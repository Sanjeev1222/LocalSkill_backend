const express = require('express');
const router = express.Router();

const {
  createRental,
  getMyRentals,
  getOwnerRentals,
  updateRentalStatus,
  getOwnerDashboard,
  adminCancelRental
} = require('../controllers/rentalController');

const { protect, authorize, adminOnly } = require('../middleware/auth');

// Any authenticated user can create a rental (cross-feature: technicians can also rent tools)
router.post('/', protect, authorize('USER', 'TECHNICIAN', 'TOOL_OWNER'), createRental);

// User rental history
router.get('/my', protect, getMyRentals);

// Toolowner rental list
router.get('/owner', protect, authorize('TOOL_OWNER'), getOwnerRentals);

// Owner dashboard analytics
router.get('/dashboard', protect, authorize('TOOL_OWNER'), getOwnerDashboard);

// Only owner can update rental lifecycle
router.put('/:id/status', protect, authorize('TOOL_OWNER'), updateRentalStatus);

// Admin dispute / cancellation
router.delete('/:id', protect, adminOnly, adminCancelRental);

module.exports = router;