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

// Any authenticated user can request estimates (cross-feature)
router.post('/', protect, authorize('user', 'technician', 'toolowner'), uploadEstimateMedia.array('media', 5), createEstimateRequest);
router.get('/my', protect, getMyEstimates);

// Technician routes (MUST be before /:id to avoid route conflicts)
router.get('/technician/requests', protect, authorize('technician'), getTechnicianEstimates);

router.get('/:id', protect, getEstimateById);
router.put('/:id/accept', protect, authorize('user', 'technician', 'toolowner'), acceptEstimate);
router.put('/:id/reject', protect, authorize('user', 'technician', 'toolowner'), rejectEstimate);
router.put('/:id/submit-estimate', protect, authorize('technician'), submitEstimate);

module.exports = router;
