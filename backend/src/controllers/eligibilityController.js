const User = require('../models/User');
const Scheme = require('../models/Scheme');
const eligibilityEngine = require('../services/eligibility/eligibilityEngine');

const checkEligibility = async (req, res) => {
  try {
    const { schemeId } = req.body;
    if (!schemeId) return res.status(400).json({ success: false, message: 'schemeId is required' });

    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const scheme = await Scheme.findById(schemeId);
    if (!scheme) return res.status(404).json({ success: false, message: 'Scheme not found' });

    if (scheme.state && scheme.state !== 'Tamil Nadu') {
      return res.status(400).json({ success: false, message: 'Only Tamil Nadu schemes are supported.' });
    }

    const result = eligibilityEngine.checkEligibility(user, scheme);

    res.json({
      success: true,
      message: 'Eligibility calculated successfully',
      data: result
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { checkEligibility };
