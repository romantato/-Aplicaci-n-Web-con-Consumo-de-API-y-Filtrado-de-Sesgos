const express = require('express');
const mongoose = require('mongoose');
const { analyzeQuery, filterHits } = require('../../shared/biasFilter');
const { searchImages, isDemoMode } = require('../pixabay');
const db = require('../db');
const Search = require('../models/Search');
const SavedImage = require('../models/SavedImage');

const router = express.Router();
const MAX_RESULTS = 24;
const LANGS = ['es', 'en'];
const STATUS_LABELS = { mitigated: 'mitigada', rewritten: 'neutralizada', blocked: 'bloqueada' };

// Identificación simple del usuario (nombre elegido en la interfaz).
router.use((req, res, next) => {
  const raw = String(req.get('x-user-id') || '').trim();
  req.userId = /^[\w.\- ]{1,40}$/.test(raw) ? raw : 'anonimo';
  next();
});

/**
 * Filtro desactivado: la consulta se envía tal cual, pero se registra qué habría
 * detectado el filtro para poder comparar ambos comportamientos en el historial.
 */
function bypassFilter(q) {
  const analysis = analyzeQuery(q);
  const query = analysis.originalQuery;
  return {
    ...analysis,
    status: query ? 'disabled' : 'blocked',
    blocked: !query,
    appliedQuery: query,
    params: {},
    wouldBe: analysis.status,
    reasons: query
      ? [
          'Filtro antisesgos DESACTIVADO: la consulta se envió sin validación ni depuración de resultados.',
          ...(analysis.status !== 'clean'
            ? [`Con el filtro activo la consulta habría sido: ${STATUS_LABELS[analysis.status]}.`]
            : []),
        ]
      : analysis.reasons,
  };
}

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

router.get('/config', (req, res) => {
  res.json({ demoMode: isDemoMode(), dbMode: db.getMode() });
});

router.get(
  '/search',
  asyncHandler(async (req, res) => {
    const q = String(req.query.q || '').slice(0, 100);
    const lang = LANGS.includes(req.query.lang) ? req.query.lang : 'es';
    const filterEnabled = req.query.filter !== 'off';
    const filter = filterEnabled ? analyzeQuery(q) : bypassFilter(q);

    const record = {
      userId: req.userId,
      originalQuery: filter.originalQuery || '(vacía)',
      appliedQuery: filter.appliedQuery,
      filterStatus: filter.status,
      detectedTerms: filter.detected.map(({ term, category }) => ({ term, category })),
      reasons: filter.reasons,
      apiParams: filter.params,
    };

    if (filter.blocked) {
      const search = await Search.create({ ...record, source: 'none' });
      return res.json({ searchId: search._id, filter, hits: [], removed: [], totalHits: 0 });
    }

    const params = { lang, ...filter.params };
    const result = await searchImages(filter.appliedQuery, params);
    const { hits, removed } = filterEnabled ? filterHits(result.hits, filter) : { hits: result.hits, removed: [] };
    const shown = hits.slice(0, MAX_RESULTS);

    const search = await Search.create({
      ...record,
      apiParams: params,
      totalHits: result.totalHits,
      removedByFilter: removed.length,
      viewedImages: shown.map((h) => ({ pixabayId: h.id, tags: h.tags, previewURL: h.previewURL })),
      source: result.source,
    });

    res.json({
      searchId: search._id,
      filter,
      hits: shown,
      removed,
      totalHits: result.totalHits,
      source: result.source,
    });
  })
);

router.get(
  '/history',
  asyncHandler(async (req, res) => {
    const [searches, stats] = await Promise.all([
      Search.find({ userId: req.userId }).sort({ createdAt: -1 }).limit(30).select('-viewedImages').lean(),
      Search.aggregate([
        { $match: { userId: req.userId } },
        { $group: { _id: '$filterStatus', count: { $sum: 1 } } },
      ]),
    ]);
    res.json({
      searches,
      stats: Object.fromEntries(stats.map((s) => [s._id, s.count])),
    });
  })
);

router.delete(
  '/history',
  asyncHandler(async (req, res) => {
    const { deletedCount } = await Search.deleteMany({ userId: req.userId });
    res.json({ deletedCount });
  })
);

router.get(
  '/images',
  asyncHandler(async (req, res) => {
    const images = await SavedImage.find({ userId: req.userId }).sort({ createdAt: -1 }).lean();
    res.json({ images });
  })
);

router.post(
  '/images',
  asyncHandler(async (req, res) => {
    const b = req.body || {};
    const pixabayId = Number(b.id);
    if (!Number.isInteger(pixabayId)) return res.status(400).json({ error: 'id de imagen inválido' });

    const doc = {
      userId: req.userId,
      pixabayId,
      tags: String(b.tags || ''),
      author: String(b.user || ''),
      likes: Number(b.likes) || 0,
      views: Number(b.views) || 0,
      previewURL: String(b.previewURL || ''),
      webformatURL: String(b.webformatURL || ''),
      pageURL: String(b.pageURL || ''),
      query: String(b.query || ''),
      searchId: mongoose.isValidObjectId(b.searchId) ? b.searchId : undefined,
    };
    const image = await SavedImage.findOneAndUpdate(
      { userId: req.userId, pixabayId },
      { $setOnInsert: doc },
      { upsert: true, new: true }
    ).lean();
    res.status(201).json({ image });
  })
);

router.delete(
  '/images/:pixabayId',
  asyncHandler(async (req, res) => {
    const { deletedCount } = await SavedImage.deleteOne({
      userId: req.userId,
      pixabayId: Number(req.params.pixabayId),
    });
    res.json({ deletedCount });
  })
);

module.exports = router;
