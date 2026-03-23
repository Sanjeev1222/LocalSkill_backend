const mongoose = require('mongoose');

const videoCallSchema = new mongoose.Schema({
  bookingId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Booking',
    required: true,
    unique: true
  },
  channelName: {
    type: String,
    required: true,
    unique: true
  },
  participants: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  startTime: {
    type: Date,
    required: true
  },
  endTime: {
    type: Date,
    required: true
  },
  status: {
    type: String,
    enum: ['scheduled', 'ongoing', 'paused', 'ended'],
    default: 'scheduled'
  },
  duration: {
    type: Number,
    default: 0
  },
  rejoinCount: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

videoCallSchema.index({ bookingId: 1 });
videoCallSchema.index({ status: 1 });
videoCallSchema.index({ 'participants': 1 });

module.exports = mongoose.model('VideoCall', videoCallSchema);
