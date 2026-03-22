const User = require('../models/User');
const TechnicianProfile = require('../models/TechnicianProfile');
const OwnerProfile = require('../models/OwnerProfile');
const { generateToken, asyncHandler, validatePhone } = require('../utils/helpers');

const twilioClient = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const VERIFY_SERVICE_SID = process.env.TWILIO_VERIFY_SERVICE_SID;

// ─── Helper: build user response with all profiles ───
const buildUserResponse = async (user, token) => {
  const roles = user.roles || ['USER'];
  const profiles = {};

  if (roles.includes('TECHNICIAN')) {
    profiles.technician = await TechnicianProfile.findOne({ userId: user._id });
  }
  if (roles.includes('TOOL_OWNER')) {
    profiles.toolOwner = await OwnerProfile.findOne({ userId: user._id });
  }

  return {
    _id: user._id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.activeRole || roles[0],
    roles,
    activeRole: user.activeRole || roles[0],
    avatar: user.avatar,
    geoLocation: user.geoLocation,
    address: user.address,
    isEmailVerified: user.isEmailVerified,
    isPhoneVerified: user.isPhoneVerified,
    profiles,
    token
  };
};

// ─── Send OTP for phone verification (registration) ───
const sendRegisterOTP = asyncHandler(async (req, res) => {
  const { phone, name, email } = req.body;

  if (!name || !email) {
    return res.status(400).json({ success: false, message: 'Please complete the registration form before verifying phone' });
  }

  const phoneCheck = validatePhone(phone);
  if (!phoneCheck.valid) {
    return res.status(400).json({ success: false, message: phoneCheck.message });
  }

  const verification = await twilioClient.verify.v2
    .services(VERIFY_SERVICE_SID)
    .verifications.create({ to: `+91${phone}`, channel: 'sms' });

  res.json({
    success: true,
    message: 'OTP sent successfully to your phone',
    status: verification.status
  });
});

// ─── Verify OTP for registration ───
const verifyRegisterOTP = asyncHandler(async (req, res) => {
  const { phone, otp } = req.body;

  const verificationCheck = await twilioClient.verify.v2
    .services(VERIFY_SERVICE_SID)
    .verificationChecks.create({ to: `+91${phone}`, code: otp });

  if (verificationCheck.status !== 'approved') {
    return res.status(400).json({ success: false, message: 'Invalid OTP. Please try again.' });
  }

  res.json({ success: true, message: 'Phone verified successfully' });
});

// ─── Register (multi-role) ───
const register = asyncHandler(async (req, res) => {
  const { name, email, password, phone, role, roles: requestedRoles, geoLocation, address } = req.body;

  // Input validation
  if (!name || !email || !password) {
    return res.status(400).json({ success: false, message: 'Name, email, and password are required' });
  }

  if (name.length > 50) {
    return res.status(400).json({ success: false, message: 'Name cannot exceed 50 characters' });
  }

  if (password.length < 6) {
    return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
  }

  const emailRegex = /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ success: false, message: 'Please enter a valid email address' });
  }

  if (phone) {
    const phoneCheck = validatePhone(phone);
    if (!phoneCheck.valid) {
      return res.status(400).json({ success: false, message: phoneCheck.message });
    }
  }

  const existingUser = await User.findOne({ email });
  if (existingUser) {
    return res.status(400).json({ success: false, message: 'Email already registered' });
  }

  // Build roles array — everyone gets 'USER' + any additional role
  let userRoles = ['USER'];
  const selectedRole = role || 'USER';
  // Prevent admin role self-assignment during registration
  if (['TECHNICIAN', 'TOOL_OWNER'].includes(selectedRole) && !userRoles.includes(selectedRole)) {
    userRoles.push(selectedRole);
  }
  // Also support explicit roles array from frontend
  if (requestedRoles && Array.isArray(requestedRoles)) {
    requestedRoles.forEach(r => {
      if (['TECHNICIAN', 'TOOL_OWNER'].includes(r) && !userRoles.includes(r)) {
        userRoles.push(r);
      }
    });
  }

  const user = await User.create({
    name, email, password,
    phone: phone || undefined,
    isPhoneVerified: !!phone,
    roles: userRoles,
    activeRole: selectedRole !== 'USER' ? selectedRole : 'USER',
    geoLocation: geoLocation || {},
    address: address || {}
  });

  // Create technician profile if role selected
  if (userRoles.includes('TECHNICIAN')) {
    const { skills, experienceYears, hourlyRate, chargeType, serviceRadiusKm, bio, availability } = req.body;
    await TechnicianProfile.create({
      userId: user._id,
      skills: skills || [],
      experienceYears: experienceYears || 0,
      hourlyRate: hourlyRate || 0,
      chargeType: chargeType || 'hourly',
      serviceRadiusKm: serviceRadiusKm || 10,
      bio: bio || '',
      availability: availability || { isOnline: true, slots: [] }
    });
  }

  // Create tool owner profile if role selected
  if (userRoles.includes('TOOL_OWNER')) {
    const { businessName, description } = req.body;
    await OwnerProfile.create({
      userId: user._id,
      businessName: businessName || `${name}'s Shop`,
      description: description || ''
    });
  }

  const token = generateToken(user._id);
  const responseData = await buildUserResponse(user, token);

  res.status(201).json({ success: true, data: responseData });
});

