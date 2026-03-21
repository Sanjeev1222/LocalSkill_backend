const jwt = require('jsonwebtoken');

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || '30d'
  });
};

const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

const toRad = (value) => (value * Math.PI) / 180;

const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

// ─── Phone number validation ───
const validatePhone = (phone) => {
  if (!phone) return { valid: true };
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length !== 10) {
    return { valid: false, message: 'Phone number must be exactly 10 digits' };
  }
  return { valid: true, cleaned };
};

// ─── OTP Store (in-memory for demo, use Redis in production) ───
const otpStore = new Map();

const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

const storeOTP = (key, purpose = 'verification') => {
  const otp = generateOTP();
  const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes
  otpStore.set(`${key}_${purpose}`, { otp, expiresAt });
  return otp;
};

const verifyOTP = (key, otp, purpose = 'verification') => {
  const storeKey = `${key}_${purpose}`;
  const stored = otpStore.get(storeKey);
  if (!stored) return { valid: false, message: 'OTP not found or expired. Please request a new one.' };
  if (Date.now() > stored.expiresAt) {
    otpStore.delete(storeKey);
    return { valid: false, message: 'OTP has expired. Please request a new one.' };
  }
  if (stored.otp !== otp) return { valid: false, message: 'Invalid OTP. Please try again.' };
  otpStore.delete(storeKey);
  return { valid: true };
};

module.exports = { generateToken, calculateDistance, asyncHandler, validatePhone, generateOTP, storeOTP, verifyOTP };
