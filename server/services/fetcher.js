const { fetchPage, getAlternativeUrls, sanitizeTextAndPromptSafety, classifyError, probeTlsCert } = require('../lib/fetcher');

async function fetchCleanPageText(url) {
  const result = await fetchPage(url);
  return {
    success: result.ok,
    status: result.errorType || (result.ok ? 'ok' : 'failed'),
    reason: result.errorMessage || (result.ok ? 'ok' : 'fetch failed'),
    httpStatus: result.status,
    finalUrl: result.finalUrl || url,
    text: result.text,
    links: result.links || []
  };
}

async function executeHttpRequest(targetUrl) {
  const result = await fetchPage(targetUrl);
  return {
    success: result.ok,
    status: result.ok ? 'ok' : (result.errorType === 'tls_expired' || result.errorType === 'tls_other' ? 'tls_error' : (result.errorType === 'timeout' ? 'timeout' : (result.status === 404 ? '404' : (result.status === 403 ? 'blocked' : 'failed')))),
    httpStatus: result.status,
    finalUrl: result.finalUrl || targetUrl,
    reason: result.errorMessage || 'ok'
  };
}

function isTlsError(err) {
  if (!err) return false;
  const type = classifyError(err, null);
  return type === 'tls_expired' || type === 'tls_other';
}

function isTimeoutError(err) {
  if (!err) return false;
  const type = classifyError(err, null);
  return type === 'timeout';
}

module.exports = {
  fetchCleanPageText,
  executeHttpRequest,
  getAlternativeUrls,
  sanitizeText: sanitizeTextAndPromptSafety,
  isTlsError,
  isTimeoutError
};
