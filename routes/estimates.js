const express = require('express');
const router = express.Router();
const {
  createEstimateRequest,
  getMyEstimates,
  getEstimateById,
  getTechnicianEstimates,
  submitEstimate,
  acceptEstimate,
  rejectEstimate
} = require('../controllers/estimateController');
const { protect, authorize } = require('../middleware/auth');
const { uploadEstimateMedia } = require('../middleware/upload');

// User routes
router.post('/', protect, authorize('user'), uploadEstimateMedia.array('media', 5), createEstimateRequest);
router.get('/my', protect, getMyEstimates);
router.get('/:id', protect, getEstimateById);
router.put('/:id/accept', protect, authorize('user'), acceptEstimate);
router.put('/:id/reject', protect, authorize('user'), rejectEstimate);

// Technician routes
router.get('/technician/requests', protect, authorize('technician'), getTechnicianEstimates);
router.put('/:id/submit-estimate', protect, authorize('technician'), submitEstimate);

module.exports = router;
