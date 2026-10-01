const Scheme = require('../models/Scheme');
const { TARGET_STATE } = require('../config/constants');
const schemeService = require('../services/schemeService');

const getSchemes = async (req, res) => {
  try {
    const { category, search, department } = req.query;
    let query = { state: TARGET_STATE, isActive: true };

    if (category) {
      query.category = category;
    }
    if (department) {
      query.department = department;
    }
    if (search) {
      query.$or = [
        { schemeName: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
      ];
    }

    const schemes = await Scheme.find(query).sort({ lastVerifiedAt: -1 });
    res.json({ success: true, data: schemes });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getSchemeById = async (req, res) => {
  try {
    const scheme = await Scheme.findOne({ _id: req.params.id, state: TARGET_STATE });
    if (scheme) {
      res.json({ success: true, data: scheme });
    } else {
      res.status(404).json({ success: false, message: 'Scheme not found' });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getCategories = async (req, res) => {
  try {
    const categories = await Scheme.distinct('category', { state: TARGET_STATE, isActive: true });
    res.json({ success: true, data: categories });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getSources = async (req, res) => {
  try {
    const sources = await Scheme.distinct('sourceName', { state: TARGET_STATE, isActive: true });
    res.json({ success: true, data: sources });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const refreshSchemes = async (req, res) => {
  try {
    // We are simulating admin authorization here
    // In production, this would be protected by admin middleware
    
    // Call the central pipeline
    const result = await schemeService.fetchAllSources();
    
    res.json({ 
      success: true, 
      message: 'Refresh completed',
      data: result
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  getSchemes,
  getSchemeById,
  getCategories,
  getSources,
  refreshSchemes
};
