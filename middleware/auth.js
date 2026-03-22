const jwt = require('jsonwebtoken');
const User = require('../models/User');

const protect = async (req, res, next) => {
  let token;

  if (req.headers.authorization?.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({ success: false, message: 'Not authorized, token missing' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findById(decoded.id).select('-password');

    if (!user) {
      return res.status(401).json({ success: false, message: 'User no longer exists' });
    }

    if (!user.isActive) {
      return res.status(403).json({ success: false, message: 'Account is inactive' });
    }

    if (user.isBanned) {
      return res.status(403).json({ success: false, message: 'Account has been suspended' });
    }

    req.user = user;

    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Session expired, please login again' });
    }
    return res.status(401).json({ success: false, message: 'Invalid token' });
  }
};

// Role based access
const authorize = (...roles) => {
  return (req, res, next) => {
    const userRoles = req.user.roles || ['USER'];
    const hasRole = userRoles.some(r => roles.includes(r));
    if (!hasRole) {
      return res.status(403).json({
        success: false,
        message: `Your roles [${userRoles.join(', ')}] are not permitted for this action`
      });
    }
    next();
  };
};

// Admin shortcut middleware
const adminOnly = (req, res, next) => {
  const userRoles = req.user.roles || ['USER'];
  if (!userRoles.includes('ADMIN')) {
    return res.status(403).json({ success: false, message: 'Admin access only' });
  }
  next();
};

// Optional auth (for public routes)
const optionalAuth = async (req, res, next) => {
  try {
    if (req.headers.authorization?.startsWith('Bearer')) {
      const token = req.headers.authorization.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = await User.findById(decoded.id).select('-password');
    }
  } catch (err) {}
  next();
};

module.exports = { protect, authorize, adminOnly, optionalAuth };