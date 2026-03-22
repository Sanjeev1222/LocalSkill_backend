const express = require('express');
const router = express.Router();

const {
  getDashboard,
  getUsers,
  toggleBan,
  changeUserRole,

  getAllTechnicians,
  verifyTechnician,
  suspendTechnician,

  getAllTools,
  deleteTool,
  approveTool,

  getAllBookings,
  cancelBooking,

  getAllRentals,
  cancelRental,

  getPayments,
  refundPayment
} = require('../controllers/adminController');

const { protect, authorize } = require('../middleware/auth');

// Admin protection for all routes
router.use(protect, authorize('ADMIN'));

// Dashboard
router.get('/dashboard', getDashboard);

// Users
router.get('/users', getUsers);
router.put('/users/:id/ban', toggleBan);
router.put('/users/:id/role', changeUserRole);

// Technicians
router.get('/technicians', getAllTechnicians);
router.put('/technicians/:id/verify', verifyTechnician);
router.put('/technicians/:id/suspend', suspendTechnician);

// Tools
router.get('/tools', getAllTools);
router.delete('/tools/:id', deleteTool);
router.put('/tools/:id/approve', approveTool);

// Bookings
router.get('/bookings', getAllBookings);
router.put('/bookings/:id/cancel', cancelBooking);

// Rentals
router.get('/rentals', getAllRentals);
router.put('/rentals/:id/cancel', cancelRental);

// Payments
router.get('/payments', getPayments);
router.post('/payments/:id/refund', refundPayment);

module.exports = router;