const express = require('express');
const router = express.Router();
const Scheme = require('../models/Scheme');

// GET all approved schemes (starter and approved records shown to users)
router.get('/', async (req, res) => {
    try {
        const schemes = await Scheme.find({
            $and: [
                { reviewStatus: { $ne: 'pending' } },
                { reviewStatus: { $ne: 'rejected' } }
            ]
        });
        res.json(schemes);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;
