const express = require('express');
const router = express.Router();
const multer = require('multer');
const pdfParse = require('pdf-parse');
const axios = require('axios');
const cheerio = require('cheerio');
const rateLimit = require('express-rate-limit');
const fs = require('fs');
const path = require('path');
const { generateContentWithRetry, mapGeminiErrorCode } = require('../lib/gemini');
const { executeUnifiedSearch } = require('../services/searchService');
const Scheme = require('../models/Scheme');

const upload = multer({ 
    dest: 'uploads/',
    limits: { fileSize: 10 * 1024 * 1024 } // 10 MB
});

const finderLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, 
    max: 20, 
    message: { error: 'Too many requests, please try again later.' }
});

router.post('/', finderLimiter, upload.array('files', 5), async (req, res) => {
    const { link, text, profile } = req.body;
    let extractedText = text || '';
    const files = req.files || [];

    try {
        let profileObj = {};
        if (profile) {
            profileObj = JSON.parse(profile);
        }

        // Process link
        if (link) {
            try {
                const response = await axios.get(link);
                const $ = cheerio.load(response.data);
                $('script, style').remove();
                extractedText += '\n\n' + $('body').text().replace(/\s+/g, ' ').trim();
            } catch (err) {
                extractedText += '\n\n[Note: Failed to fetch the provided link.]';
            }
        }

        // Process files (PDFs)
        const images = []; // For Gemini Vision if we handle images
        for (const file of files) {
            const ext = path.extname(file.originalname).toLowerCase();
            if (ext === '.pdf') {
                const dataBuffer = fs.readFileSync(file.path);
                const data = await pdfParse(dataBuffer, { max: 15 });
                if (!data.text || data.text.trim().length === 0) {
                     extractedText += `\n\n[Note: ${file.originalname} has no readable text (scanned?). Upload it as a photo instead.]`;
                } else {
                     extractedText += '\n\n' + data.text;
                }
            } else if (['.jpg', '.jpeg', '.png'].includes(ext)) {
                images.push({
                   inlineData: {
                      data: fs.readFileSync(file.path).toString("base64"),
                      mimeType: file.mimetype
                   }
                });
            }
            // Delete file after reading
            fs.unlinkSync(file.path);
        }

        // DATABASE FIRST: If it's a short text, no files, no links, route to search service or local DB
        if (!link && files.length === 0 && text && text.trim().length > 0 && text.length < 200) {
            const searchRes = await executeUnifiedSearch(text, profileObj, 'en');
            if (searchRes.level === 1 || searchRes.level === 2 || searchRes.level === 3) {
                 // Format back to what finder expects
                 const mapped = searchRes.results.map(r => ({
                     name: r.name,
                     benefit: r.benefit,
                     criteria: r.docs || [],
                     verdict: r.searchVerdict || (Object.keys(profileObj).length === 0 ? 'need_info' : 'eligible'),
                     reason: (r.searchFailedCriteria && r.searchFailedCriteria.length > 0) ? `Failed on ${r.searchFailedCriteria[0].key}` : 'Verified from database',
                     source: 'database'
                 }));
                 if (mapped.length > 0) {
                     return res.json({ schemes: mapped });
                 }
            }
        }

        const prompt = `
        You are an eligibility checker for Tamil Nadu government schemes. 
        Extract any government schemes or pensions from the following text and images.
        Compare their exact criteria against the user's profile:
        ${JSON.stringify(profileObj)}
        
        Text:
        ${extractedText}
        
        Return ONLY JSON in this exact format:
        {
          "schemes": [
            {
              "name": "Scheme Name",
              "benefit": "Benefit description",
              "criteria": ["Criterion 1", "Criterion 2"],
              "verdict": "eligible|not_eligible|need_info",
              "reason": "Brief reason based on profile"
            }
          ]
        }`;

        const contents = [{ role: 'user', parts: [{ text: prompt }] }];
        if (images.length > 0) {
             contents[0].parts.push(...images);
        }

        const responseObj = await generateContentWithRetry({
            contents,
            config: {
                responseMimeType: "application/json"
            }
        });

        res.json(JSON.parse(responseObj.text));

    } catch (err) {
        console.error('[Finder Error]', err.message);
        files.forEach(f => {
            if (fs.existsSync(f.path)) fs.unlinkSync(f.path);
        });
        
        const mappedErr = mapGeminiErrorCode(err);
        let msg = mappedErr.message;
        if (mappedErr.code === 'ai_quota_exhausted') {
            msg = "The AI assistant has reached its usage limit for now. Schemes already in the app can still be checked by name.";
        } else if (mappedErr.code === 'ai_busy') {
            msg = "The AI service is busy. Please try again in a minute.";
        }
        
        res.status(mappedErr.status || 500).json({ 
            ok: false, 
            code: mappedErr.code || 'internal_error', 
            message: msg || 'Something went wrong. Please try again.' 
        });
    }
});

module.exports = router;
