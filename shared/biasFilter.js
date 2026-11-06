/**
 * Filtro algorítmico antisesgos.
 *
 * Módulo compartido (UMD): lo usa el servidor como capa de validación obligatoria
 * y el navegador para dar retroalimentación inmediata mientras el usuario escribe.
 *
 * Política (de más a menos restrictiva):
 *   1. BLOCKED    -> término ofensivo, o identidad (raza, clase, género, religión,
 *                    discapacidad) combinada con un estereotipo negativo.
 *   2. REWRITTEN  -> término sensible racial o socioeconómico: se neutraliza la consulta
 *                    para que la API no devuelva imágenes que refuercen estereotipos.
 *   3. MITIGATED  -> término de género/religión/discapacidad sin estereotipo: se permite,
 *                    pero los resultados se depuran por etiquetas estereotipadas.
 *   4. CLEAN      -> consulta sin términos sensibles (p.ej. "black cat": color, no persona).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BiasFilter = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function normalize(text) {
    return String(text || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Términos ambiguos: son colores/lugares salvo que acompañen a personas.
  const AMBIGUOUS = {
    black: { category: 'racial', neutral: { q: '', colors: 'black', category: 'backgrounds' } },
    white: { category: 'racial', neutral: { q: '', colors: 'white', category: 'backgrounds' } },
    brown: { category: 'racial', neutral: { q: '', colors: 'brown', category: 'backgrounds' } },
    yellow: { category: 'racial', neutral: { q: '', colors: 'yellow', category: 'backgrounds' } },
    negro: { category: 'racial', neutral: { q: '', colors: 'black', category: 'backgrounds' } },
    negra: { category: 'racial', neutral: { q: '', colors: 'black', category: 'backgrounds' } },
    blanco: { category: 'racial', neutral: { q: '', colors: 'white', category: 'backgrounds' } },
    blanca: { category: 'racial', neutral: { q: '', colors: 'white', category: 'backgrounds' } },
    african: { category: 'racial', neutral: { q: 'africa landscape', category: 'places' } },
    africano: { category: 'racial', neutral: { q: 'africa landscape', category: 'places' } },
    africana: { category: 'racial', neutral: { q: 'africa landscape', category: 'places' } },
    asian: { category: 'racial', neutral: { q: 'asia landscape', category: 'places' } },
    asiatico: { category: 'racial', neutral: { q: 'asia landscape', category: 'places' } },
    indian: { category: 'racial', neutral: { q: 'india landscape', category: 'places' } },
    arab: { category: 'racial', neutral: { q: 'arabic architecture', category: 'buildings' } },
    arabe: { category: 'racial', neutral: { q: 'arabic architecture', category: 'buildings' } },
    latin: { category: 'racial', neutral: { q: 'latin america landscape', category: 'places' } },
  };

  const IDENTITY = {
    racial: [
      'blacks', 'negros', 'negras', 'morena', 'moreno', 'afro', 'afroamericano', 'african american',
      'africans', 'africanos', 'asians', 'indio', 'india people', 'indigena', 'indigenous',
      'latino', 'latina', 'latinos', 'hispanic', 'hispano', 'gypsy', 'gitano', 'gitana', 'mestizo',
      'mulato', 'mulata', 'ethnic', 'etnia', 'etnico', 'race', 'raza', 'racial', 'minority', 'minoria',
      'colored', 'de color', 'whites', 'blancos',
    ],
    socioeconomic: [
      'poor', 'pobre', 'pobres', 'poverty', 'pobreza', 'homeless', 'indigente', 'vagabundo', 'beggar',
      'mendigo', 'slum', 'favela', 'ghetto', 'gueto', 'barrio marginal', 'tugurio', 'refugee', 'refugiado',
      'migrant', 'migrante', 'immigrant', 'inmigrante', 'hunger', 'hambre', 'starving', 'miseria',
      'misery', 'third world', 'tercer mundo', 'marginado', 'needy', 'necesitado',
    ],
    gender: [
      'woman', 'women', 'mujer', 'mujeres', 'girl', 'girls', 'chica', 'chicas', 'nina', 'ninas', 'female',
      'femenino', 'femenina', 'man', 'men', 'hombre', 'hombres', 'male', 'masculino', 'boy', 'boys',
      'chico', 'chicos', 'gay', 'lesbian', 'lesbiana', 'trans', 'transgender', 'transgenero', 'lgbt',
      'lgbtq', 'queer', 'bisexual',
    ],
    religion: [
      'muslim', 'musulman', 'musulmana', 'islamic', 'islamico', 'jew', 'jewish', 'judio', 'judia',
      'hindu', 'christian', 'cristiano', 'cristiana',
    ],
    disability: [
      'disabled', 'disability', 'discapacitado', 'discapacitada', 'discapacidad', 'handicapped',
      'minusvalido', 'invalido', 'cripple', 'lisiado',
    ],
  };

  // Palabras que convierten un término ambiguo (color/lugar) en una referencia a personas.
  const PEOPLE = [
    'person', 'persona', 'personas', 'people', 'gente', 'human', 'humano', 'child', 'children', 'kid',
    'kids', 'nino', 'ninos', 'baby', 'bebe', 'family', 'familia', 'face', 'cara', 'rostro', 'portrait',
    'retrato', 'worker', 'trabajador', 'student', 'estudiante', 'crowd', 'multitud', 'skin', 'piel',
    'guy', 'lady', 'senora', 'senor', 'teen', 'adolescente', 'model', 'modelo',
  ].concat(IDENTITY.gender);

  const STEREOTYPES = [
    'criminal', 'crime', 'crimen', 'delincuente', 'thief', 'ladron', 'gang', 'pandilla', 'pandillero',
    'prison', 'carcel', 'prisoner', 'preso', 'violence', 'violent', 'violento', 'violencia', 'terrorist',
    'terrorista', 'terrorism', 'drug', 'drugs', 'droga', 'drogas', 'dealer', 'narco', 'dirty', 'sucio',
    'sucia', 'ugly', 'feo', 'fea', 'lazy', 'perezoso', 'vago', 'stupid', 'estupido', 'tonto', 'dumb',
    'slave', 'slavery', 'esclavo', 'esclava', 'esclavitud', 'servant', 'sirviente', 'sirvienta', 'maid',
    'housewife', 'ama de casa', 'kitchen', 'cocina', 'sexy', 'hot', 'bikini', 'lingerie', 'lenceria',
    'seductive', 'seductora', 'illegal', 'ilegal', 'savage', 'salvaje', 'primitive', 'primitivo',
    'tribal', 'weak', 'debil', 'monkey', 'mono', 'ape', 'simio', 'inferior', 'dangerous', 'peligroso',
    'threat', 'amenaza', 'hooligan', 'thug', 'matón', 'maton', 'emotional', 'histerica', 'hysterical',
  ];

  // Estereotipos que por sí mismos designan a una persona ("black criminal").
  const PERSON_STEREOTYPES = [
    'criminal', 'delincuente', 'thief', 'ladron', 'pandillero', 'prisoner', 'preso', 'terrorist',
    'terrorista', 'dealer', 'narco', 'slave', 'esclavo', 'esclava', 'servant', 'sirviente', 'sirvienta',
    'maid', 'housewife', 'ama de casa', 'savage', 'salvaje', 'thug', 'maton', 'hooligan',
  ];

  const SLURS = [
    'nigger', 'nigga', 'negrata', 'sudaca', 'spic', 'chink', 'gook', 'wetback', 'beaner', 'kike',
    'faggot', 'fag', 'maricon', 'marica', 'tranny', 'retard', 'retrasado', 'mongolico', 'subnormal',
    'puta', 'whore', 'bitch', 'zorra', 'indio pata rajada', 'cholo', 'naco',
  ];

  // Palabras de la consulta que se descartan al neutralizar (no aportan contexto).
  const STOPWORDS = ['a', 'an', 'the', 'of', 'el', 'la', 'los', 'las', 'un', 'una', 'de', 'del', 'y', 'and'];

  const REWRITE_SUFFIX = {
    racial: 'diversity',
    socioeconomic: 'community solidarity',
  };

  const CATEGORY_LABELS = {
    racial: 'racial/étnico',
    socioeconomic: 'socioeconómico',
    gender: 'género',
    religion: 'religioso',
    disability: 'discapacidad',
  };

  function n(list) {
    return list.map(normalize);
  }

  const N_IDENTITY = Object.fromEntries(Object.entries(IDENTITY).map(([k, v]) => [k, n(v)]));
  const N_PEOPLE = n(PEOPLE);
  const N_STEREOTYPES = n(STEREOTYPES);
  const N_PERSON_STEREOTYPES = n(PERSON_STEREOTYPES);
  const N_SLURS = n(SLURS);

  /** Devuelve los términos de `list` presentes en el texto normalizado (palabras o frases completas). */
  function findTerms(normText, list) {
    const padded = ` ${normText} `;
    return list.filter((term) => padded.includes(` ${term} `));
  }

  function removeTerms(normText, terms) {
    let out = ` ${normText} `;
    for (const t of terms) out = out.split(` ${t} `).join(' ');
    return out
      .split(' ')
      .filter((w) => w && !STOPWORDS.includes(w))
      .join(' ');
  }

  /**
   * Analiza una consulta y decide la acción del filtro.
   * @returns {{status, blocked, originalQuery, normalizedQuery, appliedQuery, params, detected, reasons}}
   */
  function analyzeQuery(query) {
    const originalQuery = String(query || '').trim();
    const norm = normalize(originalQuery);
    const result = {
      status: 'clean',
      blocked: false,
      originalQuery,
      normalizedQuery: norm,
      appliedQuery: norm,
      params: {},
      detected: [],
      reasons: [],
    };

    if (!norm) {
      result.status = 'blocked';
      result.blocked = true;
      result.reasons.push('La consulta está vacía.');
      return result;
    }

    const slurs = findTerms(norm, N_SLURS);
    if (slurs.length) {
      result.status = 'blocked';
      result.blocked = true;
      result.detected = slurs.map((term) => ({ term, category: 'ofensivo' }));
      result.reasons.push('La consulta contiene lenguaje ofensivo o discriminatorio.');
      result.appliedQuery = '';
      return result;
    }

    const stereotypes = findTerms(norm, N_STEREOTYPES);
    const hasPeople =
      findTerms(norm, N_PEOPLE).length > 0 || stereotypes.some((t) => N_PERSON_STEREOTYPES.includes(t));

    const identity = [];
    for (const [category, terms] of Object.entries(N_IDENTITY)) {
      for (const term of findTerms(norm, terms)) identity.push({ term, category });
    }

    // Términos ambiguos: solo son sensibles si se refieren a personas, acompañan a otro
    // término de identidad o van solos ("white kitchen" o "black monkey" no aluden a grupos humanos).
    const ambiguous = findTerms(norm, Object.keys(AMBIGUOUS));
    const remainingAfterAmbiguous = removeTerms(norm, ambiguous);
    const ambiguousIsSensitive =
      ambiguous.length > 0 && (hasPeople || identity.length > 0 || !remainingAfterAmbiguous);
    if (ambiguousIsSensitive) {
      for (const term of ambiguous) identity.push({ term, category: AMBIGUOUS[term].category });
    } else if (ambiguous.length) {
      result.reasons.push(
        `"${ambiguous.join(', ')}" se interpreta como color/lugar porque no se refiere a personas.`
      );
    }

    result.detected = identity.map((d) => ({ ...d, label: CATEGORY_LABELS[d.category] }));

    if (!identity.length) return result;

    const categories = [...new Set(identity.map((d) => d.category))];

    if (stereotypes.length) {
      result.status = 'blocked';
      result.blocked = true;
      result.appliedQuery = '';
      result.detected.push(...stereotypes.map((term) => ({ term, category: 'estereotipo', label: 'estereotipo' })));
      result.reasons.push(
        `Se bloqueó la búsqueda: combina un atributo ${categories.map((c) => CATEGORY_LABELS[c]).join('/')} ` +
          `con un estereotipo negativo ("${stereotypes.join('", "')}").`
      );
      return result;
    }

    const needsRewrite = categories.some((c) => c === 'racial' || c === 'socioeconomic');
    if (needsRewrite) {
      const remaining = removeTerms(
        norm,
        identity.filter((d) => d.category === 'racial' || d.category === 'socioeconomic').map((d) => d.term)
      );

      // Término ambiguo aislado (p.ej. "black") -> se busca su sentido neutro (color/lugar).
      const lone = ambiguous.length && !remaining && categories.every((c) => c === 'racial');
      if (lone) {
        const neutral = AMBIGUOUS[ambiguous[0]].neutral;
        result.appliedQuery = neutral.q;
        if (neutral.colors) result.params.colors = neutral.colors;
        if (neutral.category) result.params.category = neutral.category;
        result.reasons.push(
          `"${ambiguous[0]}" aislado es ambiguo: se busca su sentido neutro (${neutral.colors ? 'color' : 'lugar'}) ` +
            'en lugar de imágenes de personas, para no asociar el término con un grupo étnico.'
        );
      } else {
        const suffix = [...new Set(categories.map((c) => REWRITE_SUFFIX[c]).filter(Boolean))].join(' ');
        result.appliedQuery = `${remaining} ${suffix}`.trim();
        result.reasons.push(
          `Se neutralizó el término ${categories
            .filter((c) => REWRITE_SUFFIX[c])
            .map((c) => CATEGORY_LABELS[c])
            .join(' y ')} para evitar resultados que refuercen estereotipos; ` +
            `se busca "${result.appliedQuery}" con un enfoque inclusivo.`
        );
      }
      result.status = 'rewritten';
      result.params.lang = 'en';
    } else {
      result.status = 'mitigated';
      result.reasons.push(
        `Término ${categories.map((c) => CATEGORY_LABELS[c]).join('/')} permitido: ` +
          'se eliminarán los resultados con etiquetas estereotipadas o sexualizadas.'
      );
    }

    return result;
  }

  /**
   * Depura los resultados de Pixabay por sus etiquetas.
   * Siempre se eliminan las etiquetas ofensivas; si la consulta tocó un tema sensible,
   * también las que refuerzan estereotipos o asocian el tema con pobreza/marginalidad.
   */
  function filterHits(hits, analysis) {
    const sensitive = analysis && analysis.status !== 'clean';
    const banned = sensitive
      ? N_SLURS.concat(N_STEREOTYPES, N_IDENTITY.socioeconomic)
      : N_SLURS;

    const kept = [];
    const removed = [];
    for (const hit of hits || []) {
      const tags = normalize(String(hit.tags || '').replace(/,/g, ' '));
      const matches = findTerms(tags, banned);
      if (matches.length) removed.push({ id: hit.id, tags: hit.tags, matches });
      else kept.push(hit);
    }
    return { hits: kept, removed };
  }

  return {
    normalize,
    analyzeQuery,
    filterHits,
    CATEGORY_LABELS,
  };
});
