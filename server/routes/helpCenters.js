const express = require('express');
const router = express.Router();
const axios = require('axios');
const rateLimit = require('express-rate-limit');
const HelpCenter = require('../models/HelpCenter');

const nearbyLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, 
    max: 50, 
    message: { error: 'Too many search requests, please try again later.' }
});

// Helper to round coordinates for privacy
function roundCoordinate(coord) {
    return Math.round(coord * 1000) / 1000;
}

// In a real app, this would query Google Places API
async function fetchGooglePlacesNearby(lat, lng, type) {
    // This is a stub for the Google Places (New) API logic.
    // Ensure you use process.env.GOOGLE_PLACES_API_KEY
    return [];
}

router.get('/', nearbyLimiter, async (req, res) => {
    let { lat, lng, type, radius } = req.query;

    if (!lat || !lng) {
        return res.status(400).json({ error: 'Missing coordinates or location parameters' });
    }

    try {
        const roundedLat = roundCoordinate(parseFloat(lat));
        const roundedLng = roundCoordinate(parseFloat(lng));
        const searchRadius = parseInt(radius) || 10000; // default 10km

        // 1. Check our cached DB for official dataset centers + recent Google queries
        const query = {
            location: {
                $near: {
                    $geometry: { type: "Point",  coordinates: [ roundedLng, roundedLat ] },
                    $maxDistance: searchRadius
                }
            }
        };
        
        if (type && type !== 'all') {
            query.type = type;
        }

        let centers = await HelpCenter.find(query);

        // 2. If nothing is found, we would hit Google Places here, cache the result to MongoDB, and return it.
        // if (centers.length === 0) {
        //     const newPlaces = await fetchGooglePlacesNearby(roundedLat, roundedLng, type);
        //     if (newPlaces.length > 0) {
        //          centers = await HelpCenter.insertMany(newPlaces);
        //     }
        // }

        if (centers.length === 0) {
             return res.json({ 
                 message: 'Nearby search is not available right now. No official data or cached results found.',
                 fallbackUrl: 'https://www.tnesevai.tn.gov.in',
                 centers: []
             });
        }

        res.json({ centers });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST endpoint to report wrong info
router.post('/report', nearbyLimiter, async (req, res) => {
    const { centerId, reason } = req.body;
    // Log report to database for admin review
    res.json({ message: 'Report received' });
});

module.exports = router;
