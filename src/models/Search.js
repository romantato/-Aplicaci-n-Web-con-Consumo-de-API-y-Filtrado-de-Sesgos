const { Schema, model } = require('mongoose');

const viewedImageSchema = new Schema(
  {
    pixabayId: Number,
    tags: String,
    previewURL: String,
  },
  { _id: false }
);

const searchSchema = new Schema(
  {
    userId: { type: String, required: true, index: true },
    originalQuery: { type: String, required: true },
    appliedQuery: String,
    filterStatus: {
      type: String,
      enum: ['clean', 'mitigated', 'rewritten', 'blocked', 'disabled'],
      required: true,
    },
    detectedTerms: [{ _id: false, term: String, category: String }],
    reasons: [String],
    apiParams: { type: Schema.Types.Mixed, default: {} },
    totalHits: { type: Number, default: 0 },
    removedByFilter: { type: Number, default: 0 },
    viewedImages: [viewedImageSchema],
    source: { type: String, enum: ['pixabay', 'demo', 'none'], default: 'pixabay' },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: 'search_history' }
);

module.exports = model('Search', searchSchema);
