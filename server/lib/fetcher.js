const axios = require('axios');
const cheerio = require('cheerio');
const pdfParse = require('pdf-parse');
const https = require('https');
const tls = require('tls');
const crypto = require('crypto');
const { isAllowlistedUrl } = require('../config/allowlist');

const USER_AGENT = process.env.FETCH_USER_AGENT || 'TNSchemesBot/1.0 (Contact: admin@tn.gov.in)';

// Global Concurrency Limit = 3
let activeGlobalRequests = 0;
const globalQueue = [];

async function acquireGlobalSlot() {
  if (activeGlobalRequests < 3) {
    activeGlobalRequests++;
    return;
  }
  await new Promise(resolve => globalQueue.push(resolve));
  activeGlobalRequests++;
}

function releaseGlobalSlot() {
  activeGlobalRequests--;
  if (globalQueue.length > 0) {
    const next = globalQueue.shift();
    next();
  }
}

// Per-Domain Locking & Rate Limiting (1 request at a time, 3s delay)
const domainLocks = new Map();
const lastDomainRequestTime = new Map();
const domainConsecutiveFailures = new Map();
const domainConsecutiveTimeouts = new Map();
const domainCircuitOpenUntil = new Map();
const domainStatus = new Map();
const domainSkippedLogged = new Set();
const domainWorkingVariant = new Map(); // domain -> working url variant

async function acquireDomainLock(domain) {
  const pollInterval = process.env.NODE_ENV === 'test' ? 5 : 100;
  while (domainLocks.get(domain)) {
    await new Promise(r => setTimeout(r, pollInterval));
  }
  domainLocks.set(domain, true);

  const minInterval = process.env.NODE_ENV === 'test' ? 10 : 3000;
  const lastTime = lastDomainRequestTime.get(domain) || 0;
  const elapsed = Date.now() - lastTime;
  if (elapsed < minInterval) {
    await new Promise(r => setTimeout(r, minInterval - elapsed));
  }
}

function releaseDomainLock(domain) {
  lastDomainRequestTime.set(domain, Date.now());
  domainLocks.set(domain, false);
}

// Robots.txt Cache (24 hours)
const robotsCache = new Map(); // domain -> { fetchedAt, disallowPaths, crawlDelay }

async function fetchRobotsTxt(domain) {
  const cached = robotsCache.get(domain);
  if (cached && (Date.now() - cached.fetchedAt < 24 * 60 * 60 * 1000)) {
    return cached;
  }

  const result = { fetchedAt: Date.now(), disallowPaths: [], crawlDelay: 0 };
  try {
    const res = await axios.get(`https://${domain}/robots.txt`, {
      timeout: 10000,
      headers: { 'User-Agent': USER_AGENT },
      validateStatus: () => true
    });
    if (res.status === 200 && typeof res.data === 'string') {
      const lines = res.data.split(/\r?\n/);
      let isRelevantAgent = true;

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.toLowerCase().startsWith('user-agent:')) {
          const agent = trimmed.substring(11).trim();
          isRelevantAgent = agent === '*' || agent.toLowerCase().includes('tnschemesbot');
        } else if (isRelevantAgent && trimmed.toLowerCase().startsWith('disallow:')) {
          const path = trimmed.substring(9).trim();
          if (path) result.disallowPaths.push(path);
        } else if (isRelevantAgent && trimmed.toLowerCase().startsWith('crawl-delay:')) {
          const delay = parseInt(trimmed.substring(12).trim(), 10);
          if (!isNaN(delay)) result.crawlDelay = delay;
        }
      }
    }
  } catch (e) {
    // If robots.txt unavailable, assume allowed
  }

  robotsCache.set(domain, result);
  return result;
}

function isPathDisallowedByRobots(pathname, robotsInfo) {
  if (!robotsInfo || !robotsInfo.disallowPaths) return false;
  return robotsInfo.disallowPaths.some(disPath => {
    if (disPath === '/') return true;
    return pathname.startsWith(disPath);
  });
}

// TLS Probing helper
async function probeTlsCert(hostname) {
  return new Promise((resolve) => {
    try {
      const socket = tls.connect(443, hostname, { servername: hostname, rejectUnauthorized: false }, () => {
        const cert = socket.getPeerCertificate();
        socket.destroy();
        if (cert && cert.valid_to) {
          resolve({
            issuer: cert.issuer ? (cert.issuer.O || cert.issuer.CN) : 'Unknown',
            subject: cert.subject ? (cert.subject.CN || hostname) : hostname,
            validTo: new Date(cert.valid_to).toISOString(),
            isExpired: new Date(cert.valid_to).getTime() < Date.now()
          });
        } else {
          resolve(null);
        }
      });

      socket.on('error', () => {
        resolve(null);
      });

      socket.setTimeout(8000, () => {
        socket.destroy();
        resolve(null);
      });
    } catch (e) {
      resolve(null);
    }
  });
}

