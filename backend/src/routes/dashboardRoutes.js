const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const {
  getSummary,
  getRecommendations,
  getRecentSchemes
} = require('../controllers/dashboardController');

router.get('/summary', protect, getSummary);
router.get('/recommendations', protect, getRecommendations);
router.get('/recent', protect, getRecentSchemes);

module.exports = router;
