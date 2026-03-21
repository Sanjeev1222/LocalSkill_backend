const CostEstimate = require('../models/CostEstimate');
const Technician = require('../models/Technician');
const Booking = require('../models/Booking');
const { asyncHandler } = require('../utils/helpers');

// ─── User: Create a cost estimate request with photos/videos ───
const createEstimateRequest = asyncHandler(async (req, res) => {
  const { technicianId, service, description, address } = req.body;

  const technician = await Technician.findById(technicianId);
  if (!technician) {
    return res.status(404).json({ success: false, message: 'Technician not found' });
  }

  if (!technician.availability.isOnline) {
    return res.status(400).json({ success: false, message: 'Technician is currently offline' });
  }

  // Process uploaded files
  const media = [];
  if (req.files && req.files.length > 0) {
    for (const file of req.files) {
      const isVideo = file.mimetype.startsWith('video/');
      media.push({
        type: isVideo ? 'video' : 'photo',
        url: `/uploads/estimates/${file.filename}`,
        originalName: file.originalname
      });
    }
  }

  if (media.length === 0) {
    return res.status(400).json({ success: false, message: 'Please upload at least one photo or video of the issue' });
  }

  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 48); // 48 hour expiry

  const estimate = await CostEstimate.create({
    user: req.user._id,
    technician: technicianId,
    service,
    description,
    media,
    location: { address },
    expiresAt
  });

  const populated = await CostEstimate.findById(estimate._id)
    .populate('user', 'name phone avatar email')
    .populate({
      path: 'technician',
      populate: { path: 'user', select: 'name phone avatar email' }
    });

  res.status(201).json({ success: true, data: populated });
});

// ─── User: Get my estimate requests ───
const getMyEstimates = asyncHandler(async (req, res) => {
  const { status, page = 1, limit = 10 } = req.query;
  let query = { user: req.user._id };
  if (status) query.status = status;

  const estimates = await CostEstimate.find(query)
    .populate({
      path: 'technician',
      populate: { path: 'user', select: 'name phone avatar location' }
    })
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(Number(limit));

  const total = await CostEstimate.countDocuments(query);

  res.json({
    success: true,
    data: estimates,
    pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / limit) }
  });
});

// ─── User: Get single estimate detail ───
const getEstimateById = asyncHandler(async (req, res) => {
  const estimate = await CostEstimate.findById(req.params.id)
    .populate('user', 'name phone avatar email location')
    .populate({
      path: 'technician',
      populate: { path: 'user', select: 'name phone avatar email location' }
    })
    .populate('bookingId');

  if (!estimate) {
    return res.status(404).json({ success: false, message: 'Estimate request not found' });
  }

  // Only the user or the technician's user can view
  const techUser = await Technician.findById(estimate.technician._id || estimate.technician);
  const isOwner = estimate.user._id.toString() === req.user._id.toString();
  const isTech = techUser && techUser.user.toString() === req.user._id.toString();
  const isAdmin = req.user.role === 'admin';

  if (!isOwner && !isTech && !isAdmin) {
    return res.status(403).json({ success: false, message: 'Not authorized to view this estimate' });
  }

  res.json({ success: true, data: estimate });
});

// ─── Technician: Get estimate requests assigned to me ───
const getTechnicianEstimates = asyncHandler(async (req, res) => {
  const technician = await Technician.findOne({ user: req.user._id });
  if (!technician) {
    return res.status(404).json({ success: false, message: 'Technician profile not found' });
  }

  const { status, page = 1, limit = 10 } = req.query;
  let query = { technician: technician._id };
  if (status) query.status = status;

  const estimates = await CostEstimate.find(query)
    .populate('user', 'name phone avatar email location')
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(Number(limit));

  const total = await CostEstimate.countDocuments(query);

  res.json({
    success: true,
    data: estimates,
    pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / limit) }
  });
});

