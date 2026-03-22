const express = require('express');
const router = express.Router();

const {
  getTools,
  getTool,
  addTool,
  updateTool,
  deleteTool,
  getMyTools,
  adminDeleteTool,
  approveTool
} = require('../controllers/toolController');

const { protect, authorize, adminOnly } = require('../middleware/auth');

// Public browsing
router.get('/', getTools);

// Toolowner personal tools (must be before /:id)
router.get('/my-tools', protect, authorize('TOOL_OWNER'), getMyTools);

// Admin moderation
router.delete('/admin/:id', protect, adminOnly, adminDeleteTool);
router.put('/admin/approve/:id', protect, adminOnly, approveTool);

// Parameterized routes last
router.get('/:id', getTool);

// Toolowner CRUD
router.post('/', protect, authorize('TOOL_OWNER'), addTool);
router.put('/:id', protect, authorize('TOOL_OWNER'), updateTool);
router.delete('/:id', protect, authorize('TOOL_OWNER'), deleteTool);

module.exports = router;