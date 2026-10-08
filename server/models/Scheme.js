const mongoose = require('mongoose');

const changeHistorySchema = new mongoose.Schema({
  field: { type: String, required: true },
  oldValue: { type: mongoose.Schema.Types.Mixed },
  newValue: { type: mongoose.Schema.Types.Mixed },
  quote: { type: String, default: '' },
  source: { type: String, default: '' },
  date: { type: Date, default: Date.now }
}, { _id: false });

const verifiedLinkSchema = new mongoose.Schema({
  title: { type: String, default: 'Official Link' },
  url: { type: String, required: true },
  linkStatus: { type: String, default: 'ok' },
  httpStatus: { type: Number, default: null },
  checkedAt: { type: Date, default: Date.now },
  verifiedAt: { type: Date, default: Date.now },
  isAllowlisted: { type: Boolean, default: true },
  working: { type: Boolean, default: false },
  reason: { type: String, default: '' }
}, { _id: false });

const schemeSchema = new mongoose.Schema({
  name: { type: String, required: true },
  nameTamil: { type: String, default: '' },
  category: { type: String, default: 'General' },
  benefit: { type: String, required: true },
  rules: { type: mongoose.Schema.Types.Mixed, required: true, default: {} },
  status: { type: String, default: 'ACTIVE' },
  
  // Specific strict eligibility fields
  eligibilityRules: {
    age: { type: Object, default: null },
    gender: { type: String, default: null },
    annualIncome: { type: Object, default: null },
    maritalStatus: { type: String, default: null },
    disabilityPercent: { type: Object, default: null },
    destitute: { type: Boolean, default: null },
    headOfFamily: { type: Boolean, default: null },
    studiedInGovtSchool: { type: Boolean, default: null },
    inHigherEducation: { type: Boolean, default: null },
    student: { type: Boolean, default: null },
    farmer: { type: Boolean, default: null }
  },
  
  unmappedCriteria: { type: [String], default: [] },
  also: { type: [String], default: [] },
  docs: { type: [String], default: [] },
  requiredDocuments: { type: [String], default: [] },
  steps: { type: [String], default: [] },
  howToApply: { type: [String], default: [] },
  links: { type: mongoose.Schema.Types.Mixed, default: [] },
  officialLinks: { type: mongoose.Schema.Types.Mixed, default: [] },
  sourceUrl: { type: String, default: '' },
  rawSourceText: { type: String, default: '' },

  // Origin & Content Hashing
  origin: { type: String, enum: ['starter', 'live'], default: 'starter' },
  fetchedAt: { type: Date, default: Date.now },
  contentHash: { type: String, default: '' },

  // Moderation & Linking
  reviewStatus: { 
    type: String, 
    enum: ['approved', 'pending', 'rejected'], 
    default: 'approved' 
  },
  renamedFrom: { type: String, default: null },
  replacedBy: { type: String, default: null },

  // Verification Tracking Fields
  verify: { type: Boolean, default: false },
  lastVerified: { type: String, default: () => new Date().toISOString() },
  verificationStatus: {
    type: String,
    enum: ['verified', 'differs', 'unreachable', 'blocked', 'tls_problem', 'ai_unavailable', 'no_candidate_page', 'retry_later', 'pending'],
    default: 'pending'
  },
  verificationReason: { type: String, default: 'no candidate link' },
  pageUsed: { type: String, default: null },
  retryAfter: { type: Date, default: null },
  verificationLevel: { 
    type: String, 
    enum: ['official', 'secondary-source', 'unverified', 'differs'], 
    default: 'secondary-source' 
  },
  changedRecently: { type: Boolean, default: false },
  changedRecentlyUntil: { type: Date, default: null },
  changeHistory: { type: [changeHistorySchema], default: [] },
  verifiedLinks: { type: [verifiedLinkSchema], default: [] },
  openQuestionsAnswered: { type: Object, default: {} }
}, { timestamps: true, strict: false, minimize: false, versionKey: false });

// Create a text index for Level 2 Search
schemeSchema.index({
  name: 'text',
  benefit: 'text',
  category: 'text'
});

module.exports = mongoose.model('Scheme', schemeSchema);