function classifyError(err, resStatus) {
  if (resStatus) {
    if (resStatus === 404) return 'http_404';
    if (resStatus === 403) return 'http_403';
    if (resStatus === 429) return 'http_429';
    if (resStatus >= 500) return 'http_5xx';
  }

  if (!err) return null;
  const code = err.code || '';
  const msg = (err.message || '').toLowerCase();

  if (code === 'ENOTFOUND' || msg.includes('getaddrinfo enotfound')) return 'dns';
  if (code === 'ECONNREFUSED' || msg.includes('econnrefused')) return 'connection_refused';
  if (code === 'ECONNABORTED' || code === 'ETIMEDOUT' || msg.includes('timeout')) return 'timeout';

  const tlsCodes = ['CERT_HAS_EXPIRED', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'ERR_TLS_CERT_ALTNAME_INVALID', 'SELF_SIGNED_CERT_IN_CHAIN'];
  if (tlsCodes.includes(code) || msg.includes('certificate') || msg.includes('ssl') || msg.includes('tls')) {
    if (code === 'CERT_HAS_EXPIRED' || msg.includes('expired')) return 'tls_expired';
    return 'tls_other';
  }

  return 'connection_refused';
}

function sanitizeTextAndPromptSafety(rawText) {
  if (!rawText) return '';

  let clean = rawText
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Strip potential AI prompt injection markers
  clean = clean
    .replace(/ignore (all )?previous instructions/gi, '')
    .replace(/system prompt:/gi, '')
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '');

  return clean;
}

function getAlternativeUrls(urlString) {
  let secureUrl = urlString;
  if (secureUrl.startsWith('http://')) {
    secureUrl = 'https://' + secureUrl.substring(7);
  }

  const alts = [secureUrl];
  try {
    const parsed = new URL(secureUrl);
    const host = parsed.hostname;
    const altHost = host.startsWith('www.') ? host.substring(4) : 'www.' + host;
    const path = parsed.pathname === '/' ? '' : parsed.pathname;

    alts.push(`${parsed.protocol}//${altHost}${path}${parsed.search}`);

    if (parsed.pathname && parsed.pathname !== '/') {
      alts.push(`${parsed.protocol}//${host}/`);
      alts.push(`${parsed.protocol}//${altHost}/`);
    }
  } catch (e) {}

  return Array.from(new Set(alts));
}

/**
 * Main Fetcher function - ALWAYS returns result object, NEVER throws.
 */
