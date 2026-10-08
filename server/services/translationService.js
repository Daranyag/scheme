// translationService.js
// Simulates a lightweight translation pipeline

class TranslationService {
  constructor() {
    this.dictionary = {
      'முதியோர் ஓய்வூதியம்': 'Old Age Pension',
      'பெண்கள்': 'Women',
      'வருமானம்': 'Income'
    };
  }

  isTamil(text) {
    const tamilRegex = /[\u0B80-\u0BFF]/;
    return tamilRegex.test(text);
  }

  translateToEnglish(text) {
    if (!text) return text;
    let translated = text;
    for (const [ta, en] of Object.entries(this.dictionary)) {
      translated = translated.replace(new RegExp(ta, 'g'), en);
    }
    // If we can't find it in dictionary, we would normally call a translation API here
    return translated;
  }
}

module.exports = new TranslationService();
