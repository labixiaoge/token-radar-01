// Token Launch Radar — main.ts
//
// Reads the sealed DefiLlama snapshot (default /input/snapshot.json, falling
// back to the bundled copy in input/snapshot.json), ranks every pre-token
// protocol the snapshot carries, and writes the ranked board, the dashboard
// data and the dossier the judge reads.
//
// The board covers the snapshot's whole watchlist (the floor, never a
// ceiling) and adds the pre-token protocols below the floor with the most
// TVL, capped at EARLY_ROWS. A protocol is pre-token when the snapshot
// records no token for it: no market cap, no CoinGecko id, no symbol.
//
// Implied value is the entry's own yardstick, stated on the dashboard:
// TVL x the category's median market-cap / TVL ratio (category_ratios.json,
// measured across the tokenized protocols of each category), clamped to
// [0.05, 2.0]; a category with no measured ratio uses the global median
// 0.308. No protocol name is ever special-cased.
//
// Run with plain Node 22+:  node main.ts --input <snapshot.json|dir>
//   --output defaults to $MAKEFUN_OUTPUT_DIR, else ./out.
// Zero external dependencies — only the Node standard library.
// Plain TypeScript with erasable syntax only (no enums, no parameter
// properties, no namespaces) so it runs under Node type-stripping.

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildDossier } from "./vendor/makefun-board.ts";

const here = dirname(fileURLToPath(import.meta.url));

/** The global median ratio, used when a category has no measured ratio. */
const GLOBAL_RATIO = 0.308;
const RATIO_MIN = 0.05;
const RATIO_MAX = 2.0;
/** How many pre-token protocols below the watchlist floor the board carries, by TVL. */
const EARLY_ROWS = 160;
/** The dossier's caps (the gate's reference): the text cap shapes the bytes, the rest refuse. */
const TEXT_MAX_BYTES = 65_536;
const SCREENSHOT_CAPS = { max: 4, max_bytes: 524_288 };
const DASHBOARD_CAPS = { max_files: 400, max_bytes: 4_194_304 };
const IMAGE_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

/** One protocol entry of the sealed snapshot: exactly its ten fields. */
interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** One row of board.json: the ranked board's row. */
interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: "pre-token";
  age_days: number | null;
  implied_value_usd: number;
  model: {
    ratio_used: number;
    category_ratio: number | null;
    fallback: boolean;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row; its farm plan is generated in the page. */
interface DashboardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl: number;
  impliedValue: number;
  ratioUsed: number;
  change7d: number | null;
  ageDays: number | null;
}

/** Why the snapshot is not one this program can score. */
class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SnapshotError";
  }
}

/** --name <value> out of the arguments, or the fallback. */
function arg(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < process.argv.length) return process.argv[at + 1] as string;
  const withEquals = process.argv.find((a) => a.startsWith(`--${name}=`));
  return withEquals === undefined ? fallback : withEquals.slice(name.length + 3);
}

const DAY_MS = 86_400_000;

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** Whether a protocol records no token at all. */
function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** A name ending in a release marker is a versioned pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Whether a protocol is one the board may rank: pre-token, not an exchange, not a versioned pool. */
function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && p.category !== "CEX" && !VERSIONED.test(p.name);
}

/** The snapshot out of a file's text, refused unless it is the shape this program scores. */
function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError("snapshot.json is not JSON");
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new SnapshotError("snapshot.json is not a JSON object");
  }
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) {
    throw new SnapshotError("snapshot.json has no as_of date");
  }
  if (typeof o.source !== "string") throw new SnapshotError("snapshot.json has no source");
  if (typeof o.floor_usd !== "number" || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) {
    throw new SnapshotError("snapshot.json has no floor_usd");
  }
  if (!Array.isArray(o.protocols)) throw new SnapshotError("snapshot.json has no protocols array");
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== "string")) {
    throw new SnapshotError("snapshot.json has no watchlist of slugs");
  }
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== "object" || v === null || Array.isArray(v)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    }
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== "string" || typeof p.name !== "string" || typeof p.tvl_usd !== "number" || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === "string" ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === "string") : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === "number" && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === "number" && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === "string" ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === "string" ? p.gecko_id : null,
      symbol: typeof p.symbol === "string" ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** The category ratios this entry ranks by, from the bundled table. */