async function fetchPage(url, options = {}) {
  const startTime = Date.now();
  const fetchedAt = new Date().toISOString();

  // Enforce HTTPS
  let targetUrl = url;
  if (targetUrl.startsWith('http://')) {
    targetUrl = 'https://' + targetUrl.substring(7);
  }

  // 1. Allowlist Check
  if (!isAllowlistedUrl(targetUrl)) {
    return {
      ok: false,
      url,
      finalUrl: targetUrl,
      status: null,
      contentType: '',
      text: null,
      bytes: 0,
      durationMs: Date.now() - startTime,
      errorType: 'blocked_domain',
      errorMessage: 'Domain is not in allowedDomains allowlist',
      fetchedAt,
      certInfo: null,
      neededHeadless: false
    };
  }

  let domain = '';
  let pathname = '/';
  try {
    const parsed = new URL(targetUrl);
    domain = parsed.hostname.toLowerCase();
    pathname = parsed.pathname;
  } catch (e) {
    return {
      ok: false,
      url,
      finalUrl: targetUrl,
      status: null,
      contentType: '',
      text: null,
      bytes: 0,
      durationMs: Date.now() - startTime,
      errorType: 'dns',
      errorMessage: 'Invalid URL format',
      fetchedAt,
      certInfo: null,
      neededHeadless: false
    };
  }

  // 2. Circuit Breaker Check
  const openUntil = domainCircuitOpenUntil.get(domain) || 0;
  if (Date.now() < openUntil) {
    if (!domainSkippedLogged.has(domain)) {
      console.log(`[Fetcher] Domain ${domain} skipped (circuit breaker: marked slow after 2 consecutive timeouts).`);
      domainSkippedLogged.add(domain);
    }
    return {
      ok: false,
      url,
      finalUrl: targetUrl,
      status: null,
      contentType: '',
      text: null,
      bytes: 0,
      durationMs: Date.now() - startTime,
      errorType: 'timeout',
      errorMessage: `Domain ${domain} marked slow and skipped (circuit breaker active)`,
      fetchedAt,
      certInfo: null,
      neededHeadless: false
    };
  }

  // 3. Robots.txt Compliance Check
  const robotsInfo = await fetchRobotsTxt(domain);
  if (isPathDisallowedByRobots(pathname, robotsInfo)) {
    return {
      ok: false,
      url,
      finalUrl: targetUrl,
      status: null,
      contentType: '',
      text: null,
      bytes: 0,
      durationMs: Date.now() - startTime,
      errorType: 'blocked_robots',
      errorMessage: 'Path disallowed by domain robots.txt',
      fetchedAt,
      certInfo: null,
      neededHeadless: false
    };
  }

  const candidateUrls = getAlternativeUrls(targetUrl);
  // Re-order candidates if a cached working variant exists
  const cachedVariant = domainWorkingVariant.get(domain);
  if (cachedVariant && candidateUrls.includes(cachedVariant)) {
    const idx = candidateUrls.indexOf(cachedVariant);
    candidateUrls.splice(idx, 1);
    candidateUrls.unshift(cachedVariant);
  }

  let lastResult = null;

  for (const currentCandidate of candidateUrls) {
    if (!isAllowlistedUrl(currentCandidate)) continue;

    await acquireGlobalSlot();
    await acquireDomainLock(domain);

    try {
      const fetchAttempt = await executeFetchWithRetries(currentCandidate, domain, options);
      
      if (fetchAttempt.ok) {
        domainWorkingVariant.set(domain, currentCandidate);
        domainConsecutiveFailures.set(domain, 0);
        domainConsecutiveTimeouts.set(domain, 0);
        return {
          ...fetchAttempt,
          durationMs: Date.now() - startTime,
          fetchedAt
        };
      }

      lastResult = fetchAttempt;

      // If TLS error, do not try remaining candidate URL variants
      if (fetchAttempt.errorType === 'tls_expired' || fetchAttempt.errorType === 'tls_other') {
        break;
      }
    } finally {
      releaseDomainLock(domain);
      releaseGlobalSlot();
    }
  }

  // Record failure for circuit breaker
  const failures = (domainConsecutiveFailures.get(domain) || 0) + 1;
  domainConsecutiveFailures.set(domain, failures);

  if (lastResult && lastResult.errorType === 'timeout') {
    const timeouts = (domainConsecutiveTimeouts.get(domain) || 0) + 1;
    domainConsecutiveTimeouts.set(domain, timeouts);
    if (timeouts >= 2) {
      domainCircuitOpenUntil.set(domain, Date.now() + 6 * 60 * 60 * 1000);
      domainStatus.set(domain, 'slow');
      if (!domainSkippedLogged.has(domain)) {
        console.log(`[Fetcher] Domain ${domain} skipped (circuit breaker: marked slow after 2 consecutive timeouts).`);
        domainSkippedLogged.add(domain);
      }
    }
  }

  return {
    ok: false,
    url,
    finalUrl: lastResult ? lastResult.finalUrl : targetUrl,
    status: lastResult ? lastResult.status : null,
    contentType: lastResult ? lastResult.contentType : '',
    text: null,
    bytes: 0,
    durationMs: Date.now() - startTime,
    errorType: lastResult ? lastResult.errorType : 'connection_refused',
    errorMessage: lastResult ? lastResult.errorMessage : 'Fetch failed across all address variants',
    fetchedAt,
    certInfo: lastResult ? lastResult.certInfo : null,
    neededHeadless: false
  };
}

