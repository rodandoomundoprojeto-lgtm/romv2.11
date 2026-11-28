/* ==========================================================================
   RODANDO O MUNDO — UI V2.2 CONTROLLER (Dark HUD Geopolítico — Produção)
   1. Tema Dark HUD inicial por padrão (respeitando rom_theme salvo pelo usuário)
   2. Relógio Tático em Tempo Real (#v22-edition-date)
   3. Recolhimento da Barra de Telemetria ao Rolar (#main-header.is-scrolled)
   4. MutationObserver em #dossies-rotativos-grid para injetar Tarja Branca HUD
   5. Sala de Situação: Breaking News Ticker ao Vivo (#rom-breaking-ticker)
   6. Vitrine de Shorts & Stories Geopolíticos (#rom-shorts-section)
   7. Teleporte Global 🎲 (#btn-teleporte-global)
   8. Hover Card Enriquecido no Mapa (#rom-map-hover-card)
   ========================================================================== */
(function () {
  'use strict';

  var feedCache = null;
  var youtubeCache = null;

  function enforceDarkHudDefault() {
    try {
      var savedTheme = localStorage.getItem('rom_theme');
      var targetTheme = (savedTheme === 'light' || savedTheme === 'dark') ? savedTheme : 'dark';
      document.documentElement.setAttribute('data-theme', targetTheme);
    } catch (e) {
      document.documentElement.setAttribute('data-theme', 'dark');
    }
  }

  function updateHudClock() {
    var el = document.getElementById('v22-edition-date');
    if (!el) return;
    try {
      var now = new Date();
      var datePart = new Intl.DateTimeFormat('pt-BR', {
        weekday: 'short',
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      }).format(now).replace(/\./g, '').toUpperCase();

      var timePart = new Intl.DateTimeFormat('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      }).format(now);

      el.textContent = datePart + ' · ' + timePart + ' BRT · PULSO ATIVO';
    } catch (e) {
      el.textContent = 'RADAR 24H · PULSO ATIVO';
    }
  }

  function initTelemetryScroll() {
    /* A barra .hud-telemetry-bar agora fica fora do header sticky e rola
       naturalmente com a página, evitando alteração de altura e trepidação. */
    var header = document.getElementById('main-header');
    if (header) header.classList.remove('is-scrolled');
  }

  function decorateDossieCards() {
    var grid = document.getElementById('dossies-rotativos-grid');
    if (!grid) return;

    var cards = grid.querySelectorAll('.dossie-card, .hub-card, article, a');
    for (var i = 0; i < cards.length; i++) {
      var card = cards[i];
      if (card.querySelector('.v22-card-hud-tag')) continue;

      var titleEl = card.querySelector('h3, h2, .hub-card-title, .dossie-card-title');
      if (!titleEl) continue;

      var titleText = (titleEl.textContent || '').toLowerCase();
      var label = 'DOSSIÊ PERMANENTE • 31+ VEÍCULOS';
      var variant = '';

      if (titleText.indexOf('ucr') !== -1 || titleText.indexOf('guerra') !== -1 || titleText.indexOf('conflito') !== -1) {
        label = 'FRENTE DE CONFLITO • MONITORAMENTO 24H ⚠️';
        variant = '';
      } else if (titleText.indexOf('econom') !== -1 || titleText.indexOf('mercado') !== -1 || titleText.indexOf('tarifa') !== -1) {
        label = 'PULSO DE MERCADO • IMPACTO GLOBAL 📈';
        variant = ' is-emerald';
      } else if (titleText.indexOf('elei') !== -1 || titleText.indexOf('pol') !== -1) {
        label = 'RADAR ELEITORAL • ESPECTRO E / I / D ⚖️';
        variant = ' is-cyan';
      }

      var strip = document.createElement('div');
      strip.className = 'v22-impact-strip v22-card-hud-tag' + variant;
      strip.textContent = label;

      if (titleEl.parentNode) {
        titleEl.parentNode.insertBefore(strip, titleEl.nextSibling);
      }
    }
  }

  function initDossieObserver() {
    var grid = document.getElementById('dossies-rotativos-grid');
    if (!grid || typeof MutationObserver === 'undefined') return;

    decorateDossieCards();
    var observer = new MutationObserver(function () {
      decorateDossieCards();
    });
    observer.observe(grid, { childList: true, subtree: true });
  }

  /* --------------------------------------------------------------------------
     5. BREAKING NEWS TICKER AO VIVO
     -------------------------------------------------------------------------- */
  function formatRelativeTime(dateStr) {
    if (!dateStr) return 'agora';
    try {
      var diff = Math.floor((new Date() - new Date(dateStr)) / 60000);
      if (isNaN(diff) || diff < 1) return 'agora há pouco';
      if (diff < 60) return 'há ' + diff + ' min';
      var hours = Math.floor(diff / 60);
      if (hours < 24) return 'há ' + hours + 'h';
      return 'hoje';
    } catch (e) {
      return 'recente';
    }
  }

  function escHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function initBreakingNewsTicker() {
    var track = document.getElementById('rom-ticker-track');
    if (!track) return;

    var internalHighlights = [
      { titulo: 'Monitoramento contínuo de 235 países e territórios em tempo real.', fonte: 'RoM Radar', pais: 'BR', url: '/radar' },
      { titulo: 'Cobertura comparada de veículos de esquerda, centro e direita.', fonte: 'Atlas Global', pais: 'US', url: '/radar#curadoria' },
      { titulo: 'Novos dossiês ao vivo disponíveis na aba Dossiês Permanentes.', fonte: 'Redação RoM', pais: 'FR', url: '/dossies' }
    ];

    fetch('/data/feed_output.json')
      .then(function (res) { return res.json(); })
      .then(function (data) {
        var items = [];
        if (Array.isArray(data)) {
          items = data;
        } else if (data && Array.isArray(data.items)) {
          items = data.items;
        } else if (data && Array.isArray(data.noticias)) {
          items = data.noticias;
        } else if (data && typeof data === 'object') {
          // Extrai notícias de possíveis grupos de países
          Object.keys(data).forEach(function (k) {
            if (Array.isArray(data[k])) {
              items = items.concat(data[k]);
            }
          });
        }

        if (!items || !items.length) {
          items = internalHighlights;
        } else {
          items = items.slice(0, 15).concat([internalHighlights[2]]);
        }

        feedCache = items;
        renderTickerItems(items);
      })
      .catch(function () {
        renderTickerItems([
          { titulo: 'Radar geopolítico do Rodando o Mundo monitorando 235 países e territórios.', fonte: 'RoM', pais: 'BR', url: '/radar' },
          { titulo: 'Acesse os dossiês ao vivo para comparar frentes de cobertura internacional.', fonte: 'RoM', pais: 'US', url: '/dossies' }
        ]);
      });
  }

  function renderTickerItems(items) {
    var track = document.getElementById('rom-ticker-track');
    if (!track) return;

    var html = '';
    items.forEach(function (item) {
      var iso = (item.pais || item.pais_iso || item.country || 'BR').toLowerCase();
      var flagUrl = 'https://flagcdn.com/w40/' + encodeURIComponent(iso) + '.png';
      var title = item.titulo || item.title || 'Manchete em tempo real';
      var source = item.fonte_nome || item.fonte || item.source || item.veiculo || 'Atlas';
      var time = formatRelativeTime(item.data || item.data_publicacao || item.pubDate);
      var rawLink = item.spa_url || item.rota || item.url || item.link || '';
      var isInternal = rawLink.charAt(0) === '/';
      // Notícias do feed do Radar apontam diretamente para o item específico em /radar
      if (!isInternal) {
        rawLink = '/radar?item=' + encodeURIComponent(title);
      }

      html += '<a class="rom-ticker-item" href="' + escHtml(rawLink) + '" data-spa-link data-pais="' + escHtml(iso.toUpperCase()) + '">';
      html += '<img class="rom-ticker-flag" src="' + escHtml(flagUrl) + '" alt="" loading="lazy" width="18" height="12">';
      html += '<span class="rom-ticker-source">' + escHtml(source) + '</span>';
      html += '<span>' + escHtml(title) + '</span>';
      html += '<span class="rom-ticker-time">' + escHtml(time) + '</span>';
      html += '<span class="rom-ticker-sep" aria-hidden="true">•</span>';
      html += '</a>';
    });

    // Duplica o conteúdo para scroll infinito fluido contínuo
    track.innerHTML = html + html;
  }

  /* --------------------------------------------------------------------------
     6. VITRINE DE SHORTS & STORIES GEOPOLÍTICOS
     -------------------------------------------------------------------------- */
  function syncShortsVisibility() {
    var section = document.getElementById('rom-shorts-section');
    if (!section) return;
    if (section.dataset.hasItems !== '1') {
      section.hidden = true;
      return;
    }
    var editorialWrap = document.getElementById('editorial-home-wrap');
    var radarView = document.getElementById('radar-editorial-view');
    var isRadarActive = !!(editorialWrap && !editorialWrap.hidden && radarView && !radarView.hidden);
    section.hidden = !isRadarActive;
  }

  function observeRadarForShorts() {
    var editorialWrap = document.getElementById('editorial-home-wrap');
    var radarView = document.getElementById('radar-editorial-view');
    if (typeof MutationObserver !== 'function') return;

    var observer = new MutationObserver(syncShortsVisibility);
    if (editorialWrap) {
      observer.observe(editorialWrap, { attributes: true, attributeFilter: ['hidden'] });
    }
    if (radarView) {
      observer.observe(radarView, { attributes: true, attributeFilter: ['hidden'] });
    }
  }

  function initShortsCarousel() {
    var section = document.getElementById('rom-shorts-section');
    var track = document.getElementById('rom-shorts-track');
    if (!track) return;

    observeRadarForShorts();
    syncShortsVisibility();

    fetch('/data/noticias_youtube.json')
      .then(function (res) { return res.json(); })
      .then(function (data) {
        var items = (data && Array.isArray(data.items)) ? data.items : [];
        if (!items.length) {
          if (section) {
            section.dataset.hasItems = '0';
            section.hidden = true;
          }
          return;
        }

        youtubeCache = items;
        if (section) section.dataset.hasItems = '1';
        renderShortsItems(items.slice(0, 10));
        setupShortsCarouselControls();
        syncShortsVisibility();
      })
      .catch(function () {
        if (section) {
          section.dataset.hasItems = '0';
          section.hidden = true;
        }
      });
  }

  function setupShortsCarouselControls() {
    var section = document.getElementById('rom-shorts-section');
    var track = document.getElementById('rom-shorts-track');
    var prevBtn = document.getElementById('rom-shorts-prev');
    var nextBtn = document.getElementById('rom-shorts-next');
    if (!track || track.dataset.controlsBound === '1') return;
    track.dataset.controlsBound = '1';

    var autoTimer = null;
    var isPaused = false;
    var prefersReduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function getCardStep() {
      var card = track.querySelector('.rom-short-card');
      if (!card) return 224;
      var style = window.getComputedStyle(track);
      var gap = parseFloat(style.columnGap || style.gap || '14') || 14;
      return card.getBoundingClientRect().width + gap;
    }

    function scrollByCards(direction, count) {
      var maxScroll = track.scrollWidth - track.clientWidth;
      if (maxScroll <= 4) return;
      var step = getCardStep() * (count || 1);

      if (direction > 0) {
        if (track.scrollLeft >= maxScroll - 6) {
          track.scrollTo({ left: 0, behavior: 'smooth' });
        } else {
          track.scrollBy({ left: step, behavior: 'smooth' });
        }
      } else {
        if (track.scrollLeft <= 6) {
          track.scrollTo({ left: maxScroll, behavior: 'smooth' });
        } else {
          track.scrollBy({ left: -step, behavior: 'smooth' });
        }
      }
    }

    function startAutoScroll() {
      if (prefersReduced) return;
      stopAutoScroll();
      autoTimer = setInterval(function () {
        if (isPaused || document.visibilityState === 'hidden') return;
        if (section && section.hidden) return;
        scrollByCards(1, 1);
      }, 3800);
    }

    function stopAutoScroll() {
      if (autoTimer) {
        clearInterval(autoTimer);
        autoTimer = null;
      }
    }

    if (prevBtn) {
      prevBtn.addEventListener('click', function () {
        scrollByCards(-1, 2);
        startAutoScroll();
      });
    }

    if (nextBtn) {
      nextBtn.addEventListener('click', function () {
        scrollByCards(1, 2);
        startAutoScroll();
      });
    }

    if (section) {
      section.addEventListener('mouseenter', function () { isPaused = true; });
      section.addEventListener('mouseleave', function () { isPaused = false; });
      section.addEventListener('focusin', function () { isPaused = true; });
      section.addEventListener('focusout', function () { isPaused = false; });
    }

    track.addEventListener('touchstart', function () { isPaused = true; }, { passive: true });
    track.addEventListener('touchend', function () {
      setTimeout(function () {
        isPaused = false;
        startAutoScroll();
      }, 2500);
    }, { passive: true });

    startAutoScroll();
  }

  function renderShortsItems(items) {
    var track = document.getElementById('rom-shorts-track');
    if (!track) return;

    var html = '';
    items.forEach(function (item) {
      var thumb = item.thumbnail || item.imagem_url || 'https://images.unsplash.com/photo-1585829365295-ab7cd400c167?w=500&auto=format&fit=crop';
      var title = item.titulo || 'Análise Geopolítica';
      var channel = item.canal || item.fonte_nome || 'Canal RoM';
      var url = item.url || ('https://www.youtube.com/watch?v=' + (item.video_id || ''));
      var tag = item.categoria || 'ANÁLISE';

      html += '<a class="rom-short-card" href="' + url + '" target="_blank" rel="noopener noreferrer" title="' + title.replace(/"/g, '&quot;') + '">';
      html += '<img class="rom-short-thumb" src="' + thumb + '" alt="" loading="lazy">';
      html += '<div class="rom-short-overlay"></div>';
      html += '<div class="rom-short-play-badge" aria-hidden="true">';
      html += '<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
      html += '</div>';
      html += '<div class="rom-short-content">';
      html += '<span class="rom-short-tag">' + tag + '</span>';
      html += '<h4 class="rom-short-title">' + title + '</h4>';
      html += '<span class="rom-short-channel"><span>▶</span> ' + channel + '</span>';
      html += '</div>';
      html += '</a>';
    });

    track.innerHTML = html;
  }

  /* --------------------------------------------------------------------------
     7. TELEPORTE GLOBAL 🎲 (GIRAR O GLOBO)
     -------------------------------------------------------------------------- */
  var POPULAR_ISOS = [
    'BR', 'US', 'GB', 'FR', 'DE', 'JP', 'AR', 'PT', 'RU', 'CN', 'IN', 'IT', 'ES',
    'MX', 'ZA', 'EG', 'IL', 'UA', 'CA', 'AU', 'KR', 'CL', 'CO', 'UY', 'NG', 'KE',
    'SA', 'TR', 'ID', 'NZ', 'SE', 'NO', 'FI', 'GR', 'PL', 'IE', 'CH', 'NL', 'BE'
  ];

  function showTeleporteToast(nome, iso) {
    var toast = document.getElementById('rom-teleporte-toast');
    if (!toast) return;

    var flagUrl = 'https://flagcdn.com/w40/' + iso.toLowerCase() + '.png';
    toast.innerHTML = '<img src="/rodando-o-mundo-icones-512px/dice.png?v=2" alt="" aria-hidden="true" class="rom-icon rom-icon--md" width="20" height="20" decoding="async"> <img src="' + flagUrl + '" alt="" style="width: 22px; height: 14px; border-radius: 2px;"> <span>Teleportando para <strong>' + nome + '</strong>...</span>';
    toast.classList.add('is-active');

    setTimeout(function () {
      toast.classList.remove('is-active');
    }, 2800);
  }

  function initTeleporteGlobal() {
    var btn = document.getElementById('btn-teleporte-global');
    if (!btn) return;

    btn.addEventListener('click', function () {
      btn.classList.add('is-rolling');
      setTimeout(function () { btn.classList.remove('is-rolling'); }, 600);

      // Determina a lista de países disponíveis
      var paises = [];
      if (window.PAISES && Array.isArray(window.PAISES) && window.PAISES.length) {
        paises = window.PAISES;
      } else if (window.paisesData && Array.isArray(window.paisesData)) {
        paises = window.paisesData;
      }

      var iso = '';
      var nome = '';

      if (paises.length) {
        var chosen = paises[Math.floor(Math.random() * paises.length)];
        iso = chosen.iso || chosen.id || chosen.codigo || 'BR';
        nome = chosen.nome || chosen.name || iso;
      } else {
        iso = POPULAR_ISOS[Math.floor(Math.random() * POPULAR_ISOS.length)];
        nome = iso;
      }

      showTeleporteToast(nome, iso);

      // Scroll suave até o mapa se estiver rolando abaixo
      var mapEl = document.getElementById('mapa');
      if (mapEl && (window.scrollY || window.pageYOffset) > 250) {
        mapEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }

      // Dispara a seleção do país através da API global do app.js
      if (typeof window.selecionarPais === 'function') {
        window.selecionarPais(iso);
      } else {
        // Fallback: procura o elemento SVG correspondente e dispara o clique
        var path = document.querySelector('#mapa-svg path[data-id="' + iso + '"], #mapa-svg [id="' + iso + '"]');
        if (path) {
          path.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        }
      }
    });
  }

  /* --------------------------------------------------------------------------
     8. HOVER CARD ENRIQUECIDO DO MAPA
     -------------------------------------------------------------------------- */
  function initMapHoverCard() {
    var card = document.getElementById('rom-map-hover-card');
    var mapSvg = document.getElementById('mapa-svg');
    if (!card || !mapSvg) return;

    var hideTimeout = null;

    mapSvg.addEventListener('mousemove', function (e) {
      var target = e.target;
      if (!target || target.tagName.toLowerCase() !== 'path') {
        if (!hideTimeout) {
          hideTimeout = setTimeout(function () { card.hidden = true; }, 120);
        }
        return;
      }

      clearTimeout(hideTimeout);
      hideTimeout = null;

      var iso = target.getAttribute('data-id') || target.id || '';
      if (!iso || iso.length !== 2) {
        card.hidden = true;
        return;
      }

      iso = iso.toUpperCase();
      var nome = target.getAttribute('data-name') || iso;
      var flagUrl = 'https://flagcdn.com/w40/' + iso.toLowerCase() + '.png';

      // Procura notícia quente em cache
      var hotNews = null;
      if (feedCache && feedCache.length) {
        hotNews = feedCache.find(function (n) {
          return (n.pais || n.pais_iso || '').toUpperCase() === iso;
        });
      }

      var html = '<div class="rom-hover-header">';
      html += '<div class="rom-hover-country">';
      html += '<img class="rom-hover-flag" src="' + flagUrl + '" alt="" loading="lazy">';
      html += '<span>' + nome + '</span>';
      html += '</div>';
      html += '<span class="rom-hover-count">PULSO ATIVO</span>';
      html += '</div>';

      if (hotNews && hotNews.titulo) {
        html += '<div class="rom-hover-headline">"' + hotNews.titulo + '"</div>';
      } else {
        html += '<div class="rom-hover-headline" style="color: var(--text-muted); font-size: 0.75rem;">Acesse os veículos de imprensa locais e acompanhe a cobertura.</div>';
      }

      html += '<div class="rom-hover-meta">';
      html += '<span>STATUS: MONITORADO</span>';
      html += '<span class="rom-hover-cta">Explorar →</span>';
      html += '</div>';

      card.innerHTML = html;

      // Posiciona o card próximo ao ponteiro, respeitando as bordas do container do mapa
      var mapRect = mapSvg.getBoundingClientRect();
      var x = e.clientX - mapRect.left;
      var y = e.clientY - mapRect.top;

      card.style.left = Math.max(160, Math.min(mapRect.width - 160, x)) + 'px';
      card.style.top = Math.max(80, y) + 'px';
      card.hidden = false;
    });

    mapSvg.addEventListener('mouseleave', function () {
      card.hidden = true;
    });
  }

  function boot() {
    enforceDarkHudDefault();
    updateHudClock();
    setInterval(updateHudClock, 1000);
    initTelemetryScroll();
    initDossieObserver();
    initBreakingNewsTicker();
    initShortsCarousel();
    initTeleporteGlobal();
    initMapHoverCard();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
