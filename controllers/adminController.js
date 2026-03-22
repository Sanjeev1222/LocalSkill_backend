const User = require('../models/User');
const Technician = require('../models/Technician');
const ToolOwner = require('../models/ToolOwner');
const Tool = require('../models/Tool');
const Booking = require('../models/Booking');
const Rental = require('../models/Rental');
const Payment = require('../models/Payment');
const Review = require('../models/Review');
const { asyncHandler } = require('../utils/helpers');

const getDashboard = asyncHandler(async (req, res) => {
  const [
    totalUsers,
    totalTechnicians,
    totalToolOwners,
    totalTools,
    totalBookings,
    totalRentals,
    completedBookings,
    completedRentals,
    pendingBookings,
    verifiedTechnicians
  ] = await Promise.all([
    User.countDocuments({ roles: 'user' }),
    Technician.countDocuments(),
    ToolOwner.countDocuments(),
    Tool.countDocuments(),
    Booking.countDocuments(),
    Rental.countDocuments(),
    Booking.countDocuments({ status: 'completed' }),
    Rental.countDocuments({ status: 'returned' }),
    Booking.countDocuments({ status: 'pending' }),
    Technician.countDocuments({ isVerified: true })
  ]);

  const bookingRevenue = await Payment.aggregate([
    { $match: { type: 'booking', status: 'completed' } },
    { $group: { _id: null, total: { $sum: '$amount' } } }
  ]);

  const rentalRevenue = await Payment.aggregate([
    { $match: { type: 'rental', status: 'completed' } },
    { $group: { _id: null, total: { $sum: '$amount' } } }
  ]);

  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  const monthlyBookings = await Booking.aggregate([
    { $match: { createdAt: { $gte: sixMonthsAgo } } },
    {
      $group: {
        _id: { $month: '$createdAt' },
        count: { $sum: 1 },
        revenue: { $sum: '$finalCost' }
      }
    },
    { $sort: { _id: 1 } }
  ]);

  const monthlyRevenue = await Payment.aggregate([
    { $match: { createdAt: { $gte: sixMonthsAgo }, status: 'completed' } },
    {
      $group: {
        _id: { $month: '$createdAt' },
        total: { $sum: '$amount' }
      }
    },
    { $sort: { _id: 1 } }
  ]);

  const recentBookings = await Booking.find()
    .populate('user', 'name')
    .populate({ path: 'technician', populate: { path: 'user', select: 'name' } })
    .sort({ createdAt: -1 })
    .limit(5);

  const recentUsers = await User.find()
    .select('name email role createdAt')
    .sort({ createdAt: -1 })
    .limit(5);

  res.json({
    success: true,
    data: {
      totalUsers,
      totalTechnicians,
      totalToolOwners,
      totalTools,
      totalBookings,
      totalRentals,
      completedBookings,
      completedRentals,
      pendingBookings,
      verifiedTechnicians,
      bookingRevenue: bookingRevenue[0]?.total || 0,
      rentalRevenue: rentalRevenue[0]?.total || 0,
      totalRevenue: (bookingRevenue[0]?.total || 0) + (rentalRevenue[0]?.total || 0),
      monthlyBookings,
      monthlyRevenue,
      recentBookings,
      recentUsers
    }
  });
});

const getUsers = asyncHandler(async (req, res) => {
  const { role, search, page = 1, limit = 20 } = req.query;
  let query = {};

  if (role) query.roles = role;
  if (search) {
    query.$or = [
      { name: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } }
    ];
  }

  const users = await User.find(query)
    .select('-password')
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(Number(limit));

  const total = await User.countDocuments(query);

  res.json({
    success: true,
    data: users,
    pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / limit) }
  });
});

const toggleBan = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) {
    return res.status(404).json({ success: false, message: 'User not found' });
  }

  user.isBanned = !user.isBanned;
  await user.save();

  res.json({
    success: true,
    data: { isBanned: user.isBanned },
    message: user.isBanned ? 'User has been banned' : 'User has been unbanned'
  });
});

const verifyTechnician = asyncHandler(async (req, res) => {
  const technician = await Technician.findById(req.params.id);
  if (!technician) {
    return res.status(404).json({ success: false, message: 'Technician not found' });
  }

  technician.isVerified = !technician.isVerified;
  await technician.save();

  res.json({
    success: true,
    data: { isVerified: technician.isVerified }
  });
});

const getAllTechnicians = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20 } = req.query;

  const technicians = await Technician.find()
    .populate('user', 'name email phone location isBanned')
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(Number(limit));

  const total = await Technician.countDocuments();

  res.json({
    success: true,
    data: technicians,
    pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / limit) }
  });
});

const getAllTools = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20 } = req.query;

  const tools = await Tool.find()
    .populate({ path: 'owner', populate: { path: 'user', select: 'name email' } })
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(Number(limit));

  const total = await Tool.countDocuments();

  res.json({
    success: true,
    data: tools,
    pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / limit) }
  });
});

const deleteTool = asyncHandler(async (req, res) => {
  const tool = await Tool.findById(req.params.id);
  if (!tool) {
    return res.status(404).json({ success: false, message: 'Tool not found' });
  }
  await tool.deleteOne();
  res.json({ success: true, message: 'Tool removed by admin' });
});

