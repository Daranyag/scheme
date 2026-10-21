const axios = require('axios');
const cheerio = require('cheerio');
const Scheme = require('../models/Scheme');
const sourcesConfig = require('../sources.json');

async function fetchPageText(url) {
    try {
        const urlObj = new URL(url);
        // Ensure it's on the allowlist
        const isAllowed = sourcesConfig.allowlistedDomains.some(domain => urlObj.hostname.endsWith(domain));
        if (!isAllowed) {
            console.log(`Skipping ${url} - not in allowlist`);
            return null;
        }

        const response = await axios.get(url, {
            timeout: 8000,
            headers: { 'User-Agent': 'TNSchemesVerifier/1.0 (Contact: admin@example.com)' }
        });
        
        const $ = cheerio.load(response.data);
        $('script, style, nav, footer').remove();
        return $('body').text().replace(/\s+/g, ' ').trim();
    } catch (error) {
        console.error(`Failed to fetch ${url}:`, error.message);
        return null;
    }
}

async function verifySchemes() {
    console.log('Starting verification job...');
    const schemes = await Scheme.find({ verificationLevel: { $ne: 'official' } });

    for (const scheme of schemes) {
        let pageText = null;
        for (const page of sourcesConfig.officialPages) {
            const text = await fetchPageText(page.url);
            if (text && text.toLowerCase().includes(scheme.name.toLowerCase())) {
                pageText = text;
                break;
            }
        }

        if (!pageText) {
            console.log(`No official mention found for ${scheme.name}`);
            continue;
        }

        console.log(`Verifying ${scheme.name} against found text...`);
        
        const prompt = `
        You are a verification engine. 
        Compare the following Scheme Data against the Official Text below.
        
        Scheme Data:
        ${JSON.stringify({
            name: scheme.name,
            benefit: scheme.benefit,
            rules: scheme.rules,
            also: scheme.also
        })}
        
        Official Text:
        ${pageText.substring(0, 30000)}
        
        Return JSON exactly like this:
        {
           "matches": true|false,
           "differences": ["difference 1", "difference 2"],
           "extractedBenefit": "benefit from text",
           "extractedCriteria": ["criteria 1"]
        }
        Only output JSON. Do not hallucinate data outside the Official Text.
        `;

        try {
             const { scrapePage } = require('../scrapers/scraperEngine');
             const scrapeRes = await scrapePage({
                 text: pageText,
                 url: officialLink,
                 schemeId: scheme._id,
                 schemeName: scheme.name
             });

             const differences = [];
             if (scrapeRes.benefit && scrapeRes.benefit !== scheme.benefit) {
                 differences.push(`Benefit differs (found ${scrapeRes.benefit})`);
             }

             if (differences.length === 0 && (scrapeRes.facts.length > 0 || scrapeRes.confidence > 0.5)) {
                 scheme.verificationLevel = 'official';
                 scheme.lastVerified = new Date().toISOString();
                 await scheme.save();
                 console.log(`${scheme.name} verified successfully.`);
             } else if (differences.length > 0) {
                 console.log(`${scheme.name} differs! Differences:`, differences);
                 scheme.verificationLevel = 'differs';
                 scheme.lastVerified = new Date().toISOString();
                 await scheme.save();
             } else {
                 console.log(`${scheme.name} verified with basic official match.`);
                 scheme.verificationLevel = 'official';
                 scheme.lastVerified = new Date().toISOString();
                 await scheme.save();
             }

        } catch (err) {
             console.error(`Scraper verification failed for ${scheme.name}:`, err.message);
        }
    }
    console.log('Verification job complete.');
}

module.exports = { verifySchemes };
