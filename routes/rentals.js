const express = require('express');
const router = express.Router();

const {
  createRental,
  getMyRentals,
  getOwnerRentals,
  updateRentalStatus,
  getOwnerDashboard,
  sendRentalReturnOTP,
  adminCancelRental
} = require('../controllers/rentalController');

const { protect, authorize, adminOnly } = require('../middleware/auth');

// User creates rental
router.post('/', protect, authorize('user'), createRental);

// User rental history
router.get('/my', protect, getMyRentals);

// Toolowner rental list
router.get('/owner', protect, authorize('toolowner'), getOwnerRentals);

// Owner dashboard analytics
router.get('/dashboard', protect, authorize('toolowner'), getOwnerDashboard);

// Only owner can update rental lifecycle
router.put('/:id/status', protect, authorize('toolowner'), updateRentalStatus);

// Only owner sends return OTP
router.post('/:id/send-return-otp', protect, authorize('toolowner'), sendRentalReturnOTP);

// Admin dispute / cancellation
router.delete('/:id', protect, adminOnly, adminCancelRental);

module.exports = router;