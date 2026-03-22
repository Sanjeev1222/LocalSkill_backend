const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const {
  getProfile,
  updateProfile,
  getSecurity,
  toggle2FA,
  logoutAllSessions,
  addSession,
  getNotifications,
  updateNotifications,
  getPrivacy,
  updatePrivacy,
  getBankAccounts,
  addBankAccount,
  removeBankAccount,
  getTechnicianSettings,
  updateTechnicianSettings,
  getOwnerSettings,
  updateOwnerSettings,
  getAllSettings
} = require('../controllers/settingsController');

// All settings routes require authentication
router.use(protect);

// Combined — get everything at once
router.get('/all', getAllSettings);

// Profile
router.get('/profile', getProfile);
router.put('/profile', updateProfile);

// Security
router.get('/security', getSecurity);
router.put('/2fa', toggle2FA);
router.post('/logout-all', logoutAllSessions);
router.post('/session', addSession);

// Notifications
router.get('/notifications', getNotifications);
router.put('/notifications', updateNotifications);

// Privacy
router.get('/privacy', getPrivacy);
router.put('/privacy', updatePrivacy);

// Payment / Bank accounts
router.get('/bank', getBankAccounts);
router.post('/bank', addBankAccount);
router.delete('/bank/:accountId', removeBankAccount);

// Technician settings (role-checked inside controller)
router.get('/technician', authorize('TECHNICIAN'), getTechnicianSettings);
router.put('/technician', authorize('TECHNICIAN'), updateTechnicianSettings);

// Owner settings (role-checked inside controller)
router.get('/owner', authorize('TOOL_OWNER'), getOwnerSettings);
router.put('/owner', authorize('TOOL_OWNER'), updateOwnerSettings);

module.exports = router;
