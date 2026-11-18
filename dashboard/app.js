(function () {
"use strict";
var BOARD = window.TOKEN_RADAR_BOARD || [], META = window.TOKEN_RADAR_META || {};
function $(id) { return document.getElementById(id); }
function on(el, ev, fn) { el.addEventListener(ev, fn); }
function capitalFor(tvl) { return tvl >= 1e9 ? 200 : tvl >= 1e8 ? 100 : 50; }
function holdDaysFor(age) { return age === null || age === undefined ? 45 : age < 365 ? 60 : 30; }
function gasFor(cap) { return cap >= 150 ? 8 : 5; }
function chainFor(chains) { return chains && chains.length ? chains[0] : "its main chain"; }
function secondChainFor(chains) { return chains && chains.length > 1 ? chains[1] : null; }
function actionFor(name, category, chain, capital) {
  var c = (category || "").toLowerCase(), $ = "$" + capital;
  if (c.indexOf("lend") >= 0 || c.indexOf("cdp") >= 0 || c.indexOf("collateral") >= 0)
    return "Lend " + $ + " of USDC on " + name + " on " + chain + " and, if you want both sides of the market, borrow a small amount against it so the address shows as a borrower too.";
  if (c.indexOf("dex") >= 0 || c.indexOf("liquidity manager") >= 0 || c.indexOf("leveraged farm") >= 0 || c.indexOf("farm") >= 0)
    return "Put " + $ + " into " + name + "'s main pool on " + chain + " as liquidity and leave the position open; if it offers a narrow range, keep the range tight around the current price.";
  if (c.indexOf("yield") >= 0 && c.indexOf("aggregator") < 0)
    return "Deposit " + $ + " into " + name + "'s highest-yield vault on " + chain + " and leave it compounding; do not chase a new vault every week.";
  if (c.indexOf("yield aggregator") >= 0)
    return "Deposit " + $ + " into one vault on " + name + " on " + chain + " and hold the vault shares; a single steady vault reads better than hopping between many.";
  if (c.indexOf("bridge") >= 0 || c.indexOf("cross chain") >= 0)
    return "Bridge " + $ + " of USDC to " + chain + " through " + name + ", then put the bridged funds to work inside its app instead of bridging straight back.";
  if (c.indexOf("stak") >= 0 || c.indexOf("restak") >= 0)
    return "Stake " + $ + " through " + name + " on " + chain + " and hold whatever receipt token it gives you; do not sell the receipt.";
  if (c.indexOf("perpetual") >= 0 || c.indexOf("derivative") >= 0 || c.indexOf("options") >= 0)
    return "Deposit " + $ + " of USDC as margin on " + name + " on " + chain + " and open one small position at low leverage, then close it after a few days rather than leaving it open for weeks.";
  if (c.indexOf("prediction") >= 0)
    return "Fund your account with " + $ + " on " + name + " and take a position in one live market with a clear end date, then let it settle.";
  if (c.indexOf("curator") >= 0 || c.indexOf("allocator") >= 0 || c.indexOf("basis trading") >= 0)
    return "Deposit " + $ + " into a vault on " + name + " on " + chain + " and hold the vault shares; pick the vault whose strategy you understand, not the one with the highest headline yield.";
  if (c.indexOf("rwa") >= 0)
    return "Buy " + $ + " of " + name + "'s yield-bearing asset on " + chain + " and hold it; keep the purchase receipt and the asset in the same wallet.";
  if (c.indexOf("insurance") >= 0)
    return "Buy " + $ + " of cover from " + name + " on " + chain + " and keep the policy active through at least one renewal.";
  if (c.indexOf("stable") >= 0 || c.indexOf("dual-token") >= 0)
    return "Mint " + $ + " of the stable asset through " + name + " on " + chain + " and keep the vault well collateralised; do not let the ratio drift near liquidation.";
  if (c.indexOf("launchpad") >= 0)
    return "Join one launch on " + name + " on " + chain + " with " + $ + " and complete its allowlist steps early, before the launch window opens.";
  if (c.indexOf("indexes") >= 0 || c.indexOf("index") >= 0)
    return "Buy " + $ + " of " + name + "'s index token on " + chain + " and hold it; an index holding is one position, not many small ones.";
  if (c.indexOf("payments") >= 0)
    return "Send " + $ + " through " + name + " on " + chain + " to a second wallet you control, then use the app once more the following week so the address shows repeat use.";
  if (c.indexOf("privacy") >= 0)
    return "Use " + name + " on " + chain + " once with " + $ + " for a private transfer, then use it again the next week; a single use looks like a test.";
  if (c.indexOf("ai agent") >= 0 || c.indexOf("decentralized ai") >= 0 || c.indexOf("artificial") >= 0)
    return "Spend " + $ + " on " + name + "'s agent service on " + chain + " and run one real task end to end, then run a second task the following week.";
  if (c.indexOf("nft") >= 0)
    return "Buy one item through " + name + " on " + chain + " for about " + $ + " and hold it; do not flip it the same day.";
  if (c.indexOf("governance") >= 0)
    return "Lock " + $ + " in " + name + "'s governance on " + chain + " and vote on one live proposal, then vote again when the next one opens.";
  if (c.indexOf("token locker") >= 0 || c.indexOf("locker") >= 0)
    return "Lock " + $ + " of tokens through " + name + " on " + chain + " for the longest term you are comfortable with and keep the lock receipt.";
  if (c.indexOf("chain") >= 0)
    return "Bridge " + $ + " onto " + name + "'s chain on " + chain + " and use one native app there, so the address is active on the chain itself.";
  return "Deposit " + $ + " of USDC into " + name + " on " + chain + " and use its main feature once to activate the position.";
}
function secondActionFor(name, category, chain, capital) {
  var c = (category || "").toLowerCase();
  if (c.indexOf("lend") >= 0 || c.indexOf("cdp") >= 0)
    return "After a week, borrow a small amount against the deposit on " + name + " on " + chain + " and repay it within a few days, so the address shows both sides of the market.";
  if (c.indexOf("dex") >= 0 || c.indexOf("liquidity manager") >= 0)
    return "After a week, add a second, smaller liquidity position on " + name + " on " + chain + " in a different pool, so the address is not a one-pool user.";
  if (c.indexOf("yield") >= 0 || c.indexOf("curator") >= 0 || c.indexOf("allocator") >= 0)
    return "After a week, check the vault's yield on " + name + " on " + chain + " and, if it dropped sharply, move only half to another vault rather than exiting entirely.";
  if (c.indexOf("perpetual") >= 0 || c.indexOf("derivative") >= 0 || c.indexOf("options") >= 0)
    return "After a few days, close the first position on " + name + " on " + chain + " and open one more small position, so the address shows repeat trading rather than a single trade.";
  if (c.indexOf("bridge") >= 0 || c.indexOf("cross chain") >= 0)
    return "A week later, bridge a smaller amount back through " + name + " on " + chain + " so the address shows two-way use instead of a single crossing.";
  if (c.indexOf("prediction") >= 0)
    return "When the first market settles on " + name + ", take a position in a second live market with a smaller amount.";
  if (c.indexOf("rwa") >= 0 || c.indexOf("stable") >= 0)
    return "After a month, add a smaller top-up to the same position on " + name + " on " + chain + " rather than opening a second one.";
  return null;
}
function withCostTime(text, cost, time) {
  var full = text + " [Cost: " + cost + ". Time: " + time + ".]";
  return full.length <= 600 ? full : full.slice(0, 597) + "...";
}
function farmSteps(row) {
  var capital = capitalFor(row.tvl), hold = holdDaysFor(row.ageDays),
      gas = gasFor(capital), chain = chainFor(row.chains), second = secondChainFor(row.chains),
      $ = "$" + capital, W = withCostTime, steps = [
    W("Start with a wallet you use only for farming, funded with just the amount you plan to put to work, and keep its seed phrase offline.", "about $2 of gas for the first transaction", "5 minutes"),
    W(actionFor(row.name, row.category, chain, capital), $ + " of capital plus roughly $" + gas + " of gas", "20 minutes to set up")
  ];
  var extra = secondActionFor(row.name, row.category, chain, capital);
  if (extra) steps.push(W(extra, "about $" + Math.max(5, Math.round(capital / 4)) + " of capital plus roughly $2 of gas", "15 minutes"));
  if (second) steps.push(W("If " + row.name + " also runs on " + second + ", repeat the same deposit there with a smaller amount so the address is active on two chains, not one.", "about $" + Math.max(10, Math.round(capital / 2)) + " of capital plus roughly $3 of gas", "15 minutes"));
  steps.push(
    W("Come back once a week and do one more real action — a swap, a deposit, a vote or a borrow — so the address looks active over time instead of used once.", "around $2 of gas per week", "10 minutes a week"),
    W("Leave the position alone for at least " + hold + " days; snapshots reward addresses that stayed, not ones that came and went.", "the " + $ + " stays in the position", hold + " days"),
    W("When a token or points page appears, open it only from " + row.name + "'s own site or official account, and never pay anyone to claim on your behalf.", "nothing to check; claiming costs gas only", "10 minutes"),
    W("Keep a short log — wallet, dates, amounts and transaction hashes — so you can prove the activity or unwind the position later.", "nothing", "5 minutes")
  );
  return steps;
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
function changeClass(v) { return v === null || v === undefined ? "" : v > 0 ? "up" : v < 0 ? "down" : ""; }
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
    if (key === "change7d" || key === "ageDays") return row[key] === null || row[key] === undefined ? -Infinity : row[key];
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
      + '<td class="num ' + changeClass(row.change7d) + '">' + esc(changeText(row.change7d)) + "</td>"
      + '<td class="num">' + esc(ageText(row.ageDays)) + "</td>"
      + '<td class="num">' + row.ratioUsed.toFixed(3) + "</td>"
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
    + "</code> &asymp; <code>" + money(row.impliedValue) + "</code>. Ratio = category median mcap/TVL (0.169 global fallback), clamped [0.05, 2.0].</p>"
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
on(window, "hashchange", function () {
  var slug = readHash();
  render();
  if (slug) openDetail(slug);
  else if (!detailEl.hidden) closeDetail();
});
var detailSlug = readHash();
render();
if (detailSlug) openDetail(detailSlug);
})();
