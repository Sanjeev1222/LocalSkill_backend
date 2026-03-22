const UserSettings = require('../models/UserSettings');
const TechnicianSettings = require('../models/TechnicianSettings');
const OwnerSettings = require('../models/OwnerSettings');
const Technician = require('../models/Technician');
const ToolOwner = require('../models/ToolOwner');
const { asyncHandler } = require('../utils/helpers');

// ─── Helper: get or create UserSettings ───
const getOrCreateSettings = async (userId) => {
  let settings = await UserSettings.findOne({ user: userId });
  if (!settings) {
    settings = await UserSettings.create({ user: userId });
  }
  return settings;
};

// ════════════════════════════════════════
// PROFILE
// ════════════════════════════════════════

const getProfile = asyncHandler(async (req, res) => {
  const settings = await getOrCreateSettings(req.user._id);
  res.json({
    success: true,
    data: {
      profile: settings.profile,
      name: req.user.name,
      email: req.user.email,
      phone: req.user.phone,
      avatar: req.user.avatar,
      roles: req.user.roles,
      activeRole: req.user.activeRole,
      isPhoneVerified: req.user.isPhoneVerified,
      isEmailVerified: req.user.isEmailVerified,
      isVerified: req.user.isVerified,
      rating: req.user.rating,
      totalReviews: req.user.totalReviews,
      createdAt: req.user.createdAt
    }
  });
});

const updateProfile = asyncHandler(async (req, res) => {
  const allowed = ['bio', 'address', 'language', 'darkMode'];
  const updates = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) {
      updates[`profile.${key}`] = req.body[key];
    }
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ success: false, message: 'No valid fields to update' });
  }

  const settings = await UserSettings.findOneAndUpdate(
    { user: req.user._id },
    { $set: updates },
    { new: true, upsert: true, runValidators: true }
  );

  // Sync darkMode to User model
  if (req.body.darkMode !== undefined) {
    req.user.darkMode = req.body.darkMode;
    await req.user.save();
  }

  res.json({ success: true, data: settings.profile });
});

// ════════════════════════════════════════
// SECURITY
// ════════════════════════════════════════

const getSecurity = asyncHandler(async (req, res) => {
  const settings = await getOrCreateSettings(req.user._id);
  res.json({
    success: true,
    data: {
      twoFactorEnabled: settings.security.twoFactorEnabled,
      activeSessions: settings.security.activeSessions
    }
  });
});

const toggle2FA = asyncHandler(async (req, res) => {
  const settings = await getOrCreateSettings(req.user._id);
  settings.security.twoFactorEnabled = !settings.security.twoFactorEnabled;
  await settings.save();

  res.json({
    success: true,
    data: { twoFactorEnabled: settings.security.twoFactorEnabled },
    message: settings.security.twoFactorEnabled ? '2FA enabled' : '2FA disabled'
  });
});

const logoutAllSessions = asyncHandler(async (req, res) => {
  const settings = await getOrCreateSettings(req.user._id);
  settings.security.activeSessions = [];
  await settings.save();

  res.json({ success: true, message: 'All sessions logged out' });
});

const addSession = asyncHandler(async (req, res) => {
  const { device, location } = req.body;
  if (!device) {
    return res.status(400).json({ success: false, message: 'Device name is required' });
  }

  const settings = await getOrCreateSettings(req.user._id);

  // Keep max 10 sessions
  if (settings.security.activeSessions.length >= 10) {
    settings.security.activeSessions.shift();
  }

  settings.security.activeSessions.push({
    device,
    location: location || '',
    ip: req.ip || '',
    lastActive: new Date()
  });
  await settings.save();

  res.json({ success: true, data: settings.security.activeSessions });
});

// ════════════════════════════════════════
// NOTIFICATIONS
// ════════════════════════════════════════

const getNotifications = asyncHandler(async (req, res) => {
  const settings = await getOrCreateSettings(req.user._id);
  res.json({ success: true, data: settings.notifications });
});

