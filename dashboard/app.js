// Token Launch Radar — the page. Reads window.RADAR (written by main.ts from the sealed
// snapshot), renders the ranked board, a detail view per protocol, and the live-token set.
// No fetch, no network: every byte the page needs is already in data.js.
//
// State lives in the URL hash, so a view can be linked and screenshotted exactly:
//   #detail=<slug>  opens one protocol's detail view
//   #q=<text> #cat=<Category> #chain=<Chain> #scope=all|watchlist|early #sort=implied|tvl|growth|age
(function () {
  'use strict';
  var D = window.RADAR;
  if (!D || !Array.isArray(D.rows)) {
    document.getElementById('count').textContent = 'No radar data loaded.';
    return;
  }

  var PAGE_SIZE = 50;
  var rows = D.rows;

  var $ = function (id) { return document.getElementById(id); };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function money(n) {
    if (n == null) return '—';
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
    return '$' + Math.round(n);
  }

  function pct(n) {
    if (n == null) return '—';
    var v = (Math.round(n * 100) / 100).toFixed(1);
    return (n > 0 ? '+' : '') + v + '%';
  }

  function ageText(days) {
    if (days == null) return '—';
    if (days < 30) return days + 'd';
    if (days < 365) return Math.round(days / 30.4) + 'mo';
    return (days / 365).toFixed(1) + 'y';
  }

  function parseHash() {
    var h = window.location.hash.replace(/^#/, '');
    var out = { q: '', cat: '', chain: '', scope: 'all', sort: 'implied', page: 1, detail: '' };
    if (!h) return out;
    h.split('&').forEach(function (part) {
      var kv = part.split('=');
      var k = decodeURIComponent(kv[0] || '');
      var v = decodeURIComponent(kv[1] || '');
      if (k === 'q') out.q = v;
      else if (k === 'cat') out.cat = v;
      else if (k === 'chain') out.chain = v;
      else if (k === 'scope' && (v === 'all' || v === 'watchlist' || v === 'early')) out.scope = v;
      else if (k === 'sort' && (v === 'implied' || v === 'tvl' || v === 'growth' || v === 'age')) out.sort = v;
      else if (k === 'page') out.page = Math.max(1, parseInt(v, 10) || 1);
      else if (k === 'detail') out.detail = v;
    });
    return out;
  }

  function writeHash(state) {
    var parts = [];
    if (state.q) parts.push('q=' + encodeURIComponent(state.q));
    if (state.cat) parts.push('cat=' + encodeURIComponent(state.cat));
    if (state.chain) parts.push('chain=' + encodeURIComponent(state.chain));
    if (state.scope !== 'all') parts.push('scope=' + state.scope);
    if (state.sort !== 'implied') parts.push('sort=' + state.sort);
    if (state.page > 1) parts.push('page=' + state.page);
    if (state.detail) parts.push('detail=' + encodeURIComponent(state.detail));
    var next = parts.length ? '#' + parts.join('&') : '';
    if (window.location.hash !== next) {
      history.replaceState(null, '', next || window.location.pathname + window.location.search);
    }
  }

  function filtered(state) {
    var q = state.q.trim().toLowerCase();
    var list = rows.filter(function (r) {
      if (state.scope === 'watchlist' && !r.is_watchlist) return false;
      if (state.scope === 'early' && r.is_watchlist) return false;
      if (state.cat && r.category !== state.cat) return false;
      if (state.chain && r.chains.indexOf(state.chain) < 0) return false;
      if (q && r.name.toLowerCase().indexOf(q) < 0 && r.slug.toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
    var by = {
      implied: function (a, b) { return b.implied_value_usd - a.implied_value_usd || a.rank - b.rank; },
      tvl: function (a, b) { return b.tvl_usd - a.tvl_usd || a.rank - b.rank; },
      growth: function (a, b) { return (b.change_7d || 0) - (a.change_7d || 0) || a.rank - b.rank; },
      age: function (a, b) { return (b.age_days || 0) - (a.age_days || 0) || a.rank - b.rank; },
    }[state.sort];
    return list.sort(by);
  }

  function renderStats() {
    $('asof').textContent = 'snapshot ' + D.as_of;
    $('modelVersion').textContent = D.model_version;
    var watch = rows.filter(function (r) { return r.is_watchlist; }).length;
    $('stats').innerHTML = [
      ['Watchlist', String(watch), 'protocols at or above the floor'],
      ['Board', String(D.board_size), D.early_size + ' early finds below the floor'],
      ['Total implied value', money(D.total_implied_usd), 'across the whole board'],
      ['Median implied value', money(D.median_implied_usd), 'per ranked protocol'],
    ].map(function (s) {
      return '<div class="stat"><div class="stat-label">' + s[0] + '</div><div class="stat-value">' + esc(s[1]) + '</div><div class="stat-note">' + esc(s[2]) + '</div></div>';
    }).join('');
    $('source').textContent = 'Source: ' + D.source + ' · Floor: ' + money(D.floor_usd) + ' TVL.';
  }

  function renderFilters(state) {
    var cats = [];
    var chains = [];
    rows.forEach(function (r) {
      if (r.category && cats.indexOf(r.category) < 0) cats.push(r.category);
      r.chains.forEach(function (c) { if (chains.indexOf(c) < 0) chains.push(c); });
    });
    cats.sort();
    chains.sort();
    $('cat').innerHTML = '<option value="">All categories</option>' + cats.map(function (c) {
      return '<option value="' + esc(c) + '"' + (state.cat === c ? ' selected' : '') + '>' + esc(c) + '</option>';
    }).join('');
    $('chain').innerHTML = '<option value="">All chains</option>' + chains.map(function (c) {
      return '<option value="' + esc(c) + '"' + (state.chain === c ? ' selected' : '') + '>' + esc(c) + '</option>';
    }).join('');
    $('q').value = state.q;
    $('scope').value = state.scope;
    $('sort').value = state.sort;
  }

  function rowHtml(r, maxImplied) {
    var growth = r.change_7d == null ? '<td class="num">—</td>'
      : '<td class="num ' + (r.change_7d >= 0 ? 'up' : 'down') + '">' + pct(r.change_7d) + '</td>';
    var tag = r.is_watchlist ? '<span class="tag">Watchlist</span>' : '<span class="tag early">Early</span>';
    var barPct = Math.max(2, Math.round((r.implied_value_usd / maxImplied) * 100));
    return '<tr data-slug="' + esc(r.slug) + '">' +
      '<td class="num rank">' + r.rank + '</td>' +
      '<td><span class="proto-name">' + esc(r.name) + '</span>' + tag +
      '<span class="proto-slug">' + esc(r.slug) + '</span></td>' +
      '<td>' + esc(r.category || '—') + '</td>' +
      '<td>' + esc(r.chains.slice(0, 3).join(', ') || '—') + (r.chains.length > 3 ? ' +' + (r.chains.length - 3) : '') + '</td>' +
      '<td class="num">' + money(r.tvl_usd) + '</td>' + growth +
      '<td class="num">' + ageText(r.age_days) + '</td>' +
      '<td class="num implied-cell">' + money(r.implied_value_usd) +
      '<span class="implied-bar"><i style="width:' + barPct + '%"></i></span></td></tr>';
  }

  function renderBoard(state) {
    var list = filtered(state);
    var pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
    if (state.page > pages) state.page = pages;
    var start = (state.page - 1) * PAGE_SIZE;
    var page = list.slice(start, start + PAGE_SIZE);
    var maxImplied = list.length ? list[0].implied_value_usd : 1;
    $('rows').innerHTML = page.map(function (r) { return rowHtml(r, maxImplied); }).join('') ||
      '<tr><td colspan="8">No protocol matches this filter.</td></tr>';
    $('count').textContent = list.length + ' of ' + D.board_size + ' ranked protocols' +
      (state.scope === 'watchlist' ? ' · watchlist only' : state.scope === 'early' ? ' · early finds only' : '') +
      (state.cat ? ' · ' + state.cat : '') + (state.chain ? ' · ' + state.chain : '') + (state.q ? ' · matching "' + state.q + '"' : '');
    $('pager').innerHTML =
      '<button id="prevPage" ' + (state.page <= 1 ? 'disabled' : '') + '>← Prev</button>' +
      '<span>Page ' + state.page + ' of ' + pages + '</span>' +
      '<button id="nextPage" ' + (state.page >= pages ? 'disabled' : '') + '>Next →</button>';
    var prev = $('prevPage');
    var next = $('nextPage');
    if (prev) prev.onclick = function () { setState({ page: state.page - 1 }); };
    if (next) next.onclick = function () { setState({ page: state.page + 1 }); };
    Array.prototype.forEach.call(document.querySelectorAll('#rows tr[data-slug]'), function (tr) {
      tr.onclick = function () { setState({ detail: tr.getAttribute('data-slug') }); };
    });
  }

  function renderDetail(state) {
    var box = $('detail');
    var r = null;
    if (state.detail) {
      for (var i = 0; i < rows.length; i++) if (rows[i].slug === state.detail) { r = rows[i]; break; }
    }
    if (!r) { box.hidden = true; box.innerHTML = ''; return; }
    var base = r.tvl_usd * r.base_multiple;
    var implied = r.implied_value_usd;
    var steps = (r.farm_steps || []).map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('');
    box.hidden = false;
    box.innerHTML =
      '<div class="detail-head"><h2>' + esc(r.name) + ' <span class="slug">' + esc(r.slug) + '</span></h2>' +
      '<button class="detail-close" id="closeDetail">Close ×</button></div>' +
      '<div class="detail-grid"><div><dl class="kv">' +
      '<dt>Rank</dt><dd>#' + r.rank + ' of ' + D.board_size + '</dd>' +
      '<dt>Scope</dt><dd>' + (r.is_watchlist ? 'Watchlist' : 'Early find') + '</dd>' +
      '<dt>Category</dt><dd>' + esc(r.category || '—') + '</dd>' +
      '<dt>Chains</dt><dd>' + esc(r.chains.join(', ') || '—') + '</dd>' +
      '<dt>TVL</dt><dd>' + money(r.tvl_usd) + '</dd>' +
      '<dt>7-day TVL change</dt><dd>' + pct(r.change_7d) + '</dd>' +
      '<dt>Tracked since</dt><dd>' + esc(r.listed_at || 'unknown') + ' (' + ageText(r.age_days) + ')</dd>' +
      '<dt>Token recorded</dt><dd>None — no market cap, no CoinGecko id, no symbol</dd>' +
      '</dl></div><div><h3>How the value is built</h3>' +
      '<table class="factors"><tr><th>Factor</th><th>Value</th></tr>' +
      '<tr><td>TVL × multiple ' + r.base_multiple + '</td><td>' + money(base) + '</td></tr>' +
      '<tr><td>× growth ' + r.growth_multiplier + '</td><td>' + pct(r.change_7d) + ' over 7 days</td></tr>' +
      '<tr><td>× maturity ' + r.maturity_multiplier + '</td><td>' + ageText(r.age_days) + ' with no token</td></tr>' +
      '<tr><td>× chain breadth ' + r.breadth_multiplier + '</td><td>' + r.chains.length + ' chain' + (r.chains.length === 1 ? '' : 's') + '</td></tr>' +
      '<tr class="total"><td>Implied launch value</td><td>' + money(implied) + '</td></tr></table></div></div>' +
      '<h3 style="margin-top:18px">Farm plan — six steps</h3><ol class="farm">' + steps + '</ol>' +
      '<p class="detail-note">This plan puts activity on record if ' + esc(r.name) +
      ' ever issues a token. It is not a promise that it will, and the implied value is the radar&rsquo;s own claim, not a price target.</p>';
    $('closeDetail').onclick = function () { setState({ detail: '' }); };
    Array.prototype.forEach.call(document.querySelectorAll('#rows tr[data-slug]'), function (tr) {
      tr.classList.toggle('selected', tr.getAttribute('data-slug') === r.slug);
    });
    // A deep link to a detail view should land on it, so the view is the screenshot's subject.
    if (firstRender) box.scrollIntoView({ block: 'start' });
  }

  function renderLive() {
    $('liveRows').innerHTML = D.live.map(function (p) {
      return '<tr><td><span class="proto-name">' + esc(p.name) + '</span><span class="proto-slug">' + esc(p.slug) + '</span></td>' +
        '<td>' + esc(p.category || '—') + '</td>' +
        '<td>' + esc(p.chains.slice(0, 3).join(', ') || '—') + '</td>' +
        '<td class="num">' + money(p.tvl_usd) + '</td>' +
        '<td class="num">' + money(p.mcap_usd) + '</td>' +
        '<td class="num ' + (p.change_7d != null && p.change_7d >= 0 ? 'up' : 'down') + '">' + pct(p.change_7d) + '</td></tr>';
    }).join('');
  }

  var current = parseHash();
  var firstRender = true;

  function render() {
    current = parseHash();
    renderFilters(current);
    renderBoard(current);
    renderDetail(current);
    firstRender = false;
  }

  function setState(patch) {
    var next = parseHash();
    Object.keys(patch).forEach(function (k) { next[k] = patch[k]; });
    if (patch.q !== undefined || patch.cat !== undefined || patch.chain !== undefined || patch.scope !== undefined || patch.sort !== undefined) next.page = 1;
    writeHash(next);
    render();
  }

  var qTimer = null;
  $('q').addEventListener('input', function () {
    clearTimeout(qTimer);
    var v = this.value;
    qTimer = setTimeout(function () { setState({ q: v }); }, 200);
  });
  $('cat').addEventListener('change', function () { setState({ cat: this.value }); });
  $('chain').addEventListener('change', function () { setState({ chain: this.value }); });
  $('scope').addEventListener('change', function () { setState({ scope: this.value }); });
  $('sort').addEventListener('change', function () { setState({ sort: this.value }); });
  window.addEventListener('hashchange', render);

  renderStats();
  renderLive();
  render();
})();
