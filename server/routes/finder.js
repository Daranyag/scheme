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
    const images = []; // For Gemini Vision if we handle images

    try {
        let profileObj = {};
        if (profile) {
            profileObj = JSON.parse(profile);
        }

        // Process link
        let linkFetchFailed = false;
        let linkFetchEmpty = false;
        if (link) {
            try {
                const response = await axios.get(link, {
                    timeout: 10000,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
                    }
                });

                const html = typeof response.data === 'string' ? response.data : response.data.toString('utf8');
                const $ = cheerio.load(html);

                let pageContent = '';

                // 1. Check for Next.js SSR state (__NEXT_DATA__) commonly used in Vikaspedia / modern portals
                const nextDataRaw = $('#__NEXT_DATA__').text();
                if (nextDataRaw) {
                    try {
                        const parsedNext = JSON.parse(nextDataRaw);
                        const ssr = parsedNext.props?.pageProps?.ssrPageContent || parsedNext.props?.pageProps?.schemeData;
                        if (ssr) {
                            if (ssr.title) pageContent += `Scheme Name: ${ssr.title}\n`;
                            if (ssr.summery || ssr.summary) pageContent += `Summary: ${ssr.summery || ssr.summary}\n`;
                            if (ssr.content) {
                                const $c = cheerio.load(ssr.content);
                                pageContent += $c.text().replace(/\s+/g, ' ').trim() + '\n';
                            }
                            if (ssr.body) {
                                const $b = cheerio.load(ssr.body);
                                pageContent += $b.text().replace(/\s+/g, ' ').trim() + '\n';
                            }
                        }
                    } catch (_) {}
                }

                // 2. Extract meta title & description
                const metaTitle = $('meta[property="og:title"]').attr('content') || $('title').text() || '';
                const metaDesc = $('meta[name="description"]').attr('content') || $('meta[property="og:description"]').attr('content') || '';
                if (metaTitle && !pageContent.includes(metaTitle)) {
                    pageContent += `Title: ${metaTitle.trim()}\n`;
                }
                if (metaDesc && !pageContent.includes(metaDesc)) {
                    pageContent += `Description: ${metaDesc.trim()}\n`;
                }

                // 3. Extract text from primary body elements
                $('script, style, noscript, nav, footer, header, svg').remove();
                const mainBodyText = $('main, article, #content, .content, body').text().replace(/\s+/g, ' ').trim();
                if (mainBodyText.length > 50) {
                    pageContent += '\n' + mainBodyText;
                }

                if (pageContent.trim().length > 30) {
                    extractedText = `Source Link: ${link}\n\n${pageContent.trim()}` + (extractedText ? `\n\nUser Notes:\n${extractedText}` : '');
                } else {
                    linkFetchEmpty = true;
                }
            } catch (err) {
                linkFetchFailed = true;
            }
        }

        // If user submitted a link and no content could be read from it or from text/files
        if (link && !text && files.length === 0) {
            if (linkFetchFailed) {
                return res.status(200).json({
                    ok: false,
                    message: "Unable to access this web link (website timed out or blocked connection). Please copy and paste the scheme details or text directly.",
                    schemes: []
                });
            }
            if (linkFetchEmpty || !extractedText || extractedText.trim().length < 25) {
                return res.status(200).json({
                    ok: false,
                    message: "No scheme found on this web page. Please verify the URL or paste the scheme description directly.",
                    schemes: []
                });
            }
        }

        // Process files (PDFs)
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
Carefully analyze the following text, scheme name, description, or webpage content. Extract information ONLY for the specific scheme described in the provided content. Do NOT substitute or guess other unrelated schemes.

User Profile:
${JSON.stringify(profileObj)}

Scheme Content (from link, pasted text, or document):
${extractedText}

Task:
1. Identify the Exact Scheme Name described in the content above (e.g. if the text describes "Vetri Payanam Thittam" or "Vidiyal Payanam", do NOT output "Maternity Benefit" or any other scheme).
2. Summarize the Benefit (monetary amount, asset, pension, free bus travel, kit, or assistance) specifically mentioned for this scheme.
3. Extract Eligibility Criteria and Required Documents as an array of clear strings based on the text.
4. Compare with the User Profile to determine Verdict:
   - "eligible": if the user meets the known criteria (e.g. woman, resident of TN, pregnant, income, student, age, etc.)
   - "not_eligible": if user explicitly violates a criterion (e.g. male for women-only schemes, or income exceeds limit)
   - "need_info": if essential profile data is missing to be sure
5. Provide a clear Reason explaining why they are eligible or not eligible based on their profile.
6. Extract simple machine-readable rules in "rules" object (e.g. {"gender": "F"} or {"gender": "F", "income": {"$lt": 250000}} or {}).

Return ONLY valid JSON in this exact structure:
{
  "schemes": [
    {
      "name": "Exact Scheme Name",
      "nameTamil": "தமிழ் பெயர் (if applicable)",
      "category": "Social Welfare | Health | Education | Pension | Transport & Concessions | Maternity & Child Welfare | Agriculture",
      "benefit": "Detailed benefit description",
      "criteria": ["Eligibility condition 1", "Condition 2", "Required document 1"],
      "verdict": "eligible",
      "reason": "Detailed reason why user is eligible or what criteria they meet/miss",
      "rules": {}
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
                    criteria: r.docs || r.requiredDocuments || [],
                    verdict: r.searchVerdict || 'need_info',
                    reason: 'Verified from database',
                    source: 'database'
                }));
                return res.json({ schemes: mapped });
            }

            // If a URL or text was provided with a scheme title, extract cleanly from the text
            const titleMatch = extractedText.match(/(?:Scheme Name|Title):\s*([^\n\r]+)/i);
            const summaryMatch = extractedText.match(/(?:Summary|Benefit):\s*([^\n\r]+)/i);
            if (titleMatch && titleMatch[1]) {
                const sName = titleMatch[1].trim();
                const sBenefit = summaryMatch ? summaryMatch[1].trim() : 'Official government welfare assistance';
                return res.json({
                    schemes: [
                        {
                            name: sName,
                            category: 'Social Welfare',
                            benefit: sBenefit,
                            criteria: ['Must be a resident of Tamil Nadu', 'Check official portal guidelines'],
                            verdict: 'need_info',
                            reason: 'Extracted directly from the provided scheme webpage.',
                            rules: {}
                        }
                    ]
                });
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
