// Token Launch Radar — main.ts
//
// Reads a sealed DefiLlama snapshot of DeFi protocols, finds the ones that
// record no token yet, ranks them by an implied launch value built only from
// the snapshot's own figures, and writes the board, the dashboard and the
// dossier.
//
//   node main.ts --input <snapshot.json> --output <dir>
//
// Defaults: --input /input (a directory holding snapshot.json, or the file
// itself), falling back to a bundled input/snapshot.json beside this file;
// --output $MAKEFUN_OUTPUT_DIR or ./out. Node 22+, standard library only.
//
// The value model: implied = TVL x category median mcap/TVL x growth x age.
// The category medians live in category_ratios.json; a category with no
// median falls back to the global median 0.308. The used ratio is clamped to
// [0.05, 2.0], the growth factor to [0.75, 1.5], the age factor is 0.9 under
// six months, 1.1 over two years, else 1.0.

import { buildDossier } from "./vendor/makefun-board.ts";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = dirname(fileURLToPath(import.meta.url));
const VERSION_MARKER = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
const GLOBAL_MEDIAN_RATIO = 0.308;
const EARLY_LIMIT = 160;
const SCREENSHOT_MAX_BYTES = 524288;
const SCREENSHOT_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

type Protocol = {
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
};

type BoardRow = {
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
  token_status: string;
  age_days: number | null;
  implied_value_usd: number;
  model: {
    ratio_used: number;
    category_ratio: number | null;
    fallback: boolean;
    growth_factor: number;
    age_factor: number;
  };
  farm_steps: string[];
};

function fail(message: string): never {
  console.error(`token-radar: ${message}`);
  process.exit(1);
}

function parseArgs(argv: string[]): Map<string, string> {
  const out = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const eq = arg.indexOf("=");
    if (eq > 2) {
      out.set(arg.slice(2, eq), arg.slice(eq + 1));
    } else if (i + 1 < argv.length && !argv[i + 1].startsWith("--")) {
      out.set(arg.slice(2), argv[i + 1]);
      i++;
    } else {
      out.set(arg.slice(2), "");
    }
  }
  return out;
}

function resolveInputPath(arg: string | undefined): string {
  const candidates: string[] = [];
  if (arg) candidates.push(arg);
  else candidates.push("/input");
  candidates.push(join(REPO_ROOT, "input", "snapshot.json"));
  for (const candidate of candidates) {
    try {
      const st = statSync(candidate);
      if (st.isDirectory()) {
        const file = join(candidate, "snapshot.json");
        if (existsSync(file)) return file;
      } else if (st.isFile()) {
        return candidate;
      }
    } catch {
      // try the next candidate
    }
  }
  fail(`snapshot not found (tried: ${candidates.join(", ")})`);
}

function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function ageDaysBetween(listedAt: string | null, asOf: string): number | null {
  if (!listedAt) return null;
  const listed = Date.parse(`${listedAt}T00:00:00Z`);
  const asOfMs = Date.parse(`${asOf}T00:00:00Z`);
  if (Number.isNaN(listed) || Number.isNaN(asOfMs)) return null;
  return Math.round((asOfMs - listed) / 86400000);
}

function growthFactor(change7d: number | null): number {
  if (change7d === null || change7d === undefined) return 1.0;
  return clamp(1 + clamp(change7d, -50, 100) / 200, 0.75, 1.5);
}

function ageFactor(ageDays: number | null): number {
  if (ageDays === null) return 1.0;
  if (ageDays < 180) return 0.9;
  if (ageDays > 730) return 1.1;
  return 1.0;
}

// --- farm plan (dashboard/app.js mirrors these rules exactly) ---

function capitalFor(tvlUsd: number): number {
  if (tvlUsd >= 1e9) return 200;
  if (tvlUsd >= 1e8) return 100;
  return 50;
}

function holdDaysFor(ageDays: number | null): number {
  if (ageDays === null) return 45;
  if (ageDays < 365) return 60;
  return 30;
}

