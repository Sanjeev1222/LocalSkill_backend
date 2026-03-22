const mongoose = require('mongoose');

const ownerSettingsSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },

  defaultPricing: { type: Number, default: 0, min: 0 },
  lateFeePerHour: { type: Number, default: 0, min: 0 },
  depositRequired: { type: Boolean, default: true },
  autoApproval: { type: Boolean, default: false },
  insuranceEnabled: { type: Boolean, default: false }
}, {
  timestamps: true
});

module.exports = mongoose.model('OwnerSettings', ownerSettingsSchema);
