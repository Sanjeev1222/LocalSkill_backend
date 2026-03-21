const Technician = require('../models/Technician');
const Tool = require('../models/Tool');
const ToolOwner = require('../models/ToolOwner');
const { asyncHandler } = require('../utils/helpers');

// ─── AI Scoring Weights for different priorities ───
const PRIORITY_WEIGHTS = {
  cost_saving: {
    price: 0.45,
    rating: 0.20,
    experience: 0.15,
    completedJobs: 0.10,
    verified: 0.10
  },
  best_rated: {
    price: 0.10,
    rating: 0.45,
    experience: 0.20,
    completedJobs: 0.15,
    verified: 0.10
  },
  most_experienced: {
    price: 0.10,
    rating: 0.20,
    experience: 0.45,
    completedJobs: 0.15,
    verified: 0.10
  },
  best_value: {
    price: 0.30,
    rating: 0.30,
    experience: 0.15,
    completedJobs: 0.15,
    verified: 0.10
  }
};

const TOOL_PRIORITY_WEIGHTS = {
  cost_saving: {
    price: 0.45,
    rating: 0.20,
    condition: 0.15,
    totalRentals: 0.10,
    deposit: 0.10
  },
  best_rated: {
    price: 0.10,
    rating: 0.45,
    condition: 0.20,
    totalRentals: 0.15,
    deposit: 0.10
  },
  best_condition: {
    price: 0.10,
    rating: 0.20,
    condition: 0.40,
    totalRentals: 0.15,
    deposit: 0.15
  },
  best_value: {
    price: 0.30,
    rating: 0.30,
    condition: 0.15,
    totalRentals: 0.15,
    deposit: 0.10
  }
};

// ─── Normalize value to 0-1 range ───
const normalize = (value, min, max) => {
  if (max === min) return 0.5;
  return (value - min) / (max - min);
};

// ─── Condition score mapping ───
const conditionScore = (condition) => {
  const scores = { 'new': 1.0, 'like_new': 0.8, 'good': 0.6, 'fair': 0.4 };
  return scores[condition] || 0.5;
};

// ─── Generate AI insight text for technicians ───
const generateTechInsight = (tech, priority, stats) => {
  const insights = [];

  if (priority === 'cost_saving' || priority === 'best_value') {
    const savingsPercent = stats.avgPrice > 0
      ? Math.round(((stats.avgPrice - tech.chargeRate) / stats.avgPrice) * 100)
      : 0;
    if (savingsPercent > 0) {
      insights.push(`💰 ${savingsPercent}% cheaper than average`);
    } else {
      insights.push(`💰 Competitive pricing at ₹${tech.chargeRate}/${tech.chargeType === 'hourly' ? 'hr' : 'job'}`);
    }
  }

  if (tech.rating?.average >= 4.5) {
    insights.push(`⭐ Top rated with ${tech.rating.average.toFixed(1)} stars`);
  } else if (tech.rating?.average >= 4.0) {
    insights.push(`⭐ Highly rated (${tech.rating.average.toFixed(1)})`);
  }

  if (tech.experience >= 10) {
    insights.push(`🏆 Veteran with ${tech.experience}+ years experience`);
  } else if (tech.experience >= 5) {
    insights.push(`💼 Experienced (${tech.experience} years)`);
  }

  if (tech.completedJobs >= 50) {
    insights.push(`✅ ${tech.completedJobs} successful jobs completed`);
  }

  if (tech.isVerified) {
    insights.push('🔒 Verified professional');
  }

  return insights.slice(0, 3);
};

// ─── Generate AI insight text for tools ───
const generateToolInsight = (tool, priority, stats) => {
  const insights = [];
  const dailyPrice = tool.rentPrice?.daily || 0;

  if (priority === 'cost_saving' || priority === 'best_value') {
    const savingsPercent = stats.avgPrice > 0
      ? Math.round(((stats.avgPrice - dailyPrice) / stats.avgPrice) * 100)
      : 0;
    if (savingsPercent > 0) {
      insights.push(`💰 ${savingsPercent}% cheaper than average`);
    } else {
      insights.push(`💰 Competitive pricing at ₹${dailyPrice}/day`);
    }
  }

  if (tool.rating?.average >= 4.5) {
    insights.push(`⭐ Top rated with ${tool.rating.average.toFixed(1)} stars`);
  } else if (tool.rating?.average >= 4.0) {
    insights.push(`⭐ Highly rated (${tool.rating.average.toFixed(1)})`);
  }

  const cond = tool.condition;
  if (cond === 'new') {
    insights.push('✨ Brand new condition');
  } else if (cond === 'like_new') {
    insights.push('✨ Like new condition');
  }

  if (tool.totalRentals >= 20) {
    insights.push(`🔄 Popular choice (${tool.totalRentals} rentals)`);
  }

  if (tool.securityDeposit === 0) {
    insights.push('🎉 No security deposit required');
  }

  return insights.slice(0, 3);
};

