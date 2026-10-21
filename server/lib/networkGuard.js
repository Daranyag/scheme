const axios = require('axios');
const https = require('https');
const http = require('http');

const BLOCKED_HOSTS = [
  'generativelanguage.googleapis.com',
  'aiplatform.googleapis.com',
  'gemini.google.com'
];

let isGuardActive = false;
let interceptorId = null;
let originalGlobalFetch = null;
let originalHttpsRequest = null;
let originalHttpRequest = null;

function isHostBlocked(hostname) {
  if (!hostname) return false;
  const lower = hostname.toLowerCase();
  return BLOCKED_HOSTS.some(bh => lower === bh || lower.endsWith('.' + bh));
}

function getCallerLocation() {
  const err = new Error();
  const stack = err.stack || '';
  const lines = stack.split('\n');
  for (const line of lines) {
    if (line.includes('networkGuard.js') || line.includes('axios') || line.includes('node:internal')) {
      continue;
    }
    const match = line.match(/\((.*?)\)/) || line.match(/at (.*)/);
    if (match && match[1]) {
      return match[1].trim();
    }
  }
  return 'unknown location';
}

function isAiOff() {
  const aiMode = (process.env.AI_MODE || 'auto').toLowerCase();
  const fetchOnly = (process.env.FETCH_ONLY || '').toLowerCase() === 'true';
  return aiMode === 'off' || fetchOnly;
}

function installNetworkGuard() {
  if (isGuardActive) return;
  isGuardActive = true;

  // 1. Axios Request Interceptor
  interceptorId = axios.interceptors.request.use((config) => {
    if (isAiOff()) {
      let host = '';
      try {
        const urlStr = config.url || '';
        if (urlStr.startsWith('http://') || urlStr.startsWith('https://')) {
          const parsed = new URL(urlStr);
          host = parsed.hostname;
        } else if (config.baseURL) {
          const parsed = new URL(config.baseURL);
          host = parsed.hostname;
        }
      } catch (e) {}

      if (isHostBlocked(host)) {
        const location = getCallerLocation();
        console.log(`BLOCKED AI CALL at ${location}`);
        console.error(`BLOCKED AI CALL at ${location}`);
        const blockErr = new Error(`BLOCKED AI CALL at ${location}`);
        blockErr.code = 'BLOCKED_AI_CALL';
        return Promise.reject(blockErr);
      }
    }
    return config;
  });

  // 2. Global fetch interceptor (Node 18+)
  if (typeof globalThis.fetch === 'function' && !originalGlobalFetch) {
    originalGlobalFetch = globalThis.fetch;
    globalThis.fetch = async function (resource, init) {
      if (isAiOff()) {
        let urlStr = '';
        if (typeof resource === 'string') {
          urlStr = resource;
        } else if (resource && resource.url) {
          urlStr = resource.url;
        }

        let host = '';
        try {
          const parsed = new URL(urlStr);
          host = parsed.hostname;
        } catch (e) {}

        if (isHostBlocked(host)) {
          const location = getCallerLocation();
          console.log(`BLOCKED AI CALL at ${location}`);
          console.error(`BLOCKED AI CALL at ${location}`);
          const blockErr = new Error(`BLOCKED AI CALL at ${location}`);
          blockErr.code = 'BLOCKED_AI_CALL';
          throw blockErr;
        }
      }
      return originalGlobalFetch.apply(this, arguments);
    };
  }

  // 3. Native https and http request interceptors
  if (!originalHttpsRequest) {
    originalHttpsRequest = https.request;
    https.request = function (...args) {
      if (isAiOff()) {
        let host = '';
        const target = args[0];
        if (typeof target === 'string') {
          try { host = new URL(target).hostname; } catch (e) {}
        } else if (target && typeof target === 'object') {
          host = target.hostname || target.host || '';
        }
        if (isHostBlocked(host)) {
          const location = getCallerLocation();
          console.log(`BLOCKED AI CALL at ${location}`);
          console.error(`BLOCKED AI CALL at ${location}`);
          const blockErr = new Error(`BLOCKED AI CALL at ${location}`);
          blockErr.code = 'BLOCKED_AI_CALL';
          throw blockErr;
        }
      }
      return originalHttpsRequest.apply(this, args);
    };
  }

  if (!originalHttpRequest) {
    originalHttpRequest = http.request;
    http.request = function (...args) {
      if (isAiOff()) {
        let host = '';
        const target = args[0];
        if (typeof target === 'string') {
          try { host = new URL(target).hostname; } catch (e) {}
        } else if (target && typeof target === 'object') {
          host = target.hostname || target.host || '';
        }
        if (isHostBlocked(host)) {
          const location = getCallerLocation();
          console.log(`BLOCKED AI CALL at ${location}`);
          console.error(`BLOCKED AI CALL at ${location}`);
          const blockErr = new Error(`BLOCKED AI CALL at ${location}`);
          blockErr.code = 'BLOCKED_AI_CALL';
          throw blockErr;
        }
      }
      return originalHttpRequest.apply(this, args);
    };
  }
}

function uninstallNetworkGuard() {
  if (interceptorId !== null) {
    axios.interceptors.request.eject(interceptorId);
    interceptorId = null;
  }
  if (originalGlobalFetch) {
    globalThis.fetch = originalGlobalFetch;
    originalGlobalFetch = null;
  }
  if (originalHttpsRequest) {
    https.request = originalHttpsRequest;
    originalHttpsRequest = null;
  }
  if (originalHttpRequest) {
    http.request = originalHttpRequest;
    originalHttpRequest = null;
  }
  isGuardActive = false;
}

// Auto-install by default
installNetworkGuard();

module.exports = {
  installNetworkGuard,
  uninstallNetworkGuard,
  isHostBlocked,
  getCallerLocation,
  isAiOff
};
