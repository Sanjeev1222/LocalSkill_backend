const mongoose = require('mongoose');

const technicianSettingsSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },

  skills: [{
    type: String,
    enum: [
      'Plumber', 'Electrician', 'Mechanic', 'AC Technician',
      'Carpenter', 'Cleaner', 'Painter', 'Engineer',
      'Appliance Repair', 'Locksmith', 'Welder', 'Mason',
      'Pest Control', 'Gardener', 'Interior Designer'
    ]
  }],
  experienceYears: { type: Number, default: 0, min: 0 },
  hourlyRate: { type: Number, default: 0, min: 0 },
  serviceRadiusKm: { type: Number, default: 10, min: 1, max: 100 },
  workingHours: {
    start: { type: String, default: '09:00' },
    end: { type: String, default: '18:00' }
  },
  autoAcceptJobs: { type: Boolean, default: false }
}, {
  timestamps: true
});

module.exports = mongoose.model('TechnicianSettings', technicianSettingsSchema);
