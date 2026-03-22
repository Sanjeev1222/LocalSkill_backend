const mongoose = require('mongoose');

const technicianProfileSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  skills: [{
    type: String,
    required: true,
    enum: [
      'Plumber', 'Electrician', 'Mechanic', 'AC Technician',
      'Carpenter', 'Cleaner', 'Painter', 'Engineer',
      'Appliance Repair', 'Locksmith', 'Welder', 'Mason',
      'Pest Control', 'Gardener', 'Interior Designer'
    ]
  }],
  experience: {
    type: Number,
    required: [true, 'Experience is required'],
    min: [0, 'Experience cannot be negative']
  },
  chargeType: {
    type: String,
    enum: ['hourly', 'per_job'],
    default: 'hourly'
  },
  chargeRate: {
    type: Number,
    required: [true, 'Charge rate is required'],
    min: [0, 'Charge rate cannot be negative']
  },
  bio: {
    type: String,
    maxlength: [500, 'Bio cannot exceed 500 characters'],
    default: ''
  },
  serviceRadius: {
    type: Number,
    default: 10,
    min: 1,
    max: 100
  },
  availability: {
    isOnline: { type: Boolean, default: true },
    slots: [{
      day: {
        type: String,
        enum: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
      },
      startTime: String,
      endTime: String
    }]
  },
  rating: {
    average: { type: Number, default: 0, min: 0, max: 5 },
    count: { type: Number, default: 0 }
  },
  location: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: {
      type: [Number],
      default: [0, 0]
    }
  },
  completedJobs: { type: Number, default: 0 },
  totalEarnings: { type: Number, default: 0 },
  isVerified: { type: Boolean, default: false },
  documents: [{
    name: String,
    url: String
  }],
  gallery: [{ type: String }]
}, {
  timestamps: true
});

technicianProfileSchema.index({ skills: 1 });
technicianProfileSchema.index({ 'rating.average': -1 });
technicianProfileSchema.index({ chargeRate: 1 });
technicianProfileSchema.index({ location: '2dsphere' });

// AI Optimization Indexes
technicianProfileSchema.index({
  location: '2dsphere',
  chargeRate: 1,
  experience: -1,
  'rating.average': -1
});

technicianProfileSchema.index({ 'availability.isOnline': 1 });
technicianProfileSchema.index({ experience: -1 });
technicianProfileSchema.index({ skills: 'text', bio: 'text' });

module.exports = mongoose.model('TechnicianProfile', technicianProfileSchema);
