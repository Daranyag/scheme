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

  // Advanced Fetching v3: Status, Deadlines and Notices
  applicationStatus: { 
    type: String, 
    enum: ['open', 'closed', 'upcoming', 'unknown'], 
    default: 'unknown' 
  },
  applicationDeadline: { type: String, default: null }, // e.g. "31 Jul 2023" or ISO date
  applicationWindow: {
    startDate: { type: String, default: null },
    endDate: { type: String, default: null },
    statusQuote: { type: String, default: '' },
    updatedAt: { type: Date, default: Date.now }
  },

  // Advanced Fetching v3: Entity Graph, Cross-source & Departments
  department: { type: String, default: 'Social Welfare' },
  departmentTamil: { type: String, default: '' },
  board: { type: String, default: null }, // e.g. "Tamil Nadu Construction Workers Welfare Board"
  portalUrl: { type: String, default: null },
  aliases: { type: [String], default: [] }, // English & Tamil alternative names/abbreviations
  aliasesTamil: { type: [String], default: [] },
  confirmationLevel: {
    type: String,
    enum: ['confirmed by 1 official source', 'confirmed by 2 or more official sources', 'conflict between official sources', 'unconfirmed'],
    default: 'confirmed by 1 official source'
  },
  confirmingSources: { type: [String], default: [] },
  sourceTrustLevel: { type: String, enum: ['official', 'reputable', 'signal-only'], default: 'official' },
  
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
    farmer: { type: Boolean, default: null },
    communityCategory: { type: String, default: null }, // 'SC', 'ST', 'BC', 'MBC', 'Minority', 'General'
    workerType: { type: String, default: null }, // 'construction', 'auto_driver', 'domestic_worker', 'vendor', 'fisherman', 'weaver', etc.
    courseLevel: { type: String, default: null }, // 'school', 'UG', 'PG', 'PhD', 'ITI', 'diploma'
    disability: { type: Boolean, default: null }
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
  origin: { type: String, enum: ['starter', 'live', 'policy_note', 'central_dir', 'district_portal'], default: 'starter' },
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
    enum: ['verified', 'confirmed', 'differs', 'partial', 'fetched_not_parsed', 'unreachable', 'never_checked', 'blocked', 'tls_problem', 'no_candidate_page', 'retry_later', 'pending'],
    default: 'pending'
  },
  displayState: {
    type: String,
    enum: ['confirmed', 'partial', 'fetched_not_parsed', 'unreachable', 'never_checked'],
    default: 'never_checked'
  },
  completenessScore: { type: Number, default: 0 },
  missingFields: { type: [String], default: [] },
  starterData: { type: Object, default: {} },
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

// Create indexes for fast query and search
schemeSchema.index({
  name: 'text',
  benefit: 'text',
  category: 'text'
});
schemeSchema.index({ reviewStatus: 1 });
schemeSchema.index({ name: 1 });

// Cache invalidation hooks
const invalidateCacheHook = () => {
  try {
    const { invalidateCache } = require('../lib/schemesCache');
    invalidateCache();
  } catch (_) {}
};

schemeSchema.post('save', invalidateCacheHook);
schemeSchema.post('insertMany', invalidateCacheHook);
schemeSchema.post('updateOne', invalidateCacheHook);
schemeSchema.post('updateMany', invalidateCacheHook);
schemeSchema.post('findOneAndUpdate', invalidateCacheHook);
schemeSchema.post('findOneAndReplace', invalidateCacheHook);
schemeSchema.post('findOneAndDelete', invalidateCacheHook);
schemeSchema.post('deleteOne', invalidateCacheHook);
schemeSchema.post('deleteMany', invalidateCacheHook);

module.exports = mongoose.model('Scheme', schemeSchema);

