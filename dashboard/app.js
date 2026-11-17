(function () {
"use strict";
var BOARD = window.TOKEN_RADAR_BOARD || [], META = window.TOKEN_RADAR_META || {};
function $(id) { return document.getElementById(id); }
function on(el, ev, fn) { el.addEventListener(ev, fn); }
function capitalFor(tvl) { return tvl >= 1e9 ? 200 : tvl >= 1e8 ? 100 : 50; }
function holdDaysFor(age) { return age === null || age === undefined ? 45 : age < 365 ? 60 : 30; }
function gasFor(cap) { return cap >= 150 ? 8 : 5; }
function chainFor(chains) { return chains && chains.length ? chains[0] : "its main chain"; }
function actionFor(name, category, chain, capital) {
  var c = (category || "").toLowerCase(), $ = "$" + capital;
  if (c.indexOf("lend") >= 0 || c.indexOf("cdp") >= 0 || c.indexOf("collateral") >= 0)
    return "Lend " + $ + " of USDC on " + name + " on " + chain + " and, if you want both sides of the market, borrow a small amount against it.";
  if (c.indexOf("dex") >= 0 || c.indexOf("yield") >= 0 || c.indexOf("leveraged farm") >= 0 || c.indexOf("liquidity manager") >= 0 || c.indexOf("farm") >= 0)
    return "Put " + $ + " into " + name + "'s main pool on " + chain + " as liquidity and leave the position open.";
  if (c.indexOf("bridge") >= 0)
    return "Bridge " + $ + " of USDC to " + chain + " through " + name + ", then put the bridged funds to work inside its app.";
  if (c.indexOf("stak") >= 0 || c.indexOf("restak") >= 0)
    return "Stake " + $ + " through " + name + " on " + chain + " and hold whatever receipt token it gives you.";
  if (c.indexOf("perpetual") >= 0 || c.indexOf("derivative") >= 0 || c.indexOf("options") >= 0)
    return "Deposit " + $ + " of USDC as margin on " + name + " on " + chain + " and open one small position at low leverage.";
  if (c.indexOf("prediction") >= 0)
    return "Fund your account with " + $ + " on " + name + " and take a position in one live market.";
  if (c.indexOf("curator") >= 0 || c.indexOf("allocator") >= 0 || c.indexOf("basis trading") >= 0)
    return "Deposit " + $ + " into a vault on " + name + " on " + chain + " and hold the vault shares.";
  if (c.indexOf("rwa") >= 0)
    return "Buy " + $ + " of " + name + "'s yield-bearing asset on " + chain + " and hold it.";
  if (c.indexOf("insurance") >= 0)
    return "Buy " + $ + " of cover from " + name + " on " + chain + " and keep the policy active.";
  if (c.indexOf("stable") >= 0)
    return "Mint " + $ + " of the stable asset through " + name + " on " + chain + " and keep the vault well collateralised.";
  if (c.indexOf("launchpad") >= 0)
    return "Join one launch on " + name + " on " + chain + " with " + $ + " and complete its allowlist steps early.";
  return "Deposit " + $ + " of USDC into " + name + " on " + chain + " and use its main feature once to activate the position.";
}
function withCostTime(text, cost, time) {
  var full = text + " [Cost: " + cost + ". Time: " + time + ".]";
  return full.length <= 600 ? full : full.slice(0, 597) + "...";
}
function farmSteps(row) {
  var capital = capitalFor(row.tvl), hold = holdDaysFor(row.ageDays),
      gas = gasFor(capital), chain = chainFor(row.chains), $ = "$" + capital, W = withCostTime;
  return [
    W("Start with a wallet you use only for farming, funded with just the amount you plan to put to work, and keep its seed phrase offline.", "about $2 of gas for the first transaction", "5 minutes"),
    W(actionFor(row.name, row.category, chain, capital), $ + " of capital plus roughly $" + gas + " of gas", "20 minutes to set up"),
    W("Come back once a week and do one more real action — a swap, a deposit, a vote or a borrow — so the address looks active over time instead of used once.", "around $2 of gas per week", "10 minutes a week"),
    W("Leave the position alone for at least " + hold + " days; snapshots reward addresses that stayed, not ones that came and went.", "the " + $ + " stays in the position", hold + " days"),
    W("When a token or points page appears, open it only from " + row.name + "'s own site or official account, and never pay anyone to claim on your behalf.", "nothing to check; claiming costs gas only", "10 minutes"),
    W("Keep a short log — wallet, dates, amounts and transaction hashes — so you can prove the activity or unwind the position later.", "nothing", "5 minutes")
  ];
}
function esc(v) {
  return String(v === null || v === undefined ? "" : v).replace(/[&<>"']/g, function (ch) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
  });
}
function money(v) {
  if (v >= 1e9) return "$" + (v / 1e9).toFixed(2) + "B";
  if (v >= 1e6) return "$" + (v / 1e6).toFixed(1) + "M";
  if (v >= 1e3) return "$" + (v / 1e3).toFixed(1) + "K";
  return "$" + Math.round(v);
}
function changeText(v) { return v === null || v === undefined ? "not reported" : (v > 0 ? "+" : "") + v.toFixed(1) + "%"; }
function ageText(v) { return v === null || v === undefined ? "unknown" : v + " days"; }
function catOf(row) { return row.category || "Uncategorised"; }
var state = { search: "", category: "", chain: "", sortKey: "rank", sortDir: 1, openSlug: null };
var searchEl = $("search"), categoryEl = $("category"), chainEl = $("chain"), resetEl = $("reset"),
    countEl = $("count"), rowsEl = $("rows"), emptyEl = $("empty"),
    overlayEl = $("overlay"), detailEl = $("detail");
function fillSelect(el, values, allLabel) {
  var html = '<option value="">' + esc(allLabel) + "</option>";
  values.forEach(function (v) { html += '<option value="' + esc(v) + '">' + esc(v) + "</option>"; });
  el.innerHTML = html;
}
function filtered() {
  var q = state.search.trim().toLowerCase();
  return BOARD.filter(function (row) {
    if (state.category && catOf(row) !== state.category) return false;
    if (state.chain && (!row.chains || row.chains.indexOf(state.chain) < 0)) return false;
    if (q && (row.name + " " + row.slug + " " + (row.category || "")).toLowerCase().indexOf(q) < 0) return false;
    return true;
  });
}
function render() {
  var key = state.sortKey, dir = state.sortDir;
  function sv(row) {
    if (key === "chains") return (row.chains || []).join(", ").toLowerCase();
    if (key === "name" || key === "category") return String(row[key] || "").toLowerCase();
    return row[key];
  }
  var list = filtered().slice().sort(function (a, b) {
    var va = sv(a), vb = sv(b), cmp = va < vb ? -1 : va > vb ? 1 : a.rank - b.rank;
    return cmp * dir;
  });
  rowsEl.innerHTML = list.map(function (row) {
    return '<tr data-slug="' + esc(row.slug) + '"' + (row.rank <= 3 ? ' class="top3"' : "") + ">"
      + '<td class="rank num">' + row.rank + "</td>"
      + '<td class="name">' + esc(row.name) + "</td>"
      + '<td><span class="pill">' + esc(catOf(row)) + "</span></td>"
      + '<td class="num">' + money(row.tvl) + "</td>"
      + '<td class="num implied">' + money(row.impliedValue) + "</td>"
      + '<td class="chains">' + esc((row.chains || []).join(", ")) + "</td></tr>";
  }).join("");
  emptyEl.hidden = list.length > 0;
  countEl.textContent = "Showing " + list.length + " of " + BOARD.length + " protocols";
  document.querySelectorAll("th[data-key]").forEach(function (th) {
    th.classList.remove("sorted-asc", "sorted-desc");
    if (th.getAttribute("data-key") === key) th.classList.add(dir === 1 ? "sorted-asc" : "sorted-desc");
  });
}
function openDetail(slug) {
  var row = null;
  BOARD.forEach(function (r) { if (r.slug === slug) row = r; });
  if (!row) return;
  state.openSlug = slug;
  var stepsHtml = farmSteps(row).map(function (s) {
    var m = s.match(/^(.*) \[Cost: (.*)\. Time: (.*)\.\]$/);
    return m ? "<li>" + esc(m[1]) + ' <span class="cost">[Cost: ' + esc(m[2]) + ". Time: " + esc(m[3]) + ".]</span></li>"
             : "<li>" + esc(s) + "</li>";
  }).join("");
  var kv = [["TVL", money(row.tvl), ""], ["Implied value", money(row.impliedValue), "good"],
    ["Ratio used", row.ratioUsed.toFixed(4), ""],
    ["Growth factor", row.growthFactor.toFixed(2) + "&times; (" + esc(changeText(row.change7d)) + " in 7 days)", ""],
    ["Age factor", row.ageFactor.toFixed(2) + "&times; (listed " + esc(ageText(row.ageDays)) + " ago)", ""],
    ["7-day change", esc(changeText(row.change7d)), ""], ["Age", esc(ageText(row.ageDays)), ""],
    ["Chains", esc((row.chains || []).join(", ")), ""]];
  var kvHtml = kv.map(function (k) {
    return "<dt>" + k[0] + "</dt><dd" + (k[2] ? ' class="' + k[2] + '"' : "") + ">" + k[1] + "</dd>";
  }).join("");
  detailEl.innerHTML =
    '<button class="close" type="button" aria-label="Close detail">&times;</button>'
    + "<h2>" + esc(row.name) + "</h2>"
    + '<p class="sub">Rank #' + row.rank + " &middot; " + esc(catOf(row)) + " &middot; records no token yet</p>"
    + '<dl class="kv">' + kvHtml + "</dl>"
    + "<h3>How the value was estimated</h3>"
    + '<p class="estimate">TVL <code>' + money(row.tvl) + "</code> &times; ratio <code>" + row.ratioUsed.toFixed(4)
    + "</code> &times; growth <code>" + row.growthFactor.toFixed(2) + "</code> &times; age <code>" + row.ageFactor.toFixed(2)
    + "</code> &asymp; <code>" + money(row.impliedValue) + "</code>. Ratio = category median mcap/TVL (0.308 global fallback), clamped [0.05, 2.0].</p>"
    + "<h3>How to farm it</h3>"
    + '<ol class="farm">' + stepsHtml + "</ol>"
    + '<h3>Risk</h3><p class="risk">A rough yardstick, not a forecast. The protocol records no token — that is the snapshot&rsquo;s record, not proof it has none. Never deposit more than you can lose.</p>';
  overlayEl.hidden = false;
  detailEl.hidden = false;
  on(detailEl.querySelector(".close"), "click", closeDetail);
  writeHash();
}
function closeDetail() {
  state.openSlug = null;
  overlayEl.hidden = true;
  detailEl.hidden = true;
  detailEl.innerHTML = "";
  writeHash();
}
function readHash() {
  var p = new URLSearchParams(window.location.hash.slice(1));
  if (p.get("search") !== null) state.search = p.get("search") || "";
  if (p.get("category") !== null) state.category = p.get("category") || "";
  if (p.get("chain") !== null) state.chain = p.get("chain") || "";
  searchEl.value = state.search;
  categoryEl.value = state.category;
  chainEl.value = state.chain;
  return p.get("detail");
}
function writeHash() {
  var p = new URLSearchParams();
  if (state.search) p.set("search", state.search);
  if (state.category) p.set("category", state.category);
  if (state.chain) p.set("chain", state.chain);
  if (state.openSlug) p.set("detail", state.openSlug);
  var hash = p.toString();
  history.replaceState(null, "", hash ? "#" + hash : window.location.pathname + window.location.search);
}
on(searchEl, "input", function () { state.search = searchEl.value; render(); writeHash(); });
on(categoryEl, "change", function () { state.category = categoryEl.value; render(); writeHash(); });
on(chainEl, "change", function () { state.chain = chainEl.value; render(); writeHash(); });
on(resetEl, "click", function () {
  state.search = ""; state.category = ""; state.chain = "";
  searchEl.value = ""; categoryEl.value = ""; chainEl.value = "";
  render(); writeHash();
});
document.querySelectorAll("th[data-key]").forEach(function (th) {
  on(th, "click", function () {
    var key = th.getAttribute("data-key");
    if (state.sortKey === key) state.sortDir = -state.sortDir;
    else { state.sortKey = key; state.sortDir = (key === "rank" || key === "tvl" || key === "impliedValue") ? -1 : 1; }
    render();
  });
});
on(rowsEl, "click", function (event) {
  var tr = event.target.closest("tr[data-slug]");
  if (tr) openDetail(tr.getAttribute("data-slug"));
});
on(overlayEl, "click", closeDetail);
on(document, "keydown", function (event) {
  if (event.key === "Escape" && !detailEl.hidden) closeDetail();
});
fillSelect(categoryEl, Array.from(new Set(BOARD.map(function (r) { return catOf(r); }))).sort(), "All categories");
fillSelect(chainEl, Array.from(new Set(BOARD.reduce(function (acc, r) { return acc.concat(r.chains || []); }, []))).sort(), "All chains");
var totalTvl = BOARD.reduce(function (s, r) { return s + r.tvl; }, 0);
var totalImplied = BOARD.reduce(function (s, r) { return s + r.impliedValue; }, 0);
$("stat-count").textContent = String(META.boardSize || BOARD.length);
$("stat-tvl").textContent = money(totalTvl);
$("stat-implied").textContent = money(totalImplied);
if (BOARD.length) {
  var top = BOARD[0];
  $("stat-top").textContent = top.name;
  $("snapline").innerHTML =
    "<strong>" + esc(top.name) + "</strong> leads the board at " + esc(money(top.impliedValue))
    + " implied value. " + esc(String(META.boardSize || BOARD.length))
    + " pre-token protocols hold " + esc(money(totalTvl)) + " of TVL in the sealed "
    + esc(META.asOf || "") + " snapshot.";
}
var detailSlug = readHash();
render();
if (detailSlug) openDetail(detailSlug);
})();
