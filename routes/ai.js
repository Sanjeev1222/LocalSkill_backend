const express = require('express');
const router = express.Router();

const { aiSearchTechnicians, aiSearchTools } = require('../controllers/aiController');
const { protect, optionalAuth } = require('../middleware/auth');

const rateLimit = require('express-rate-limit');

// ⭐ AI Rate Limiter (Very Important for cost control)
const aiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 15, // max AI requests per minute
  message: {
    success: false,
    message: 'Too many AI requests, please slow down'
  }
});

// ⭐ Public but tracked AI search
router.get('/technicians', optionalAuth, aiLimiter, aiSearchTechnicians);
router.get('/tools', optionalAuth, aiLimiter, aiSearchTools);

// ⭐ Future protected AI routes (example)
router.post('/private-search', protect, aiLimiter, aiSearchTechnicians);

module.exports = router;