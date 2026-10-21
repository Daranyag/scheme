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
                const response = await axios.get(link, {
                    timeout: 12000,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                    }
                });
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

        const { isUserAiEnabled, isAiModeOff } = require('../lib/aiGate');
        const { evaluateEligibilityExtended } = require('../services/ruleEngine');

        // Helper for deterministic AI-free finder extraction
        const runAiFreeFinder = async (textSource, profileData) => {
            let matchedSchemes = [];
            try {
                const searchRes = await executeUnifiedSearch(textSource, profileData, 'en');
                if (searchRes && searchRes.results && searchRes.results.length > 0) {
                    matchedSchemes = searchRes.results;
                }
            } catch (sErr) {}

            if (matchedSchemes.length === 0) {
                // Regex / substring fallback across known schemes
                const allSchemes = await Scheme.find().lean();
                const norm = textSource.toLowerCase();
                for (const s of allSchemes) {
                    if (norm.includes(s.name.toLowerCase()) || 
                        (s.nameTamil && norm.includes(s.nameTamil.toLowerCase())) ||
                        (s.aliases || []).some(a => norm.includes(a.toLowerCase())) ||
                        (s.category && norm.includes(s.category.toLowerCase()))) {
                        matchedSchemes.push(s);
                    }
                }
            }

            return matchedSchemes.map(s => {
                const evalRes = evaluateEligibilityExtended(profileData, s.rules || s.eligibilityRules || {}, s.status);
                let reason = 'Verified from database';
                if (evalRes.verdict === 'not_eligible') {
                    reason = `Unmet conditions: ${evalRes.failedCriteria.map(f => f.key).join(', ')}`;
                } else if (evalRes.verdict === 'eligible') {
                    reason = 'Meets all verified eligibility criteria';
                } else {
                    reason = 'Additional info needed to verify eligibility';
                }
                return {
                    name: s.name,
                    benefit: s.benefit,
                    criteria: s.requiredDocuments || s.docs || s.unmappedCriteria || [],
                    verdict: evalRes.verdict === 'eligible' ? 'eligible' : (evalRes.verdict === 'not_eligible' ? 'not_eligible' : 'need_info'),
                    reason,
                    source: s.sourceUrl || 'Official Database'
                };
            });
        };

        // If photos were uploaded but AI / OCR is unavailable
        if (images.length > 0 && (isAiModeOff() || !isUserAiEnabled())) {
            return res.status(200).json({
                ok: false,
                message: "Photos need text reading, which is not available right now. Paste the text or upload a PDF instead.",
                schemes: []
            });
        }

        // AI-free path for text or PDF
        if (isAiModeOff() || !isUserAiEnabled()) {
            const schemes = await runAiFreeFinder(extractedText, profileObj);
            return res.json({ schemes });
        }

        // 1. If user just entered text (no link, no files), check if it matches an existing DB scheme first
        if (!link && files.length === 0 && text && text.trim().length > 0) {
            const searchRes = await executeUnifiedSearch(text, profileObj, 'en');
            if (searchRes && searchRes.results && searchRes.results.length > 0) {
                const mapped = searchRes.results.map(r => ({
                    name: r.name,
                    nameTamil: r.nameTamil || '',
                    category: r.category || 'General',
                    benefit: r.benefit || r.benefitSummary || '',
                    criteria: r.requiredDocuments || r.docs || r.unmappedCriteria || [],
                    rules: r.rules || r.eligibilityRules || {},
                    verdict: r.searchVerdict === 'eligible' ? 'eligible' : (r.searchVerdict === 'not_eligible' ? 'not_eligible' : 'need_info'),
                    reason: (r.searchFailedCriteria && r.searchFailedCriteria.length > 0) 
                        ? `Not eligible based on your profile (${r.searchFailedCriteria[0].key} requirement).`
                        : (r.searchVerdict === 'eligible' ? 'You qualify based on your profile details.' : 'Additional details may be needed to verify full qualification.'),
                    source: r.sourceUrl || 'Tamil Nadu Government Database'
                }));
                if (mapped.length > 0) {
                    return res.json({ schemes: mapped });
                }
            }
        }

        // 2. Comprehensive AI Prompt to analyze ANY scheme name, pasted description, link, or document
        const prompt = `
You are an expert government welfare scheme eligibility analyzer.
Analyze the following text, scheme name, description, or document. Even if this scheme is not in any pre-existing database, understand what scheme it is, extract its exact benefits, eligibility rules, and required documents.

User Profile:
${JSON.stringify(profileObj)}

Scheme Text / Description / Name:
${extractedText}

Task:
1. Identify the Scheme Name (e.g., if user only wrote "Moovalur Ramamirtham" or "free cycle scheme", identify it cleanly).
2. Summarize the Benefit (monetary amount, asset, pension, kit, or assistance).
3. Extract Eligibility Criteria and Required Documents as an array of clear strings.
4. Compare with the User Profile to determine Verdict:
   - "eligible": if the user meets the known criteria (e.g. woman, pregnant, income, student, age, etc.)
   - "not_eligible": if user explicitly violates a criterion (e.g. male for maternity/women schemes, or income exceeds limit)
   - "need_info": if essential profile data is missing to be sure
5. Provide a clear Reason explaining why they are eligible or not eligible based on their profile.
6. Extract simple machine-readable rules in "rules" object (e.g. {"gender": "F", "income": {"$lt": 250000}} or {"hasNewborn": true} or {}).

Return ONLY valid JSON in this exact structure:
{
  "schemes": [
    {
      "name": "Scheme Name",
      "nameTamil": "தமிழ் பெயர் (if applicable)",
      "category": "Social Welfare | Health | Education | Pension | Maternity & Child Welfare | Agriculture",
      "benefit": "Detailed benefit description",
      "criteria": ["Eligibility condition 1", "Condition 2", "Required document 1"],
      "verdict": "eligible",
      "reason": "Detailed reason why user is eligible or what criteria they meet/miss",
      "rules": {}
    }
  ]
}
`;

        const contents = [{ role: 'user', parts: [{ text: prompt }] }];
        if (images.length > 0) {
             contents[0].parts.push(...images);
        }

        const responseObj = await generateContentWithRetry({
            contents,
            config: {
                responseMimeType: "application/json"
            },
            options: { purpose: 'user' }
        });

        res.json(JSON.parse(responseObj.text));

    } catch (err) {
        console.error('[Finder Error]', err.message);
        files.forEach(f => {
            if (fs.existsSync(f.path)) fs.unlinkSync(f.path);
        });
        
        // If photos failed due to OCR or AI unavailability
        if (images.length > 0) {
            return res.status(200).json({
                ok: false,
                message: "Photos need text reading, which is not available right now. Paste the text or upload a PDF instead.",
                schemes: []
            });
        }

        // Deterministic text fallback if AI fails
        try {
            const { evaluateEligibilityExtended } = require('../services/ruleEngine');
            const searchRes = await executeUnifiedSearch(extractedText, profileObj, 'en');
            if (searchRes && searchRes.results && searchRes.results.length > 0) {
                const mapped = searchRes.results.map(r => ({
                    name: r.name,
                    benefit: r.benefit,
                    criteria: r.docs || [],
                    verdict: r.searchVerdict || 'need_info',
                    reason: 'Verified from database',
                    source: 'database'
                }));
                return res.json({ schemes: mapped });
            }
        } catch (fbErr) {}

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
