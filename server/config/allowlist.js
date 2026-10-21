const path = require('path');
const fs = require('fs');

let allowedDomainsList = [];
try {
  const allowedDomainsPath = path.join(__dirname, 'allowedDomains.json');
  allowedDomainsList = JSON.parse(fs.readFileSync(allowedDomainsPath, 'utf8'));
} catch (e) {
  allowedDomainsList = [
    "cra.tn.gov.in",
    "www.cra.tn.gov.in",
    "tnsocialwelfare.tn.gov.in",
    "tnesevai.tn.gov.in",
    "umis.tn.gov.in",
    "naanmudhalvan.tn.gov.in",
    "portal.naanmudhalvan.tn.gov.in",
    "cmchistn.com",
    "www.cmchistn.com",
    "kmut.tn.gov.in",
    "tn.gov.in",
    "myscheme.gov.in",
    "gov.in",
    "nic.in",
    "skilldevelopment.tn.gov.in",
    "portal.skilldevelopment.tn.gov.in"
  ];
}

function isGovernmentDomain(hostname) {
  if (!hostname || typeof hostname !== 'string') return false;
  const h = hostname.toLowerCase();
  return h.endsWith('.gov.in') || h.endsWith('.nic.in') || h === 'gov.in' || h === 'nic.in' || h.endsWith('.tn.gov.in') || h === 'cmchistn.com' || h.endsWith('.cmchistn.com');
}

function isAllowlistedUrl(urlString) {
  if (!urlString || typeof urlString !== 'string') return false;
  try {
    const parsed = new URL(urlString);
    const hostname = parsed.hostname.toLowerCase();

    // Never add or allow a domain that is not a government domain (or the official CMCHIS portal)
    if (!isGovernmentDomain(hostname)) {
      return false;
    }

    return allowedDomainsList.some(domain => 
      hostname === domain.toLowerCase() || hostname.endsWith('.' + domain.toLowerCase())
    );
  } catch (e) {
    return false;
  }
}

module.exports = {
  allowedDomains: allowedDomainsList,
  isAllowlistedUrl
};
