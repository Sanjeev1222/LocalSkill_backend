const mongoose = require('mongoose');

const ownerProfileSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  businessName: {
    type: String,
    required: [true, 'Business name is required'],
    trim: true,
    maxlength: 100
  },
  description: {
    type: String,
    maxlength: 500,
    default: ''
  },
  rating: {
    average: { type: Number, default: 0, min: 0, max: 5 },
    count: { type: Number, default: 0 }
  },
  totalRentals: { type: Number, default: 0 },
  totalEarnings: { type: Number, default: 0 },
  isVerified: { type: Boolean, default: false },

  // Merged from OwnerSettings
  defaultPricing: { type: Number, default: 0, min: 0 },
  lateFeePerHour: { type: Number, default: 0, min: 0 },
  depositRequired: { type: Boolean, default: true },
  insuranceEnabled: { type: Boolean, default: false }
}, {
  timestamps: true
});

module.exports = mongoose.model('OwnerProfile', ownerProfileSchema);
