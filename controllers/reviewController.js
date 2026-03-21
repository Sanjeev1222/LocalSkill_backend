const Review = require('../models/Review');
const Technician = require('../models/Technician');
const Tool = require('../models/Tool');
const ToolOwner = require('../models/ToolOwner');
const { asyncHandler } = require('../utils/helpers');

const addReview = asyncHandler(async (req, res) => {
  const { targetType, targetId, rating, comment, bookingId, rentalId } = req.body;

  const modelMap = {
    technician: 'Technician',
    tool: 'Tool',
    toolowner: 'ToolOwner'
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
      await Technician.findByIdAndUpdate(targetId, updateData);
      break;
    case 'tool':
      await Tool.findByIdAndUpdate(targetId, updateData);
      break;
    case 'toolowner':
      await ToolOwner.findByIdAndUpdate(targetId, updateData);
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
