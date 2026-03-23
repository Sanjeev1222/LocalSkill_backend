const User = require('../models/User');
const TechnicianProfile = require('../models/TechnicianProfile');
const OwnerProfile = require('../models/OwnerProfile');
const admin = require('../config/firebaseAdmin');
const { OAuth2Client } = require('google-auth-library');
const { generateToken, asyncHandler, validatePhone } = require('../utils/helpers');

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

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

// ─── Firebase Phone Authentication (login or register) ───
const firebaseLogin = asyncHandler(async (req, res) => {
  const { idToken } = req.body;

  if (!idToken) {
    return res.status(400).json({ success: false, message: 'Firebase ID token is required' });
  }

  // Verify token — backend is the security boundary, never trust client
  let decodedToken;
  try {
    decodedToken = await admin.auth().verifyIdToken(idToken);
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Invalid or expired Firebase token' });
  }

  const { uid: firebaseUid, phone_number: rawPhone } = decodedToken;
  if (!rawPhone) {
    return res.status(400).json({ success: false, message: 'Phone authentication required' });
  }

  // Normalise: +91XXXXXXXXXX → 10-digit string stored in User.phone
  const digits = rawPhone.replace(/\D/g, '');
  const phone = digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits;

  const {
    name, email, password, role, roles: requestedRoles,
    geoLocation, address, skills, experienceYears, hourlyRate,
    chargeType, serviceRadiusKm, bio, businessName, description
  } = req.body;

  let user = await User.findOne({ $or: [{ firebaseUid }, { phone }] });
  let isNewUser = false;

  if (user) {
    if (user.isBanned) {
      return res.status(403).json({ success: false, message: 'Account has been suspended' });
    }
    // Link Firebase UID if this account was previously email/password only
    if (!user.firebaseUid) {
      user.firebaseUid = firebaseUid;
      user.isPhoneVerified = true;
      await user.save();
    }
  } else {
    isNewUser = true;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Name is required for new accounts' });
    }

    let userRoles = ['USER'];
    const selectedRole = role || 'USER';
    if (['TECHNICIAN', 'TOOL_OWNER'].includes(selectedRole)) userRoles.push(selectedRole);
    if (Array.isArray(requestedRoles)) {
      requestedRoles.forEach(r => {
        if (['TECHNICIAN', 'TOOL_OWNER'].includes(r) && !userRoles.includes(r)) userRoles.push(r);
      });
    }

    if (email) {
      const emailExists = await User.findOne({ email: email.toLowerCase() });
      if (emailExists) {
        return res.status(400).json({ success: false, message: 'Email already registered' });
      }
    }

    try {
      user = await User.create({
        name: name.trim(),
        email: email ? email.toLowerCase() : undefined,
        password: password || undefined,
        phone,
        firebaseUid,
        isPhoneVerified: true,
        roles: userRoles,
        activeRole: selectedRole,
        geoLocation: geoLocation || { type: 'Point', coordinates: [0, 0] },
        address: address || {}
      });
    } catch (err) {
      if (err.code === 11000) {
        // Race condition: concurrent request already created the user
        user = await User.findOne({ $or: [{ firebaseUid }, { phone }] });
        if (!user) throw err;
      } else {
        throw err;
      }
    }
  }

  // Ensure TechnicianProfile exists for TECHNICIAN users (handles first-time + retry after partial failure)
  if (user.roles.includes('TECHNICIAN')) {
    const existingProfile = await TechnicianProfile.findOne({ userId: user._id });
    if (!existingProfile) {
      try {
        await TechnicianProfile.create({
          userId: user._id,
          skills: skills || [],
          experienceYears: Number(experienceYears) || 0,
          hourlyRate: Number(hourlyRate) || 0,
          chargeType: chargeType || 'hourly',
          serviceRadiusKm: Number(serviceRadiusKm) || 10,
          bio: bio || ''
        });
      } catch (profileErr) {
        // If profile creation fails, clean up the orphaned user (only for new registrations)
        if (isNewUser) {
          await User.deleteOne({ _id: user._id });
        }
        throw profileErr;
      }
    }
  }

  // Ensure OwnerProfile exists for TOOL_OWNER users
  if (user.roles.includes('TOOL_OWNER')) {
    const existingProfile = await OwnerProfile.findOne({ userId: user._id });
    if (!existingProfile) {
      try {
        await OwnerProfile.create({
          userId: user._id,
          businessName: businessName || `${(user.name || name || '').trim()}'s Shop`,
          description: description || ''
        });
      } catch (profileErr) {
        if (isNewUser) {
          await User.deleteOne({ _id: user._id });
        }
        throw profileErr;
      }
    }
  }

  const token = generateToken(user._id);
  const responseData = await buildUserResponse(user, token);
  res.status(isNewUser ? 201 : 200).json({ success: true, data: responseData, isNewUser });
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
    isPhoneVerified: false,
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
  const { credential } = req.body;

  if (!credential) {
    return res.status(400).json({ success: false, message: 'Google credential token is required' });
  }

  // Verify the Google ID token server-side — never trust client-decoded data
  let payload;
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID
    });
    payload = ticket.getPayload();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Invalid Google token' });
  }

  const { sub: googleId, email, name, picture: avatar } = payload;

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
  firebaseLogin,
  switchRole, addRole
};
