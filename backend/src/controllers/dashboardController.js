const Scheme = require('../models/Scheme');
const User = require('../models/User');
const { TARGET_STATE } = require('../config/constants');

const getSummary = async (req, res) => {
  try {
    const totalSchemes = await Scheme.countDocuments({ state: TARGET_STATE });
    const activeSchemes = await Scheme.countDocuments({ state: TARGET_STATE, isActive: true });
    
    const categories = await Scheme.distinct('category', { state: TARGET_STATE, isActive: true });
    const sources = await Scheme.distinct('sourceName', { state: TARGET_STATE, isActive: true });
    
    const latestScheme = await Scheme.findOne({ state: TARGET_STATE }).sort({ lastVerifiedAt: -1 });

    res.json({
      success: true,
      data: {
        totalSchemes,
        activeSchemes,
        categories: categories.length,
        sources: sources.length,
        lastUpdatedAt: latestScheme ? latestScheme.lastVerifiedAt : null
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getRecentSchemes = async (req, res) => {
  try {
    const recentSchemes = await Scheme.find({ state: TARGET_STATE, isActive: true })
      .sort({ lastVerifiedAt: -1, lastFetchedAt: -1 })
      .limit(5);
    
    res.json({ success: true, data: recentSchemes });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getRecommendations = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Basic matching: find schemes that match user category or age or etc
    // Since we don't have a complex engine, we just do a basic query and attach reasons
    const query = { state: TARGET_STATE, isActive: true };
    
    let orConditions = [];
    if (user.category) {
      orConditions.push({ categoryEligibility: { $regex: user.category, $options: 'i' } });
      orConditions.push({ description: { $regex: user.category, $options: 'i' } });
    }
    
    // Add some random matching logic for demo purposes (basic text matching)
    if (user.gender) {
      orConditions.push({ genderEligibility: { $regex: user.gender, $options: 'i' } });
    }

    // For simplicity, we just fetch a few schemes to recommend if we don't have deep parsed criteria yet
    // In a real scenario, this would be a much more complex query
    let recommendedSchemes = [];
    
    if (orConditions.length > 0) {
      recommendedSchemes = await Scheme.find({
        ...query,
        $or: orConditions
      }).limit(5);
    }
    
    // If no direct matches, just return some general schemes for the user
    if (recommendedSchemes.length === 0) {
      recommendedSchemes = await Scheme.find(query).sort({ createdAt: -1 }).limit(3);
    }

    // Map to add reasons
    const mappedSchemes = recommendedSchemes.map(s => {
      const reasons = [];
      reasons.push("Potentially relevant based on your profile");
      
      const obj = s.toObject();
      obj.relevanceReasons = reasons;
      return obj;
    });

    res.json({ success: true, data: mappedSchemes });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  getSummary,
  getRecentSchemes,
  getRecommendations
};
