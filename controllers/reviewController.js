const Review = require('../models/Review');
const TechnicianProfile = require('../models/TechnicianProfile');
const Tool = require('../models/Tool');
const OwnerProfile = require('../models/OwnerProfile');
const Booking = require('../models/Booking');
const Rental = require('../models/Rental');
const { asyncHandler } = require('../utils/helpers');

const addReview = asyncHandler(async (req, res) => {
  const { targetType, targetId, rating, comment, bookingId, rentalId } = req.body;

  // Prevent self-review
  if (targetType === 'technician') {
    const tech = await TechnicianProfile.findById(targetId);
    if (tech && tech.userId.toString() === req.user._id.toString()) {
      return res.status(400).json({ success: false, message: 'You cannot review yourself' });
    }
  } else if (targetType === 'toolowner') {
    const owner = await OwnerProfile.findById(targetId);
    if (owner && owner.userId.toString() === req.user._id.toString()) {
      return res.status(400).json({ success: false, message: 'You cannot review yourself' });
    }
  } else if (targetType === 'tool') {
    const tool = await Tool.findById(targetId).populate('owner');
    if (tool && tool.owner?.userId?.toString() === req.user._id.toString()) {
      return res.status(400).json({ success: false, message: 'You cannot review your own tool' });
    }
  }

  // Verify transaction exists and is completed
  if (bookingId) {
    const booking = await Booking.findById(bookingId);
    if (!booking || booking.user.toString() !== req.user._id.toString()) {
      return res.status(400).json({ success: false, message: 'Invalid booking reference' });
    }
    if (booking.status !== 'completed') {
      return res.status(400).json({ success: false, message: 'Booking must be completed before reviewing' });
    }
  } else if (rentalId) {
    const rental = await Rental.findById(rentalId);
    if (!rental || rental.user.toString() !== req.user._id.toString()) {
      return res.status(400).json({ success: false, message: 'Invalid rental reference' });
    }
    if (rental.status !== 'returned') {
      return res.status(400).json({ success: false, message: 'Rental must be returned before reviewing' });
    }
  }

  const modelMap = {
    technician: 'TechnicianProfile',
    tool: 'Tool',
    toolowner: 'OwnerProfile'
  };

  const review = await Review.create({
    user: req.user._id,
    targetType,
    targetId,
    targetModel: modelMap[targetType],
    rating,
    comment,
    booking: bookingId || undefined,
    rental: rentalId || undefined
  });

  const reviews = await Review.find({ targetId, targetType });
  const avgRating = reviews.reduce((acc, r) => acc + r.rating, 0) / reviews.length;

  const updateData = {
    'rating.average': Math.round(avgRating * 10) / 10,
    'rating.count': reviews.length
  };

  switch (targetType) {
    case 'technician':
      await TechnicianProfile.findByIdAndUpdate(targetId, updateData);
      break;
    case 'tool':
      await Tool.findByIdAndUpdate(targetId, updateData);
      break;
    case 'toolowner':
      await OwnerProfile.findByIdAndUpdate(targetId, updateData);
      break;
  }

  const populatedReview = await Review.findById(review._id)
    .populate('user', 'name avatar');

  res.status(201).json({ success: true, data: populatedReview });
});

const getReviews = asyncHandler(async (req, res) => {
  const { targetType, targetId } = req.params;
  const { page = 1, limit = 10 } = req.query;

  const reviews = await Review.find({ targetId, targetType, isVisible: true })
    .populate('user', 'name avatar')
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(Number(limit));

  const total = await Review.countDocuments({ targetId, targetType, isVisible: true });

  res.json({
    success: true,
    data: reviews,
    pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / limit) }
  });
});

module.exports = { addReview, getReviews };