function loadRatios(): Record<string, number> {
  const file = join(here, "category_ratios.json");
  if (!existsSync(file)) {
    process.stderr.write("token radar: no category_ratios.json beside main.ts: every category falls back to 0.308\n");
    return {};
  }
  const raw: unknown = JSON.parse(readFileSync(file, "utf8"));
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
  }
  return out;
}

/** The ratio a category's protocols are scored with: the measured median, clamped, or the fallback. */
function ratioFor(category: string | null, ratios: Record<string, number>): { used: number; raw: number | null; fallback: boolean } {
  const raw = category !== null ? ratios[category] : undefined;
  if (raw === undefined) return { used: GLOBAL_RATIO, raw: null, fallback: true };
  return { used: Math.max(RATIO_MIN, Math.min(RATIO_MAX, raw)), raw, fallback: false };
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(tvlUsd: number): number {
  if (tvlUsd >= 1_000_000_000) return 200;
  if (tvlUsd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 45;
  if (age < 365) return 60;
  return 30;
}

/** The category's one action, in words a farmer can follow. */
function actionFor(category: string | null, name: string, capital: number, chain: string): string {
  const c = (category ?? "").toLowerCase();
  if (c.includes("lend") || c.includes("cdp") || c.includes("collateral")) {
    return `Lend $${capital} of USDC on ${name} on ${chain} and, if you want both sides of the market, borrow a small amount against it.`;
  }
  if (c.includes("dex") || c.includes("yield") || c.includes("leveraged farm") || c.includes("liquidity manager") || c.includes("farm")) {
    return `Put $${capital} into ${name}'s main pool on ${chain} as liquidity and leave the position open.`;
  }
  if (c.includes("bridge")) {
    return `Bridge $${capital} of USDC to ${chain} through ${name}, then put the bridged funds to work inside its app.`;
  }
  if (c.includes("stak") || c.includes("restak")) {
    return `Stake $${capital} through ${name} on ${chain} and hold whatever receipt token it gives you.`;
  }
  if (c.includes("perpetual") || c.includes("derivative") || c.includes("options")) {
    return `Deposit $${capital} of USDC as margin on ${name} on ${chain} and open one small position at low leverage.`;
  }
  if (c.includes("prediction")) {
    return `Fund your account with $${capital} on ${name} and take a position in one live market.`;
  }
  if (c.includes("curator") || c.includes("allocator") || c.includes("basis trading")) {
    return `Deposit $${capital} into a vault on ${name} on ${chain} and hold the vault shares.`;
  }
  if (c.includes("rwa")) {
    return `Buy $${capital} of ${name}'s yield-bearing asset on ${chain} and hold it.`;
  }
  if (c.includes("insurance")) {
    return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy active.`;
  }
  if (c.includes("stable")) {
    return `Mint $${capital} of the stable asset through ${name} on ${chain} and keep the vault well collateralised.`;
  }
  if (c.includes("launchpad")) {
    return `Join one launch on ${name} on ${chain} with $${capital} and complete its allowlist steps early.`;
  }
  return `Deposit $${capital} of USDC into ${name} on ${chain} and use its main feature once to activate the position.`;
}

/**
 * A protocol's farm plan: six steps, each an action with what it costs and
 * how long it takes. The plan is derived from the protocol's own record
 * (category, chains, TVL, age), never from a hand-written list of names.
 * The dashboard's page builds the same plan from the same rules, so the
 * plan a reader sees is the plan this board carries.
 */
function farmSteps(p: SnapshotProtocol, age: number | null): string[] {
  const chain = p.chains.length > 0 ? (p.chains[0] as string) : "its main chain";
  const capital = capitalFor(p.tvl_usd);
  const hold = holdDaysFor(age);
  const gas = capital >= 150 ? 8 : 5;
  const steps: Array<{ text: string; cost: string; time: string }> = [
    {
      text: "Start with a wallet you use only for farming, funded with just the amount you plan to put to work, and keep its seed phrase offline.",
      cost: "about $2 of gas for the first transaction",
      time: "5 minutes",
    },
    {
      text: actionFor(p.category, p.name, capital, chain),
      cost: `$${capital} of capital plus roughly $${gas} of gas`,
      time: "20 minutes to set up",
    },
    {
      text: "Come back once a week and do one more real action — a swap, a deposit, a vote or a borrow — so the address looks active over time instead of used once.",
      cost: "around $2 of gas per week",
      time: "10 minutes a week",
    },
    {
      text: `Leave the position alone for at least ${hold} days; snapshots reward addresses that stayed, not ones that came and went.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `When a token or points page appears, open it only from ${p.name}'s own site or official account, and never pay anyone to claim on your behalf.`,
      cost: "nothing to check; claiming costs gas only",
      time: "10 minutes",
    },
    {
      text: "Keep a short log — wallet, dates, amounts and transaction hashes — so you can prove the activity or unwind the position later.",
      cost: "nothing",
      time: "5 minutes",
    },
  ];
  return steps.map((s) => {
    let line = `${s.text} [Cost: ${s.cost}. Time: ${s.time}.]`;
    if (line.length > 600) line = `${line.slice(0, 596)}...`;
    if (line.length < 20) line = `${line} Hold the position and check the protocol's own page.`;
    return line;
  });
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
function buildBoard(snapshot: Snapshot, ratios: Record<string, number>): BoardRow[] {
  const index = new Map(snapshot.protocols.map((p) => [p.slug, p]));
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug, even one the snapshot no longer carries.
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: pre-token protocols below the watchlist floor, by TVL, capped.
  // Never a replacement for a watchlist row: a chosen protocol stays chosen.
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, EARLY_ROWS);
  for (const p of early) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => {
    const r = ratioFor(p.category, ratios);
    const age = ageDays(snapshot.as_of, p.listed_at);
    return { p, ratio: r, age, implied: Math.max(1, Math.round(p.tvl_usd * r.used)) };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: "pre-token" as const,
    age_days: s.age,
    implied_value_usd: s.implied,
    model: {
      ratio_used: s.ratio.used,
      category_ratio: s.ratio.raw,
      fallback: s.ratio.fallback,
    },
    farm_steps: farmSteps(s.p, s.age),
  }));
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) {
    return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? "" : "s"}: ${missing.slice(0, 5).join(", ")}`;
  }
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) {
    if ((board[i] as BoardRow).implied_value_usd > (board[i - 1] as BoardRow).implied_value_usd) {
      return `row ${i + 1} outranks row ${i} on implied value`;
    }
  }
  if (board.length >= 2 && (board[0] as BoardRow).implied_value_usd === (board[board.length - 1] as BoardRow).implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${(board[0] as BoardRow).implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) {
      return `${r.slug} has implied value ${r.implied_value_usd}`;
    }
  }
  return null;
}

/** A board row's compact form for data.js, with the farm plan generated in the page. */
function dashboardRow(row: BoardRow): DashboardRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl: row.tvl_usd,
    impliedValue: row.implied_value_usd,
    ratioUsed: Math.round(row.model.ratio_used * 1e4) / 1e4,
    change7d: row.change_7d === null ? null : Math.round(row.change_7d * 10) / 10,
    ageDays: row.age_days,
  };
}

/** Copy one directory's regular files into `to`, skipping names that start with a dot and any in `skip`. */
function copyFiles(from: string, to: string, skip: Set<string> = new Set()): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const copied: string[] = [];
  for (const name of readdirSync(from)) {
    if (name.startsWith(".") || skip.has(name)) continue;
    const path = join(from, name);
    if (!statSync(path).isFile()) continue;
    copyFileSync(path, join(to, name));
    copied.push(name);
  }
  return copied;
}

function money(n: number): string {
  return "$" + Math.round(n).toLocaleString("en-US");
}

function main(): void {
  const inputArg = arg("input", "/input");
  let inputFile = inputArg.endsWith(".json") ? inputArg : join(inputArg, "snapshot.json");
  if (!existsSync(inputFile)) {
    const bundled = join(here, "input", "snapshot.json");
    if (existsSync(bundled)) {
      process.stderr.write(`token radar: no snapshot at ${inputFile}: using the bundled copy ${bundled}\n`);
      inputFile = bundled;
    } else {
      process.stderr.write(`token radar: no snapshot at ${inputFile}: pass --input <snapshot.json|directory> or mount the sealed /input\n`);
      process.exit(2);
    }
  }
  const out = arg("output", process.env.MAKEFUN_OUTPUT_DIR ?? "./out");

  const snapshot = parseSnapshot(readFileSync(inputFile, "utf8"));
  const ratios = loadRatios();
  const board = buildBoard(snapshot, ratios);
  const issue = boardIssue(board, snapshot);
  if (issue !== null) {
    process.stderr.write(`token radar: the model wrote a board the gate refuses: ${issue}\n`);
    process.exit(1);
  }

  const preToken = snapshot.protocols.filter(isPreToken).length;
  const earlySize = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const meta = {
    asOf: snapshot.as_of,
    floorUsd: snapshot.floor_usd,
    snapshotProtocols: snapshot.protocols.length,
    preTokenProtocols: preToken,
    liveProtocols: snapshot.protocols.length - preToken,
    watchlistSize: snapshot.watchlist.length,
    boardSize: board.length,
    earlySize,
  };
  const rows = board.map(dashboardRow);
  const dataJs =
    `// Board as of ${meta.asOf}, from the sealed snapshot. One row: rank, slug, name,\n` +
    `// category, chains, tvl, impliedValue, ratioUsed, change7d, ageDays.\n` +
    `window.TOKEN_RADAR_META = ${JSON.stringify(meta)};\n` +
    `window.TOKEN_RADAR_BOARD = ${JSON.stringify(rows)};\n`;

  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "board.json"), `${JSON.stringify({ rows: board })}\n`);

  copyFiles(join(here, "dashboard"), join(out, "dashboard"), new Set(["data.js"]));
  writeFileSync(join(out, "dashboard", "data.js"), dataJs);

  const shots = copyFiles(join(here, "screenshots"), join(out, "screenshots"));
  if (shots.length < 3) {
    process.stderr.write(`token radar: screenshots/ holds ${shots.length} image${shots.length === 1 ? "" : "s"}: hand in 3, the board, a detail view and a filtered view\n`);
    process.exit(1);
  }
  for (const name of shots) {
    if (!IMAGE_NAME.test(name)) {
      process.stderr.write(`token radar: screenshots/${name}: a name is letters, digits and . _ -, 1 to 128 characters\n`);
      process.exit(1);
    }
    const size = statSync(join(out, "screenshots", name)).size;
    if (size > SCREENSHOT_CAPS.max_bytes) {
      process.stderr.write(`token radar: screenshots/${name} is ${size} bytes, over the ${SCREENSHOT_CAPS.max_bytes} a screenshot may hold\n`);
      process.exit(1);
    }
  }

  // The dossier is written last: the scorer rebuilds it from this output and compares bytes.
  writeFileSync(
    join(out, "dossier.json"),
    buildDossier(out, { text_max_bytes: TEXT_MAX_BYTES, screenshots: SCREENSHOT_CAPS, dashboard: DASHBOARD_CAPS }),
  );

  process.stdout.write(
    `token radar: ${snapshot.protocols.length} protocols, ${snapshot.watchlist.length} on the watchlist, ${board.length} rows scored (${earlySize} early, ${meta.liveProtocols} live set aside)\n` +
      `token radar: wrote ${join(out, "board.json")}, ${join(out, "dashboard")} (4 files), ${join(out, "screenshots")} (${shots.length} images) and ${join(out, "dossier.json")}\n` +
      "token radar: top 5 by implied value:\n",
  );
  for (const row of board.slice(0, 5)) {
    process.stdout.write(`  #${row.rank} ${row.name} (${row.category}) — TVL ${money(row.tvl_usd)}, implied ${money(row.implied_value_usd)}, ratio ${row.model.ratio_used}\n`);
  }
}

main();
