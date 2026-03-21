const Booking = require('../models/Booking');
const Technician = require('../models/Technician');
const User = require('../models/User');
const Payment = require('../models/Payment');
const { asyncHandler } = require('../utils/helpers');

const twilioClient = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const VERIFY_SERVICE_SID = process.env.TWILIO_VERIFY_SERVICE_SID;

const createBooking = asyncHandler(async (req, res) => {
  const { technicianId, service, description, scheduledDate, timeSlot, location, paymentMethod } = req.body;

  const technician = await Technician.findById(technicianId);
  if (!technician) {
    return res.status(404).json({ success: false, message: 'Technician not found' });
  }

  if (!technician.availability.isOnline) {
    return res.status(400).json({ success: false, message: 'Technician is currently offline' });
  }

  const estimatedCost = technician.chargeRate;

  const booking = await Booking.create({
    user: req.user._id,
    technician: technicianId,
    service,
    description,
    scheduledDate,
    timeSlot,
    location,
    estimatedCost,
    paymentMethod: paymentMethod || 'cash'
  });

  const populatedBooking = await Booking.findById(booking._id)
    .populate('user', 'name phone avatar')
    .populate({
      path: 'technician',
      populate: { path: 'user', select: 'name phone avatar' }
    });

  res.status(201).json({ success: true, data: populatedBooking });
});

const getMyBookings = asyncHandler(async (req, res) => {
  const { status, page = 1, limit = 10 } = req.query;
  let query = { user: req.user._id };
  if (status) query.status = status;

  const bookings = await Booking.find(query)
    .populate({
      path: 'technician',
      populate: { path: 'user', select: 'name phone avatar location' }
    })
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(Number(limit));

  const total = await Booking.countDocuments(query);

  res.json({
    success: true,
    data: bookings,
    pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / limit) }
  });
});

const getTechnicianBookings = asyncHandler(async (req, res) => {
  const technician = await Technician.findOne({ user: req.user._id });
  if (!technician) {
    return res.status(404).json({ success: false, message: 'Technician profile not found' });
  }

  const { status, page = 1, limit = 10 } = req.query;
  let query = { technician: technician._id };
  if (status) query.status = status;

  const bookings = await Booking.find(query)
    .populate('user', 'name phone avatar location')
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(Number(limit));

  const total = await Booking.countDocuments(query);

  res.json({
    success: true,
    data: bookings,
    pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / limit) }
  });
});

const updateBookingStatus = asyncHandler(async (req, res) => {
  const { status, finalCost, cancellationReason } = req.body;

  const booking = await Booking.findById(req.params.id);
  if (!booking) {
    return res.status(404).json({ success: false, message: 'Booking not found' });
  }

  const validTransitions = {
    pending: ['confirmed', 'cancelled'],
    confirmed: ['in_progress', 'cancelled'],
    in_progress: ['completed', 'cancelled'],
  };

  if (!validTransitions[booking.status] || !validTransitions[booking.status].includes(status)) {
    return res.status(400).json({
      success: false,
      message: `Cannot change status from ${booking.status} to ${status}`
    });
  }

  booking.status = status;

  if (status === 'completed') {
    // Verify OTP before completing
    const { otp } = req.body;
    if (!otp) {
      return res.status(400).json({ success: false, message: 'OTP is required to complete a booking' });
    }

    const user = await User.findById(booking.user);
    if (!user || !user.phone) {
      return res.status(400).json({ success: false, message: 'User phone number not available for verification' });
    }

    const verificationCheck = await twilioClient.verify.v2
      .services(VERIFY_SERVICE_SID)
      .verificationChecks.create({ to: `+91${user.phone}`, code: otp });

    if (verificationCheck.status !== 'approved') {
      return res.status(400).json({ success: false, message: 'Invalid OTP. Please try again.' });
    }

    booking.finalCost = finalCost || booking.estimatedCost;
    booking.completedAt = new Date();
    booking.paymentStatus = booking.paymentMethod === 'cash' ? 'paid' : booking.paymentStatus;

    const technician = await Technician.findById(booking.technician);
    if (technician) {
      technician.completedJobs += 1;
      technician.totalEarnings += booking.finalCost;
      await technician.save();
    }

    await Payment.create({
      user: booking.user,
      type: 'booking',
      referenceId: booking._id,
      amount: booking.finalCost,
      method: booking.paymentMethod,
      status: 'completed'
    });
  }

  if (status === 'cancelled') {
    booking.cancellationReason = cancellationReason || 'No reason provided';
  }

  await booking.save();

  const updatedBooking = await Booking.findById(booking._id)
    .populate('user', 'name phone avatar')
    .populate({
      path: 'technician',
      populate: { path: 'user', select: 'name phone avatar' }
    });

  res.json({ success: true, data: updatedBooking });
});

const getBooking = asyncHandler(async (req, res) => {
  const booking = await Booking.findById(req.params.id)
    .populate('user', 'name phone avatar location')
    .populate({
      path: 'technician',
      populate: { path: 'user', select: 'name phone avatar location' }
    });

  if (!booking) {
    return res.status(404).json({ success: false, message: 'Booking not found' });
  }

  res.json({ success: true, data: booking });
});

// ─── Send OTP for booking completion (sent to user's phone) ───
const sendBookingCompleteOTP = asyncHandler(async (req, res) => {
  const booking = await Booking.findById(req.params.id)
    .populate('user', 'name phone');

  if (!booking) {
    return res.status(404).json({ success: false, message: 'Booking not found' });
  }

  if (booking.status !== 'in_progress') {
    return res.status(400).json({ success: false, message: 'Booking must be in progress to send completion OTP' });
  }

  if (!booking.user?.phone) {
    return res.status(400).json({ success: false, message: 'User phone number not available' });
  }

  const verification = await twilioClient.verify.v2
    .services(VERIFY_SERVICE_SID)
    .verifications.create({ to: `+91${booking.user.phone}`, channel: 'sms' });

  res.json({
    success: true,
    message: `OTP sent to user ${booking.user.name}'s phone`,
    status: verification.status,
    userPhone: `****${booking.user.phone.slice(-4)}`
  });
});

const adminCancelBooking = asyncHandler(async (req, res) => {
  const booking = await Booking.findById(req.params.id);
  if (!booking) {
    return res.status(404).json({ success: false, message: 'Booking not found' });
  }

  if (booking.status === 'cancelled') {
    return res.status(400).json({ success: false, message: 'Booking is already cancelled' });
  }

  booking.status = 'cancelled';
  booking.cancellationReason = req.body.reason || 'Cancelled by admin';
  await booking.save();

  res.json({
    success: true,
    data: booking,
    message: 'Booking has been cancelled'
  });
});

module.exports = {
  createBooking,
  getMyBookings,
  getTechnicianBookings,
  updateBookingStatus,
  getBooking,
  sendBookingCompleteOTP,
  adminCancelBooking
};