// ─── Technician: Submit cost estimate (service charge + materials) ───
const submitEstimate = asyncHandler(async (req, res) => {
  const { serviceCharge, materials, estimatedDuration, notes } = req.body;

  const technician = await Technician.findOne({ user: req.user._id });
  if (!technician) {
    return res.status(404).json({ success: false, message: 'Technician profile not found' });
  }

  const estimate = await CostEstimate.findById(req.params.id);
  if (!estimate) {
    return res.status(404).json({ success: false, message: 'Estimate request not found' });
  }

  if (estimate.technician.toString() !== technician._id.toString()) {
    return res.status(403).json({ success: false, message: 'Not authorized' });
  }

  if (estimate.status !== 'pending') {
    return res.status(400).json({ success: false, message: 'This estimate has already been responded to' });
  }

  // Calculate material costs
  const parsedMaterials = (materials || []).map(m => ({
    name: m.name,
    quantity: Number(m.quantity) || 1,
    unitPrice: Number(m.unitPrice) || 0,
    total: (Number(m.quantity) || 1) * (Number(m.unitPrice) || 0)
  }));

  const materialTotal = parsedMaterials.reduce((sum, m) => sum + m.total, 0);
  const totalCost = (Number(serviceCharge) || 0) + materialTotal;

  estimate.estimate = {
    serviceCharge: Number(serviceCharge) || 0,
    materials: parsedMaterials,
    materialTotal,
    totalCost,
    estimatedDuration: estimatedDuration || '',
    notes: notes || ''
  };
  estimate.status = 'estimated';
  estimate.estimatedAt = new Date();

  await estimate.save();

  const populated = await CostEstimate.findById(estimate._id)
    .populate('user', 'name phone avatar email')
    .populate({
      path: 'technician',
      populate: { path: 'user', select: 'name phone avatar email' }
    });

  res.json({ success: true, data: populated, message: 'Estimate sent to user' });
});

// ─── User: Accept estimate and proceed to booking ───
const acceptEstimate = asyncHandler(async (req, res) => {
  const { scheduledDate, timeSlot, paymentMethod } = req.body;

  const estimate = await CostEstimate.findById(req.params.id);
  if (!estimate) {
    return res.status(404).json({ success: false, message: 'Estimate not found' });
  }

  if (estimate.user.toString() !== req.user._id.toString()) {
    return res.status(403).json({ success: false, message: 'Not authorized' });
  }

  if (estimate.status !== 'estimated') {
    return res.status(400).json({ success: false, message: 'Estimate cannot be accepted in its current state' });
  }

  // Create booking from estimate
  const [start, end] = (timeSlot || '10:00 - 12:00').split(' - ');

  const booking = await Booking.create({
    user: req.user._id,
    technician: estimate.technician,
    service: estimate.service,
    description: estimate.description,
    scheduledDate: scheduledDate || new Date(Date.now() + 24 * 60 * 60 * 1000),
    timeSlot: { start: start.trim(), end: end.trim() },
    location: estimate.location,
    estimatedCost: estimate.estimate.totalCost,
    paymentMethod: paymentMethod || 'cash',
    notes: `From estimate: ${estimate.estimate.notes || ''}\nMaterials: ${estimate.estimate.materials.map(m => `${m.name} x${m.quantity}`).join(', ')}`
  });

  estimate.status = 'booked';
  estimate.bookingId = booking._id;
  estimate.respondedAt = new Date();
  await estimate.save();

  const populatedBooking = await Booking.findById(booking._id)
    .populate('user', 'name phone avatar')
    .populate({
      path: 'technician',
      populate: { path: 'user', select: 'name phone avatar' }
    });

  res.json({
    success: true,
    data: { estimate, booking: populatedBooking },
    message: 'Booking created from estimate'
  });
});

// ─── User: Reject estimate ───
const rejectEstimate = asyncHandler(async (req, res) => {
  const estimate = await CostEstimate.findById(req.params.id);
  if (!estimate) {
    return res.status(404).json({ success: false, message: 'Estimate not found' });
  }

  if (estimate.user.toString() !== req.user._id.toString()) {
    return res.status(403).json({ success: false, message: 'Not authorized' });
  }

  if (estimate.status !== 'estimated') {
    return res.status(400).json({ success: false, message: 'Only estimated requests can be rejected' });
  }

  estimate.status = 'rejected';
  estimate.respondedAt = new Date();
  await estimate.save();

  res.json({ success: true, data: estimate, message: 'Estimate rejected' });
});

module.exports = {
  createEstimateRequest,
  getMyEstimates,
  getEstimateById,
  getTechnicianEstimates,
  submitEstimate,
  acceptEstimate,
  rejectEstimate
};
