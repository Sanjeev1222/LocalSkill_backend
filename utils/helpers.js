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

// ─── Phone number masking (privacy) ───
const maskPhone = (phone) => {
  if (!phone) return '';
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length < 4) return '****';
  return cleaned.slice(0, 2) + '****' + cleaned.slice(-2);
};

module.exports = { generateToken, calculateDistance, asyncHandler, validatePhone, maskPhone };
