const mongoose = require('mongoose');
const { TARGET_STATE } = require('../config/constants');

const schemeSchema = new mongoose.Schema(
  {
    schemeId: { type: String, unique: true, required: true },
    schemeName: { type: String, required: true },
    shortDescription: { type: String },
    description: { type: String },

    department: { type: String },
    category: { type: String, required: true },

    benefit: { type: String },
    benefits: [{ type: String }],

    eligibility: { type: String },
    ageLimit: { min: Number, max: Number },
    incomeLimit: Number,
    disabilityEligibility: Boolean,
    documents: [String],
    ageLimit: { type: String },
    incomeLimit: { type: String },
    genderEligibility: { type: String },
    occupationEligibility: { type: String },
    disabilityEligibility: { type: String },
    categoryEligibility: { type: String },

    documents: [{ type: String }],

    applicationMethod: { type: String },
    applicationProcess: { type: String },

    officialUrl: { type: String },
    officialSourceUrl: { type: String, required: true },
    officialApplicationUrl: { type: String },

    sourceWebsite: { type: String, required: true },
    sourceName: { type: String, required: true },
    sourceType: { 
      type: String, 
      enum: ['API', 'STRUCTURED_DATA', 'HTML', 'PDF', 'OFFICIAL_PAGE', 'MANUAL_VERIFIED'],
      default: 'OFFICIAL_PAGE'
    },
    sourceReferences: [
      {
        sourceName: String,
        url: String
      }
    ],

    state: { type: String, default: TARGET_STATE, required: true },

    status: { type: String, default: 'ACTIVE' },
    isActive: { type: Boolean, default: true },

    lastFetchedAt: { type: Date, default: Date.now },
    lastVerifiedAt: { type: Date, default: Date.now },
  },
  {
    timestamps: true,
  }
);

// Indexes for duplicate detection and faster search
schemeSchema.index({ schemeName: 1, department: 1 }, { unique: true });

const Scheme = mongoose.model('Scheme', schemeSchema);
module.exports = Scheme;
