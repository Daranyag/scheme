// ocrService.js
// Simulates a tesseract.js pipeline for scanned PDFs

class OcrService {
  constructor() {
    this.tesseractAvailable = false; // Mock configuration
  }

  async processScannedPdf(pdfBuffer) {
    console.log('[OcrService] Processing scanned PDF buffer...');
    if (!this.tesseractAvailable) {
      console.warn('[OcrService] Tesseract not installed/available. Yielding blank text.');
      return '';
    }
    // Real implementation would use pdf2pic and tesseract.js here
    return 'Mock OCR text extracted from scanned PDF... G.O. (Ms) No. 42 dated 01.01.2025';
  }
}

module.exports = new OcrService();
