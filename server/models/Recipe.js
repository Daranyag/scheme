const mongoose = require('mongoose');

const recipeSchema = new mongoose.Schema({
  domain: { type: String, required: true },
  urlPattern: { type: String, required: true },
  field: { type: String, required: true },
  type: { type: String, enum: ['selector', 'regex'], required: true },
  value: { type: String, required: true }, // The CSS selector or the regex pattern
  postProcess: { type: String } // e.g. "trim", "parse_amount", "parse_date"
}, { timestamps: true });

recipeSchema.index({ domain: 1 });

module.exports = mongoose.model('Recipe', recipeSchema);
