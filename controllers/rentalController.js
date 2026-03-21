const Rental = require('../models/Rental');
const Tool = require('../models/Tool');
const ToolOwner = require('../models/ToolOwner');
const User = require('../models/User');
const Payment = require('../models/Payment');
const { asyncHandler } = require('../utils/helpers');

const twilioClient = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const VERIFY_SERVICE_SID = process.env.TWILIO_VERIFY_SERVICE_SID;

const createRental = asyncHandler(async (req, res) => {
  const { toolId, rentalPeriod, duration, paymentMethod, notes } = req.body;

  const tool = await Tool.findById(toolId).populate('owner');
  if (!tool) {
    return res.status(404).json({ success: false, message: 'Tool not found' });
  }

  if (!tool.isAvailable) {
    return res.status(400).json({ success: false, message: 'Tool is not available for rent' });
  }

  let totalCost = 0;
  if (duration.unit === 'hours') {
    totalCost = tool.rentPrice.hourly * duration.value;
  } else {
    totalCost = tool.rentPrice.daily * duration.value;
  }

  const rental = await Rental.create({
    user: req.user._id,
    tool: toolId,
    toolOwner: tool.owner._id,
    rentalPeriod,
    duration,
    totalCost,
    securityDeposit: tool.securityDeposit,
    paymentMethod: paymentMethod || 'online',
    notes
  });

  const populatedRental = await Rental.findById(rental._id)
    .populate('tool', 'name images rentPrice')
    .populate({
      path: 'toolOwner',
      populate: { path: 'user', select: 'name phone' }
    });

  res.status(201).json({ success: true, data: populatedRental });
});

const getMyRentals = asyncHandler(async (req, res) => {
  const { status, page = 1, limit = 10 } = req.query;
  let query = { user: req.user._id };
  if (status) query.status = status;

  const rentals = await Rental.find(query)
    .populate('tool', 'name images rentPrice category')
    .populate({
      path: 'toolOwner',
      populate: { path: 'user', select: 'name phone' }
    })
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(Number(limit));

  const total = await Rental.countDocuments(query);

  res.json({
    success: true,
    data: rentals,
    pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / limit) }
  });
});

const getOwnerRentals = asyncHandler(async (req, res) => {
  const toolOwner = await ToolOwner.findOne({ user: req.user._id });
  if (!toolOwner) {
    return res.status(404).json({ success: false, message: 'Tool owner profile not found' });
  }

  const { status, page = 1, limit = 10 } = req.query;
  let query = { toolOwner: toolOwner._id };
  if (status) query.status = status;

  const rentals = await Rental.find(query)
    .populate('tool', 'name images rentPrice category')
    .populate('user', 'name phone avatar')
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(Number(limit));

  const total = await Rental.countDocuments(query);

  res.json({
    success: true,
    data: rentals,
    pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / limit) }
  });
});

const updateRentalStatus = asyncHandler(async (req, res) => {
  const { status, conditionOnReturn } = req.body;

  const rental = await Rental.findById(req.params.id);
  if (!rental) {
    return res.status(404).json({ success: false, message: 'Rental not found' });
  }

  const validTransitions = {
    pending: ['approved', 'cancelled'],
    approved: ['active', 'cancelled'],
    active: ['returned', 'overdue'],
    overdue: ['returned']
  };

  if (!validTransitions[rental.status] || !validTransitions[rental.status].includes(status)) {
    return res.status(400).json({
      success: false,
      message: `Cannot change status from ${rental.status} to ${status}`
    });
  }

  rental.status = status;

  if (status === 'returned') {
    // Verify OTP before marking returned
    const { otp } = req.body;
    if (!otp) {
      return res.status(400).json({ success: false, message: 'OTP is required to confirm tool return' });
    }

    const renter = await User.findById(rental.user);
    if (!renter || !renter.phone) {
      return res.status(400).json({ success: false, message: 'Renter phone number not available for verification' });
    }

    const verificationCheck = await twilioClient.verify.v2
      .services(VERIFY_SERVICE_SID)
      .verificationChecks.create({ to: `+91${renter.phone}`, code: otp });

    if (verificationCheck.status !== 'approved') {
      return res.status(400).json({ success: false, message: 'Invalid OTP. Please try again.' });
    }

    rental.returnConfirmed = true;
    rental.returnDate = new Date();
    rental.condition.onReturn = conditionOnReturn || 'good';
    rental.paymentStatus = 'deposit_returned';

    await Tool.findByIdAndUpdate(rental.tool, { isAvailable: true });

    const toolOwner = await ToolOwner.findById(rental.toolOwner);
    if (toolOwner) {
      toolOwner.totalRentals += 1;
      toolOwner.totalEarnings += rental.totalCost;
      await toolOwner.save();
    }

    await Payment.create({
      user: rental.user,
      type: 'rental',
      referenceId: rental._id,
      amount: rental.totalCost,
      method: rental.paymentMethod,
      status: 'completed'
    });
  }

  if (status === 'active') {
    await Tool.findByIdAndUpdate(rental.tool, { isAvailable: false });
  }

  await rental.save();

  const updatedRental = await Rental.findById(rental._id)
    .populate('tool', 'name images rentPrice')
    .populate('user', 'name phone avatar');

  res.json({ success: true, data: updatedRental });
});

