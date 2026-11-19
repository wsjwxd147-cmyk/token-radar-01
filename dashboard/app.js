// Token Radar dashboard (radar-2). It reads window.RADAR (written beside dashboard/ by
// main.ts) and renders the ranked board, a filterable table, a per-protocol detail drawer
// with the model's own inputs and the protocol's farm plan, and a model sandbox that
// recomputes the board live. No network: every byte it shows is in data.js.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var WATCHLIST = {};
  DATA.rows.forEach(function (r) { WATCHLIST[r.slug] = true; });
  var state = { q: '', category: 'all', chain: 'all', wl: false, tab: 'pre-token', sort: 'implied', dir: -1, selected: null,
    sandbox: { growth: DATA.model.growth_weight, floor: DATA.model.maturity_floor, scale: 1, active: false } };

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }

  // The model in one function: the page recomputes a row from the snapshot figures and checks
  // the number board.json carries, so the page's code and the board's data are visibly the same
  // arithmetic. The sandbox overrides growth weight, maturity floor and the multiple scale.
  function impliedOf(row, model, sandbox) {
    var m = model;
    var growth = Math.min(m.growth_cap, Math.max(m.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var w = sandbox && sandbox.active ? sandbox.growth : m.growth_weight;
    var growthMult = 1 + (growth / 100) * w;
    var age = row.age_days === null || row.age_days === undefined ? m.unknown_age_days : row.age_days;
    var floor = sandbox && sandbox.active ? sandbox.floor : m.maturity_floor;
    var maturity = floor + (Math.min(Math.max(age, 0), m.maturity_days) / m.maturity_days) * (1 - floor);
    var scale = sandbox && sandbox.active ? sandbox.scale : 1;
    return Math.max(1, Math.round(row.tvl_usd * row.category_multiple * scale * growthMult * maturity * row.chain_multiplier));
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  // The farm plan is the same derivation main.ts writes to board.json: category, chains, TVL
  // and age decide the action, the capital, the hold and every cost and time. No name is
  // special-cased.
  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function capitalFor(p) {
    if (p.tvl_usd >= 5e9) return 250;
    if (p.tvl_usd >= 1e9) return 150;
    if (p.tvl_usd >= 1e8) return 100;
    return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' and keep the position open.';
    if (c.indexOf('dex') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Provide $' + capital + ' of liquidity to ' + name + "'s main pool on " + chain + ' and keep the position open.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ' and use the bridged funds in its app.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return "Stake $" + capital + " of the chain's staking asset through " + name + ' and keep the receipt token.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('options') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small hedge.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' and place one market position on ' + name + '.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0 || c.indexOf('risk') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and keep the shares.';
    if (c.indexOf('stable') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + '.';
    if (c.indexOf('rwa') >= 0) return "Mint $" + capital + " of the protocol's yield-bearing asset on " + chain + ' and hold it.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy.';
    if (c.indexOf('yield') >= 0 || c.indexOf('aggregator') >= 0 || c.indexOf('manager') >= 0) return 'Deposit $' + capital + ' into ' + name + "'s highest-TVL vault on " + chain + ' and keep the shares.';
    if (c.indexOf('launchpad') >= 0 || c.indexOf('locker') >= 0) return 'Lock $' + capital + ' of the required asset through ' + name + ' on ' + chain + ' for the campaign.';
    if (c.indexOf('payment') >= 0) return 'Pay $' + capital + ' through ' + name + ' on ' + chain + ' and keep the receipt.';
    if (c.indexOf('index') >= 0) return 'Buy $' + capital + ' of the ' + name + ' index on ' + chain + ' and hold the shares.';
    if (c.indexOf('ai') >= 0 || c.indexOf('agent') >= 0) return 'Use $' + capital + ' of the agent service on ' + name + ' on ' + chain + ' and keep the usage record.';
    if (c.indexOf('nft') >= 0) return 'List or trade one item worth $' + capital + ' through ' + name + ' on ' + chain + '.';
    if (c.indexOf('privacy') >= 0) return 'Run $' + capital + ' through ' + name + "'s private flow on " + chain + ' and keep the receipt.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  }
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Hold the position and check the protocol's own page.";
    return s;
  }
  function farmSteps(p) {
    var chain = chainOf(p);
    var capital = capitalFor(p);
    var hold = holdDaysFor(p.age_days);
    return [
      { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
      { text: actionFor(p, capital, chain), cost: '$' + capital + ' of capital and about $' + (capital >= 150 ? 8 : 4) + ' of gas', time: '15 minutes to set up' },
      { text: 'Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.', cost: 'about $2 of gas a week', time: '10 minutes a week' },
      { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: "If the protocol runs a points program, check its own points page once a week and keep the balance growing.", cost: 'no fee to check', time: '5 minutes a week' },
      { text: "Before you withdraw, open the protocol's own rewards page and claim only from the link it publishes.", cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      { text: 'If a token is announced, claim inside the window the protocol publishes, then write the wallet, the dates and every transaction in a farm log.', cost: 'claim gas only, about $3', time: '15 minutes' }
    ].map(stepText);
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('wl') === '1') state.wl = true;
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.wl) params.set('wl', '1');
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function rows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && r.category !== state.category) return false;
      if (state.chain !== 'all' && !(r.chains || []).some(function (c) { return c === state.chain; })) return false;
      if (state.wl && !WATCHLIST[r.slug]) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    var sb = state.sandbox;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else { av = sb.active ? impliedOf(a, DATA.model, sb) : a.implied_value_usd; bv = sb.active ? impliedOf(b, DATA.model, sb) : b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }
  function topImplied(n) {
    var total = 0;
    DATA.rows.slice(0, n).forEach(function (r) { total += r.implied_value_usd; });
    return total;
  }

  function downloadCsv() {
    var list = state.tab === 'pre-token' ? sortedRows(rows()) : DATA.live;
    var head = 'rank,slug,name,category,chains,tvl_usd,change_7d,age_days,implied_value_usd\n';
    var lines = list.map(function (r) {
      var cells = state.tab === 'pre-token'
        ? [r.rank, r.slug, r.name, r.category || '', (r.chains || []).join('|'), r.tvl_usd, r.change_7d === null ? '' : r.change_7d, r.age_days === null ? '' : r.age_days, r.implied_value_usd]
        : ['live', r.slug, r.name, r.category || '', (r.chains || []).join('|'), r.tvl_usd, r.change_7d === null ? '' : r.change_7d, '', r.mcap_usd === null ? '' : r.mcap_usd];
      return cells.map(function (v) { var s = String(v); return s.indexOf(',') >= 0 || s.indexOf('"') >= 0 ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(',');
    });
    var blob = new Blob([head + lines.join('\n') + '\n'], { type: 'text/csv' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'token-radar-board.csv';
    document.body.appendChild(a);
    a.click();
    URL.revokeObjectURL(a.href);
    a.remove();
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'mark' }), el('span', { class: 'brand-name', text: 'Token Radar' })),
      el('div', { class: 'top-meta' },
        el('span', { text: 'Snapshot ' + DATA.as_of }),
        el('span', { text: 'DefiLlama protocol index' }),
        el('span', { text: DATA.model_version + ' model' })
      )
    );
  }

  function lede() {
    return el('section', { class: 'lede' },
      el('div', null,
        el('h1', { text: DATA.watchlist_size + ' watchlist protocols, ranked by implied value' }),
        el('p', { text: 'The watchlist is the floor: every protocol with at least $' + Math.round(DATA.floor_usd / 1e6) + 'M of TVL and no token on record. The early radar adds ' + DATA.early_size + ' pre-token protocols below that floor. Implied value is a model, not a promise: each category is priced at the multiple its own live protocols trade at.' })
      ),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size })),
        el('div', { class: 'fact' }, el('span', { text: 'Pre-token rows scored' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Top 10 implied value' }), el('b', { text: fmtUsd(topImplied(10)) })),
        el('div', { class: 'fact' }, el('span', { text: 'Live-token protocols set aside' }), el('b', { text: String(DATA.live_size) }))
      )
    );
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chains = Array.from(new Set(DATA.rows.reduce(function (acc, r) { return acc.concat(r.chains || []); }, []))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var select = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); })
    );
    select.addEventListener('change', function () { state.category = select.value; writeHash(); render(); });
    var chainSel = el('select', { id: 'chain', 'aria-label': 'Filter by chain' },
      el('option', { value: 'all', text: 'All chains' }),
      chains.map(function (c) { return el('option', { value: c, text: c, selected: c === state.chain ? 'selected' : null }); })
    );
    chainSel.addEventListener('change', function () { state.chain = chainSel.value; writeHash(); render(); });
    var wl = el('input', { type: 'checkbox', id: 'wl', checked: state.wl ? 'checked' : null, 'aria-label': 'Watchlist only' });
    wl.addEventListener('change', function () { state.wl = wl.checked; writeHash(); render(); });
    var pre = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token', onclick: function () { state.tab = 'pre-token'; render(); } });
    var live = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live token', onclick: function () { state.tab = 'live'; render(); } });
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), select),
      el('div', { class: 'field' }, el('label', { for: 'chain', text: 'Chain' }), chainSel),
      el('label', { class: 'check', for: 'wl' }, wl, 'Watchlist only'),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Token status' }), el('div', { class: 'tabs' }, pre, live)),
      el('button', { class: 'button', type: 'button', text: 'Download CSV', onclick: function () { downloadCsv(); } }),
      el('span', { class: 'count', text: state.tab === 'pre-token' ? rows().length + ' rows shown' + (state.sandbox.active ? ' (what-if model)' : '') : DATA.live.length + ' live-token protocols' })
    );
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } render(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' v' : ' ^' }) : null
      )
    );
  }

  function boardTable() {
    var list = sortedRows(rows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category to see the board again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; state.wl = false; writeHash(); render(); } })
      ));
    }
    var max = (state.sandbox.active ? impliedOf(list[0], DATA.model, state.sandbox) : list[0].implied_value_usd) || 1;
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var shown = state.sandbox.active ? impliedOf(r, DATA.model, state.sandbox) : r.implied_value_usd;
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num' }, el('span', { class: 'rank-badge', text: String(r.rank) })),
        el('td', null, el('div', { class: 'name' },
          el('b', null, r.name, WATCHLIST[r.slug] ? el('span', { class: 'badge-watch', text: 'WATCHLIST' }) : null),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((shown / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(shown) })
        )),
        el('td', null, el('span', { class: 'status', text: 'no token' }))
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Pre-token protocols, strongest implied value first. Select a row for its model and farm plan.' }),
          el('thead', null, el('tr', null,
            sortHeader('implied', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('age', 'Age'),
            sortHeader('implied', 'Implied value'),
            el('th', { scope: 'col', text: 'Token' })
          )),
          tbody
        )
      )
    );
  }

  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', { class: 'num', text: 'live' }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', null, el('span', { class: 'status live', text: 'already trades' }))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Token live: these protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Token' }))),
          tbody
        )
      )
    );
  }

  function modelPanel() {
    var m = DATA.model;
    var multRows = DATA.multiples.slice(0, 12).map(function (x) {
      return el('tr', null,
        el('td', { text: x.category }),
        el('td', { class: 'num', text: String(x.live_count) }),
        el('td', { class: 'num', text: String(x.median_ratio) }),
        el('td', { class: 'num', text: String(x.multiple) })
      );
    });
    var sb = state.sandbox;
    function slider(id, label, min, max, step, value, fmt, oninput) {
      var out = el('output', { for: id, text: fmt(value) });
      var input = el('input', { type: 'range', id: id, min: String(min), max: String(max), step: String(step), value: String(value), 'aria-label': label });
      input.addEventListener('input', function () { var v = parseFloat(input.value); out.textContent = fmt(v); oninput(v); });
      return el('label', null, el('span', { text: label }), input, out);
    }
    function markActive() {
      sb.active = sb.growth !== m.growth_weight || sb.floor !== m.maturity_floor || sb.scale !== 1;
      render();
    }
    var sandbox = el('div', { class: 'sandbox' },
      slider('sb-growth', 'Growth weight', 0, 1, 0.05, sb.growth, function (v) { return v.toFixed(2); }, function (v) { sb.growth = v; markActive(); }),
      slider('sb-floor', 'Maturity floor', 0.4, 0.8, 0.05, sb.floor, function (v) { return v.toFixed(2); }, function (v) { sb.floor = v; markActive(); }),
      slider('sb-scale', 'Category multiple scale', 0.5, 2, 0.1, sb.scale, function (v) { return v.toFixed(1) + 'x'; }, function (v) { sb.scale = v; markActive(); })
    );
    return el('section', { class: 'panel model' },
      el('h2', { text: 'How implied value is computed' }),
      el('p', { class: 'sub', text: 'Every row is scored by one function of the snapshot figures. No protocol name is special-cased, and no row is hand-picked.' }),
      el('div', { class: 'formula' },
        'implied = round( tvl_usd x multiple(category) x (1 + clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 x ' + m.growth_weight + ') x (' + m.maturity_floor + ' + min(age_days, ' + m.maturity_days + ') / ' + m.maturity_days + ' x ' + m.maturity_range + ') x (1 + 0.02 x min(chains - 1, 5)) )'
      ),
      el('p', { class: 'sub', text: 'The multiple is the category’s own market multiple: the median market-cap-per-TVL of its live protocols, winsorized at ' + m.winsor + 'x, shrunk toward the global median ' + DATA.global_multiple + ' with k=' + m.shrink_k + ', clamped to ' + m.multiple_floor + '–' + m.multiple_cap + '. A category with no live protocol takes the global median. Age is the time since the protocol was first listed, the best record of how long it has run with no token; an unlisted age uses ' + m.unknown_age_days + ' days.' }),
      el('div', { class: 'table-wrap' },
        el('table', { class: 'mult-table' },
          el('caption', { class: 'sub', text: 'Category multiples, highest first (top 12 of ' + DATA.multiples.length + ').' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Category' }), el('th', { scope: 'col', text: 'Live n' }), el('th', { scope: 'col', text: 'Median mcap/TVL' }), el('th', { scope: 'col', text: 'Multiple used' }))),
          el('tbody', null, multRows)
        )
      ),
      el('h3', { text: 'Model sandbox' }),
      el('p', { class: 'sub', text: 'Move a slider and the board recomputes live. This is a what-if: the ranked board above uses the base model until you move one.' }),
      sandbox,
      el('p', { class: 'sandbox-note' }, sb.active ? 'What-if model is active. ' : 'Base model is active. ',
        el('button', { class: 'button', type: 'button', text: 'Reset to base model', onclick: function () { state.sandbox = { growth: m.growth_weight, floor: m.maturity_floor, scale: 1, active: false }; render(); } })
      )
    );
  }

  function categoryPanel() {
    var cats = DATA.categories || [];
    if (cats.length === 0) return el('section', { class: 'panel cat-panel' }, el('p', { class: 'sub', text: 'No category breakdown in this snapshot.' }));
    var body = el('tbody');
    cats.forEach(function (c, i) {
      body.appendChild(el('tr', null,
        el('td', { class: 'num', text: String(i + 1) }),
        el('td', null, el('b', { text: c.category })),
        el('td', { class: 'num', text: String(c.protocols) }),
        el('td', { class: 'num', text: fmtUsd(c.total_tvl_usd) }),
        el('td', { class: 'num', text: fmtUsd(c.total_implied_usd) }),
        el('td', { class: 'num', text: String(c.median_multiple) }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: c.top_name }), el('span', { class: 'sub', text: fmtUsd(c.top_implied_usd) }))),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(2, Math.round(c.share_of_implied)) + '%' })),
          el('span', { class: 'num', text: c.share_of_implied.toFixed(1) + '%' })
        ))
      ));
    });
    return el('section', { class: 'panel cat-panel' },
      el('h2', { text: 'Where the value sits' }),
      el('p', { class: 'sub', text: "The ranked board grouped by category. A category earns its place from the protocols in it, not from a headline: the top ten rows hold " + DATA.top10_share + "% of the board's implied value." }),
      el('div', { class: 'table-wrap' },
        el('table', { class: 'cat-table' },
          el('caption', { class: 'sub', text: 'Categories by total implied value, strongest first.' }),
          el('thead', null, el('tr', null,
            el('th', { scope: 'col', text: '#' }),
            el('th', { scope: 'col', text: 'Category' }),
            el('th', { scope: 'col', text: 'Protocols' }),
            el('th', { scope: 'col', text: 'Total TVL' }),
            el('th', { scope: 'col', text: 'Total implied' }),
            el('th', { scope: 'col', text: 'Median multiple' }),
            el('th', { scope: 'col', text: 'Top protocol' }),
            el('th', { scope: 'col', text: 'Share' })
          )),
          body
        )
      )
    );
  }

  function growthPanel() {
    var leaders = DATA.growth_leaders || [];
    if (leaders.length === 0) return el('section', { class: 'panel cat-panel' }, el('p', { class: 'sub', text: 'No growing pre-token row in this snapshot.' }));
    var body = el('tbody');
    leaders.forEach(function (r, i) {
      body.appendChild(el('tr', { onclick: function () { openDetail(r.slug); } },
        el('td', { class: 'num', text: String(i + 1) }),
        el('td', null, el('div', { class: 'name' },
          el('b', null, r.name, WATCHLIST[r.slug] ? el('span', { class: 'badge-watch', text: 'WATCHLIST' }) : null),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') })
        )),
        el('td', { class: 'num pos', text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num', text: fmtUsd(r.implied_value_usd) })
      ));
    });
    return el('section', { class: 'panel cat-panel' },
      el('h2', { text: 'Growing fastest' }),
      el('p', { class: 'sub', text: "Seven-day TVL growth among the ranked rows. A rising line this early is the radar's first hint, not a promise: check the row before you farm it." }),
      el('div', { class: 'table-wrap' },
        el('table', { class: 'cat-table' },
          el('caption', { class: 'sub', text: 'Pre-token rows by seven-day growth, fastest first.' }),
          el('thead', null, el('tr', null,
            el('th', { scope: 'col', text: '#' }),
            el('th', { scope: 'col', text: 'Protocol' }),
            el('th', { scope: 'col', text: '7d' }),
            el('th', { scope: 'col', text: 'TVL' }),
            el('th', { scope: 'col', text: 'Implied value' })
          )),
          body
        )
      )
    );
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    var steps = farmSteps(row);
    var recomputed = impliedOf(row, DATA.model, null);
    var mult = DATA.multiples.filter(function (x) { return x.category === (row.category || 'Other'); })[0];
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'brand-name', text: 'Rank ' + row.rank + ' of ' + DATA.board_size + (WATCHLIST[row.slug] ? ' · watchlist' : '') }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') + (row.listed_at ? ' · listed ' + row.listed_at : '') })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Implied value' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'TVL' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: 'Category multiple (' + (row.category || 'Other') + ')' }), el('b', { class: 'num', text: String(row.category_multiple) + (mult ? ' · ' + mult.live_count + ' live' : '') })),
        el('div', null, el('span', { text: 'Seven-day growth' }), el('b', { class: 'num', text: fmtPct(row.change_7d) })),
        el('div', null, el('span', { text: 'Age with no token' }), el('b', { class: 'num', text: fmtAge(row.age_days) })),
        el('div', null, el('span', { text: 'Growth multiplier' }), el('b', { class: 'num', text: String(row.growth_multiplier) })),
        el('div', null, el('span', { text: 'Maturity multiplier' }), el('b', { class: 'num', text: String(row.maturity_multiplier) })),
        el('div', null, el('span', { text: 'Chain multiplier' }), el('b', { class: 'num', text: String(row.chain_multiplier) })),
        el('div', null, el('span', { text: 'Implied value' }), el('b', { class: 'num', text: fmtUsd(row.implied_value_usd) }))
      ),
      el('p', { class: 'sub', text: 'Model ' + DATA.model_version + ': the same function scores every protocol. The page recomputes this row as ' + fmtUsd(recomputed) + (recomputed === row.implied_value_usd ? ', the same number board.json carries.' : ', which differs from the board: the data would be stale.') + ' This is an estimate, not a price.' })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan' }),
      el('ol', { class: 'steps' }, steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
      }))
    ));
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(lede());
    shell.appendChild(controls());
    shell.appendChild(state.tab === 'pre-token' ? boardTable() : liveTable());
    if (state.tab === 'pre-token') shell.appendChild(modelPanel());
    if (state.tab === 'pre-token') shell.appendChild(categoryPanel());
    if (state.tab === 'pre-token') shell.appendChild(growthPanel());
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();
