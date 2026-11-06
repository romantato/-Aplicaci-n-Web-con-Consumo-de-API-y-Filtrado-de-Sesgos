const { Schema, model } = require('mongoose');

const savedImageSchema = new Schema(
  {
    userId: { type: String, required: true },
    pixabayId: { type: Number, required: true },
    tags: String,
    author: String,
    likes: Number,
    views: Number,
    previewURL: String,
    webformatURL: String,
    pageURL: String,
    query: String,
    searchId: { type: Schema.Types.ObjectId, ref: 'Search' },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: 'saved_images' }
);

savedImageSchema.index({ userId: 1, pixabayId: 1 }, { unique: true });

module.exports = model('SavedImage', savedImageSchema);