// ═══════════════════════════════════════════════════════
//  AI Smart Search for Technicians
// ═══════════════════════════════════════════════════════
const aiSearchTechnicians = asyncHandler(async (req, res) => {
  const {
    lat,
    lng,
    skill,
    minPrice,
    maxPrice,
    minExp,
    minRating,
    priority = "best_value",
    page = 1,
    limit = 12
  } = req.query;

  let matchStage = { "availability.isOnline": true };

  if (skill) {
    matchStage.skills = { $in: Array.isArray(skill) ? skill : [skill] };
  }

  if (minPrice || maxPrice) {
    matchStage.chargeRate = {};
    if (minPrice) matchStage.chargeRate.$gte = Number(minPrice);
    if (maxPrice) matchStage.chargeRate.$lte = Number(maxPrice);
  }

  if (minExp) matchStage.experience = { $gte: Number(minExp) };
  if (minRating) matchStage["rating.average"] = { $gte: Number(minRating) };

  let pipeline = [];

  // ⭐ GEO ONLY WHEN NEAREST PRIORITY
  if (priority === "nearest" && lat && lng) {
    pipeline.push({
      $geoNear: {
        near: {
          type: "Point",
          coordinates: [Number(lng), Number(lat)]
        },
        distanceField: "distance",
        maxDistance: 20000,
        spherical: true,
        query: matchStage
      }
    });
  } else {
    pipeline.push({ $match: matchStage });
  }

  // ⭐ LIMIT BEFORE AI SCORING (IMPORTANT)
  pipeline.push({ $limit: 200 });

  const technicians = await Technician.aggregate(pipeline);

  if (!technicians.length) {
    return res.json({
      success: true,
      data: [],
      aiSummary: "No technicians found",
      pagination: { page: 1, limit, total: 0, pages: 0 }
    });
  }

  // ⭐ NORMALIZATION DATA
  const prices = technicians.map(t => t.chargeRate);
  const ratings = technicians.map(t => t.rating?.average || 0);
  const experiences = technicians.map(t => t.experience || 0);
  const jobs = technicians.map(t => t.completedJobs || 0);
  const distances = technicians.map(t => t.distance || 10000);

  const stats = {
    minPrice: Math.min(...prices),
    maxPrice: Math.max(...prices),
    minRating: Math.min(...ratings),
    maxRating: Math.max(...ratings),
    minExp: Math.min(...experiences),
    maxExp: Math.max(...experiences),
    minJobs: Math.min(...jobs),
    maxJobs: Math.max(...jobs),
    minDist: Math.min(...distances),
    maxDist: Math.max(...distances)
  };

  const weights = PRIORITY_WEIGHTS[priority] || PRIORITY_WEIGHTS.best_value;

  const scored = technicians.map(t => {

    const priceScore = 1 - normalize(t.chargeRate, stats.minPrice, stats.maxPrice);
    const ratingScore = normalize(t.rating?.average || 0, stats.minRating, stats.maxRating);
    const expScore = normalize(t.experience || 0, stats.minExp, stats.maxExp);
    const jobsScore = normalize(t.completedJobs || 0, stats.minJobs, stats.maxJobs);
    const verifiedScore = t.isVerified ? 1 : 0;

    let distanceScore = 0;
    if (priority === "nearest") {
      distanceScore = 1 - normalize(t.distance || stats.maxDist, stats.minDist, stats.maxDist);
    }

    const totalScore =
      weights.price * priceScore +
      weights.rating * ratingScore +
      weights.experience * expScore +
      weights.completedJobs * jobsScore +
      weights.verified * verifiedScore +
      (priority === "nearest" ? 0.25 * distanceScore : 0);

    return {
      ...t,
      aiScore: Math.round(totalScore * 100),
      aiMatch:
        totalScore >= 0.75
          ? "Excellent Match"
          : totalScore >= 0.5
          ? "Good Match"
          : "Fair Match"
    };
  });

  scored.sort((a, b) => b.aiScore - a.aiScore);

  const total = scored.length;
  const start = (page - 1) * limit;
  const paginated = scored.slice(start, start + Number(limit));

  res.json({
    success: true,
    data: paginated,
    priority,
    totalAnalyzed: total,
    pagination: {
      page: Number(page),
      limit: Number(limit),
      total,
      pages: Math.ceil(total / limit)
    }
  });
});
// ═══════════════════════════════════════════════════════
//  AI Smart Search for Tools
// ═══════════════════════════════════════════════════════
const aiSearchTools = asyncHandler(async (req, res) => {
  const {
    category, toolType, minPrice, maxPrice,
    search, priority = 'best_value',
    page = 1, limit = 12
  } = req.query;

  // Build base query
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

  // Fetch ALL matching tools for AI comparison
  const allTools = await Tool.find(query)
    .populate({
      path: 'owner',
      populate: { path: 'user', select: 'name location' }
    });

  if (allTools.length === 0) {
    return res.json({
      success: true,
      data: [],
      aiSummary: 'No tools found matching your criteria. Try adjusting your filters.',
      priority,
      pagination: { page: 1, limit: Number(limit), total: 0, pages: 0 }
    });
  }

  // Calculate statistics for normalization
  const prices = allTools.map(t => t.rentPrice?.daily || 0);
  const ratings = allTools.map(t => t.rating?.average || 0);
  const rentals = allTools.map(t => t.totalRentals || 0);
  const deposits = allTools.map(t => t.securityDeposit || 0);

  const stats = {
    minPrice: Math.min(...prices),
    maxPrice: Math.max(...prices),
    avgPrice: prices.reduce((a, b) => a + b, 0) / prices.length,
    minRating: Math.min(...ratings),
    maxRating: Math.max(...ratings),
    minRentals: Math.min(...rentals),
    maxRentals: Math.max(...rentals),
    minDeposit: Math.min(...deposits),
    maxDeposit: Math.max(...deposits)
  };

  const weights = TOOL_PRIORITY_WEIGHTS[priority] || TOOL_PRIORITY_WEIGHTS.best_value;

  // Score each tool
  const scored = allTools.map(tool => {
    const dailyPrice = tool.rentPrice?.daily || 0;
    // Lower price = higher score for cost_saving
    const priceScore = 1 - normalize(dailyPrice, stats.minPrice, stats.maxPrice);
    const ratingScore = normalize(tool.rating?.average || 0, stats.minRating, stats.maxRating);
    const condScore = conditionScore(tool.condition);
    const rentalScore = normalize(tool.totalRentals || 0, stats.minRentals, stats.maxRentals);
    // Lower deposit = higher score
    const depositScore = 1 - normalize(tool.securityDeposit || 0, stats.minDeposit, stats.maxDeposit);

    const totalScore =
      weights.price * priceScore +
      weights.rating * ratingScore +
      weights.condition * condScore +
      weights.totalRentals * rentalScore +
      weights.deposit * depositScore;

    const insights = generateToolInsight(tool, priority, stats);

    return {
      ...tool.toObject(),
      aiScore: Math.round(totalScore * 100),
      aiInsights: insights,
      aiMatch: totalScore >= 0.7 ? 'Excellent Match' : totalScore >= 0.5 ? 'Good Match' : 'Fair Match'
    };
  });

  // Sort by AI score descending
  scored.sort((a, b) => b.aiScore - a.aiScore);

  // Paginate
  const total = scored.length;
  const start = (Number(page) - 1) * Number(limit);
  const paginated = scored.slice(start, start + Number(limit));

  // Generate summary
  const topPick = paginated[0];
  let aiSummary = '';
  switch (priority) {
    case 'cost_saving':
      aiSummary = `🤖 AI found ${total} tools. Best deal: "${topPick?.name}" at ₹${topPick?.rentPrice?.daily}/day with ${topPick?.rating?.average?.toFixed(1) || 'N/A'} rating.`;
      break;
    case 'best_rated':
      aiSummary = `🤖 AI found ${total} tools. Top rated: "${topPick?.name}" with ${topPick?.rating?.average?.toFixed(1)}⭐ (${topPick?.totalRentals} rentals).`;
      break;
    case 'best_condition':
      aiSummary = `🤖 AI found ${total} tools. Best condition: "${topPick?.name}" in ${topPick?.condition?.replace('_', ' ')} condition.`;
      break;
    default:
      aiSummary = `🤖 AI analyzed ${total} tools and found the best value options for you based on price, rating, and condition.`;
  }

  // Simulate AI processing time
  await new Promise(resolve => setTimeout(resolve, 300 + Math.random() * 500));

  res.json({
    success: true,
    data: paginated,
    aiSummary,
    priority,
    totalAnalyzed: total,
    pagination: {
      page: Number(page),
      limit: Number(limit),
      total,
      pages: Math.ceil(total / Number(limit))
    }
  });
});

module.exports = { aiSearchTechnicians, aiSearchTools };