const changeUserRole = asyncHandler(async (req, res) => {
  const { role, action } = req.body;
  const validRoles = ['user', 'technician', 'toolowner', 'admin'];

  if (!role || !validRoles.includes(role)) {
    return res.status(400).json({ success: false, message: 'Invalid role. Must be one of: user, technician, toolowner, admin' });
  }

  const user = await User.findById(req.params.id);
  if (!user) {
    return res.status(404).json({ success: false, message: 'User not found' });
  }

  if (action === 'remove') {
    // Remove a role (but never remove 'user')
    if (role === 'user') {
      return res.status(400).json({ success: false, message: 'Cannot remove base user role' });
    }
    user.roles = user.roles.filter(r => r !== role);
    if (user.activeRole === role) {
      user.activeRole = 'user';
    }
  } else {
    // Add a role
    if (!user.roles.includes(role)) {
      user.roles.push(role);
    }
  }

  await user.save();

  res.json({
    success: true,
    data: { roles: user.roles },
    message: action === 'remove' ? `Role '${role}' removed` : `Role '${role}' added`
  });
});

const suspendTechnician = asyncHandler(async (req, res) => {
  const technician = await Technician.findById(req.params.id).populate('user');
  if (!technician) {
    return res.status(404).json({ success: false, message: 'Technician not found' });
  }

  const user = await User.findById(technician.user._id);
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

const approveTool = asyncHandler(async (req, res) => {
  const tool = await Tool.findById(req.params.id);
  if (!tool) {
    return res.status(404).json({ success: false, message: 'Tool not found' });
  }

  tool.isAvailable = !tool.isAvailable;
  await tool.save();

  res.json({
    success: true,
    data: { isAvailable: tool.isAvailable },
    message: tool.isAvailable ? 'Tool has been approved' : 'Tool approval revoked'
  });
});

const cancelBooking = asyncHandler(async (req, res) => {
  const booking = await Booking.findById(req.params.id);
  if (!booking) {
    return res.status(404).json({ success: false, message: 'Booking not found' });
  }

  if (booking.status === 'cancelled') {
    return res.status(400).json({ success: false, message: 'Booking is already cancelled' });
  }

  booking.status = 'cancelled';
  booking.cancellationReason = req.body.reason || 'Cancelled by admin';
  await booking.save();

  res.json({
    success: true,
    data: booking,
    message: 'Booking has been cancelled'
  });
});

const cancelRental = asyncHandler(async (req, res) => {
  const rental = await Rental.findById(req.params.id);
  if (!rental) {
    return res.status(404).json({ success: false, message: 'Rental not found' });
  }

  if (rental.status === 'cancelled') {
    return res.status(400).json({ success: false, message: 'Rental is already cancelled' });
  }

  rental.status = 'cancelled';
  await rental.save();

  res.json({
    success: true,
    data: rental,
    message: 'Rental has been cancelled'
  });
});

const getAllBookings = asyncHandler(async (req, res) => {
  const { status, page = 1, limit = 20 } = req.query;
  let query = {};
  if (status) query.status = status;

  const bookings = await Booking.find(query)
    .populate('user', 'name email')
    .populate({ path: 'technician', populate: { path: 'user', select: 'name email' } })
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(Number(limit));

  const total = await Booking.countDocuments(query);

  res.json({
    success: true,
    data: bookings,
    pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / limit) }
  });
});

const getAllRentals = asyncHandler(async (req, res) => {
  const { status, page = 1, limit = 20 } = req.query;
  let query = {};
  if (status) query.status = status;

  const rentals = await Rental.find(query)
    .populate('user', 'name email')
    .populate('tool', 'name category')
    .populate({ path: 'toolOwner', populate: { path: 'user', select: 'name email' } })
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(Number(limit));

  const total = await Rental.countDocuments(query);

  res.json({
    success: true,
    data: rentals,
    pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / limit) }
  });
});

const getPayments = asyncHandler(async (req, res) => {
  const { status, type, page = 1, limit = 20 } = req.query;
  let query = {};
  if (status) query.status = status;
  if (type) query.type = type;

  const payments = await Payment.find(query)
    .populate('user', 'name email')
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(Number(limit));

  const total = await Payment.countDocuments(query);

  res.json({
    success: true,
    data: payments,
    pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / limit) }
  });
});

const refundPayment = asyncHandler(async (req, res) => {
  const payment = await Payment.findById(req.params.id);
  if (!payment) {
    return res.status(404).json({ success: false, message: 'Payment not found' });
  }

  if (payment.status === 'refunded') {
    return res.status(400).json({ success: false, message: 'Payment is already refunded' });
  }

  payment.status = 'refunded';
  await payment.save();

  res.json({
    success: true,
    data: payment,
    message: 'Payment has been refunded'
  });
});

module.exports = {
  getDashboard,
  getUsers,
  toggleBan,
  changeUserRole,
  verifyTechnician,
  suspendTechnician,
  getAllTechnicians,
  getAllTools,
  deleteTool,
  approveTool,
  getAllBookings,
  cancelBooking,
  getAllRentals,
  cancelRental,
  getPayments,
  refundPayment
};