function gasFor(capital: number): number {
  return capital >= 150 ? 8 : 5;
}

function chainFor(chains: string[]): string {
  return chains && chains.length > 0 ? chains[0] : "its main chain";
}

function actionFor(name: string, category: string | null, chain: string, capital: number): string {
  const c = (category ?? "").toLowerCase();
  if (c.includes("lend") || c.includes("cdp") || c.includes("collateral")) {
    return `Lend $${capital} of USDC on ${name} on ${chain} and, if you want both sides of the market, borrow a small amount against it.`;
  }
  if (
    c.includes("dex") ||
    c.includes("yield") ||
    c.includes("leveraged farm") ||
    c.includes("liquidity manager") ||
    c.includes("farm")
  ) {
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

function withCostTime(text: string, cost: string, time: string): string {
  const full = `${text} [Cost: ${cost}. Time: ${time}.]`;
  if (full.length <= 600) return full;
  return `${full.slice(0, 597)}...`;
}

function farmSteps(
  name: string,
  category: string | null,
  chains: string[],
  tvlUsd: number,
  ageDays: number | null,
): string[] {
  const capital = capitalFor(tvlUsd);
  const hold = holdDaysFor(ageDays);
  const gas = gasFor(capital);
  const chain = chainFor(chains);
  return [
    withCostTime(
      "Start with a wallet you use only for farming, funded with just the amount you plan to put to work, and keep its seed phrase offline.",
      "about $2 of gas for the first transaction",
      "5 minutes",
    ),
    withCostTime(
      actionFor(name, category, chain, capital),
      `$${capital} of capital plus roughly $${gas} of gas`,
      "20 minutes to set up",
    ),
    withCostTime(
      "Come back once a week and do one more real action — a swap, a deposit, a vote or a borrow — so the address looks active over time instead of used once.",
      "around $2 of gas per week",
      "10 minutes a week",
    ),
    withCostTime(
      `Leave the position alone for at least ${hold} days; snapshots reward addresses that stayed, not ones that came and went.`,
      `the $${capital} stays in the position`,
      `${hold} days`,
    ),
    withCostTime(
      `When a token or points page appears, open it only from ${name}'s own site or official account, and never pay anyone to claim on your behalf.`,
      "nothing to check; claiming costs gas only",
      "10 minutes",
    ),
    withCostTime(
      "Keep a short log — wallet, dates, amounts and transaction hashes — so you can prove the activity or unwind the position later.",
      "nothing",
      "5 minutes",
    ),
  ];
}

// --- board ---

function isPreToken(p: Protocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

function validateBoard(rows: BoardRow[], watchlist: string[]): void {
  const problems: string[] = [];
  const seen = new Set(rows.map((r) => r.slug));
  for (const slug of watchlist) {
    if (!seen.has(slug)) problems.push(`watchlist slug missing from board: ${slug}`);
  }
  rows.forEach((row, i) => {
    if (row.rank !== i + 1) problems.push(`rank ${row.rank} at position ${i + 1}`);
  });
  for (let i = 1; i < rows.length; i++) {
    if (rows[i].implied_value_usd > rows[i - 1].implied_value_usd) {
      problems.push(`implied value rises at rank ${rows[i].rank}`);
    }
  }
  if (rows.length > 1 && rows.every((r) => r.implied_value_usd === rows[0].implied_value_usd)) {
    problems.push("all implied values are equal — not a ranking");
  }
  for (const row of rows) {
    if (!Number.isSafeInteger(row.implied_value_usd) || row.implied_value_usd <= 0) {
      problems.push(`bad implied value for ${row.slug}: ${row.implied_value_usd}`);
    }
    if (!Array.isArray(row.farm_steps) || row.farm_steps.length < 3 || row.farm_steps.length > 12) {
      problems.push(`bad farm_steps count for ${row.slug}`);
      continue;
    }
    for (const step of row.farm_steps) {
      const trimmed = String(step).trim();
      if (trimmed.length < 20 || trimmed.length > 600) {
        problems.push(`farm step of ${trimmed.length} chars for ${row.slug}`);
      }
    }
  }
  if (problems.length > 0) {
    const shown = problems.slice(0, 20).join("\n- ");
    const extra = problems.length > 20 ? `\n... and ${problems.length - 20} more` : "";
    fail(`board validation failed:\n- ${shown}${extra}`);
  }
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const inputPath = resolveInputPath(args.get("input"));
  const outDir =
    args.get("output") ?? process.env.MAKEFUN_OUTPUT_DIR ?? join(process.cwd(), "out");

  const snapshot = JSON.parse(readFileSync(inputPath, "utf8")) as {
    as_of: string;
    source: string;
    floor_usd: number;
    protocols: Protocol[];
    watchlist: string[];
  };
  const ratios = JSON.parse(
    readFileSync(join(REPO_ROOT, "category_ratios.json"), "utf8"),
  ) as Record<string, number>;

  const asOf: string = snapshot.as_of;
  const floorUsd: number = snapshot.floor_usd;
  const protocols: Protocol[] = snapshot.protocols;
  const watchlist: string[] = snapshot.watchlist;
  const bySlug = new Map<string, Protocol>(protocols.map((p) => [p.slug, p]));
  const preToken = protocols.filter(isPreToken);
  const live = protocols.filter((p) => !isPreToken(p));

  function modelFor(p: Protocol): {
    ageDays: number | null;
    categoryRatio: number | null;
    fallback: boolean;
    ratioUsed: number;
    growth: number;
    age: number;
    implied: number;
  } {
    const ageDays = ageDaysBetween(p.listed_at, asOf);
    const categoryRatio =
      p.category !== null && typeof ratios[p.category] === "number"
        ? ratios[p.category]
        : null;
    const fallback = categoryRatio === null;
    const ratioUsed = clamp(fallback ? GLOBAL_MEDIAN_RATIO : (categoryRatio as number), 0.05, 2.0);
    const growth = growthFactor(p.change_7d);
    const age = ageFactor(ageDays);
    const implied = Math.max(1, Math.round(p.tvl_usd * ratioUsed * growth * age));
    return { ageDays, categoryRatio, fallback, ratioUsed, growth, age, implied };
  }

  function rowFor(p: Protocol): BoardRow {
    const m = modelFor(p);
    return {
      rank: 0,
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      change_7d: p.change_7d,
      mcap_usd: p.mcap_usd,
      listed_at: p.listed_at,
      gecko_id: p.gecko_id,
      symbol: p.symbol,
      token_status: "pre-token",
      age_days: m.ageDays,
      implied_value_usd: m.implied,
      model: {
        ratio_used: m.ratioUsed,
        category_ratio: m.categoryRatio,
        fallback: m.fallback,
        growth_factor: round4(m.growth),
        age_factor: m.age,
      },
      farm_steps: farmSteps(p.name, p.category, p.chains, p.tvl_usd, m.ageDays),
    };
  }

  // The board: every watchlist protocol, plus the 160 largest pre-token
  // protocols below the floor, skipping CEX and versioned names.
  const chosen = new Map<string, Protocol>();
  for (const slug of watchlist) {
    const p = bySlug.get(slug);
    if (p) chosen.set(slug, p);
  }
  const early = preToken
    .filter(
      (p) =>
        p.tvl_usd < floorUsd &&
        p.category !== "CEX" &&
        !VERSION_MARKER.test(p.name) &&
        !chosen.has(p.slug),
    )
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, EARLY_LIMIT);
  for (const p of early) chosen.set(p.slug, p);

  const rows = [...chosen.values()].map(rowFor);
  rows.sort(
    (a, b) =>
      b.implied_value_usd - a.implied_value_usd ||
      (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0),
  );
  rows.forEach((row, i) => {
    row.rank = i + 1;
  });

  validateBoard(rows, watchlist);

  const watchlistPresent = watchlist.filter((s) => bySlug.has(s)).length;
  const earlySize = rows.length - watchlistPresent;

  // --- write outputs ---
  const dashDir = join(outDir, "dashboard");
  const shotsDir = join(outDir, "screenshots");
  mkdirSync(dashDir, { recursive: true });
  mkdirSync(shotsDir, { recursive: true });

  writeFileSync(join(outDir, "board.json"), `${JSON.stringify({ rows })}\n`);

  const meta = {
    asOf,
    floorUsd,
    snapshotProtocols: protocols.length,
    preTokenProtocols: preToken.length,
    liveProtocols: live.length,
    watchlistSize: watchlist.length,
    boardSize: rows.length,
    earlySize,
  };
  const boardData = rows.map((r) => ({
    rank: r.rank,
    slug: r.slug,
    name: r.name,
    category: r.category,
    chains: r.chains,
    tvl: r.tvl_usd,
    impliedValue: r.implied_value_usd,
    ratioUsed: round4(r.model.ratio_used),
    growthFactor: r.model.growth_factor,
    ageFactor: r.model.age_factor,
    change7d: r.change_7d === null ? null : Math.round(r.change_7d * 10) / 10,
    ageDays: r.age_days,
  }));
  const dataJs =
    `// Token Launch Radar data (as of ${asOf}). Generated by main.ts; no network needed.\n` +
    `window.TOKEN_RADAR_META = ${JSON.stringify(meta)};\n` +
    `window.TOKEN_RADAR_BOARD = [\n${boardData.map((r) => JSON.stringify(r)).join(",\n")}\n];\n`;

  const srcDash = join(REPO_ROOT, "dashboard");
  for (const name of readdirSync(srcDash)) {
    if (name === "data.js") continue;
    const src = join(srcDash, name);
    if (statSync(src).isFile()) copyFileSync(src, join(dashDir, name));
  }
  writeFileSync(join(dashDir, "data.js"), dataJs);

  const srcShots = join(REPO_ROOT, "screenshots");
  const shots = readdirSync(srcShots)
    .filter((n) => statSync(join(srcShots, n)).isFile())
    .sort();
  if (shots.length < 3) {
    fail(`screenshots: expected at least 3 files, found ${shots.length}`);
  }
  for (const name of shots) {
    if (!SCREENSHOT_NAME.test(name)) fail(`screenshots: bad file name ${name}`);
    const size = statSync(join(srcShots, name)).size;
    if (size > SCREENSHOT_MAX_BYTES) {
      fail(`screenshots: ${name} is ${size} bytes, over the 524288 limit`);
    }
    copyFileSync(join(srcShots, name), join(shotsDir, name));
  }

  // Dossier last, so it covers exactly what was written above.
  writeFileSync(
    join(outDir, "dossier.json"),
    buildDossier(outDir, {
      text_max_bytes: 65536,
      screenshots: { max: 4, max_bytes: 524288 },
      dashboard: { max_files: 400, max_bytes: 4194304 },
    }),
  );

  const usd = (v: number): string => `$${Math.round(v).toLocaleString("en-US")}`;
  console.log(`Token Launch Radar — snapshot ${asOf}`);
  console.log(
    `protocols: ${protocols.length} (pre-token ${preToken.length}, with token ${live.length})`,
  );
  console.log(`watchlist: ${watchlist.length} protocols at ${usd(floorUsd)}+`);
  console.log(`board rows: ${rows.length} (${watchlistPresent} watchlist + ${earlySize} early)`);
  console.log("top 5 by implied value:");
  for (const r of rows.slice(0, 5)) {
    console.log(
      `  #${r.rank} ${r.name} (${r.category ?? "uncategorised"}) — TVL ${usd(r.tvl_usd)}, implied ${usd(r.implied_value_usd)}, ratio ${r.model.ratio_used}, growth ${r.model.growth_factor}, age ${r.model.age_factor}`,
    );
  }
  console.log(`wrote ${outDir}/board.json, ${outDir}/dashboard/, ${outDir}/screenshots/, ${outDir}/dossier.json`);
}

main();
