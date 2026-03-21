const Tool = require('../models/Tool');
const ToolOwner = require('../models/ToolOwner');
const Rental = require('../models/Rental');
const { asyncHandler, calculateDistance } = require('../utils/helpers');

const getTools = asyncHandler(async (req, res) => {
  const {
    category, toolType, minPrice, maxPrice,
    search, lat, lng, radius,
    sortBy, page = 1, limit = 12
  } = req.query;

  let query = { isAvailable: true };

  if (category) query.category = category;
  if (toolType) query.toolType = toolType;

  if (minPrice || maxPrice) {
    query['rentPrice.daily'] = {};
    if (minPrice) query['rentPrice.daily'].$gte = Number(minPrice);
    if (maxPrice) query['rentPrice.daily'].$lte = Number(maxPrice);
  }

  if (search) {
    query.$text = { $search: search };
  }

  let sortOption = {};
  switch (sortBy) {
    case 'price_low': sortOption = { 'rentPrice.daily': 1 }; break;
    case 'price_high': sortOption = { 'rentPrice.daily': -1 }; break;
    case 'rating': sortOption = { 'rating.average': -1 }; break;
    case 'newest': sortOption = { createdAt: -1 }; break;
    default: sortOption = { createdAt: -1 };
  }

  const skip = (Number(page) - 1) * Number(limit);

  let tools = await Tool.find(query)
    .populate({
      path: 'owner',
      populate: { path: 'user', select: 'name location' }
    })
    .sort(sortOption)
    .skip(skip)
    .limit(Number(limit));

  if (lat && lng) {
    const userLat = Number(lat);
    const userLng = Number(lng);
    const maxRadius = Number(radius) || 50;

    tools = tools.filter(tool => {
      if (tool.location && tool.location.coordinates && tool.location.coordinates[0] !== 0) {
        const [toolLng, toolLat] = tool.location.coordinates;
        const distance = calculateDistance(userLat, userLng, toolLat, toolLng);
        tool._doc.distance = Math.round(distance * 10) / 10;
        return distance <= maxRadius;
      }
      return true;
    });
  }

  const total = await Tool.countDocuments(query);

  res.json({
    success: true,
    data: tools,
    pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / limit) }
  });
});

const getTool = asyncHandler(async (req, res) => {
  const tool = await Tool.findById(req.params.id)
    .populate({
      path: 'owner',
      populate: { path: 'user', select: 'name phone avatar location' }
    });

  if (!tool) {
    return res.status(404).json({ success: false, message: 'Tool not found' });
  }

  res.json({ success: true, data: tool });
});

const addTool = asyncHandler(async (req, res) => {
  const toolOwner = await ToolOwner.findOne({ user: req.user._id });
  if (!toolOwner) {
    return res.status(404).json({ success: false, message: 'Tool owner profile not found' });
  }

  const tool = await Tool.create({
    ...req.body,
    owner: toolOwner._id,
    location: req.user.location || req.body.location
  });

  res.status(201).json({ success: true, data: tool });
});

const updateTool = asyncHandler(async (req, res) => {
  const toolOwner = await ToolOwner.findOne({ user: req.user._id });
  let tool = await Tool.findById(req.params.id);

  if (!tool) {
    return res.status(404).json({ success: false, message: 'Tool not found' });
  }

  if (tool.owner.toString() !== toolOwner._id.toString()) {
    return res.status(403).json({ success: false, message: 'Not authorized to update this tool' });
  }

  tool = await Tool.findByIdAndUpdate(req.params.id, req.body, {
    new: true, runValidators: true
  });

  res.json({ success: true, data: tool });
});

const deleteTool = asyncHandler(async (req, res) => {
  const toolOwner = await ToolOwner.findOne({ user: req.user._id });
  const tool = await Tool.findById(req.params.id);

  if (!tool) {
    return res.status(404).json({ success: false, message: 'Tool not found' });
  }

  if (tool.owner.toString() !== toolOwner._id.toString()) {
    return res.status(403).json({ success: false, message: 'Not authorized' });
  }

  await tool.deleteOne();
  res.json({ success: true, message: 'Tool removed' });
});

const getMyTools = asyncHandler(async (req, res) => {
  const toolOwner = await ToolOwner.findOne({ user: req.user._id });
  if (!toolOwner) {
    return res.status(404).json({ success: false, message: 'Tool owner profile not found' });
  }

  const tools = await Tool.find({ owner: toolOwner._id }).sort({ createdAt: -1 });

  res.json({ success: true, data: tools });
});

const adminDeleteTool = asyncHandler(async (req, res) => {
  const tool = await Tool.findById(req.params.id);
  if (!tool) {
    return res.status(404).json({ success: false, message: 'Tool not found' });
  }

  await tool.deleteOne();
  res.json({ success: true, message: 'Tool removed by admin' });
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

module.exports = {
  getTools,
  getTool,
  addTool,
  updateTool,
  deleteTool,
  getMyTools,
  adminDeleteTool,
  approveTool
};
