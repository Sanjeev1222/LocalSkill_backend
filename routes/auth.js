const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const {
  register, login, getMe, updateProfile, googleAuth,
  firebaseLogin,
  switchRole, addRole
} = require('../controllers/authController');
const { protect } = require('../middleware/auth');

const firebaseLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 min
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests, please try again later' }
});

router.post('/register', register);
router.post('/login', login);
router.post('/google', googleAuth);
router.post('/firebase-login', firebaseLimiter, firebaseLogin);
router.get('/me', protect, getMe);
router.put('/profile', protect, updateProfile);
router.put('/switch-role', protect, switchRole);
router.post('/add-role', protect, addRole);

module.exports = router;
