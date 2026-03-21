const express = require('express');
const router = express.Router();
const { register, login, getMe, updateProfile, googleAuth, sendRegisterOTP, verifyRegisterOTP } = require('../controllers/authController');
const { protect } = require('../middleware/auth');

router.post('/register', register);
router.post('/login', login);
router.post('/google', googleAuth);
router.post('/send-otp', sendRegisterOTP);
router.post('/verify-otp', verifyRegisterOTP);
router.get('/me', protect, getMe);
router.put('/profile', protect, updateProfile);

module.exports = router;
