const VideoCall = require('../models/VideoCall');
const Booking = require('../models/Booking');
const TechnicianProfile = require('../models/TechnicianProfile');
const asyncHandler = require('express-async-handler');
const { RtcTokenBuilder, RtcRole } = require('agora-access-token');

const APP_ID = process.env.AGORA_APP_ID;
const APP_CERTIFICATE = process.env.AGORA_APP_CERTIFICATE;

// ─── Helper: check if user is a participant of this booking ───
const isBookingParticipant = async (booking, userId) => {
  if (booking.user.toString() === userId) return true;
  const tech = await TechnicianProfile.findById(booking.technician);
  return tech && tech.userId.toString() === userId;
};

// ─── Helper: check if within join window (startTime - 10min to endTime) ───
const withinJoinWindow = (videoCall) => {
  const now = Date.now();
  const earlyJoin = new Date(videoCall.startTime).getTime() - 10 * 60 * 1000;
  const end = new Date(videoCall.endTime).getTime();
  return now >= earlyJoin && now <= end;
};

// @desc    Generate Agora token for a booking's video call
// @route   POST /api/calls/token
// @access  Private
exports.generateToken = asyncHandler(async (req, res) => {
  const { bookingId } = req.body;
  const userId = req.user._id.toString();

  if (!APP_ID || !APP_CERTIFICATE) {
    res.status(500);
    throw new Error('Agora credentials not configured');
  }

  // 1. Verify booking exists and is confirmed
  const booking = await Booking.findById(bookingId);
  if (!booking) {
    res.status(404);
    throw new Error('Booking not found');
  }
  if (booking.status !== 'confirmed') {
    res.status(400);
    throw new Error('Booking must be confirmed to join a call');
  }

  // 2. Verify user is a participant
  const isParticipant = await isBookingParticipant(booking, userId);
  if (!isParticipant) {
    res.status(403);
    throw new Error('You are not a participant of this booking');
  }

  // 3. Find or verify video call record
  const videoCall = await VideoCall.findOne({ bookingId });
  if (!videoCall) {
    res.status(404);
    throw new Error('Video call not scheduled for this booking');
  }

  // 4. Check call isn't already ended
  if (videoCall.status === 'ended') {
    res.status(400);
    throw new Error('This call has already ended');
  }

  // 5. Check join window
  if (!withinJoinWindow(videoCall)) {
    res.status(400);
    throw new Error('Call is not within the scheduled window');
  }

  // 6. Generate Agora token
  const channelName = videoCall.channelName;
  const uid = 0; // Use 0 for string uid mode — Agora will assign
  const role = RtcRole.PUBLISHER;
  const tokenExpiry = Math.floor(Date.now() / 1000) + 3600; // 1 hour

  const token = RtcTokenBuilder.buildTokenWithUid(
    APP_ID, APP_CERTIFICATE, channelName, uid, role, tokenExpiry
  );

  // Mark as ongoing if scheduled
  if (videoCall.status === 'scheduled') {
    videoCall.status = 'ongoing';
    await videoCall.save();
  }

  res.json({
    success: true,
    data: {
      token,
      channelName,
      uid,
      appId: APP_ID,
      bookingId: videoCall.bookingId,
      startTime: videoCall.startTime,
      endTime: videoCall.endTime
    }
  });
});

// @desc    Get video call info for a booking
// @route   GET /api/calls/booking/:bookingId
// @access  Private
exports.getCallByBooking = asyncHandler(async (req, res) => {
  const userId = req.user._id.toString();
  const { bookingId } = req.params;

  const booking = await Booking.findById(bookingId);
  if (!booking) {
    res.status(404);
    throw new Error('Booking not found');
  }

  const isParticipant = await isBookingParticipant(booking, userId);
  if (!isParticipant) {
    res.status(403);
    throw new Error('Not authorized');
  }

  const videoCall = await VideoCall.findOne({ bookingId })
    .populate('participants', 'name avatar')
    .populate('bookingId', 'service scheduledDate timeSlot status');

  if (!videoCall) {
    return res.json({ success: true, data: null });
  }

  const canJoin = videoCall.status !== 'ended' && withinJoinWindow(videoCall);

  res.json({
    success: true,
    data: {
      ...videoCall.toObject(),
      canJoin
    }
  });
});

// @desc    End a video call
// @route   POST /api/calls/end
// @access  Private
exports.endCall = asyncHandler(async (req, res) => {
  const { bookingId } = req.body;
  const userId = req.user._id.toString();

  const booking = await Booking.findById(bookingId);
  if (!booking) {
    res.status(404);
    throw new Error('Booking not found');
  }

  const isParticipant = await isBookingParticipant(booking, userId);
  if (!isParticipant) {
    res.status(403);
    throw new Error('Not authorized');
  }

  const videoCall = await VideoCall.findOne({ bookingId });
  if (!videoCall || videoCall.status === 'ended') {
    res.status(400);
    throw new Error('No active call found');
  }

  videoCall.status = 'ended';
  if (videoCall.status === 'ongoing') {
    videoCall.duration = Math.round((Date.now() - new Date(videoCall.updatedAt).getTime()) / 1000);
  }
  await videoCall.save();

  res.json({ success: true, message: 'Call ended', data: videoCall });
});

// @desc    Get call history for current user
// @route   GET /api/calls/history
// @access  Private
exports.getCallHistory = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { page = 1, limit = 20 } = req.query;

  const calls = await VideoCall.find({ participants: userId })
    .populate('bookingId', 'service scheduledDate status')
    .populate('participants', 'name avatar')
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(Number(limit));

  const total = await VideoCall.countDocuments({ participants: userId });

  res.json({
    success: true,
    data: calls,
    pagination: {
      page: Number(page),
      limit: Number(limit),
      total,
      pages: Math.ceil(total / limit)
    }
  });
});
