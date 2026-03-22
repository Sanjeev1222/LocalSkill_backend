const Booking = require('../models/Booking');
const TechnicianProfile = require('../models/TechnicianProfile');
const User = require('../models/User');
const Payment = require('../models/Payment');
const { asyncHandler, maskPhone } = require('../utils/helpers');

const twilioClient = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const VERIFY_SERVICE_SID = process.env.TWILIO_VERIFY_SERVICE_SID;

const createBooking = asyncHandler(async (req, res) => {
  const { technicianId, service, description, scheduledDate, timeSlot, location, paymentMethod } = req.body;

  if (!technicianId || !service || !scheduledDate) {
    return res.status(400).json({ success: false, message: 'Technician, service, and scheduled date are required' });
  }

  const technician = await TechnicianProfile.findById(technicianId);
  if (!technician) {
    return res.status(404).json({ success: false, message: 'Technician not found' });
  }

  // Prevent self-booking
  if (technician.userId.toString() === req.user._id.toString()) {
    return res.status(400).json({ success: false, message: 'You cannot book yourself' });
  }

  if (!technician.availability.isOnline) {
    return res.status(400).json({ success: false, message: 'Technician is currently offline' });
  }

  // Prevent overlapping bookings for same technician on same date/time
  if (scheduledDate && timeSlot) {
    const startOfDay = new Date(scheduledDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(scheduledDate);
    endOfDay.setHours(23, 59, 59, 999);

    const existingBooking = await Booking.findOne({
      technician: technicianId,
      scheduledDate: { $gte: startOfDay, $lte: endOfDay },
      'timeSlot.start': timeSlot.start,
      status: { $nin: ['cancelled', 'completed'] }
    });

    if (existingBooking) {
      return res.status(400).json({ success: false, message: 'This technician is already booked for that time slot' });
    }
  }

  const estimatedCost = technician.hourlyRate;

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
      populate: { path: 'userId', select: 'name phone avatar' }
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
      populate: { path: 'userId', select: 'name phone avatar geoLocation address' }
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
  const technician = await TechnicianProfile.findOne({ userId: req.user._id });
  if (!technician) {
    return res.status(404).json({ success: false, message: 'Technician profile not found' });
  }

  const { status, page = 1, limit = 10 } = req.query;
  let query = { technician: technician._id };
  if (status) query.status = status;

  const bookings = await Booking.find(query)
    .populate('user', 'name phone avatar geoLocation address')
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

  // Verify this technician owns this booking
  const technician = await TechnicianProfile.findOne({ userId: req.user._id });
  if (!technician || booking.technician.toString() !== technician._id.toString()) {
    return res.status(403).json({ success: false, message: 'Not authorized to update this booking' });
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

    const technician = await TechnicianProfile.findById(booking.technician);
    if (technician) {
      technician.completedJobs += 1;
      technician.totalEarnings += booking.finalCost;
      await technician.save();
    }

    // Only create payment record if one doesn't already exist for this booking
    const existingPayment = await Payment.findOne({ type: 'booking', referenceId: booking._id });
    if (existingPayment) {
      existingPayment.status = 'completed';
      existingPayment.amount = booking.finalCost;
      await existingPayment.save();
    } else {
      await Payment.create({
        user: booking.user,
        type: 'booking',
        referenceId: booking._id,
        amount: booking.finalCost,
        method: booking.paymentMethod,
        status: 'completed'
      });
    }
  }

  if (status === 'cancelled') {
    booking.cancellationReason = cancellationReason || 'No reason provided';
  }

  await booking.save();

  const updatedBooking = await Booking.findById(booking._id)
    .populate('user', 'name phone avatar')
    .populate({
      path: 'technician',
      populate: { path: 'userId', select: 'name phone avatar' }
    });

  res.json({ success: true, data: updatedBooking });
});

const getBooking = asyncHandler(async (req, res) => {
  const booking = await Booking.findById(req.params.id)
    .populate('user', 'name phone avatar geoLocation address')
    .populate({
      path: 'technician',
      populate: { path: 'userId', select: 'name phone avatar geoLocation address' }
    });

  if (!booking) {
    return res.status(404).json({ success: false, message: 'Booking not found' });
  }

  // Ownership check: booking user, technician's user, or admin
  const isBookingUser = booking.user._id.toString() === req.user._id.toString();
  const isTechUser = booking.technician?.userId?._id?.toString() === req.user._id.toString();
  const isAdmin = (req.user.roles || []).includes('ADMIN');

  if (!isBookingUser && !isTechUser && !isAdmin) {
    return res.status(403).json({ success: false, message: 'Not authorized to view this booking' });
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

  // Verify this technician owns this booking
  const technician = await TechnicianProfile.findOne({ userId: req.user._id });
  if (!technician || booking.technician.toString() !== technician._id.toString()) {
    return res.status(403).json({ success: false, message: 'Not authorized for this booking' });
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

// ─── Check if user has active booking with technician → reveal contact ───
const getContactInfo = asyncHandler(async (req, res) => {
  const { technicianId } = req.params;

  const activeBooking = await Booking.findOne({
    user: req.user._id,
    technician: technicianId,
    status: { $in: ['confirmed', 'in_progress'] }
  });

  if (!activeBooking) {
    return res.status(403).json({
      success: false,
      message: 'You need an active booking with this technician to view contact info'
    });
  }

  const technician = await TechnicianProfile.findById(technicianId).populate('userId', 'name phone email location');
  if (!technician) {
    return res.status(404).json({ success: false, message: 'Technician not found' });
  }

  res.json({
    success: true,
    data: {
      phone: technician.userId.phone,
      email: technician.userId.email,
      location: technician.userId.location
    }
  });
});

module.exports = {
  createBooking,
  getMyBookings,
  getTechnicianBookings,
  updateBookingStatus,
  getBooking,
  sendBookingCompleteOTP,
  adminCancelBooking,
  getContactInfo
};
