class PdfAdapter {
  constructor(pdfText, url) {
    this.pdfText = pdfText;
    this.url = url;
  }

  // Simulated logic to extract fields from G.O. PDF text
  extractFields() {
    const textLower = this.pdfText.toLowerCase();
    const result = {
      goNumber: null,
      date: null,
      benefit: 'Government benefit from PDF'
    };

    const goMatch = textLower.match(/g\.o\.\s*\(ms\)\s*no\.?\s*(\d+)/i);
    if (goMatch) {
      result.goNumber = goMatch[1];
    }

    const dateMatch = textLower.match(/dated\s*:?\s*(\d{1,2}[\.\-\/]\d{1,2}[\.\-\/]\d{2,4})/i);
    if (dateMatch) {
      result.date = dateMatch[1];
    }

    if (textLower.includes('rs.') || textLower.includes('₹')) {
       result.benefit = 'Monetary benefit found in PDF order';
    }

    return result;
  }
}

module.exports = PdfAdapter;
