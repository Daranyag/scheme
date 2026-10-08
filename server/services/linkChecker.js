const { isAllowlistedUrl } = require('../config/allowlist');
const { executeHttpRequest, isTlsError, isTimeoutError } = require('./fetcher');

/**
 * Tests an official link using the rate-limited HTTP executor with TLS protection & timeout handling.
 * Returns metadata object with linkStatus, httpStatus, checkedAt, isAllowlisted, and working boolean.
 */
async function verifyLink(url) {
  const isAllowed = isAllowlistedUrl(url);
  if (!isAllowed) {
    return {
      url,
      isAllowlisted: false,
      working: false,
      linkStatus: 'domain_not_allowed',
      httpStatus: null,
      reason: 'Domain not on official allowlist',
      checkedAt: new Date().toISOString(),
      verifiedAt: new Date().toISOString()
    };
  }

  const res = await executeHttpRequest(url);
  return {
    url,
    isAllowlisted: true,
    working: res.status === 'ok',
    linkStatus: res.status, // 'ok', '404', 'timeout', 'tls_error', 'blocked', 'failed'
    httpStatus: res.httpStatus,
    reason: res.reason || (res.status === 'ok' ? 'Link operational' : `fetch failed (${res.status})`),
    checkedAt: new Date().toISOString(),
    verifiedAt: new Date().toISOString()
  };
}

/**
 * Batch checks a list of link tuples or objects and returns verified link records.
 */
async function checkLinks(linksList) {
  const results = [];
  for (const item of linksList) {
    let url = '';
    let title = 'Official Link';

    if (Array.isArray(item)) {
      title = item[0] || 'Official Portal';
      url = item[1] || '';
    } else if (typeof item === 'object' && item !== null) {
      title = item.title || item.name || 'Official Portal';
      url = item.url || item.link || '';
    } else if (typeof item === 'string') {
      url = item;
    }

    if (!url) continue;

    const linkMeta = await verifyLink(url);
    results.push({
      title,
      url: linkMeta.url,
      linkStatus: linkMeta.linkStatus,
      httpStatus: linkMeta.httpStatus,
      checkedAt: linkMeta.checkedAt,
      verifiedAt: linkMeta.verifiedAt,
      isAllowlisted: linkMeta.isAllowlisted,
      working: linkMeta.working,
      reason: linkMeta.reason
    });
  }
  return results;
}

module.exports = {
  verifyLink,
  checkLinks
};