const updateNotifications = asyncHandler(async (req, res) => {
  const allowed = ['jobAlerts', 'rentalAlerts', 'paymentAlerts', 'marketing', 'sms', 'email'];
  const updates = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) {
      updates[`notifications.${key}`] = req.body[key];
    }
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ success: false, message: 'No valid fields to update' });
  }

  const settings = await UserSettings.findOneAndUpdate(
    { user: req.user._id },
    { $set: updates },
    { new: true, upsert: true, runValidators: true }
  );

  res.json({ success: true, data: settings.notifications });
});

// ════════════════════════════════════════
// PRIVACY
// ════════════════════════════════════════

const getPrivacy = asyncHandler(async (req, res) => {
  const settings = await getOrCreateSettings(req.user._id);
  res.json({ success: true, data: settings.privacy });
});

const updatePrivacy = asyncHandler(async (req, res) => {
  const allowed = ['showPhone', 'showLocation', 'profileVisibility'];
  const updates = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) {
      updates[`privacy.${key}`] = req.body[key];
    }
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ success: false, message: 'No valid fields to update' });
  }

  const settings = await UserSettings.findOneAndUpdate(
    { user: req.user._id },
    { $set: updates },
    { new: true, upsert: true, runValidators: true }
  );

  res.json({ success: true, data: settings.privacy });
});

// ════════════════════════════════════════
// PAYMENT / BANK ACCOUNTS
// ════════════════════════════════════════

const getBankAccounts = asyncHandler(async (req, res) => {
  const settings = await getOrCreateSettings(req.user._id);
  res.json({ success: true, data: settings.payment.bankAccounts });
});

const addBankAccount = asyncHandler(async (req, res) => {
  const { label, accountNumber, ifsc, upi } = req.body;

  if (!accountNumber && !upi) {
    return res.status(400).json({ success: false, message: 'Account number or UPI is required' });
  }

  const settings = await getOrCreateSettings(req.user._id);

  if (settings.payment.bankAccounts.length >= 5) {
    return res.status(400).json({ success: false, message: 'Maximum 5 bank accounts allowed' });
  }

  settings.payment.bankAccounts.push({
    label: label || 'Account',
    accountNumber: accountNumber || '',
    ifsc: ifsc || '',
    upi: upi || ''
  });
  await settings.save();

  res.status(201).json({ success: true, data: settings.payment.bankAccounts });
});

const removeBankAccount = asyncHandler(async (req, res) => {
  const { accountId } = req.params;
  const settings = await getOrCreateSettings(req.user._id);

  const idx = settings.payment.bankAccounts.findIndex(a => a._id.toString() === accountId);
  if (idx === -1) {
    return res.status(404).json({ success: false, message: 'Bank account not found' });
  }

  settings.payment.bankAccounts.splice(idx, 1);
  await settings.save();

  res.json({ success: true, data: settings.payment.bankAccounts });
});

// ════════════════════════════════════════
// TECHNICIAN SETTINGS
// ════════════════════════════════════════

const getTechnicianSettings = asyncHandler(async (req, res) => {
  const userRoles = req.user.roles || [];
  if (!userRoles.includes('technician')) {
    return res.status(403).json({ success: false, message: 'Technician role required' });
  }

  let settings = await TechnicianSettings.findOne({ user: req.user._id });
  if (!settings) {
    // Seed from existing Technician profile
    const techProfile = await Technician.findOne({ user: req.user._id });
    settings = await TechnicianSettings.create({
      user: req.user._id,
      skills: techProfile?.skills || [],
      experienceYears: techProfile?.experience || 0,
      hourlyRate: techProfile?.chargeRate || 0,
      serviceRadiusKm: techProfile?.serviceRadius || 10
    });
  }

  res.json({ success: true, data: settings });
});

