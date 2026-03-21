const VideoCall = require('../models/VideoCall');
const asyncHandler = require('express-async-handler');

// @desc    Get call history for current user
// @route   GET /api/calls/history
// @access  Private
exports.getCallHistory = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { page = 1, limit = 20 } = req.query;

  const calls = await VideoCall.find({
    $or: [{ caller: userId }, { receiver: userId }]
  })
    .populate('caller', 'name email avatar')
    .populate('receiver', 'name email avatar')
    .populate('technician', 'skills chargeRate')
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(Number(limit));

  const total = await VideoCall.countDocuments({
    $or: [{ caller: userId }, { receiver: userId }]
  });

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

// @desc    Get single call details
// @route   GET /api/calls/:id
// @access  Private
exports.getCallById = asyncHandler(async (req, res) => {
  const call = await VideoCall.findById(req.params.id)
    .populate('caller', 'name email avatar')
    .populate('receiver', 'name email avatar')
    .populate('technician', 'skills chargeRate user');

  if (!call) {
    res.status(404);
    throw new Error('Call not found');
  }

  // Only caller or receiver can view
  const userId = req.user._id.toString();
  if (call.caller._id.toString() !== userId && call.receiver._id.toString() !== userId) {
    res.status(403);
    throw new Error('Not authorized to view this call');
  }

  res.json({ success: true, data: call });
});
