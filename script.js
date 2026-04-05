(async function CountryGuessr() {

  // ── STATE ──────────────────────────────────────────────────────────────────
  const TIMER_START = 15 * 60; // 15 minutes in seconds

  const state = {
    guessedSet: new Set(),
    countries: [],
    numericToCountry: new Map(),
    nameToCountry: new Map(),      // lowercased localized name → country
    fuse: null,
    lang: 'en',
    theme: 'sunset',
    activeContinent: 'All',
    timerEnabled: true,
    timerRunning: false,
    timerSecondsLeft: TIMER_START,
    timerInterval: null,
    projection: null,
    topoData: null,
  };

  const TOTAL = 197;
  const LS_KEY = 'countryguessr_v2';

  // ── i18n ───────────────────────────────────────────────────────────────────
  const i18n = {
    en: {
      placeholder: 'Type a country name...',
      remaining: '{n} remaining',
      guessed_title: 'Guessed Countries',
      already: 'Already guessed!',
      wrong: 'Not a country name',
      win_title: 'Congratulations!',
      win_subtitle: 'You named all 197 countries!',
      play_again: 'Play Again',
      reset_confirm: 'Reset all progress?',
      about: 'About',
      capital: 'Capital',
      gdp: 'GDP',
      capital_location: 'Capital Location',
      give_up: 'Give Up',
      results_title: 'Results',
      results_timeout: "Time's up!",
      results_giveup: 'You gave up',
      missed_countries: 'Countries you missed',
      time_left: 'Time remaining',
      currency: 'Currency',
      economic: 'Economic Overview',
    },
    fr: {
      placeholder: 'Tapez un nom de pays...',
      remaining: '{n} restants',
      guessed_title: 'Pays devinés',
      already: 'Déjà deviné !',
      wrong: 'Pas un nom de pays',
      win_title: 'Félicitations !',
      win_subtitle: 'Vous avez nommé les 197 pays !',
      play_again: 'Rejouer',
      reset_confirm: 'Réinitialiser la progression ?',
      about: 'À propos',
      capital: 'Capitale',
      gdp: 'PIB',
      capital_location: 'Localisation de la capitale',
      give_up: 'Abandonner',
      results_title: 'Résultats',
      results_timeout: 'Temps écoulé !',
      results_giveup: 'Vous avez abandonné',
      missed_countries: 'Pays manqués',
      time_left: 'Temps restant',
      currency: 'Monnaie',
      economic: 'Aperçu économique',
    },
  };

  function t(key) { return i18n[state.lang][key] || i18n.en[key] || key; }

  function flagUrl(alpha2) {
    return `https://flagcdn.com/w80/${alpha2.toLowerCase()}.png`;
  }
  function flagUrlLarge(alpha2) {
    return `https://flagcdn.com/w320/${alpha2.toLowerCase()}.png`;
  }
  function bannerUrl(alpha2) {
    // Use flagcdn large flag as banner (reliable, always works)
    return `https://flagcdn.com/w1280/${alpha2.toLowerCase()}.png`;
  }

  // Strip diacritics for accent-insensitive matching (é→e, ï→i, etc.)
  function normalize(str) {
    return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  }

  // ── DOM ─────────────────────────────────────────────────────────────────────
  const $ = id => document.getElementById(id);
  const dom = {
    input:         $('country-input'),
    scoreCurrent:  $('score-current'),
    scoreTotal:    $('score-total'),
    scorePct:      $('score-pct'),
    progressBar:   $('progress-bar'),
    remainingText: $('remaining-text'),
    guessedTitle:  $('guessed-title'),
    guessedList:   $('guessed-list'),
    toastContainer:$('toast-container'),
    tooltip:       $('tooltip'),
    ttFlag:        $('tt-flag'),
    ttName:        $('tt-name'),
    ttContinent:   $('tt-continent'),
    ttCapital:     $('tt-capital'),
    ttPopulation:  $('tt-population'),
    ttGdp:         $('tt-gdp'),
    continentTabs: $('continent-tabs'),
    mapContainer:  $('map-container'),
    mapLoading:    $('map-loading'),
    timerDisplay:  $('timer-display'),
    timerValue:    $('timer-value'),
    timerToggle:   $('timer-toggle'),
    restartBtn:    $('restart-btn'),
    winModal:      $('win-modal'),
    winTime:       $('win-time'),
    winRestartBtn: $('win-restart-btn'),
    langToggle:    $('lang-toggle'),
    themePicker:   $('theme-picker'),
    // Preview
    preview:        $('country-preview'),
    previewOverlay: $('preview-overlay'),
    previewClose:   $('preview-close'),
    previewBanner:  $('preview-banner-img'),
    previewFlag:    $('preview-flag'),
    previewName:    $('preview-name'),
    previewContinent:$('preview-continent'),
    previewCapital: $('preview-capital'),
    previewPop:     $('preview-population'),
    previewGdp:     $('preview-gdp'),
    previewDesc:    $('preview-description'),
    previewCurrency:$('preview-currency'),
    previewEconomic:$('preview-economic'),
    previewMinimap: $('preview-minimap'),
    // Results
    resultsModal:   $('results-modal'),
    resultsClose:   $('results-close'),
    resultsTitle:   $('results-title'),
    resultsCount:   $('results-count'),
    resultsPct:     $('results-pct'),
    resultsTime:    $('results-time'),
    resultsContinents: $('results-continents'),
    resultsMissedTitle: $('results-missed-title'),
    resultsMissedList: $('results-missed-list'),
    resultsRestartBtn: $('results-restart-btn'),
    giveupBtn:      $('giveup-btn'),
  };

  // ── DATA LOADING ───────────────────────────────────────────────────────────
  let topoData, countries;
  try {
    [topoData, countries] = await Promise.all([
      fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-50m.json').then(r => r.json()),
      fetch('countries.json').then(r => r.json()),
    ]);
  } catch (err) {
    dom.mapLoading.innerHTML = `
      <div style="text-align:center;padding:2rem;">
        <div style="font-size:2rem;margin-bottom:1rem;">⚠️</div>
        <p style="color:var(--text-secondary);margin-bottom:0.5rem;">Failed to load game data.</p>
        <code style="color:var(--accent);font-size:0.75rem;">python3 -m http.server 8080</code>
        <p style="color:var(--text-muted);font-size:0.7rem;margin-top:0.5rem;">${err.message}</p>
      </div>`;
    return;
  }

  state.countries = countries;
  state.topoData = topoData;
  countries.forEach(c => state.numericToCountry.set(c.numeric, c));

  // ── BUILD NAME INDEX ───────────────────────────────────────────────────────
  function buildNameIndex() {
    state.nameToCountry.clear();
    for (const c of state.countries) {
      const name = c.name[state.lang] || c.name.en;
      state.nameToCountry.set(name.toLowerCase(), c);
      state.nameToCountry.set(normalize(name), c);        // accent-insensitive
      const aliases = c.aliases[state.lang] || c.aliases.en || [];
      for (const a of aliases) {
        state.nameToCountry.set(a.toLowerCase(), c);
        state.nameToCountry.set(normalize(a), c);         // accent-insensitive
      }
    }
  }

  // ── FUSE INIT ──────────────────────────────────────────────────────────────
  function initFuse() {
    const lang = state.lang;
    const entries = state.countries.map(c => ({
      _country: c,
      name:        c.name[lang] || c.name.en,
      nameNorm:    normalize(c.name[lang] || c.name.en),
      aliases:     (c.aliases[lang] || c.aliases.en || []).join(' '),
      aliasesNorm: (c.aliases[lang] || c.aliases.en || []).map(normalize).join(' '),
    }));
    state.fuse = new Fuse(entries, {
      keys: [
        { name: 'name',        weight: 0.4 },
        { name: 'nameNorm',    weight: 0.4 },
        { name: 'aliases',     weight: 0.1 },
        { name: 'aliasesNorm', weight: 0.1 },
      ],
      threshold: 0.38,
      minMatchCharLength: 2,
      includeScore: true,
      ignoreLocation: true,
    });
  }

  // ── MAP RENDERING ──────────────────────────────────────────────────────────
  function renderMap() {
    const container = dom.mapContainer;
    const w = container.clientWidth  || 900;
    const h = container.clientHeight || 500;

    const projection = d3.geoNaturalEarth1()
      .scale(w / 5.8)
      .translate([w / 2, h / 2]);
    state.projection = projection;

    const pathGen = d3.geoPath().projection(projection);

    const svg = d3.select('#map-container')
      .append('svg')
      .attr('viewBox', `0 0 ${w} ${h}`)
      .attr('preserveAspectRatio', 'xMidYMid meet');

    svg.append('rect').attr('width', w).attr('height', h).attr('fill', 'var(--bg-primary)');

    const g = svg.append('g').attr('id', 'map-g');

    const features = topojson.feature(topoData, topoData.objects.countries).features;
    g.selectAll('path')
      .data(features)
      .enter()
      .append('path')
      .attr('d', pathGen)
      .attr('data-id', d => String(+d.id))   // strip leading zeros: "076" → "76"
      .attr('class', d =>
        state.numericToCountry.has(String(+d.id))
          ? 'country-path'
          : 'country-path unrecognized'
      );

    // Zoom
    const zoom = d3.zoom()
      .scaleExtent([1, 14])
      .on('zoom', e => g.attr('transform', e.transform));
    svg.call(zoom);
    svg.on('dblclick.zoom', null);
    svg.on('dblclick', () => svg.transition().duration(500).call(zoom.transform, d3.zoomIdentity));

    if (dom.mapLoading) dom.mapLoading.remove();
  }

  // ── CONTINENT TABS ─────────────────────────────────────────────────────────
  function initContinentTabs() {
    const continents = ['All', 'Africa', 'Americas', 'Asia', 'Europe', 'Oceania'];
    dom.continentTabs.innerHTML = continents
      .map(c => `<button class="continent-tab${c === 'All' ? ' active' : ''}" data-continent="${c}">${c}</button>`)
      .join('');

    dom.continentTabs.addEventListener('click', e => {
      const btn = e.target.closest('.continent-tab');
      if (!btn) return;
      state.activeContinent = btn.dataset.continent;
      dom.continentTabs.querySelectorAll('.continent-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      applyContinentFilter();
    });
  }

  function applyContinentFilter() {
    const c = state.activeContinent;
    document.querySelectorAll('.country-path').forEach(path => {
      const country = state.numericToCountry.get(path.getAttribute('data-id'));
      if (!country) return;
      if (c === 'All' || country.continent === c) {
        path.classList.remove('dimmed');
      } else {
        path.classList.add('dimmed');
      }
    });
  }

  // ── INPUT: AUTO-VALIDATE ───────────────────────────────────────────────────
  dom.input.addEventListener('input', () => {
    const query = dom.input.value.trim().toLowerCase();
    if (query.length < 2) return;

    // Exact match, then accent-insensitive fallback
    const exactMatch = state.nameToCountry.get(query) || state.nameToCountry.get(normalize(query));
    if (exactMatch) {
      if (state.guessedSet.has(exactMatch.numeric)) {
        showToast(t('already'), 'error');
        dom.input.value = '';
      } else {
        submitGuess(exactMatch);
      }
      return;
    }
  });

  dom.input.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const query = dom.input.value.trim().toLowerCase();
      if (query.length < 2) return;

      // Exact match, then accent-insensitive fallback
      const exactMatch = state.nameToCountry.get(query) || state.nameToCountry.get(normalize(query));
      if (exactMatch) {
        if (state.guessedSet.has(exactMatch.numeric)) {
          showToast(t('already'), 'error');
        } else {
          submitGuess(exactMatch);
        }
        return;
      }

      // Fuzzy match — normalize the query so accented chars work too
      const results = state.fuse.search(normalize(query), { limit: 1 });
      if (results.length > 0 && results[0].score < 0.2) {
        const country = results[0].item._country;
        if (state.guessedSet.has(country.numeric)) {
          showToast(t('already'), 'error');
        } else {
          submitGuess(country);
        }
      } else {
        showToast(t('wrong'), 'error');
      }
      dom.input.value = '';
    }
  });

  // ── GAME LOGIC ─────────────────────────────────────────────────────────────
  function submitGuess(country) {
    dom.input.value = '';
    dom.input.focus();

    const isFirstGuess = state.guessedSet.size === 0;
    state.guessedSet.add(country.numeric);

    if (isFirstGuess) {
      dom.giveupBtn.classList.remove('hidden');
      if (state.timerEnabled && !state.timerRunning) startTimer();
    }

    highlightCountry(country.numeric);
    updateScore();
    rebuildGuessedList();
    saveProgress();

    if (state.guessedSet.size === TOTAL) handleWin();
  }

  function highlightCountry(numeric, flash = true) {
    const paths = document.querySelectorAll(`[data-id="${numeric}"]`);
    if (!paths.length) return;
    const inContinent = state.activeContinent !== 'All'
      ? state.numericToCountry.get(numeric)?.continent === state.activeContinent
      : true;
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
    const guessed = getComputedStyle(document.documentElement).getPropertyValue('--guessed').trim();
    paths.forEach(path => {
      path.classList.remove('unrecognized');
      path.classList.add('guessed');
      if (flash) {
        // Use D3 transition for flash — CSS keyframe animations on SVG fills are unreliable
        d3.select(path)
          .style('fill', '#ffffff')
          .transition().duration(150)
          .style('fill', accent)
          .transition().duration(450)
          .style('fill', null); // release to CSS class fill
      }
      if (state.activeContinent !== 'All' && !inContinent) {
        path.classList.add('dimmed');
      }
    });
  }

  // ── SCORE ──────────────────────────────────────────────────────────────────
  function updateScore() {
    const n = state.guessedSet.size;
    const pct = Math.round((n / TOTAL) * 100);
    dom.scoreCurrent.textContent = n;
    dom.scoreTotal.textContent = TOTAL;
    dom.scorePct.textContent = `${pct}%`;
    dom.progressBar.style.width = `${pct}%`;
    dom.remainingText.textContent = t('remaining').replace('{n}', TOTAL - n);
  }

  // ── GUESSED LIST (grouped by continent) ────────────────────────────────────
  function rebuildGuessedList() {
    const lang = state.lang;
    const groups = {};
    const continentOrder = ['Africa', 'Americas', 'Asia', 'Europe', 'Oceania'];

    for (const numeric of state.guessedSet) {
      const c = state.numericToCountry.get(numeric);
      if (!c) continue;
      if (!groups[c.continent]) groups[c.continent] = [];
      groups[c.continent].push(c);
    }

    // Sort each group alphabetically
    for (const key of Object.keys(groups)) {
      groups[key].sort((a, b) => (a.name[lang] || a.name.en).localeCompare(b.name[lang] || b.name.en));
    }

    let html = '';
    for (const cont of continentOrder) {
      if (!groups[cont] || groups[cont].length === 0) continue;
      html += `<div class="continent-group">
        <div class="continent-group-header">
          <span class="continent-group-name">${cont}</span>
          <span class="continent-group-count">${groups[cont].length}</span>
        </div>`;
      for (const c of groups[cont]) {
        const name = c.name[lang] || c.name.en;
        html += `<div class="guessed-item" data-numeric="${c.numeric}">
          <img class="guessed-item-flag" src="${flagUrl(c.alpha2)}" alt="${name}" loading="lazy" />
          <span class="guessed-item-name">${name}</span>
        </div>`;
      }
      html += '</div>';
    }

    dom.guessedList.innerHTML = html;

    // Click handlers → open preview or pan to country
    dom.guessedList.querySelectorAll('.guessed-item').forEach(el => {
      el.addEventListener('click', () => {
        const country = state.numericToCountry.get(el.dataset.numeric);
        if (country) openPreview(country);
      });
    });
  }

  // ── TOOLTIP ────────────────────────────────────────────────────────────────
  dom.mapContainer.addEventListener('mousemove', e => {
    const target = e.target.closest('path[data-id]');
    if (!target) { dom.tooltip.classList.add('hidden'); return; }
    const numeric = target.getAttribute('data-id');
    if (!state.guessedSet.has(numeric)) { dom.tooltip.classList.add('hidden'); return; }
    const c = state.numericToCountry.get(numeric);
    if (!c) return;

    const lang = state.lang;
    dom.ttFlag.src = flagUrl(c.alpha2);
    dom.ttName.textContent = c.name[lang] || c.name.en;
    dom.ttContinent.textContent = c.continent;
    dom.ttCapital.textContent = c.capital[lang] || c.capital.en;
    dom.ttPopulation.textContent = c.population.toLocaleString();
    dom.ttGdp.textContent = c.gdp;

    dom.tooltip.classList.remove('hidden');
    const margin = 16;
    let x = e.clientX + margin;
    let y = e.clientY + margin;
    if (x + dom.tooltip.offsetWidth > window.innerWidth) x = e.clientX - dom.tooltip.offsetWidth - margin;
    if (y + dom.tooltip.offsetHeight > window.innerHeight) y = e.clientY - dom.tooltip.offsetHeight - margin;
    dom.tooltip.style.left = `${x}px`;
    dom.tooltip.style.top = `${y}px`;
  });

  dom.mapContainer.addEventListener('mouseleave', () => dom.tooltip.classList.add('hidden'));

  // ── MAP CLICK → OPEN PREVIEW ───────────────────────────────────────────────
  dom.mapContainer.addEventListener('click', e => {
    const target = e.target.closest('path[data-id]');
    if (!target) return;
    const numeric = target.getAttribute('data-id');
    if (!state.guessedSet.has(numeric)) return;
    const c = state.numericToCountry.get(numeric);
    if (c) openPreview(c);
  });

  // ── COUNTRY PREVIEW ────────────────────────────────────────────────────────
  function openPreview(country) {
    const lang = state.lang;
    const name = country.name[lang] || country.name.en;

    dom.previewBanner.src = bannerUrl(country.alpha2);
    dom.previewFlag.src = flagUrlLarge(country.alpha2);
    dom.previewName.textContent = name;
    dom.previewContinent.textContent = country.continent;
    dom.previewCapital.textContent = country.capital[lang] || country.capital.en;
    dom.previewPop.textContent = country.population.toLocaleString();
    dom.previewGdp.textContent = country.gdp;
    dom.previewDesc.textContent = country.description[lang] || country.description.en;
    if (dom.previewCurrency) {
      dom.previewCurrency.textContent = country.currency
        ? `${country.currency.symbol} ${country.currency.name} (1 ${country.currency.code} = ${country.currency.rateToEur}€)`
        : '—';
    }
    if (dom.previewEconomic) {
      dom.previewEconomic.textContent = (country.economic && (country.economic[lang] || country.economic.en)) || '';
    }

    // Update i18n labels
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.dataset.i18n;
      if (i18n[lang][key]) el.textContent = i18n[lang][key];
    });

    // Render mini-map with highlighted country + capital dot
    renderMinimap(country);
    // Capital dot on main world map
    addMainCapitalDot(country);

    dom.preview.classList.remove('hidden');
  }

  function renderMinimap(country) {
    dom.previewMinimap.innerHTML = '';
    const w = dom.previewMinimap.clientWidth || 360;
    const h = 180;

    const projection = d3.geoNaturalEarth1().scale(w / 6).translate([w / 2, h / 2]);
    const pathGen = d3.geoPath().projection(projection);

    const svg = d3.select('#preview-minimap')
      .append('svg')
      .attr('viewBox', `0 0 ${w} ${h}`)
      .attr('preserveAspectRatio', 'xMidYMid meet');

    svg.append('rect').attr('width', w).attr('height', h).attr('fill', 'var(--bg-primary)');

    const features = topojson.feature(state.topoData, state.topoData.objects.countries).features;
    const g = svg.append('g');

    g.selectAll('path')
      .data(features)
      .enter()
      .append('path')
      .attr('d', pathGen)
      .attr('fill', d => String(d.id) === country.numeric ? 'var(--accent)' : '#1e1e2a')
      .attr('stroke', '#2a2a36')
      .attr('stroke-width', 0.3);

    // Capital red dot
    if (country.capital.lat && country.capital.lng) {
      const [cx, cy] = projection([country.capital.lng, country.capital.lat]);
      if (cx && cy) {
        g.append('circle')
          .attr('cx', cx)
          .attr('cy', cy)
          .attr('r', 4)
          .attr('class', 'capital-dot');
      }
    }
  }

  // Capital dot on main map
  function addMainCapitalDot(country) {
    removeMainCapitalDot();
    if (!country.capital.lat || !country.capital.lng || !state.projection) return;
    const [cx, cy] = state.projection([country.capital.lng, country.capital.lat]);
    if (!cx || !cy) return;
    d3.select('#map-g')
      .append('circle')
      .attr('id', 'main-capital-dot')
      .attr('cx', cx)
      .attr('cy', cy)
      .attr('r', 5)
      .attr('class', 'capital-dot');
  }
  function removeMainCapitalDot() {
    d3.select('#main-capital-dot').remove();
  }

  // Close preview
  function closePreview() {
    dom.preview.classList.add('hidden');
    removeMainCapitalDot();
  }
  dom.previewClose.addEventListener('click', closePreview);
  dom.previewOverlay.addEventListener('click', closePreview);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !dom.preview.classList.contains('hidden')) closePreview();
  });

  // ── LANGUAGE TOGGLE ────────────────────────────────────────────────────────
  dom.langToggle.addEventListener('click', e => {
    const btn = e.target.closest('.lang-btn');
    if (!btn) return;
    const lang = btn.dataset.lang;
    if (lang === state.lang) return;

    state.lang = lang;
    dom.langToggle.querySelectorAll('.lang-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    buildNameIndex();
    initFuse();
    updateUI();
    rebuildGuessedList();
    saveProgress();
  });

  function updateUI() {
    dom.input.placeholder = t('placeholder');
    dom.guessedTitle.textContent = t('guessed_title');
    updateScore();
    // Update i18n elements
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.dataset.i18n;
      if (i18n[state.lang][key]) el.textContent = i18n[state.lang][key];
    });
  }

  // ── THEME PICKER ───────────────────────────────────────────────────────────
  dom.themePicker.addEventListener('click', e => {
    const dot = e.target.closest('.theme-dot');
    if (!dot) return;
    const theme = dot.dataset.theme;
    document.documentElement.setAttribute('data-theme', theme);
    state.theme = theme;
    saveProgress();
  });

  // ── TIMER ──────────────────────────────────────────────────────────────────
  dom.timerToggle.addEventListener('click', () => {
    state.timerEnabled = !state.timerEnabled;
    dom.timerToggle.classList.toggle('active', state.timerEnabled);
    if (state.timerEnabled) {
      state.timerSecondsLeft = TIMER_START;
      dom.timerValue.textContent = formatTime(TIMER_START);
      dom.timerDisplay.classList.remove('hidden');
      // Start immediately if guesses already made
      if (state.guessedSet.size > 0 && !state.timerRunning) startTimer();
    } else {
      stopTimer();
      dom.timerDisplay.classList.add('hidden');
    }
  });

  function startTimer() {
    state.timerRunning = true;
    state.timerInterval = setInterval(() => {
      state.timerSecondsLeft--;
      dom.timerValue.textContent = formatTime(state.timerSecondsLeft);
      if (state.timerSecondsLeft <= 0) {
        stopTimer();
        showResults('timeout');
      }
    }, 1000);
  }
  function stopTimer() {
    state.timerRunning = false;
    if (state.timerInterval) { clearInterval(state.timerInterval); state.timerInterval = null; }
  }
  function formatTime(s) {
    const m = Math.floor(s / 60).toString().padStart(2, '0');
    return `${m}:${(s % 60).toString().padStart(2, '0')}`;
  }

  // ── GIVE UP ────────────────────────────────────────────────────────────────
  dom.giveupBtn.addEventListener('click', () => {
    if (!confirm(state.lang === 'fr' ? 'Abandonner la partie ?' : 'Give up this game?')) return;
    showResults('giveup');
  });

  // ── RESULTS SCREEN ─────────────────────────────────────────────────────────
  function showResults(reason) {
    stopTimer();
    const lang = state.lang;
    const guessedCount = state.guessedSet.size;
    const pct = Math.round((guessedCount / TOTAL) * 100);

    dom.resultsTitle.textContent = reason === 'timeout' ? t('results_timeout') : t('results_giveup');
    dom.resultsCount.textContent = guessedCount;
    dom.resultsPct.textContent = `${pct}%`;

    // Time display
    if (state.timerEnabled) {
      const elapsed = TIMER_START - state.timerSecondsLeft;
      dom.resultsTime.textContent = `${t('time_left')}: ${formatTime(state.timerSecondsLeft)}`;
      dom.resultsTime.classList.remove('hidden');
    } else {
      dom.resultsTime.classList.add('hidden');
    }

    // Per-continent stats
    const continentOrder = ['Africa', 'Americas', 'Asia', 'Europe', 'Oceania'];
    const totals = {}, guessed = {};
    state.countries.forEach(c => {
      totals[c.continent] = (totals[c.continent] || 0) + 1;
      if (state.guessedSet.has(c.numeric)) guessed[c.continent] = (guessed[c.continent] || 0) + 1;
    });
    dom.resultsContinents.innerHTML = continentOrder.map(cont => {
      const g = guessed[cont] || 0;
      const total = totals[cont] || 1;
      const p = Math.round((g / total) * 100);
      return `<div class="results-continent-row">
        <span class="results-continent-name">${cont}</span>
        <div class="results-continent-bar-track">
          <div class="results-continent-bar-fill" style="width:${p}%"></div>
        </div>
        <span class="results-continent-stat">${g}/${total}</span>
      </div>`;
    }).join('');

    // Missed countries (all unguessed)
    dom.resultsMissedTitle.textContent = t('missed_countries');
    const missed = state.countries.filter(c => !state.guessedSet.has(c.numeric));
    missed.sort((a, b) => (a.name[lang] || a.name.en).localeCompare(b.name[lang] || b.name.en));
    dom.resultsMissedList.innerHTML = missed.map(c => {
      const name = c.name[lang] || c.name.en;
      return `<div class="results-missed-item" data-numeric="${c.numeric}">
        <img src="${flagUrl(c.alpha2)}" alt="${name}" loading="lazy" />
        <span>${name}</span>
      </div>`;
    }).join('');
    dom.resultsMissedList.querySelectorAll('.results-missed-item').forEach(el => {
      el.addEventListener('click', () => {
        const country = state.numericToCountry.get(el.dataset.numeric);
        if (country) openPreview(country);
      });
    });

    dom.resultsRestartBtn.textContent = t('play_again');
    dom.resultsModal.classList.remove('hidden');
  }

  dom.resultsClose.addEventListener('click', () => dom.resultsModal.classList.add('hidden'));
  dom.resultsRestartBtn.addEventListener('click', () => { dom.resultsModal.classList.add('hidden'); restart(); });

  // ── WIN ────────────────────────────────────────────────────────────────────
  function handleWin() {
    stopTimer();
    showToast('🏆 ' + t('win_title'), 'success');
    setTimeout(() => {
      dom.winModal.classList.remove('hidden');
      if (state.timerEnabled) {
        dom.winTime.textContent = formatTime(state.timerSecondsLeft);
        dom.winTime.classList.remove('hidden');
      }
    }, 600);
  }
  dom.winRestartBtn.addEventListener('click', () => { dom.winModal.classList.add('hidden'); restart(); });

  // ── TOAST ──────────────────────────────────────────────────────────────────
  function showToast(msg, type = 'info') {
    const el = document.createElement('div');
    el.className = `toast${type === 'error' ? ' error' : type === 'success' ? ' success' : ''}`;
    el.textContent = msg;
    dom.toastContainer.appendChild(el);
    setTimeout(() => {
      el.classList.add('dismissing');
      el.addEventListener('animationend', () => el.remove(), { once: true });
    }, 1500);
  }

  // ── LOCAL STORAGE ──────────────────────────────────────────────────────────
  function saveProgress() {
    localStorage.setItem(LS_KEY, JSON.stringify({
      guessed: [...state.guessedSet],
      lang: state.lang,
      theme: state.theme,
    }));
  }

  function loadProgress() {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return;
    let data;
    try { data = JSON.parse(raw); } catch { return; }

    // Restore theme
    if (data.theme) {
      state.theme = data.theme;
      document.documentElement.setAttribute('data-theme', data.theme);
    }

    // Restore language
    if (data.lang) {
      state.lang = data.lang;
      dom.langToggle.querySelectorAll('.lang-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.lang === data.lang);
      });
      buildNameIndex();
      initFuse();
    }

    // Restore guessed
    if (data.guessed && data.guessed.length > 0) {
      data.guessed.forEach(numeric => {
        const country = state.numericToCountry.get(numeric);
        if (country && !state.guessedSet.has(numeric)) {
          state.guessedSet.add(numeric);
          highlightCountry(numeric, false); // no flash on restore
        }
      });
      updateScore();
      rebuildGuessedList();
      dom.giveupBtn.classList.remove('hidden');
    }
  }

  // ── RESTART ────────────────────────────────────────────────────────────────
  function restart() {
    if (state.guessedSet.size > 0 && !confirm(t('reset_confirm'))) return;
    state.guessedSet.clear();
    localStorage.removeItem(LS_KEY);

    document.querySelectorAll('.country-path').forEach(p => {
      p.classList.remove('guessed', 'just-guessed', 'dimmed');
      p.style.fill = '';
    });

    dom.guessedList.innerHTML = '';
    dom.input.value = '';
    updateScore();

    state.activeContinent = 'All';
    dom.continentTabs.querySelectorAll('.continent-tab').forEach(b => b.classList.remove('active'));
    dom.continentTabs.querySelector('[data-continent="All"]')?.classList.add('active');

    stopTimer();
    state.timerSecondsLeft = TIMER_START;
    state.timerRunning = false;
    dom.timerValue.textContent = formatTime(TIMER_START);

    dom.giveupBtn.classList.add('hidden');
    dom.resultsModal.classList.add('hidden');
    dom.winModal.classList.add('hidden');
    removeMainCapitalDot();
    dom.preview.classList.add('hidden');

    dom.input.focus();
  }
  dom.restartBtn.addEventListener('click', restart);

  // ── INIT ───────────────────────────────────────────────────────────────────
  buildNameIndex();
  renderMap();
  initFuse();
  initContinentTabs();
  loadProgress();
  updateUI();
  // Timer is on by default
  dom.timerToggle.classList.add('active');
  dom.timerDisplay.classList.remove('hidden');
  dom.timerValue.textContent = formatTime(TIMER_START);
  dom.input.focus();

})().catch(err => {
  console.error('CountryGuessr init error:', err);
});