// ─── Send OTP for tool return (sent to renter's phone) ───
const sendRentalReturnOTP = asyncHandler(async (req, res) => {
  const rental = await Rental.findById(req.params.id)
    .populate('user', 'name phone');

  if (!rental) {
    return res.status(404).json({ success: false, message: 'Rental not found' });
  }

  if (rental.status !== 'active' && rental.status !== 'overdue') {
    return res.status(400).json({ success: false, message: 'Rental must be active to send return OTP' });
  }

  if (!rental.user?.phone) {
    return res.status(400).json({ success: false, message: 'Renter phone number not available' });
  }

  const verification = await twilioClient.verify.v2
    .services(VERIFY_SERVICE_SID)
    .verifications.create({ to: `+91${rental.user.phone}`, channel: 'sms' });

  res.json({
    success: true,
    message: `OTP sent to renter ${rental.user.name}'s phone`,
    status: verification.status,
    userPhone: `****${rental.user.phone.slice(-4)}`
  });
});

const getOwnerDashboard = asyncHandler(async (req, res) => {
  const toolOwner = await ToolOwner.findOne({ user: req.user._id });
  if (!toolOwner) {
    return res.status(404).json({ success: false, message: 'Tool owner profile not found' });
  }

  const totalTools = await Tool.countDocuments({ owner: toolOwner._id });
  const activeRentals = await Rental.countDocuments({ toolOwner: toolOwner._id, status: 'active' });
  const pendingRequests = await Rental.countDocuments({ toolOwner: toolOwner._id, status: 'pending' });
  const completedRentals = await Rental.countDocuments({ toolOwner: toolOwner._id, status: 'returned' });

  const recentRentals = await Rental.find({ toolOwner: toolOwner._id })
    .populate('tool', 'name images')
    .populate('user', 'name avatar')
    .sort({ createdAt: -1 })
    .limit(10);

  res.json({
    success: true,
    data: {
      toolOwner,
      stats: {
        totalTools,
        activeRentals,
        pendingRequests,
        completedRentals,
        totalEarnings: toolOwner.totalEarnings,
        rating: toolOwner.rating
      },
      recentRentals
    }
  });
});

const adminCancelRental = asyncHandler(async (req, res) => {
  const rental = await Rental.findById(req.params.id);
  if (!rental) {
    return res.status(404).json({ success: false, message: 'Rental not found' });
  }

  if (rental.status === 'cancelled') {
    return res.status(400).json({ success: false, message: 'Rental is already cancelled' });
  }

  rental.status = 'cancelled';
  await rental.save();

  res.json({
    success: true,
    data: rental,
    message: 'Rental has been cancelled'
  });
});

module.exports = {
  createRental,
  getMyRentals,
  getOwnerRentals,
  updateRentalStatus,
  getOwnerDashboard,
  sendRentalReturnOTP,
  adminCancelRental
};
