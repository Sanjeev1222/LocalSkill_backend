const mongoose = require('mongoose');

const toolSchema = new mongoose.Schema({
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'OwnerProfile',
    required: true
  },
  name: {
    type: String,
    required: [true, 'Tool name is required'],
    trim: true,
    maxlength: 100
  },
  description: {
    type: String,
    maxlength: 500,
    default: ''
  },
  category: {
    type: String,
    required: true,
    enum: [
      'Power Tools', 'Hand Tools', 'Measuring Tools',
      'Plumbing Tools', 'Electrical Tools', 'Gardening Tools',
      'Painting Tools', 'Cleaning Equipment', 'Construction Equipment',
      'Automotive Tools', 'Welding Equipment', 'Safety Equipment',
      'Other'
    ]
  },
  toolType: {
    type: String,
    enum: ['technical', 'non-technical'],
    default: 'technical'
  },
  images: [{ type: String }],
  rentPrice: {
    hourly: { type: Number, default: 0 },
    daily: { type: Number, required: [true, 'Daily rent price is required'], min: 0 }
  },
  securityDeposit: {
    type: Number,
    default: 0,
    min: 0
  },
  condition: {
    type: String,
    enum: ['new', 'like_new', 'good', 'fair'],
    default: 'good'
  },
  isAvailable: { type: Boolean, default: true },
  location: {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], default: [0, 0] },
    address: { type: String, default: '' }
  },
  specifications: { type: Map, of: String },
  totalRentals: { type: Number, default: 0 },
  rating: {
    average: { type: Number, default: 0 },
    count: { type: Number, default: 0 }
  }
}, {
  timestamps: true
});

toolSchema.index({ 'location': '2dsphere' });
toolSchema.index({ category: 1 });
toolSchema.index({ name: 'text', description: 'text' });
toolSchema.index({ owner: 1 });
toolSchema.index({ 'rentPrice.daily': 1 });
toolSchema.index({ isAvailable: 1 });

module.exports = mongoose.model('Tool', toolSchema);
