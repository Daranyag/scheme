const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const {
  getSchemes,
  getSchemeById,
  getCategories,
  getSources,
  refreshSchemes
} = require('../controllers/schemeController');

// Public routes (for authenticated users)
router.get('/', protect, getSchemes);
router.get('/categories', protect, getCategories);
router.get('/sources', protect, getSources);
router.get('/:id', protect, getSchemeById);

// Admin route (using protect for now, but should ideally have an admin check)
router.post('/refresh', protect, refreshSchemes);

module.exports = router;
