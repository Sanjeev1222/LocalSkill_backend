const express = require('express');
const router = express.Router();

const {
  getTechnicians,
  getTechnician,
  updateTechnicianProfile,
  toggleStatus,
  getDashboard,
  adminSuspendTechnician,
  adminApproveTechnician
} = require('../controllers/technicianController');

const { protect, authorize, adminOnly } = require('../middleware/auth');

// Public browsing
router.get('/', getTechnicians);

// Technician personal routes (must be before /:id)
router.get('/dashboard', protect, authorize('TECHNICIAN'), getDashboard);
router.put('/profile', protect, authorize('TECHNICIAN'), updateTechnicianProfile);
router.put('/toggle-status', protect, authorize('TECHNICIAN'), toggleStatus);

// Admin moderation
router.put('/admin/suspend/:id', protect, adminOnly, adminSuspendTechnician);
router.put('/admin/approve/:id', protect, adminOnly, adminApproveTechnician);

// Parameterized route last
router.get('/:id', getTechnician);

module.exports = router;