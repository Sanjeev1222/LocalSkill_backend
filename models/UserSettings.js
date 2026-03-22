const mongoose = require('mongoose');

const userSettingsSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },

  language: { type: String, default: 'en', enum: ['en', 'hi', 'ta', 'te', 'kn', 'ml', 'mr', 'bn', 'gu', 'pa'] },

  profile: {
    bio: { type: String, maxlength: 500, default: '' },
    address: { type: String, maxlength: 200, default: '' },
    language: { type: String, default: 'en', enum: ['en', 'hi', 'ta', 'te', 'kn', 'ml', 'mr', 'bn', 'gu', 'pa'] },
    darkMode: { type: Boolean, default: false }
  },

  security: {
    twoFactorEnabled: { type: Boolean, default: false },
    activeSessions: [{
      device: { type: String },
      location: { type: String, default: '' },
      ip: { type: String, default: '' },
      lastActive: { type: Date, default: Date.now },
      _id: false
    }]
  },

  notifications: {
    jobAlerts: { type: Boolean, default: true },
    rentalAlerts: { type: Boolean, default: true },
    paymentAlerts: { type: Boolean, default: true },
    marketing: { type: Boolean, default: false },
    sms: { type: Boolean, default: true },
    email: { type: Boolean, default: true }
  },

  privacy: {
    showPhone: { type: Boolean, default: false },
    showLocation: { type: Boolean, default: true },
    profileVisibility: { type: String, enum: ['public', 'registered', 'private'], default: 'public' }
  },

  payment: {
    bankAccounts: [{
      label: { type: String, default: 'Primary' },
      accountNumber: { type: String },
      ifsc: { type: String },
      upi: { type: String }
    }]
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('UserSettings', userSettingsSchema);
