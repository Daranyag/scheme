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

function isAllowlistedUrl(urlString) {
  if (!urlString || typeof urlString !== 'string') return false;
  try {
    const parsed = new URL(urlString);
    const hostname = parsed.hostname.toLowerCase();
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
