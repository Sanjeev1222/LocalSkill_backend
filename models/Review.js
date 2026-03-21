const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  targetType: {
    type: String,
    enum: ['technician', 'tool', 'toolowner'],
    required: true
  },
  targetId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    refPath: 'targetModel'
  },
  targetModel: {
    type: String,
    enum: ['Technician', 'Tool', 'ToolOwner'],
    required: true
  },
  booking: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Booking'
  },
  rental: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Rental'
  },
  rating: {
    type: Number,
    required: [true, 'Rating is required'],
    min: 1,
    max: 5
  },
  comment: {
    type: String,
    maxlength: [500, 'Review cannot exceed 500 characters'],
    default: ''
  },
  isVisible: { type: Boolean, default: true }
}, {
  timestamps: true
});

reviewSchema.index({ user: 1, targetId: 1, booking: 1 }, { unique: true, sparse: true });
reviewSchema.index({ targetId: 1, targetType: 1 });

module.exports = mongoose.model('Review', reviewSchema);
