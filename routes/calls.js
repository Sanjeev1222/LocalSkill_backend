const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { generateToken, getCallByBooking, endCall, getCallHistory } = require('../controllers/callController');

router.use(protect);

router.post('/token', generateToken);
router.get('/booking/:bookingId', getCallByBooking);
router.post('/end', endCall);
router.get('/history', getCallHistory);

module.exports = router;
