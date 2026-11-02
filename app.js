/* ============================================================
   GGCPU · app.js — script compartido de todo el sitio
   1) LOGIN GOOGLE (un solo botón, en la topbar)
   2) PRECIOS EN VIVO por endpoint (CoinGecko, 1 request batch)
   3) BUSCADOR del foro (solo index)
   4) NAV activo según scroll (solo index)
   ============================================================ */
(function () {
  'use strict';

  /* ----------------------------------------------------------
     1) LOGIN GOOGLE — UN SOLO BOTÓN
     ----------------------------------------------------------
     MODO DEMO (por defecto): el botón guarda un perfil demo en
     localStorage, sirve para probar el flujo sin backend.

     MODO REAL: crea tus credenciales en
       https://console.cloud.google.com/apis/credentials
     → "ID de cliente de OAuth" → tipo "Aplicación web"
     → Orígenes autorizados: tu dominio (ej. https://tuweb.github.io)
     y pega el client_id aquí abajo. El botón pasará a usar
     Google Identity Services automáticamente:
  ---------------------------------------------------------- */
  var GOOGLE_CLIENT_ID = ''; // ← pega aquí tu client_id.apps.googleusercontent.com

  var LS_KEY = 'ggcpu_user';

  function showProfile(profile) {
    document.querySelectorAll('.btn-login').forEach(function (b) { b.hidden = true; });
    document.querySelectorAll('.user-profile').forEach(function (p) {
      p.hidden = false;
      var img = p.querySelector('.user-avatar');
      if (img && profile.picture) img.src = profile.picture;
      var name = p.querySelector('.user-name');
      if (name) name.textContent = profile.name;
    });
  }

  function hideProfile() {
    document.querySelectorAll('.btn-login').forEach(function (b) { b.hidden = false; });
    document.querySelectorAll('.user-profile').forEach(function (p) { p.hidden = true; });
  }

  function saveSession(profile) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(profile)); } catch (e) {}
    showProfile(profile);
  }

  function logout() {
    try { localStorage.removeItem(LS_KEY); } catch (e) {}
    hideProfile();
  }

  function demoLogin() {
    saveSession({
      name: 'Miner Demo',
      email: 'demo@ggcpu.io',
      picture: 'https://ui-avatars.com/api/?name=Miner+Demo&background=00ff9c&color=000&bold=true'
    });
  }

  /* Login real con Google Identity Services */
  function initGoogleReal() {
    var s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.defer = true;
    s.onload = function () {
      google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: function (res) {
          try {
            var payload = JSON.parse(decodeURIComponent(
              (res.credential.split('.')[1] || '').replace(/-/g, '+').replace(/_/g, '/')
            ) + 'x'.repeat((4 - res.credential.split('.')[1].length % 4) % 4));
            saveSession({ name: payload.name, email: payload.email, picture: payload.picture });
          } catch (e) { demoLogin(); }
        }
      });
      document.querySelectorAll('.btn-login').forEach(function (b) {
        b.addEventListener('click', function () { google.accounts.id.prompt(); });
      });
    };
    document.head.appendChild(s);
  }

  function initLogin() {
    var buttons = document.querySelectorAll('.btn-login');
    if (!buttons.length) return;
    if (GOOGLE_CLIENT_ID) {
      initGoogleReal();
    } else {
      buttons.forEach(function (b) { b.addEventListener('click', demoLogin); });
    }
    document.querySelectorAll('.user-profile [data-logout]').forEach(function (b) {
      b.addEventListener('click', logout);
    });
    var saved = null;
    try { saved = JSON.parse(localStorage.getItem(LS_KEY)); } catch (e) {}
    if (saved && saved.name) showProfile(saved);
  }

  /* ----------------------------------------------------------
     2) PRECIOS EN VIVO — UN ENDPOINT PARA TODAS LAS MONEDAS
     ----------------------------------------------------------
     Endpoint público de CoinGecko (sin API key):
       GET https://api.coingecko.com/api/v3/simple/price
           ?ids=dero,monero,...        → ids CoinGecko de cada moneda
           &vs_currencies=usd
           &include_24hr_change=true   → % de cambio 24h
     Cada elemento del HTML marca su moneda con data-cg="id":
       <span class="price-value" data-cg="monero">…</span>
     El script junta todos los ids únicos y hace UN solo request,
     luego pinta precio + cambio 24h. Refresca cada 60 s.
  ---------------------------------------------------------- */
  var CG_ENDPOINT = 'https://api.coingecko.com/api/v3/simple/price';

  function fmtPrice(p) {
    if (p >= 1) return '$' + p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (p >= 0.01) return '$' + p.toFixed(4);
    return '$' + p.toFixed(6);
  }

  function paintChange(el, change) {
    var box = el.closest('.coin-price') || el.parentElement;
    if (!box) return;
    var delta = box.querySelector('.delta-24h');
    if (!delta) {
      delta = document.createElement('span');
      delta.className = 'delta delta-24h';
      box.appendChild(delta);
    }
    if (change == null) { delta.textContent = ''; return; }
    var up = change >= 0;
    delta.textContent = (up ? '▲ +' : '▼ ') + change.toFixed(2) + '% (24h)';
    delta.style.color = up ? 'var(--neon)' : 'var(--danger)';
  }

  async function refreshPrices() {
    var els = document.querySelectorAll('[data-cg]');
    if (!els.length) return;
    var ids = Array.from(new Set(Array.from(els).map(function (e) { return e.dataset.cg; }))).join(',');
    try {
      var r = await fetch(CG_ENDPOINT + '?ids=' + ids + '&vs_currencies=usd&include_24hr_change=true');
      if (!r.ok) throw new Error('HTTP ' + r.status);
      var data = await r.json();
      els.forEach(function (el) {
        var coin = data[el.dataset.cg];
        if (coin && coin.usd != null) {
          el.textContent = fmtPrice(coin.usd);
          el.classList.add('live');
          paintChange(el, coin.usd_24h_change);
        } else {
          /* id no existente en CoinGecko → marcar N/D */
          el.textContent = 'N/D';
        }
      });
    } catch (e) {
      console.warn('[GGCPU] Precios en vivo no disponibles ahora, se mantienen los valores estáticos.', e);
    }
  }

  /* ----------------------------------------------------------
     3) BUSCADOR DEL FORO (solo existe en index)
  ---------------------------------------------------------- */
  function initForumSearch() {
    var search = document.getElementById('forumSearch');
    if (!search) return;
    var threads = document.querySelectorAll('.thread');
    search.addEventListener('input', function () {
      var q = this.value.toLowerCase().trim();
      threads.forEach(function (t) {
        var text = t.textContent.toLowerCase();
        var tags = (t.dataset.tags || '').toLowerCase();
        t.style.display = (q === '' || text.indexOf(q) !== -1 || tags.indexOf(q) !== -1) ? '' : 'none';
      });
    });
  }

  /* ----------------------------------------------------------
     4) NAV ACTIVO SEGÚN SCROLL (solo index)
  ---------------------------------------------------------- */
  function initNavSpy() {
    var navLinks = document.querySelectorAll('.nav a[href^="#"]');
    if (!navLinks.length) return;
    var sections = [];
    navLinks.forEach(function (a) {
      var el = document.getElementById(a.getAttribute('href').replace('#', ''));
      if (el) sections.push({ link: a, el: el });
    });
    if (!sections.length) return;
    function onScroll() {
      var y = window.scrollY + 120;
      var current = sections[0];
      sections.forEach(function (s) { if (s.el.offsetTop <= y) current = s; });
      navLinks.forEach(function (a) { a.classList.remove('active'); });
      if (current) current.link.classList.add('active');
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  /* ARRANQUE */
  initLogin();
  refreshPrices();
  setInterval(refreshPrices, 60000);
  initForumSearch();
  initNavSpy();
})();
