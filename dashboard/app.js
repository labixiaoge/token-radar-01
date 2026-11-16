// Token Launch Radar — the page. Reads window.TOKEN_RADAR_BOARD and
// window.TOKEN_RADAR_META (main.ts, from the sealed snapshot), renders the
// sortable, filterable board, and builds each protocol's farm plan in the
// page from the same figures main.ts scores with.
(function () {
  var BOARD = window.TOKEN_RADAR_BOARD || [];
  var META = window.TOKEN_RADAR_META || {};
  var state = { search: "", category: "", chain: "", sortKey: "rank", sortDir: 1 };

  function fmt(n) {
    if (n >= 1e9) return "$" + (n / 1e9).toFixed(2) + "B";
    if (n >= 1e6) return "$" + (n / 1e6).toFixed(1) + "M";
    if (n >= 1e3) return "$" + (n / 1e3).toFixed(1) + "K";
    return "$" + Math.round(n).toLocaleString("en-US");
  }
  function fmtFull(n) {
    return "$" + Math.round(n).toLocaleString("en-US");
  }
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  // How much capital one farm position needs, from the protocol's TVL.
  function capitalFor(tvl) {
    if (tvl >= 1000000000) return 200;
    if (tvl >= 100000000) return 100;
    return 50;
  }
  // How long to hold, from the protocol's age.
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 45;
    if (age < 365) return 60;
    return 30;
  }
  // The category's one action.
  function actionFor(category, name, capital, chain) {
    var c = (category || "").toLowerCase();
    if (c.indexOf("lend") !== -1 || c.indexOf("cdp") !== -1 || c.indexOf("collateral") !== -1) {
      return "Lend $" + capital + " of USDC on " + name + " on " + chain + " and, if you want both sides of the market, borrow a small amount against it.";
    }
    if (c.indexOf("dex") !== -1 || c.indexOf("yield") !== -1 || c.indexOf("leveraged farm") !== -1 || c.indexOf("liquidity manager") !== -1 || c.indexOf("farm") !== -1) {
      return "Put $" + capital + " into " + name + "'s main pool on " + chain + " as liquidity and leave the position open.";
    }
    if (c.indexOf("bridge") !== -1) {
      return "Bridge $" + capital + " of USDC to " + chain + " through " + name + ", then put the bridged funds to work inside its app.";
    }
    if (c.indexOf("stak") !== -1 || c.indexOf("restak") !== -1) {
      return "Stake $" + capital + " through " + name + " on " + chain + " and hold whatever receipt token it gives you.";
    }
    if (c.indexOf("perpetual") !== -1 || c.indexOf("derivative") !== -1 || c.indexOf("options") !== -1) {
      return "Deposit $" + capital + " of USDC as margin on " + name + " on " + chain + " and open one small position at low leverage.";
    }
    if (c.indexOf("prediction") !== -1) {
      return "Fund your account with $" + capital + " on " + name + " and take a position in one live market.";
    }
    if (c.indexOf("curator") !== -1 || c.indexOf("allocator") !== -1 || c.indexOf("basis trading") !== -1) {
      return "Deposit $" + capital + " into a vault on " + name + " on " + chain + " and hold the vault shares.";
    }
    if (c.indexOf("rwa") !== -1) {
      return "Buy $" + capital + " of " + name + "'s yield-bearing asset on " + chain + " and hold it.";
    }
    if (c.indexOf("insurance") !== -1) {
      return "Buy $" + capital + " of cover from " + name + " on " + chain + " and keep the policy active.";
    }
    if (c.indexOf("stable") !== -1) {
      return "Mint $" + capital + " of the stable asset through " + name + " on " + chain + " and keep the vault well collateralised.";
    }
    if (c.indexOf("launchpad") !== -1) {
      return "Join one launch on " + name + " on " + chain + " with $" + capital + " and complete its allowlist steps early.";
    }
    return "Deposit $" + capital + " of USDC into " + name + " on " + chain + " and use its main feature once to activate the position.";
  }
  // A protocol's farm plan: six steps, each an action with its cost and time.
  function farmSteps(r) {
    var chain = (r.chains && r.chains.length) ? r.chains[0] : "its main chain";
    var capital = capitalFor(r.tvl);
    var hold = holdDaysFor(r.ageDays);
    var gas = capital >= 150 ? 8 : 5;
    var steps = [
      { text: "Start with a wallet you use only for farming, funded with just the amount you plan to put to work, and keep its seed phrase offline.", cost: "about $2 of gas for the first transaction", time: "5 minutes" },
      { text: actionFor(r.category, r.name, capital, chain), cost: "$" + capital + " of capital plus roughly $" + gas + " of gas", time: "20 minutes to set up" },
      { text: "Come back once a week and do one more real action — a swap, a deposit, a vote or a borrow — so the address looks active over time instead of used once.", cost: "around $2 of gas per week", time: "10 minutes a week" },
      { text: "Leave the position alone for at least " + hold + " days; snapshots reward addresses that stayed, not ones that came and went.", cost: "the $" + capital + " stays in the position", time: hold + " days" },
      { text: "When a token or points page appears, open it only from " + r.name + "'s own site or official account, and never pay anyone to claim on your behalf.", cost: "nothing to check; claiming costs gas only", time: "10 minutes" },
      { text: "Keep a short log — wallet, dates, amounts and transaction hashes — so you can prove the activity or unwind the position later.", cost: "nothing", time: "5 minutes" }
    ];
    return steps.map(function (s) {
      var line = s.text + " [Cost: " + s.cost + ". Time: " + s.time + ".]";
      if (line.length > 600) line = line.slice(0, 596) + "...";
      if (line.length < 20) line = line + " Hold the position and check the protocol's own page.";
      return line;
    });
  }

  var searchEl = document.getElementById("search");
  var categoryEl = document.getElementById("category");
  var chainEl = document.getElementById("chain");
  var countEl = document.getElementById("count");
  var rowsEl = document.getElementById("rows");
  var emptyEl = document.getElementById("empty");
  var detailEl = document.getElementById("detail");
  var overlayEl = document.getElementById("overlay");

  // Populate filter dropdowns.
  var cats = {}, chains = {};
  BOARD.forEach(function (r) {
    cats[r.category] = true;
    (r.chains || []).forEach(function (c) { chains[c] = true; });
  });
  Object.keys(cats).sort().forEach(function (c) {
    var o = document.createElement("option"); o.value = c; o.textContent = c; categoryEl.appendChild(o);
  });
  Object.keys(chains).sort().forEach(function (c) {
    var o = document.createElement("option"); o.value = c; o.textContent = c; chainEl.appendChild(o);
  });

  // Header stats and snapshot line.
  var totalTvl = BOARD.reduce(function (s, r) { return s + r.tvl; }, 0);
  var totalImplied = BOARD.reduce(function (s, r) { return s + r.impliedValue; }, 0);
  document.getElementById("stat-count").textContent = BOARD.length;
  document.getElementById("stat-tvl").textContent = fmt(totalTvl);
  document.getElementById("stat-implied").textContent = fmt(totalImplied);
  document.getElementById("stat-top").textContent = BOARD.length ? BOARD[0].name + " " + fmt(BOARD[0].impliedValue) : "–";
  document.getElementById("snapline").innerHTML = "Snapshot <b>" + esc(META.asOf || "") + "</b> · <b>"
    + (META.snapshotProtocols || 0) + "</b> protocols tracked · <b>" + (META.preTokenProtocols || 0)
    + "</b> with no token · <b>" + (META.liveProtocols || 0)
    + "</b> already have a token and are not ranked";

  function filtered() {
    var q = state.search.trim().toLowerCase();
    var out = BOARD.filter(function (r) {
      if (state.category && r.category !== state.category) return false;
      if (state.chain && (r.chains || []).indexOf(state.chain) === -1) return false;
      if (q && (r.name + " " + r.category).toLowerCase().indexOf(q) === -1) return false;
      return true;
    });
    var key = state.sortKey, dir = state.sortDir;
    out.sort(function (a, b) {
      var av = a[key], bv = b[key];
      if (key === "chains") { av = (a.chains || [])[0] || ""; bv = (b.chains || [])[0] || ""; }
      if (typeof av === "string") return dir * av.localeCompare(bv);
      return dir * (av - bv);
    });
    return out;
  }

  function render() {
    var list = filtered();
    countEl.innerHTML = "Showing <b>" + list.length + "</b> of " + BOARD.length + " protocols";
    emptyEl.style.display = list.length ? "none" : "block";
    var html = "";
    list.forEach(function (r) {
      html += '<tr data-slug="' + esc(r.slug) + '" class="' + (r.rank <= 3 ? "top3" : "") + '">'
        + '<td class="num rank">' + r.rank + "</td>"
        + '<td><span class="pname">' + esc(r.name) + '<span class="slug">' + esc(r.slug) + "</span></span></td>"
        + '<td><span class="cat">' + esc(r.category) + "</span></td>"
        + '<td class="num">' + fmt(r.tvl) + "</td>"
        + '<td class="num implied">' + fmt(r.impliedValue) + "</td>"
        + '<td class="chains">' + esc((r.chains || []).slice(0, 4).join(", ")) + "</td></tr>";
    });
    rowsEl.innerHTML = html;
    document.querySelectorAll("th[data-key]").forEach(function (th) {
      var k = th.getAttribute("data-key");
      var base = th.textContent.replace(/ [▲▼]$/, "");
      th.innerHTML = esc(base) + (state.sortKey === k ? ' <span class="arrow">' + (state.sortDir === 1 ? "▲" : "▼") + "</span>" : "");
    });
  }

  function openDetail(slug) {
    var r = null;
    BOARD.forEach(function (x) { if (x.slug === slug) r = x; });
    if (!r) return;
    document.querySelectorAll("tbody tr").forEach(function (tr) {
      tr.classList.toggle("selected", tr.getAttribute("data-slug") === slug);
    });
    var steps = farmSteps(r).map(function (s) { return "<li>" + esc(s) + "</li>"; }).join("");
    var change = r.change7d === null || r.change7d === undefined
      ? "not reported"
      : (r.change7d > 0 ? "+" : "") + r.change7d.toFixed(1) + "% over 7 days";
    var age = r.ageDays === null || r.ageDays === undefined
      ? "age unknown"
      : r.ageDays + " days tracked";
    detailEl.innerHTML =
      '<button class="close" id="detail-close">✕ Close</button>'
      + "<h2>" + esc(r.name) + "</h2>"
      + '<p class="dsub">Rank #' + r.rank + " · " + esc(r.category) + "</p>"
      + "<dl class='kv'>"
      + "<dt>TVL</dt><dd>" + fmtFull(r.tvl) + "</dd>"
      + "<dt>Implied value</dt><dd><b>" + fmtFull(r.impliedValue) + "</b></dd>"
      + "<dt>Ratio used</dt><dd>" + r.ratioUsed + " (category median mcap/TVL, clamped to [0.05, 2.0])</dd>"
      + "<dt>7-day change</dt><dd>" + esc(change) + "</dd>"
      + "<dt>Age</dt><dd>" + esc(age) + "</dd>"
      + "<dt>Chains</dt><dd>" + esc((r.chains || []).join(", ")) + "</dd>"
      + "</dl>"
      + "<h3>How the value was estimated</h3>"
      + "<p class='desc'>Implied value = TVL (" + fmtFull(r.tvl) + ") × " + r.ratioUsed
      + ", the median market-cap/TVL ratio of tokenized protocols in the " + esc(r.category)
      + " category. Categories without a measured ratio use the global median 0.308.</p>"
      + "<h3>Farm plan — if it ever launches a token</h3><ol>" + steps + "</ol>"
      + "<div class='note'>No token is confirmed. Airdrops are never guaranteed; only deposit what you can afford to lose, and prefer small, repeated, real usage over one large deposit.</div>";
    detailEl.classList.add("open");
    overlayEl.classList.add("open");
    document.getElementById("detail-close").addEventListener("click", closeDetail);
  }

  function closeDetail() {
    detailEl.classList.remove("open");
    overlayEl.classList.remove("open");
    document.querySelectorAll("tbody tr").forEach(function (tr) { tr.classList.remove("selected"); });
  }

  rowsEl.addEventListener("click", function (e) {
    var tr = e.target.closest("tr[data-slug]");
    if (tr) openDetail(tr.getAttribute("data-slug"));
  });
  overlayEl.addEventListener("click", closeDetail);
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeDetail(); });

  searchEl.addEventListener("input", function () { state.search = searchEl.value; render(); });
  categoryEl.addEventListener("change", function () { state.category = categoryEl.value; render(); });
  chainEl.addEventListener("change", function () { state.chain = chainEl.value; render(); });
  document.getElementById("reset").addEventListener("click", function () {
    state.search = ""; state.category = ""; state.chain = ""; state.sortKey = "rank"; state.sortDir = 1;
    searchEl.value = ""; categoryEl.value = ""; chainEl.value = ""; render();
  });
  document.querySelectorAll("th[data-key]").forEach(function (th) {
    th.addEventListener("click", function () {
      var k = th.getAttribute("data-key");
      if (state.sortKey === k) state.sortDir = -state.sortDir;
      else { state.sortKey = k; state.sortDir = 1; }
      render();
    });
  });

  // Deep-link state via the URL hash, e.g. #category=Derivatives or #detail=gauntlet
  // (used for deterministic screenshots; harmless in normal use).
  function applyHash() {
    var h = location.hash.replace(/^#/, "");
    if (!h) return;
    h.split("&").forEach(function (pair) {
      var kv = pair.split("=");
      var k = decodeURIComponent(kv[0] || ""), v = decodeURIComponent(kv[1] || "");
      if (k === "category" && v) { state.category = v; categoryEl.value = v; }
      if (k === "chain" && v) { state.chain = v; chainEl.value = v; }
      if (k === "search" && v) { state.search = v; searchEl.value = v; }
    });
    render();
    var detailSlug = null;
    h.split("&").forEach(function (pair) {
      var kv = pair.split("=");
      if (decodeURIComponent(kv[0] || "") === "detail" && kv[1]) detailSlug = decodeURIComponent(kv[1]);
    });
    closeDetail();
    if (detailSlug) openDetail(detailSlug);
  }

  render();
  applyHash();
  window.addEventListener("hashchange", applyHash);
})();
