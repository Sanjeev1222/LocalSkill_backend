const mongoose = require('mongoose');

const rentalSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  tool: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tool',
    required: true
  },
  toolOwner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ToolOwner',
    required: true
  },
  rentalPeriod: {
    start: { type: Date, required: true },
    end: { type: Date, required: true }
  },
  duration: {
    value: { type: Number, required: true },
    unit: { type: String, enum: ['hours', 'days'], default: 'days' }
  },
  totalCost: { type: Number, required: true, min: 0 },
  securityDeposit: { type: Number, default: 0 },
  status: {
    type: String,
    enum: ['pending', 'approved', 'active', 'returned', 'cancelled', 'overdue'],
    default: 'pending'
  },
  paymentMethod: {
    type: String,
    enum: ['online', 'cash'],
    default: 'online'
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'paid', 'refunded', 'deposit_held', 'deposit_returned'],
    default: 'pending'
  },
  returnConfirmed: { type: Boolean, default: false },
  returnDate: { type: Date },
  condition: {
    onPickup: { type: String, default: '' },
    onReturn: { type: String, default: '' }
  },
  notes: { type: String, maxlength: 500 }
}, {
  timestamps: true
});

rentalSchema.index({ user: 1, status: 1 });
rentalSchema.index({ toolOwner: 1, status: 1 });
rentalSchema.index({ tool: 1 });

module.exports = mongoose.model('Rental', rentalSchema);
