const mongoose = require('mongoose');

const videoCallSchema = new mongoose.Schema({
  caller: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  receiver: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  technician: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Technician',
    required: true
  },
  roomId: {
    type: String,
    required: true,
    unique: true
  },
  status: {
    type: String,
    enum: ['ringing', 'active', 'ended', 'missed', 'rejected'],
    default: 'ringing'
  },
  duration: {
    type: Number,
    default: 0
  },
  startedAt: { type: Date },
  endedAt: { type: Date }
}, {
  timestamps: true
});

videoCallSchema.index({ caller: 1, createdAt: -1 });
videoCallSchema.index({ receiver: 1, createdAt: -1 });

module.exports = mongoose.model('VideoCall', videoCallSchema);
