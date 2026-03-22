const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
    maxlength: [50, 'Name cannot exceed 50 characters']
  },
  email: {
    type: String,
    unique: true,
    lowercase: true,
    sparse: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
  },
  password: {
    type: String,
    required: [function() { return !this.googleId; }, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters'],
    select: false
  },
  googleId: {
    type: String,
    unique: true,
    sparse: true
  },
  phone: {
    type: String,
    validate: {
      validator: function(v) {
        if (!v) return true;
        return /^[0-9]{10}$/.test(v);
      },
      message: 'Phone number must be exactly 10 digits'
    }
  },

  roles: {
    type: [String],
    enum: ['USER', 'TECHNICIAN', 'TOOL_OWNER', 'ADMIN'],
    default: ['USER']
  },
  activeRole: {
    type: String,
    enum: ['USER', 'TECHNICIAN', 'TOOL_OWNER', 'ADMIN'],
    default: 'USER'
  },

  avatar: { type: String, default: '' },

  isPhoneVerified: { type: Boolean, default: false },
  isEmailVerified: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true },
  isBanned: { type: Boolean, default: false },
  isVerified: { type: Boolean, default: false },

  trustScore: { type: Number, default: 0, min: 0, max: 100 },

  geoLocation: {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], default: [0, 0] }
  },

  address: {
    city: { type: String, default: '' },
    state: { type: String, default: '' },
    pincode: { type: String, default: '' },
    fullAddress: { type: String, default: '' }
  },

  privacySettings: {
    showPhoneAfterBooking: { type: Boolean, default: true },
    showExactLocationAfterBooking: { type: Boolean, default: true }
  },

  lastLoginAt: { type: Date }
}, {
  timestamps: true
});

userSchema.index({ phone: 1 }, { unique: true, sparse: true });
userSchema.index({ roles: 1 });
userSchema.index({ isActive: 1 });
userSchema.index({ isBanned: 1 });
userSchema.index({ 'geoLocation': '2dsphere' });

userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

userSchema.methods.matchPassword = async function(enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