async function executeFetchWithRetries(targetUrl, domain, options) {
  const retryDelays = options.customDelays || [2000, 5000];
  const maxRetries = options.maxRetries !== undefined ? options.maxRetries : 2; // at most 2 retries (up to 3 attempts total: 0, 1, 2)
  const timeoutMs = options.timeoutMs || 20000;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await axios.get(targetUrl, {
        timeout: timeoutMs, // 20 second timeout default
        maxContentLength: 15 * 1024 * 1024, // 15 MB
        maxRedirects: 5,
        headers: {
          'Accept-Encoding': 'gzip, deflate, br',
          'User-Agent': USER_AGENT,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,application/pdf;q=0.8,*/*;q=0.8'
        },
        responseType: targetUrl.endsWith('.pdf') ? 'arraybuffer' : 'text',
        validateStatus: () => true
      });

      const finalUrl = response.request?.res?.responseUrl || response.config?.url || targetUrl;
      const status = response.status;
      const contentType = response.headers['content-type'] || '';
      const bytes = Buffer.isBuffer(response.data) ? response.data.length : Buffer.byteLength(response.data || '', 'utf8');

      // Check Content Length cap
      if (bytes > 15 * 1024 * 1024) {
        return { ok: false, finalUrl, status, contentType, errorType: 'too_large', errorMessage: 'Content exceeds 15 MB limit' };
      }

      // HTTP Error status handling
      if (status >= 400) {
        const errorType = classifyError(null, status);

        // Handle Retry-After on 429 or 503
        if ((status === 429 || status === 503) && attempt < maxAttempts) {
          const retryAfterHeader = response.headers['retry-after'];
          let delay = retryDelays[attempt] + Math.floor(Math.random() * 1000);
          if (retryAfterHeader) {
            const parsedSec = parseInt(retryAfterHeader, 10);
            if (!isNaN(parsedSec)) delay = parsedSec * 1000;
          }
          console.log(`[Fetcher] HTTP ${status} for ${targetUrl}. Waiting ${delay}ms before retry ${attempt + 1}...`);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }

        return { ok: false, finalUrl, status, contentType, errorType, errorMessage: `HTTP Server returned status ${status}` };
      }

      // Process 2xx Content
      let cleanText = '';
      let rawHtml = '';
      let extractedLinks = [];
      let neededHeadless = false;

      if (contentType.includes('application/pdf') || targetUrl.endsWith('.pdf')) {
        try {
          const buffer = Buffer.isBuffer(response.data) ? response.data : Buffer.from(response.data);
          const pdfData = await pdfParse(buffer, { max: 30 });
          cleanText = sanitizeTextAndPromptSafety(pdfData.text);
          if (!cleanText || cleanText.length === 0) {
            return { ok: false, finalUrl, status, contentType, errorType: 'unsupported_type', errorMessage: 'scanned_pdf', links: [] };
          }
        } catch (pdfErr) {
          return { ok: false, finalUrl, status, contentType, errorType: 'parse_error', errorMessage: pdfErr.message, links: [] };
        }
      } else {
        rawHtml = typeof response.data === 'string' ? response.data : response.data.toString('utf8');
        const $ = cheerio.load(rawHtml);
        
        $('a[href]').each((_, el) => {
           let href = $(el).attr('href');
           if (href) {
               // Make absolute
               try {
                   const absoluteUrl = new URL(href, finalUrl).href;
                   if (absoluteUrl.startsWith('http')) {
                       extractedLinks.push(absoluteUrl);
                   }
               } catch(e) {}
           }
        });
        extractedLinks = Array.from(new Set(extractedLinks)); // Deduplicate
        
        $('script, style, nav, footer, header, noscript, iframe, svg, .cookie-banner, #cookie-banner, .cookie-consent').remove();
        const bodyText = $('body').text() || $.text();
        cleanText = sanitizeTextAndPromptSafety(bodyText);

        // JavaScript-only page check (< 300 chars or enable javascript message)
        if (cleanText.length < 300 || /enable javascript|requires javascript/i.test(cleanText)) {
          // Attempt Playwright headless browser fallback if installed
          const headlessResult = await tryPlaywrightHeadless(targetUrl);
          if (headlessResult.success && headlessResult.text) {
            cleanText = headlessResult.text;
            neededHeadless = true;
          } else {
            return {
              ok: false,
              finalUrl,
              status,
              contentType,
              errorType: 'empty_content',
              errorMessage: 'Page content under 300 chars or requires JavaScript (headless browser fallback unavailable)'
            };
          }
        }
      }

      return {
        ok: true,
        finalUrl,
        status,
        contentType,
        text: cleanText,
        rawHtml: rawHtml || '',
        bytes,
        errorType: null,
        errorMessage: null,
        certInfo: null,
        neededHeadless,
        links: extractedLinks
      };

    } catch (err) {
      const errorType = classifyError(err, null);

      if (errorType === 'tls_expired' || errorType === 'tls_other') {
        const certInfo = await probeTlsCert(domain);
        return {
          ok: false,
          finalUrl: targetUrl,
          status: null,
          contentType: '',
          errorType,
          errorMessage: `TLS certificate verification failed (${err.message})`,
          certInfo: certInfo || { issuer: 'Unknown', isExpired: errorType === 'tls_expired' }
        };
      }

      // Retryable errors: timeout, connection_refused, dns
      if (['timeout', 'connection_refused', 'dns'].includes(errorType) && attempt < maxRetries) {
        const delay = (retryDelays[attempt] || 2000) + Math.floor(Math.random() * 500);
        console.log(`[Fetcher] ${errorType} on ${targetUrl}. Retrying in ${delay}ms (attempt ${attempt + 1})...`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }


      return {
        ok: false,
        finalUrl: targetUrl,
        status: null,
        contentType: '',
        errorType,
        errorMessage: err.message,
        certInfo: null
      };
    }
  }

  return { ok: false, finalUrl: targetUrl, status: null, contentType: '', errorType: 'timeout', errorMessage: 'Max retries exceeded' };
}

// Playwright Browser Management (Shared instance, capped pages per run)
let sharedBrowser = null;
let pagesRenderedCount = 0;
const MAX_PAGES_RENDERED_PER_RUN = 5;

async function tryPlaywrightHeadless(url) {
  if (pagesRenderedCount >= MAX_PAGES_RENDERED_PER_RUN) {
    return { success: false, reason: 'Page render budget cap reached' };
  }

  // 1. Try Playwright headless browser
  try {
    const playwright = require('playwright');
    if (!sharedBrowser) {
      sharedBrowser = await playwright.chromium.launch({ headless: true });
    }
    const page = await sharedBrowser.newPage();
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    const content = await page.evaluate(() => document.body.innerText);
    await page.close();
    pagesRenderedCount++;

    const clean = sanitizeTextAndPromptSafety(content);
    if (clean.length >= 50) {
      return { success: true, text: clean, method: 'playwright' };
    }
  } catch (pwErr) {
    // Playwright not installed or failed, proceed to embedded JSON & sitemap fallbacks
  }

  // 2. Embedded JSON (__NEXT_DATA__, script tags, noscript)
  try {
    const res = await axios.get(url, { timeout: 10000, validateStatus: () => true });
    if (res.data && typeof res.data === 'string') {
      const $ = cheerio.load(res.data);
      const nextData = $('script#__NEXT_DATA__').html();
      if (nextData) {
        try {
          const parsed = JSON.parse(nextData);
          const jsonText = JSON.stringify(parsed);
          if (jsonText.length > 100) {
            return { success: true, text: sanitizeTextAndPromptSafety(jsonText), method: 'embedded_json' };
          }
        } catch (je) {}
      }
      
      const noscript = $('noscript').text();
      if (noscript && noscript.length > 100) {
        return { success: true, text: sanitizeTextAndPromptSafety(noscript), method: 'noscript' };
      }
    }
  } catch (e) {}

  // 3. Fallback to official MyScheme portal for CMCHIS if terms allow
  if (url.includes('cmchis')) {
    try {
      const mySchemeRes = await axios.get('https://www.myscheme.gov.in/schemes/cmchis', { timeout: 10000, validateStatus: () => true });
      if (mySchemeRes.status === 200 && mySchemeRes.data) {
        const $ = cheerio.load(mySchemeRes.data);
        $('script, style, nav, footer').remove();
        const bodyText = sanitizeTextAndPromptSafety($('body').text() || '');
        if (bodyText.length > 200) {
          return {
            success: true,
            text: bodyText,
            method: 'myscheme_fallback'
          };
        }
      }
    } catch (e) {}
  }

  return { success: false, reason: 'All headless rendering and JSON fallback methods exhausted' };
}

function resetCircuitBreakerForTesting() {
  domainConsecutiveFailures.clear();
  domainConsecutiveTimeouts.clear();
  domainCircuitOpenUntil.clear();
  domainStatus.clear();
  domainSkippedLogged.clear();
  domainLocks.clear();
  lastDomainRequestTime.clear();
  domainWorkingVariant.clear();
}

function getDomainStatus(domain) {
  const norm = (domain || '').toLowerCase();
  return {
    status: domainStatus.get(norm) || 'normal',
    consecutiveTimeouts: domainConsecutiveTimeouts.get(norm) || 0,
    openUntil: domainCircuitOpenUntil.get(norm) || 0,
    isCircuitOpen: (domainCircuitOpenUntil.get(norm) || 0) > Date.now()
  };
}

module.exports = {
  fetchPage,
  getAlternativeUrls,
  sanitizeTextAndPromptSafety,
  classifyError,
  probeTlsCert,
  resetCircuitBreakerForTesting,
  getDomainStatus
};
