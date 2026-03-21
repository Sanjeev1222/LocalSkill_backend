const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  technician: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Technician',
    required: true
  },
  service: {
    type: String,
    required: [true, 'Service type is required']
  },
  description: {
    type: String,
    required: [true, 'Work description is required'],
    maxlength: 1000
  },
  scheduledDate: {
    type: Date,
    required: [true, 'Scheduled date is required']
  },
  timeSlot: {
    start: { type: String, required: true },
    end: { type: String, required: true }
  },
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'in_progress', 'completed', 'cancelled'],
    default: 'pending'
  },
  location: {
    address: { type: String, required: true },
    coordinates: { type: [Number], default: [0, 0] }
  },
  estimatedCost: { type: Number, default: 0 },
  finalCost: { type: Number, default: 0 },
  paymentMethod: {
    type: String,
    enum: ['online', 'cash'],
    default: 'cash'
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'paid', 'refunded'],
    default: 'pending'
  },
  notes: { type: String, maxlength: 500 },
  cancellationReason: { type: String },
  completedAt: { type: Date }
}, {
  timestamps: true
});

bookingSchema.index({ user: 1, status: 1 });
bookingSchema.index({ technician: 1, status: 1 });
bookingSchema.index({ scheduledDate: 1 });
bookingSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Booking', bookingSchema);
