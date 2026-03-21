const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { getCallHistory, getCallById } = require('../controllers/callController');

router.use(protect);

router.get('/history', getCallHistory);
router.get('/:id', getCallById);

module.exports = router;
