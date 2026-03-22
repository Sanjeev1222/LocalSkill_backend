const TechnicianProfile = require('../models/TechnicianProfile');
const User = require('../models/User');
const Booking = require('../models/Booking');
const Review = require('../models/Review');
const { asyncHandler, calculateDistance, maskPhone } = require('../utils/helpers');

const getTechnicians = asyncHandler(async (req, res) => {
  const {
    skill, minPrice, maxPrice, minExp, maxExp,
    minRating, sortBy, lat, lng, radius,
    page = 1, limit = 12
  } = req.query;

  let query = {};

  if (skill) {
    query.skills = { $in: Array.isArray(skill) ? skill : [skill] };
  }

  if (minPrice || maxPrice) {
    query.chargeRate = {};
    if (minPrice) query.chargeRate.$gte = Number(minPrice);
    if (maxPrice) query.chargeRate.$lte = Number(maxPrice);
  }

  if (minExp || maxExp) {
    query.experience = {};
    if (minExp) query.experience.$gte = Number(minExp);
    if (maxExp) query.experience.$lte = Number(maxExp);
  }

  if (minRating) {
    query['rating.average'] = { $gte: Number(minRating) };
  }

  let sortOption = {};
  switch (sortBy) {
    case 'price_low': sortOption = { chargeRate: 1 }; break;
    case 'price_high': sortOption = { chargeRate: -1 }; break;
    case 'rating': sortOption = { 'rating.average': -1 }; break;
    case 'experience': sortOption = { experience: -1 }; break;
    default: sortOption = { 'rating.average': -1 };
  }

  const skip = (Number(page) - 1) * Number(limit);

  let technicians = await TechnicianProfile.find(query)
    .populate('userId', 'name email phone avatar location')
    .sort(sortOption)
    .skip(skip)
    .limit(Number(limit));

  if (lat && lng) {
    const userLat = Number(lat);
    const userLng = Number(lng);
    const maxRadius = Number(radius) || 50;

    technicians = technicians.filter(tech => {
      if (tech.userId && tech.userId.location && tech.userId.location.coordinates) {
        const [techLng, techLat] = tech.userId.location.coordinates;
        const distance = calculateDistance(userLat, userLng, techLat, techLng);
        tech._doc.distance = Math.round(distance * 10) / 10;
        return distance <= maxRadius;
      }
      return true;
    });

    if (sortBy === 'distance' || !sortBy) {
      technicians.sort((a, b) => (a._doc.distance || 999) - (b._doc.distance || 999));
    }
  }

  const total = await TechnicianProfile.countDocuments(query);

  // Mask phone numbers in public listing
  const maskedTechnicians = technicians.map(t => {
    const obj = t.toObject ? t.toObject() : { ...t._doc };
    if (obj.userId && obj.userId.phone) {
      obj.userId.phone = maskPhone(obj.userId.phone);
    }
    return obj;
  });

  res.json({
    success: true,
    data: maskedTechnicians,
    pagination: {
      page: Number(page),
      limit: Number(limit),
      total,
      pages: Math.ceil(total / Number(limit))
    }
  });
});

const getTechnician = asyncHandler(async (req, res) => {
  const technician = await TechnicianProfile.findById(req.params.id)
    .populate('userId', 'name email phone avatar location');

  if (!technician) {
    return res.status(404).json({ success: false, message: 'Technician not found' });
  }

  const reviews = await Review.find({ targetId: technician._id, targetType: 'technician' })
    .populate('user', 'name avatar')
    .sort({ createdAt: -1 })
    .limit(20);

  const techObj = technician.toObject();
  if (techObj.userId && techObj.userId.phone) {
    techObj.userId.phone = maskPhone(techObj.userId.phone);
  }

  res.json({
    success: true,
    data: { ...techObj, reviews }
  });
});

const updateTechnicianProfile = asyncHandler(async (req, res) => {
  const { skills, experience, chargeRate, chargeType, serviceRadius, bio, availability, gallery } = req.body;

  const technician = await TechnicianProfile.findOneAndUpdate(
    { userId: req.user._id },
    { skills, experience, chargeRate, chargeType, serviceRadius, bio, availability, gallery },
    { new: true, runValidators: true }
  ).populate('userId', 'name email phone avatar location');

  if (!technician) {
    return res.status(404).json({ success: false, message: 'Technician profile not found' });
  }

  res.json({ success: true, data: technician });
});

const toggleStatus = asyncHandler(async (req, res) => {
  const technician = await TechnicianProfile.findOne({ userId: req.user._id });

  if (!technician) {
    return res.status(404).json({ success: false, message: 'Technician profile not found' });
  }

  technician.availability.isOnline = !technician.availability.isOnline;
  await technician.save();

  res.json({
    success: true,
    data: { isOnline: technician.availability.isOnline }
  });
});

const getDashboard = asyncHandler(async (req, res) => {
  const technician = await TechnicianProfile.findOne({ userId: req.user._id });

  if (!technician) {
    return res.status(404).json({ success: false, message: 'Technician profile not found' });
  }

  const totalBookings = await Booking.countDocuments({ technician: technician._id });
  const pendingBookings = await Booking.countDocuments({ technician: technician._id, status: 'pending' });
  const confirmedBookings = await Booking.countDocuments({ technician: technician._id, status: 'confirmed' });
  const completedBookings = await Booking.countDocuments({ technician: technician._id, status: 'completed' });

  const recentBookings = await Booking.find({ technician: technician._id })
    .populate('user', 'name avatar phone')
    .sort({ createdAt: -1 })
    .limit(10);

  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  const monthlyEarnings = await Booking.aggregate([
    {
      $match: {
        technician: technician._id,
        status: 'completed',
        completedAt: { $gte: sixMonthsAgo }
      }
    },
    {
      $group: {
        _id: { $month: '$completedAt' },
        total: { $sum: '$finalCost' },
        count: { $sum: 1 }
      }
    },
    { $sort: { _id: 1 } }
  ]);

  res.json({
    success: true,
    data: {
      technician,
      isOnline: technician.availability?.isOnline || false,
      totalBookings,
      pendingBookings,
      confirmedBookings,
      completedBookings,
      completedJobs: completedBookings,
      totalEarnings: technician.totalEarnings || 0,
      rating: technician.rating || { average: 0, count: 0 },
      recentBookings,
      monthlyEarnings
    }
  });
});

const adminSuspendTechnician = asyncHandler(async (req, res) => {
  const technician = await TechnicianProfile.findById(req.params.id).populate('userId');
  if (!technician) {
    return res.status(404).json({ success: false, message: 'Technician not found' });
  }

  const user = await User.findById(technician.userId._id);
  if (!user) {
    return res.status(404).json({ success: false, message: 'Associated user not found' });
  }

  user.isBanned = !user.isBanned;
  await user.save();

  res.json({
    success: true,
    data: { isSuspended: user.isBanned },
    message: user.isBanned ? 'Technician has been suspended' : 'Technician has been unsuspended'
  });
});

const adminApproveTechnician = asyncHandler(async (req, res) => {
  const technician = await TechnicianProfile.findById(req.params.id);
  if (!technician) {
    return res.status(404).json({ success: false, message: 'Technician not found' });
  }

  technician.isVerified = !technician.isVerified;
  await technician.save();

  res.json({
    success: true,
    data: { isVerified: technician.isVerified },
    message: technician.isVerified ? 'Technician has been approved' : 'Technician approval revoked'
  });
});

module.exports = {
  getTechnicians,
  getTechnician,
  updateTechnicianProfile,
  toggleStatus,
  getDashboard,
  adminSuspendTechnician,
  adminApproveTechnician
};
