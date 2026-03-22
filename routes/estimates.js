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
router.post('/', protect, authorize('USER', 'TECHNICIAN', 'TOOL_OWNER'), uploadEstimateMedia.array('media', 5), createEstimateRequest);
router.get('/my', protect, getMyEstimates);

// Technician routes (MUST be before /:id to avoid route conflicts)
router.get('/technician/requests', protect, authorize('TECHNICIAN'), getTechnicianEstimates);

router.get('/:id', protect, getEstimateById);
router.put('/:id/accept', protect, authorize('USER', 'TECHNICIAN', 'TOOL_OWNER'), acceptEstimate);
router.put('/:id/reject', protect, authorize('USER', 'TECHNICIAN', 'TOOL_OWNER'), rejectEstimate);
router.put('/:id/submit-estimate', protect, authorize('TECHNICIAN'), submitEstimate);

module.exports = router;