// ─── Login (multi-role) ───
const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ success: false, message: 'Please provide email and password' });
  }

  const user = await User.findOne({ email }).select('+password');
  if (!user) {
    return res.status(401).json({ success: false, message: 'Invalid credentials' });
  }

  if (user.isBanned) {
    return res.status(403).json({ success: false, message: 'Account has been suspended' });
  }

  const isMatch = await user.matchPassword(password);
  if (!isMatch) {
    return res.status(401).json({ success: false, message: 'Invalid credentials' });
  }

  const token = generateToken(user._id);
  const responseData = await buildUserResponse(user, token);

  res.json({ success: true, data: responseData });
});

// ─── Get current user (multi-role) ───
const getMe = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  const responseData = await buildUserResponse(user, null);
  delete responseData.token;

  res.json({ success: true, data: responseData });
});

// ─── Update profile ───
const updateProfile = asyncHandler(async (req, res) => {
  const { name, phone, geoLocation, address, avatar } = req.body;

  if (phone) {
    const phoneCheck = validatePhone(phone);
    if (!phoneCheck.valid) {
      return res.status(400).json({ success: false, message: phoneCheck.message });
    }
  }

  const user = await User.findByIdAndUpdate(
    req.user._id,
    { name, phone, geoLocation, address, avatar },
    { new: true, runValidators: true }
  );

  res.json({ success: true, data: user });
});

// ─── Switch active role ───
const switchRole = asyncHandler(async (req, res) => {
  const { role } = req.body;
  const user = await User.findById(req.user._id);

  if (!user.roles.includes(role)) {
    return res.status(400).json({ success: false, message: `You don't have the '${role}' role` });
  }

  user.activeRole = role;
  await user.save();

  const responseData = await buildUserResponse(user, null);
  delete responseData.token;

  res.json({ success: true, data: responseData, message: `Switched to ${role} mode` });
});

// ─── Add role to existing account (role upgrade) ───
const addRole = asyncHandler(async (req, res) => {
  const { role } = req.body;
  const user = await User.findById(req.user._id);

  if (!['TECHNICIAN', 'TOOL_OWNER'].includes(role)) {
    return res.status(400).json({ success: false, message: 'Invalid role. Can only add technician or toolowner.' });
  }

  if (user.roles.includes(role)) {
    return res.status(400).json({ success: false, message: `You already have the '${role}' role` });
  }

  // Create the corresponding profile
  if (role === 'TECHNICIAN') {
    const { skills, experienceYears, hourlyRate, chargeType, serviceRadiusKm, bio } = req.body;
    const existing = await TechnicianProfile.findOne({ userId: user._id });
    if (!existing) {
      await TechnicianProfile.create({
        userId: user._id,
        skills: skills || [],
        experienceYears: experienceYears || 0,
        hourlyRate: hourlyRate || 0,
        chargeType: chargeType || 'hourly',
        serviceRadiusKm: serviceRadiusKm || 10,
        bio: bio || ''
      });
    }
  }

  if (role === 'TOOL_OWNER') {
    const { businessName, description } = req.body;
    const existing = await OwnerProfile.findOne({ userId: user._id });
    if (!existing) {
      await OwnerProfile.create({
        userId: user._id,
        businessName: businessName || `${user.name}'s Shop`,
        description: description || ''
      });
    }
  }

  user.roles.push(role);
  user.activeRole = role;
  await user.save();

  const token = generateToken(user._id);
  const responseData = await buildUserResponse(user, token);

  res.json({ success: true, data: responseData, message: `${role} role added successfully!` });
});

// ─── Google OAuth Login / Register (multi-role) ───
const googleAuth = asyncHandler(async (req, res) => {
  const { googleId, email, name, avatar } = req.body;

  if (!googleId || !email) {
    return res.status(400).json({ success: false, message: 'Google ID and email are required' });
  }

  let user = await User.findOne({ googleId });

  if (!user) {
    user = await User.findOne({ email });
    if (user) {
      user.googleId = googleId;
      user.isEmailVerified = true;
      if (avatar && !user.avatar) user.avatar = avatar;
      await user.save();
    } else {
      user = await User.create({
        name,
        email,
        googleId,
        avatar: avatar || '',
        isEmailVerified: true,
        roles: ['USER'],
        activeRole: 'USER'
      });
    }
  }

  if (user.isBanned) {
    return res.status(403).json({ success: false, message: 'Account has been suspended' });
  }

  const token = generateToken(user._id);
  const responseData = await buildUserResponse(user, token);

  res.json({ success: true, data: responseData });
});

module.exports = {
  register, login, getMe, updateProfile, googleAuth,
  sendRegisterOTP, verifyRegisterOTP,
  switchRole, addRole
};
