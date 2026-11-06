const PIXABAY_URL = 'https://pixabay.com/api/';
const PER_PAGE = 40;

const DEMO_HITS = [
  [101, 'cat, pet, feline, gato, mascota', 'CatPhotographer', 1240, 45200, 40],
  [102, 'nature, landscape, mountain, naturaleza, paisaje', 'NatureLover', 3890, 89100, 1018],
  [103, 'beach, sea, summer, playa, mar', 'SeaBreeze', 2150, 62300, 1015],
  [104, 'city, architecture, night, ciudad, technology', 'UrbanVibe', 1820, 31000, 1031],
  [105, 'dog, pet, animal, perro', 'DogDays', 980, 22100, 237],
  [106, 'laptop, technology, computer, work', 'TechDesk', 1430, 51200, 0],
  [107, 'forest, winter, nature, snow', 'ColdTrails', 760, 18300, 1036],
  [108, 'people, community, solidarity, diversity, team', 'TogetherStudio', 2010, 40500, 1005],
  [109, 'poverty, poor, child, dirty', 'StockSample', 300, 9000, 1011],
  [110, 'black, color, abstract, background, texture', 'ColorLab', 640, 15400, 1047],
  [111, 'woman, kitchen, housewife, cooking', 'StockSample', 410, 12000, 1060],
  [112, 'woman, scientist, laboratory, science', 'LabWomen', 1720, 30100, 1062],
].map(([id, tags, user, likes, views, picsum]) => ({
  id,
  tags,
  user,
  likes,
  views,
  previewURL: `https://picsum.photos/id/${picsum}/150/100`,
  webformatURL: `https://picsum.photos/id/${picsum}/640/426`,
  pageURL: 'https://pixabay.com/',
}));

function isDemoMode() {
  return !process.env.PIXABAY_API_KEY;
}

const DEMO_SIZE = 20;
const DEMO_AUTHORS = ['PixelNomad', 'LensCraft', 'Aurora', 'FotoAndina', 'StudioK', 'Wanderer', 'Mirador'];

/** Simula una respuesta de Pixabay: coincidencias de ejemplo + imágenes de relleno hasta DEMO_SIZE. */
function demoSearch(query, params) {
  const words = String(query || '').toLowerCase().split(/\s+/).filter(Boolean);
  const terms = params.colors ? [params.colors] : words;
  const matches = DEMO_HITS.filter((h) => terms.some((w) => h.tags.includes(w)));

  const baseTags = (terms.length ? terms : ['photo']).join(', ');
  const seedBase = encodeURIComponent(terms.join('-') || 'photo');
  const filler = Array.from({ length: DEMO_SIZE - matches.length }, (_, i) => ({
    id: 1000 + i,
    tags: `${baseTags}, ${['photography', 'background', 'scene', 'detail'][i % 4]}`,
    user: DEMO_AUTHORS[i % DEMO_AUTHORS.length],
    likes: 150 + ((i * 137) % 2400),
    views: 4000 + ((i * 7919) % 90000),
    previewURL: `https://picsum.photos/seed/${seedBase}-${i}/150/100`,
    webformatURL: `https://picsum.photos/seed/${seedBase}-${i}/640/426${params.colors ? '?grayscale' : ''}`,
    pageURL: 'https://pixabay.com/',
  }));

  const hits = matches.concat(filler);
  return { totalHits: hits.length, hits };
}

/**
 * Consulta asíncrona a Pixabay. SafeSearch siempre activo.
 * @param {string} query consulta ya procesada por el filtro antisesgos
 * @param {{colors?: string, category?: string, lang?: string, page?: number}} params
 */
async function searchImages(query, params = {}) {
  if (isDemoMode()) return { ...demoSearch(query, params), source: 'demo' };

  const url = new URL(PIXABAY_URL);
  url.searchParams.set('key', process.env.PIXABAY_API_KEY);
  url.searchParams.set('q', query.slice(0, 100));
  url.searchParams.set('image_type', 'photo');
  url.searchParams.set('safesearch', 'true');
  url.searchParams.set('per_page', String(PER_PAGE));
  url.searchParams.set('page', String(params.page || 1));
  url.searchParams.set('lang', params.lang || 'es');
  if (params.colors) url.searchParams.set('colors', params.colors);
  if (params.category) url.searchParams.set('category', params.category);

  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Pixabay respondió ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  return {
    totalHits: data.totalHits,
    hits: data.hits.map((h) => ({
      id: h.id,
      tags: h.tags,
      user: h.user,
      likes: h.likes,
      views: h.views,
      previewURL: h.previewURL,
      webformatURL: h.webformatURL,
      pageURL: h.pageURL,
    })),
    source: 'pixabay',
  };
}

module.exports = { searchImages, isDemoMode };
