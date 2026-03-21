const mongoose = require('mongoose');

const toolOwnerSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  shopName: {
    type: String,
    required: [true, 'Shop name is required'],
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
  isVerified: { type: Boolean, default: false }
}, {
  timestamps: true
});

module.exports = mongoose.model('ToolOwner', toolOwnerSchema);
