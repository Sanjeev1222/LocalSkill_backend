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
  role: {
    type: String,
    enum: ['user', 'technician', 'toolowner', 'admin'],
    default: 'user'
  },
  location: {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], default: [0, 0] },
    address: { type: String, default: '' },
    city: { type: String, default: '' },
    state: { type: String, default: '' }
  },
  rating: { type: Number, default: 0 },
totalReviews: { type: Number, default: 0 },

skills: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Skill' }],

bookings: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Booking' }],

walletBalance: { type: Number, default: 0 },

availability: {
  type: String,
  enum: ['online', 'offline', 'busy'],
  default: 'offline'
},

bio: { type: String, default: '' },

experienceYears: { type: Number, default: 0 },

specialization: [{ type: String }],

lastLogin: { type: Date },

profileCompleted: { type: Boolean, default: false },

  isActive: { type: Boolean, default: true },
  isBanned: { type: Boolean, default: false },
  isVerified: { type: Boolean, default: false },
  darkMode: { type: Boolean, default: false }

  
}, {
  timestamps: true
});
userSchema.index({ role: 1 });
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
