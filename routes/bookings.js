const express = require('express');
const router = express.Router();

const {
  createBooking,
  getMyBookings,
  getTechnicianBookings,
  updateBookingStatus,
  getBooking,
  sendBookingCompleteOTP,
  adminCancelBooking
} = require('../controllers/bookingController');

const { protect, authorize, adminOnly } = require('../middleware/auth');

// User creates booking
router.post('/', protect, authorize('user'), createBooking);

// User booking history
router.get('/my', protect, getMyBookings);

// Technician booking list
router.get('/technician', protect, authorize('technician'), getTechnicianBookings);

// Get single booking (must validate ownership in controller)
router.get('/:id', protect, getBooking);

// Only technician can update booking status
router.put('/:id/status', protect, authorize('technician'), updateBookingStatus);

// Technician send OTP
router.post('/:id/send-complete-otp', protect, authorize('technician'), sendBookingCompleteOTP);

// Admin cancel booking
router.delete('/:id', protect, adminOnly, adminCancelBooking);

module.exports = router;