(() => {
  'use strict';

  const ICONS = {
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="m8 12 3 3 5-6"/></svg>',
    image: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/></svg>',
    db: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/></svg>',
    tag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><circle cx="7.5" cy="7.5" r="1.5"/></svg>',
    heart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l7 7z"/></svg>',
    eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
    bookmark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>',
  };

  const STATUS_TEXT = {
    clean: 'Sin sesgo detectado',
    mitigated: 'Mitigado',
    rewritten: 'Consulta neutralizada',
    blocked: 'Bloqueado',
    disabled: 'Filtro desactivado',
  };

  const X_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="m9 9 6 6M15 9l-6 6"/></svg>';

  const $ = (sel) => document.querySelector(sel);
  const els = {
    form: $('#search-form'),
    input: $('#search-input'),
    lang: $('#lang-select'),
    user: $('#user-input'),
    liveWarning: $('#live-warning'),
    report: $('#filter-report'),
    status: $('#status'),
    gallery: $('#gallery'),
    collection: $('#collection'),
    galleryCount: $('#gallery-count'),
    collectionCount: $('#collection-count'),
    historyList: $('#history-list'),
    historyStats: $('#history-stats'),
    pixabayMode: $('#pixabay-mode'),
    dbMode: $('#db-mode'),
    filterToggle: $('#filter-toggle'),
  };

  const state = {
    userId: localStorage.getItem('userId') || '',
    filterEnabled: localStorage.getItem('filterEnabled') !== 'false',
    lastSearch: null,
    savedIds: new Set(),
    controller: null,
    lastQueryKey: '',
  };

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  }

  function fillIcons(root = document) {
    root.querySelectorAll('[data-icon]').forEach((el) => {
      if (!el.innerHTML) el.innerHTML = ICONS[el.dataset.icon] || '';
    });
  }

  async function api(path, options = {}) {
    const res = await fetch(`/api${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'X-User-Id': state.userId || 'anonimo',
        ...(options.headers || {}),
      },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
    return data;
  }

  const fmt = (n) => Number(n || 0).toLocaleString('es-CO');

  // ---------- Validación en el cliente (retroalimentación inmediata) ----------
  function updateLiveWarning() {
    const q = els.input.value.trim();
    const analysis = q ? window.BiasFilter.analyzeQuery(q) : null;
    if (!analysis || analysis.status === 'clean') {
      els.liveWarning.hidden = true;
      return;
    }
    els.liveWarning.hidden = false;
    els.liveWarning.classList.toggle('blocked', state.filterEnabled && analysis.blocked);
    els.liveWarning.classList.toggle('disabled', !state.filterEnabled);
    const terms = analysis.detected.map((d) => `"${d.term}" (${d.label || d.category})`).join(', ');
    els.liveWarning.textContent = state.filterEnabled
      ? `⚠ ${STATUS_TEXT[analysis.status]}: ${terms}. ` + (analysis.reasons[0] || '')
      : `Filtro desactivado: se detectó ${terms}, pero la consulta se enviará sin cambios ` +
        `(con el filtro activo: ${STATUS_TEXT[analysis.status]}).`;
  }

  function renderFilterToggle() {
    const on = state.filterEnabled;
    els.filterToggle.classList.toggle('badge-green', on);
    els.filterToggle.classList.toggle('badge-red', !on);
    els.filterToggle.setAttribute('aria-pressed', String(on));
    els.filterToggle.querySelector('.icon').innerHTML = on ? ICONS.check : X_ICON;
    els.filterToggle.querySelector('.label').textContent = `Filtro Antisesgo: ${on ? 'ACTIVO' : 'INACTIVO'}`;
  }

  // ---------- Búsqueda ----------
  async function runSearch(query, { force = false } = {}) {
    const q = query.trim();
    if (!q) return;
    const key = `${q.toLowerCase()}|${els.lang.value}|${state.filterEnabled}`;
    if (!force && key === state.lastQueryKey) return;
    state.lastQueryKey = key;

    if (state.controller) state.controller.abort();
    state.controller = new AbortController();

    els.status.className = 'status';
    els.status.textContent = `Buscando "${q}"…`;
    showTab('gallery');

    try {
      const params = new URLSearchParams({ q, lang: els.lang.value, filter: state.filterEnabled ? 'on' : 'off' });
      const data = await api(`/search?${params}`, { signal: state.controller.signal });
      state.lastSearch = data;
      renderReport(data);
      renderGallery(data);
      loadHistory();
    } catch (err) {
      if (err.name === 'AbortError') return;
      state.lastQueryKey = '';
      els.status.className = 'status error';
      els.status.textContent = `No se pudo completar la búsqueda: ${err.message}`;
    }
  }

  function renderReport({ filter, removed, source }) {
    const r = els.report;
    r.hidden = false;
    r.className = `filter-report status-${filter.status}`;
    const detected = filter.detected.length
      ? filter.detected.map((d) => `<code>${esc(d.term)}</code> <small>(${esc(d.label || d.category)})</small>`).join(', ')
      : 'ninguno';
    const applied = filter.blocked
      ? '—'
      : `<code>${esc(filter.appliedQuery || '(sin texto)')}</code>` +
        (Object.keys(filter.params).length
          ? ` <small>parámetros: ${esc(Object.entries(filter.params).map(([k, v]) => `${k}=${v}`).join(', '))}</small>`
          : '');
    const reasons = filter.reasons.map((x) => `<li>${esc(x)}</li>`).join('');
    const removedLine = removed && removed.length
      ? `<li>Se descartaron <strong>${removed.length}</strong> resultado(s) por etiquetas estereotipadas: ${esc(
          [...new Set(removed.flatMap((x) => x.matches))].join(', ')
        )}.</li>`
      : '';

    r.innerHTML = `
      <h3>Reporte del filtro: <span class="tag-status ${filter.status}">${STATUS_TEXT[filter.status]}</span>
        ${source === 'demo' ? '<span class="tag-status">demo</span>' : ''}</h3>
      <div>Consulta original: <code>${esc(filter.originalQuery)}</code> → enviada a la API: ${applied}</div>
      <div>Términos sensibles detectados: ${detected}</div>
      ${reasons || removedLine ? `<ul>${reasons}${removedLine}</ul>` : ''}`;
  }

  function imageCard(img, { saved, mode }) {
    const tags = img.tags.split(',').slice(0, 4).map((t) => t.trim()).join(', ');
    const button =
      mode === 'collection'
        ? `<button type="button" class="btn btn-red" data-action="delete" data-id="${img.id}">✕ Quitar de Mongo</button>`
        : `<button type="button" class="btn btn-green" data-action="save" data-id="${img.id}" ${saved ? 'disabled' : ''}>
             <span class="icon">${ICONS.bookmark}</span> ${saved ? '✓ Guardado en Mongo' : '+ Guardar en Mongo'}
           </button>`;
    return `
      <article class="img-card">
        <a class="img-wrap" href="${esc(img.pageURL)}" target="_blank" rel="noopener noreferrer">
          <img src="${esc(img.webformatURL)}" alt="${esc(tags)}" loading="lazy" />
          <span class="img-id">ID: ${esc(img.id)}</span>
        </a>
        <div class="img-body">
          <div class="img-tags"><span class="icon">${ICONS.tag}</span> ${esc(tags)}</div>
          <div class="img-author">Autor: <strong>${esc(img.user)}</strong></div>
          <div class="img-stats">
            <span class="likes"><span class="icon">${ICONS.heart}</span> ${fmt(img.likes)}</span>
            <span class="views"><span class="icon">${ICONS.eye}</span> ${fmt(img.views)}</span>
          </div>
          ${button}
        </div>
      </article>`;
  }

  function renderGallery(data) {
    const { hits, filter, totalHits } = data;
    els.galleryCount.textContent = hits.length;
    if (filter.blocked) {
      els.status.className = 'status error';
      els.status.textContent = 'Búsqueda bloqueada por el filtro antisesgos. Revisa el reporte arriba.';
      els.gallery.innerHTML = '';
      return;
    }
    els.status.className = 'status';
    els.status.textContent = hits.length
      ? `Mostrando ${hits.length} imagen(es) de ${fmt(totalHits)} coincidencias para "${filter.appliedQuery || filter.originalQuery}".`
      : 'No se encontraron imágenes para esta búsqueda.';
    els.gallery.innerHTML = hits
      .map((h) => imageCard(h, { saved: state.savedIds.has(h.id), mode: 'gallery' }))
      .join('');
  }

  // ---------- Colección MongoDB ----------
  async function loadCollection() {
    try {
      const { images } = await api('/images');
      state.savedIds = new Set(images.map((i) => i.pixabayId));
      els.collectionCount.textContent = images.length;
      els.collection.innerHTML = images.length
        ? images
            .map((i) =>
              imageCard(
                { ...i, id: i.pixabayId, user: i.author },
                { mode: 'collection' }
              )
            )
            .join('')
        : '<p class="empty">Aún no has guardado imágenes. Usa “+ Guardar en Mongo” en la galería.</p>';
    } catch (err) {
      els.collection.innerHTML = `<p class="empty">Error cargando la colección: ${esc(err.message)}</p>`;
    }
  }

  async function saveImage(id, button) {
    const hit = state.lastSearch && state.lastSearch.hits.find((h) => h.id === id);
    if (!hit) return;
    button.disabled = true;
    try {
      await api('/images', {
        method: 'POST',
        body: JSON.stringify({ ...hit, query: state.lastSearch.filter.originalQuery, searchId: state.lastSearch.searchId }),
      });
      button.innerHTML = `<span class="icon">${ICONS.bookmark}</span> ✓ Guardado en Mongo`;
      await loadCollection();
    } catch (err) {
      button.disabled = false;
      alert(`No se pudo guardar: ${err.message}`);
    }
  }

  async function deleteImage(id) {
    try {
      await api(`/images/${id}`, { method: 'DELETE' });
      await loadCollection();
      if (state.lastSearch) renderGallery(state.lastSearch);
    } catch (err) {
      alert(`No se pudo eliminar: ${err.message}`);
    }
  }

  // ---------- Historial ----------
  async function loadHistory() {
    try {
      const { searches, stats } = await api('/history');
      els.historyStats.innerHTML = Object.keys(STATUS_TEXT)
        .filter((k) => stats[k])
        .map((k) => `<span class="tag-status ${k}">${STATUS_TEXT[k]}: ${stats[k]}</span>`)
        .join('');
      els.historyList.innerHTML = searches.length
        ? searches
            .map(
              (s) => `
          <li>
            <button type="button" data-q="${esc(s.originalQuery)}" title="Repetir búsqueda">${esc(s.originalQuery)}</button>
            <span class="meta">
              <span class="tag-status ${s.filterStatus}">${STATUS_TEXT[s.filterStatus]}</span>
              ${new Date(s.createdAt).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
            </span>
          </li>`
            )
            .join('')
        : '<li class="empty">Sin búsquedas registradas.</li>';
    } catch (err) {
      els.historyList.innerHTML = `<li class="empty">Error cargando historial: ${esc(err.message)}</li>`;
    }
  }

  // ---------- Pestañas ----------
  function showTab(name) {
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === name));
    document.querySelectorAll('[data-panel]').forEach((p) => (p.hidden = p.dataset.panel !== name));
    els.status.hidden = name !== 'gallery';
  }

  // ---------- Eventos ----------
  let typingTimer;
  els.input.addEventListener('input', () => {
    updateLiveWarning();
    clearTimeout(typingTimer);
    const q = els.input.value.trim();
    if (q.length >= 3) typingTimer = setTimeout(() => runSearch(q), 900);
  });

  els.form.addEventListener('submit', (e) => {
    e.preventDefault();
    clearTimeout(typingTimer);
    runSearch(els.input.value);
  });

  els.lang.addEventListener('change', () => runSearch(els.input.value));

  els.filterToggle.addEventListener('click', () => {
    state.filterEnabled = !state.filterEnabled;
    localStorage.setItem('filterEnabled', String(state.filterEnabled));
    renderFilterToggle();
    updateLiveWarning();
    runSearch(els.input.value);
  });

  document.querySelectorAll('.chip[data-q]').forEach((chip) =>
    chip.addEventListener('click', () => {
      els.input.value = chip.dataset.q;
      updateLiveWarning();
      runSearch(chip.dataset.q, { force: true });
    })
  );

  els.historyList.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-q]');
    if (!btn) return;
    els.input.value = btn.dataset.q;
    updateLiveWarning();
    runSearch(btn.dataset.q, { force: true });
  });

  $('#clear-history').addEventListener('click', async () => {
    if (!confirm('¿Borrar todo tu historial de búsquedas en MongoDB?')) return;
    await api('/history', { method: 'DELETE' });
    loadHistory();
  });

  document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => showTab(t.dataset.tab)));

  els.gallery.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action="save"]');
    if (btn) saveImage(Number(btn.dataset.id), btn);
  });
  els.collection.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action="delete"]');
    if (btn) deleteImage(Number(btn.dataset.id));
  });

  els.user.value = state.userId;
  els.user.addEventListener('change', () => {
    state.userId = els.user.value.trim();
    localStorage.setItem('userId', state.userId);
    loadHistory();
    loadCollection();
  });

  // ---------- Inicio ----------
  fillIcons();
  renderFilterToggle();
  api('/config')
    .then(({ demoMode, dbMode }) => {
      els.pixabayMode.textContent = demoMode ? 'Pixabay: MODO DEMO' : 'Pixabay: API real';
      els.pixabayMode.classList.add(demoMode ? 'warn' : 'ok');
      els.dbMode.textContent = dbMode === 'memory' ? 'MongoDB: en memoria' : 'MongoDB: conectado';
      els.dbMode.classList.add(dbMode === 'memory' ? 'warn' : 'ok');
    })
    .catch(() => {
      els.pixabayMode.textContent = 'Servidor no disponible';
    });
  loadHistory();
  loadCollection();
})();