const updateTechnicianSettings = asyncHandler(async (req, res) => {
  const userRoles = req.user.roles || [];
  if (!userRoles.includes('technician')) {
    return res.status(403).json({ success: false, message: 'Technician role required' });
  }

  const allowed = ['skills', 'experienceYears', 'hourlyRate', 'serviceRadiusKm', 'workingHours', 'autoAcceptJobs'];
  const updates = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) {
      updates[key] = req.body[key];
    }
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ success: false, message: 'No valid fields to update' });
  }

  const settings = await TechnicianSettings.findOneAndUpdate(
    { user: req.user._id },
    { $set: updates },
    { new: true, upsert: true, runValidators: true }
  );

  // Sync key fields back to Technician profile
  const techSync = {};
  if (updates.skills) techSync.skills = updates.skills;
  if (updates.experienceYears !== undefined) techSync.experience = updates.experienceYears;
  if (updates.hourlyRate !== undefined) techSync.chargeRate = updates.hourlyRate;
  if (updates.serviceRadiusKm !== undefined) techSync.serviceRadius = updates.serviceRadiusKm;

  if (Object.keys(techSync).length > 0) {
    await Technician.findOneAndUpdate({ user: req.user._id }, { $set: techSync });
  }

  res.json({ success: true, data: settings });
});

// ════════════════════════════════════════
// OWNER SETTINGS
// ════════════════════════════════════════

const getOwnerSettings = asyncHandler(async (req, res) => {
  const userRoles = req.user.roles || [];
  if (!userRoles.includes('toolowner')) {
    return res.status(403).json({ success: false, message: 'Tool Owner role required' });
  }

  let settings = await OwnerSettings.findOne({ user: req.user._id });
  if (!settings) {
    settings = await OwnerSettings.create({ user: req.user._id });
  }

  res.json({ success: true, data: settings });
});

const updateOwnerSettings = asyncHandler(async (req, res) => {
  const userRoles = req.user.roles || [];
  if (!userRoles.includes('toolowner')) {
    return res.status(403).json({ success: false, message: 'Tool Owner role required' });
  }

  const allowed = ['defaultPricing', 'lateFeePerHour', 'depositRequired', 'autoApproval', 'insuranceEnabled'];
  const updates = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) {
      updates[key] = req.body[key];
    }
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ success: false, message: 'No valid fields to update' });
  }

  const settings = await OwnerSettings.findOneAndUpdate(
    { user: req.user._id },
    { $set: updates },
    { new: true, upsert: true, runValidators: true }
  );

  res.json({ success: true, data: settings });
});

// ════════════════════════════════════════
// COMBINED — get all settings at once
// ════════════════════════════════════════

const getAllSettings = asyncHandler(async (req, res) => {
  const userSettings = await getOrCreateSettings(req.user._id);
  const userRoles = req.user.roles || [];

  const result = {
    profile: {
      ...userSettings.profile.toObject(),
      name: req.user.name,
      email: req.user.email,
      phone: req.user.phone,
      avatar: req.user.avatar,
      roles: req.user.roles,
      activeRole: req.user.activeRole,
      isPhoneVerified: req.user.isPhoneVerified,
      isVerified: req.user.isVerified,
      rating: req.user.rating,
      totalReviews: req.user.totalReviews,
      createdAt: req.user.createdAt
    },
    security: userSettings.security,
    notifications: userSettings.notifications,
    privacy: userSettings.privacy,
    payment: userSettings.payment
  };

  if (userRoles.includes('technician')) {
    let techSettings = await TechnicianSettings.findOne({ user: req.user._id });
    if (!techSettings) {
      const techProfile = await Technician.findOne({ user: req.user._id });
      techSettings = await TechnicianSettings.create({
        user: req.user._id,
        skills: techProfile?.skills || [],
        experienceYears: techProfile?.experience || 0,
        hourlyRate: techProfile?.chargeRate || 0,
        serviceRadiusKm: techProfile?.serviceRadius || 10
      });
    }
    result.technician = techSettings;
  }

  if (userRoles.includes('toolowner')) {
    let ownerSettings = await OwnerSettings.findOne({ user: req.user._id });
    if (!ownerSettings) {
      ownerSettings = await OwnerSettings.create({ user: req.user._id });
    }
    result.owner = ownerSettings;
  }

  res.json({ success: true, data: result });
});

module.exports = {
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
};
