const express = require('express');
const router = express.Router();

const {
  createPaymentIntent,
  confirmPayment,
  getPaymentHistory,
  handleStripeWebhook,
  adminRefundPayment
} = require('../controllers/paymentController');

const { protect, adminOnly } = require('../middleware/auth');

// User create payment intent
router.post('/create-intent', protect, createPaymentIntent);

// User fetch payment history
router.get('/history', protect, getPaymentHistory);

// Payment confirmation (should internally verify Stripe)
router.post('/confirm', protect, confirmPayment);

// Stripe webhook (NO protect middleware)
router.post('/webhook', express.raw({ type: 'application/json' }), handleStripeWebhook);

// Admin refund route
router.post('/refund/:id', protect, adminOnly, adminRefundPayment);

module.exports = router;