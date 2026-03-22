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
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
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
  isPhoneVerified: { type: Boolean, default: false },
  isEmailVerified: { type: Boolean, default: false },
  avatar: {
    type: String,
    default: ''
  },
  roles: {
    type: [String],
    enum: ['user', 'technician', 'toolowner', 'admin'],
    default: ['user']
  },
  activeRole: {
    type: String,
    enum: ['user', 'technician', 'toolowner', 'admin'],
    default: 'user'
  },
  location: {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], default: [0, 0] },
    address: { type: String, default: '' },
    city: { type: String, default: '' },
    state: { type: String, default: '' },
    pincode: { type: String, default: '' }
  },
  rating: { type: Number, default: 0 },
  totalReviews: { type: Number, default: 0 },

  lastLogin: { type: Date },

  isActive: { type: Boolean, default: true },
  isBanned: { type: Boolean, default: false },
  isVerified: { type: Boolean, default: false },
  darkMode: { type: Boolean, default: false },

  privacySettings: {
    showPhone: { type: String, enum: ['everyone', 'booked', 'nobody'], default: 'booked' },
    showEmail: { type: String, enum: ['everyone', 'booked', 'nobody'], default: 'booked' },
    showLocation: { type: String, enum: ['everyone', 'booked', 'nobody'], default: 'everyone' }
  }

  
}, {
  timestamps: true
});
userSchema.index({ roles: 1 });
userSchema.index({ isActive: 1 });
userSchema.index({ isBanned: 1 });

userSchema.index({ 'location': '2dsphere' });

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
