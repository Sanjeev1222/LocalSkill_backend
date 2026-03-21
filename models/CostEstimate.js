const mongoose = require('mongoose');

const materialItemSchema = new mongoose.Schema({
  name: { type: String, required: true },
  quantity: { type: Number, required: true, min: 1 },
  unitPrice: { type: Number, required: true, min: 0 },
  total: { type: Number, required: true, min: 0 }
}, { _id: false });

const costEstimateSchema = new mongoose.Schema({
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
    required: [true, 'Problem description is required'],
    maxlength: 2000
  },
  media: [{
    type: { type: String, enum: ['photo', 'video'], required: true },
    url: { type: String, required: true },
    originalName: { type: String }
  }],
  location: {
    address: { type: String, required: true }
  },
  status: {
    type: String,
    enum: ['pending', 'estimated', 'accepted', 'rejected', 'expired', 'booked'],
    default: 'pending'
  },
  // Technician fills these
  estimate: {
    serviceCharge: { type: Number, default: 0 },
    materials: [materialItemSchema],
    materialTotal: { type: Number, default: 0 },
    totalCost: { type: Number, default: 0 },
    estimatedDuration: { type: String, default: '' },
    notes: { type: String, maxlength: 1000 }
  },
  bookingId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Booking',
    default: null
  },
  estimatedAt: { type: Date },
  respondedAt: { type: Date },
  expiresAt: { type: Date }
}, {
  timestamps: true
});

costEstimateSchema.index({ user: 1, status: 1 });
costEstimateSchema.index({ technician: 1, status: 1 });
costEstimateSchema.index({ createdAt: -1 });

module.exports = mongoose.model('CostEstimate', costEstimateSchema);
