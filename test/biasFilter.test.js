const test = require('node:test');
const assert = require('node:assert/strict');
const { analyzeQuery, filterHits } = require('../shared/biasFilter');

const status = (q) => analyzeQuery(q).status;

test('consultas neutras pasan sin cambios', () => {
  for (const q of ['nature', 'technology', 'gato', 'playa al atardecer']) {
    const r = analyzeQuery(q);
    assert.equal(r.status, 'clean', q);
    assert.equal(r.appliedQuery, r.normalizedQuery);
  }
});

test('"black" aislado se reinterpreta como color', () => {
  const r = analyzeQuery('BLACK');
  assert.equal(r.status, 'rewritten');
  assert.equal(r.params.colors, 'black');
  assert.equal(r.params.category, 'backgrounds');
});

test('colores aplicados a objetos o animales no se consideran sensibles', () => {
  assert.equal(status('black cat'), 'clean');
  assert.equal(status('white kitchen'), 'clean');
  assert.equal(status('black monkey'), 'clean');
});

test('color + persona se neutraliza con enfoque de diversidad', () => {
  const r = analyzeQuery('black people');
  assert.equal(r.status, 'rewritten');
  assert.equal(r.appliedQuery, 'people diversity');
});

test('"poor" se neutraliza hacia un enfoque digno', () => {
  const r = analyzeQuery('POOR');
  assert.equal(r.status, 'rewritten');
  assert.equal(r.appliedQuery, 'community solidarity');
  assert.equal(analyzeQuery('niños pobres').appliedQuery, 'ninos community solidarity');
});

test('identidad + estereotipo se bloquea', () => {
  for (const q of ['black criminal', 'mujer cocina', 'poor dirty', 'latino ilegal', 'African savage']) {
    assert.equal(status(q), 'blocked', q);
  }
});

test('lenguaje ofensivo se bloquea', () => {
  assert.equal(status('sudaca'), 'blocked');
});

test('términos de género se permiten con mitigación', () => {
  assert.equal(status('woman'), 'mitigated');
  assert.equal(status('mujer científica'), 'mitigated');
});

test('acentos y mayúsculas se normalizan', () => {
  assert.equal(status('POBREZA'), 'rewritten');
  assert.equal(status('Afroamericano'), 'rewritten');
});

test('filterHits elimina resultados con etiquetas estereotipadas en consultas sensibles', () => {
  const hits = [
    { id: 1, tags: 'woman, scientist, laboratory' },
    { id: 2, tags: 'woman, kitchen, housewife' },
    { id: 3, tags: 'child, poverty, dirty' },
  ];
  const { hits: kept, removed } = filterHits(hits, analyzeQuery('woman'));
  assert.deepEqual(kept.map((h) => h.id), [1]);
  assert.equal(removed.length, 2);

  // En consultas neutras solo se eliminan etiquetas ofensivas.
  assert.equal(filterHits(hits, analyzeQuery('nature')).hits.length, 3);
});
