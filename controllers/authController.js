const User = require('../models/User');
const Technician = require('../models/Technician');
const ToolOwner = require('../models/ToolOwner');
const { generateToken, asyncHandler, validatePhone } = require('../utils/helpers');

const twilioClient = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const VERIFY_SERVICE_SID = process.env.TWILIO_VERIFY_SERVICE_SID;

// ─── Send OTP for phone verification (registration) ───
const sendRegisterOTP = asyncHandler(async (req, res) => {
  const { phone } = req.body;

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

const register = asyncHandler(async (req, res) => {
  const { name, email, password, phone, role, location } = req.body;

  // Validate phone if provided
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

  const user = await User.create({
    name, email, password,
    phone: phone || undefined,
    isPhoneVerified: !!phone,
    role: role || 'user',
    location: location || {}
  });

  if (role === 'technician') {
    const { skills, experience, chargeRate, chargeType, serviceRadius, bio, availability } = req.body;
    await Technician.create({
      user: user._id,
      skills: skills || [],
      experience: experience || 0,
      chargeRate: chargeRate || 0,
      chargeType: chargeType || 'hourly',
      serviceRadius: serviceRadius || 10,
      bio: bio || '',
      availability: availability || { isOnline: true, slots: [] }
    });
  }

  if (role === 'toolowner') {
    const { shopName, description } = req.body;
    await ToolOwner.create({
      user: user._id,
      shopName: shopName || `${name}'s Shop`,
      description: description || ''
    });
  }

  const token = generateToken(user._id);

  res.status(201).json({
    success: true,
    data: {
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      token
    }
  });
});

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

  // get profile data if exists
  let profile = null;
  if (user.role === 'technician') {
    profile = await Technician.findOne({ user: user._id });
  } else if (user.role === 'toolowner') {
    profile = await ToolOwner.findOne({ user: user._id });
  }

  res.json({
    success: true,
    data: {
      _id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      avatar: user.avatar,
      location: user.location,
      darkMode: user.darkMode,
      profile,
      token
    }
  });
});

const getMe = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);

  let profile = null;
  if (user.role === 'technician') {
    profile = await Technician.findOne({ user: user._id });
  } else if (user.role === 'toolowner') {
    profile = await ToolOwner.findOne({ user: user._id });
  }

  res.json({
    success: true,
    data: { ...user.toObject(), profile }
  });
});

const updateProfile = asyncHandler(async (req, res) => {
  const { name, phone, location, avatar, darkMode } = req.body;

  // Validate phone if provided
  if (phone) {
    const phoneCheck = validatePhone(phone);
    if (!phoneCheck.valid) {
      return res.status(400).json({ success: false, message: phoneCheck.message });
    }
  }

  const user = await User.findByIdAndUpdate(
    req.user._id,
    { name, phone, location, avatar, darkMode },
    { new: true, runValidators: true }
  );

  res.json({ success: true, data: user });
});

// ─── Google OAuth Login / Register ───
const googleAuth = asyncHandler(async (req, res) => {
  const { googleId, email, name, avatar } = req.body;

  if (!googleId || !email) {
    return res.status(400).json({ success: false, message: 'Google ID and email are required' });
  }

  // Check if user exists with this Google ID
  let user = await User.findOne({ googleId });

  if (!user) {
    // Check if email already exists (link accounts)
    user = await User.findOne({ email });
    if (user) {
      user.googleId = googleId;
      user.isEmailVerified = true;
      if (avatar && !user.avatar) user.avatar = avatar;
      await user.save();
    } else {
      // Create new user via Google
      user = await User.create({
        name,
        email,
        googleId,
        avatar: avatar || '',
        isEmailVerified: true,
        role: 'user'
      });
    }
  }

  if (user.isBanned) {
    return res.status(403).json({ success: false, message: 'Account has been suspended' });
  }

  const token = generateToken(user._id);

  let profile = null;
  if (user.role === 'technician') {
    profile = await Technician.findOne({ user: user._id });
  } else if (user.role === 'toolowner') {
    profile = await ToolOwner.findOne({ user: user._id });
  }

  res.json({
    success: true,
    data: {
      _id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      avatar: user.avatar,
      location: user.location,
      darkMode: user.darkMode,
      isEmailVerified: user.isEmailVerified,
      isPhoneVerified: user.isPhoneVerified,
      profile,
      token
    }
  });
});

module.exports = { register, login, getMe, updateProfile, googleAuth, sendRegisterOTP, verifyRegisterOTP };
