const cheerio = require('cheerio');
const { isAllowlistedUrl } = require('../config/allowlist');

class ListingAdapter {
  constructor(pageContent, url) {
    this.pageContent = pageContent || '';
    this.url = url || '';
  }

  extractLinks() {
    const schemeLinks = [];
    const pdfLinks = [];

    if (!this.pageContent) return { schemeLinks, pdfLinks, allLinks: [] };

    let $;
    try {
      $ = cheerio.load(this.pageContent);
      $('a[href]').each((_, el) => {
        const href = $(el).attr('href');
        if (!href) return;

        try {
          const absoluteUrl = new URL(href, this.url).href;
          if (!isAllowlistedUrl(absoluteUrl)) return;

          const lower = absoluteUrl.toLowerCase();
          if (lower.includes('login') || lower.includes('calendar') || lower.includes('search') || lower.includes('feedback')) {
            return;
          }

          if (lower.endsWith('.pdf') || lower.includes('/pdf/') || lower.includes('.pdf?')) {
            pdfLinks.push(absoluteUrl);
          } else if (lower.includes('scheme') || lower.includes('welfare') || lower.includes('pension') || lower.includes('service') || lower.includes('data_view')) {
            schemeLinks.push(absoluteUrl);
          }
        } catch (e) {}
      });
    } catch (e) {
      // Regex fallback
      const hrefRegex = /href=["']([^"']+)["']/gi;
      let match;
      while ((match = hrefRegex.exec(this.pageContent)) !== null) {
        try {
          const absoluteUrl = new URL(match[1], this.url).href;
          if (isAllowlistedUrl(absoluteUrl)) {
            if (absoluteUrl.toLowerCase().endsWith('.pdf')) {
              pdfLinks.push(absoluteUrl);
            } else {
              schemeLinks.push(absoluteUrl);
            }
          }
        } catch (e) {}
      }
    }

    const uniqueSchemeLinks = [...new Set(schemeLinks)];
    const uniquePdfLinks = [...new Set(pdfLinks)];

    return {
      schemeLinks: uniqueSchemeLinks,
      pdfLinks: uniquePdfLinks,
      allLinks: [...new Set([...uniqueSchemeLinks, ...uniquePdfLinks])]
    };
  }
}

module.exports = ListingAdapter;
