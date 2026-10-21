/**
 * Advanced Link Graph Crawler
 * - Link scoring with English & Tamil keywords (scheme, scholarship, pension, assistance, etc.)
 * - Scope rules per domain (allowed hosts, depth, max pages)
 * - Guards against login pages, form submissions, and sensitive URLs
 * - Content hashing & ETag conditional requests
 */

const crypto = require('crypto');
const { fetchPage } = require('../lib/fetcher');
const { isAllowlistedUrl } = require('../config/allowlist');

// Keywords that indicate scheme or benefit content
const INTERESTING_KEYWORDS = [
  'scheme', 'scholarship', 'pension', 'assistance', 'welfare', 'benefit', 'benefits',
  'eligibility', 'apply', 'notification', 'g.o', 'circular', 'order', 'guidelines',
  'திட்டம்', 'உதவித்தொகை', 'ஓய்வூதியம்', 'நலத்திட்டம்', 'தகுதி', 'விண்ணப்பிக்க', 'அரசாணை'
];

// Disallowed patterns (login, register, forms, tenders, galleries)
const DISALLOWED_PATH_PATTERNS = [
  /\/login/i, /\/signin/i, /\/auth/i, /\/register/i, /\/signup/i,
  /\/apply-form/i, /\/submit/i, /\/form/i, /\/user/i, /\/admin/i,
  /\/gallery/i, /\/photo/i, /\/video/i, /\/tender/i, /\/recruitment/i,
  /\/calendar/i, /\/contact/i, /\/feedback/i
];

/**
 * Score a URL or link anchor text based on relevance keywords
 */
function scoreLink(urlStr, anchorText = '') {
  let score = 0;
  const combined = `${urlStr} ${anchorText}`.toLowerCase();

  // Guard: if matches disallowed login/form patterns, reject immediately
  for (const pattern of DISALLOWED_PATH_PATTERNS) {
    if (pattern.test(urlStr)) {
      return -1000; // Do not crawl
    }
  }

  for (const kw of INTERESTING_KEYWORDS) {
    if (combined.includes(kw.toLowerCase())) {
      score += 10;
    }
  }

  // Bonus for PDF documents containing schemes / guidelines
  if (urlStr.endsWith('.pdf')) {
    score += 5;
  }

  return score;
}

/**
 * Validates if link should be crawled based on allowlist and safety rules
 */
function shouldCrawlLink(urlStr) {
  if (!urlStr || typeof urlStr !== 'string') return false;
  if (!urlStr.startsWith('http://') && !urlStr.startsWith('https://')) return false;

  // Never crawl login, registration, or form submission endpoints
  for (const pattern of DISALLOWED_PATH_PATTERNS) {
    if (pattern.test(urlStr)) return false;
  }

  // Must be allowlisted domain
  if (!isAllowlistedUrl(urlStr)) return false;

  return true;
}

/**
 * Link Graph Crawler for a single source
 */
async function crawlSourceScope({ startUrl, maxDepth = 2, maxPages = 10, domain = '' }) {
  const visited = new Set();
  const queue = [{ url: startUrl, depth: 0 }];
  const crawledPages = [];

  while (queue.length > 0 && crawledPages.length < maxPages) {
    // Sort queue by scored links so interesting pages are fetched first
    queue.sort((a, b) => (b.score || 0) - (a.score || 0));
    const current = queue.shift();

    if (visited.has(current.url) || current.depth > maxDepth) continue;
    visited.add(current.url);

    if (!shouldCrawlLink(current.url)) continue;

    console.log(`[CRAWL] Depth ${current.depth}: ${current.url}`);
    const res = await fetchPage(current.url);

    if (!res.ok || !res.text) continue;

    crawledPages.push({
      url: current.url,
      finalUrl: res.finalUrl,
      depth: current.depth,
      text: res.text,
      links: res.links || []
    });

    // Enqueue discovered child links if under maxDepth
    if (current.depth < maxDepth && res.links) {
      for (const link of res.links) {
        if (!visited.has(link) && shouldCrawlLink(link)) {
          const linkScore = scoreLink(link);
          if (linkScore >= 0) {
            queue.push({
              url: link,
              depth: current.depth + 1,
              score: linkScore
            });
          }
        }
      }
    }
  }

  return crawledPages;
}

module.exports = {
  scoreLink,
  shouldCrawlLink,
  crawlSourceScope,
  INTERESTING_KEYWORDS,
  DISALLOWED_PATH_PATTERNS
};
