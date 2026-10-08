const express = require('express');
const router = express.Router();
const { executeUnifiedSearch } = require('../services/searchService');

router.post('/', async (req, res) => {
  try {
    const { query, profile, language } = req.body;
    if (!query || typeof query !== 'string') {
      return res.status(400).json({ ok: false, code: 'bad_request', message: 'Search query is required.' });
    }

    const result = await executeUnifiedSearch(query, profile || {}, language);
    res.json(result);
  } catch (err) {
    console.error('[Search API Error]', err);
    res.status(500).json({
      ok: false,
      code: 'internal_error',
      message: 'Something went wrong processing your search. Please try again.',
      notes: [err.message]
    });
  }
});

module.exports = router;
