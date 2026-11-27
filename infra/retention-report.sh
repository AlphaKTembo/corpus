#!/bin/bash
# Usage and retention report for the private beta. Read-only.
#   ./retention-report.sh            # last 8 weeks
#   ./retention-report.sh 12         # last 12 weeks
# Activity = a user made an authenticated request that day (app, web or GPT),
# excluding scheduled background syncs. Source: user_activity table + AI usage log.
set -euo pipefail
WEEKS="${1:-8}"
docker exec -e WEEKS="$WEEKS" corpus-api node -e '
const Database = require("better-sqlite3");
const fs = require("fs");
const db = new Database("/data/corpus/corpus.db", { readonly: true });
const WEEKS = parseInt(process.env.WEEKS, 10);
const day = (d) => d.toISOString().slice(0, 10);
const today = new Date();
const daysAgo = (n) => day(new Date(Date.now() - n * 86400000));

const hasTable = db.prepare("SELECT 1 FROM sqlite_master WHERE type=\x27table\x27 AND name=\x27user_activity\x27").get();
if (!hasTable) { console.log("No activity recorded yet (user_activity table missing)."); process.exit(0); }

const users = db.prepare("SELECT id, createdAt FROM users").all();
const act = db.prepare("SELECT userId, day, surface FROM user_activity").all();
const firstTracked = act.reduce((m, a) => (!m || a.day < m ? a.day : m), null);

console.log(`Corpus usage report - ${day(today)}  (activity tracked since ${firstTracked || "n/a"})`);
console.log(`Accounts: ${users.length}`);

const activeBetween = (from, to) => new Set(act.filter(a => a.day >= from && a.day <= to).map(a => a.userId));
console.log(`\nActive users   today: ${activeBetween(daysAgo(0), daysAgo(0)).size}` +
  `   last 7d: ${activeBetween(daysAgo(6), daysAgo(0)).size}` +
  `   last 28d: ${activeBetween(daysAgo(27), daysAgo(0)).size}`);

const bySurface = {};
for (const a of act.filter(a => a.day >= daysAgo(27))) (bySurface[a.surface] ||= new Set()).add(a.userId);
console.log("Last 28d by surface: " + (Object.entries(bySurface).map(([s, v]) => `${s} ${v.size}`).join(", ") || "none"));

// Weekly actives
console.log(`\nWeekly active users (last ${WEEKS} weeks):`);
for (let w = WEEKS - 1; w >= 0; w--) {
  const from = daysAgo(w * 7 + 6), to = daysAgo(w * 7);
  const n = activeBetween(from, to).size;
  console.log(`  ${from} .. ${to}  ${String(n).padStart(3)}  ${"#".repeat(n)}`);
}

// Cohort retention: users grouped by the week of their first tracked activity;
// week-N = active in days [7N, 7N+6] after their first active day.
const first = {};
for (const a of act) if (!first[a.userId] || a.day < first[a.userId]) first[a.userId] = a.day;
const days = {};
for (const a of act) (days[a.userId] ||= new Set()).add(a.day);
const addDays = (d, n) => day(new Date(Date.parse(d + "T00:00:00Z") + n * 86400000));
const cohorts = {};
for (const [u, d0] of Object.entries(first)) {
  const wk = addDays(d0, -((new Date(d0 + "T00:00:00Z").getUTCDay() + 6) % 7)); // Monday
  (cohorts[wk] ||= []).push(u);
}
console.log("\nRetention by first-active week (% of cohort active in week N; - = not reached yet):");
console.log("  cohort      size   W1    W2    W3    W4");
for (const wk of Object.keys(cohorts).sort()) {
  const us = cohorts[wk];
  const cells = [1, 2, 3, 4].map(n => {
    if (addDays(wk, 7 * n) > daysAgo(0)) return "  -  ";
    const kept = us.filter(u => [...days[u]].some(d => d >= addDays(first[u], 7 * n) && d <= addDays(first[u], 7 * n + 6))).length;
    return `${String(Math.round(100 * kept / us.length)).padStart(3)}% `;
  });
  console.log(`  ${wk}  ${String(us.length).padStart(4)}  ${cells.join(" ")}`);
}

// AI usage from the API usage log
const log = "/data/corpus/metadata/ai_usage.jsonl";
if (fs.existsSync(log)) {
  const since = Date.now() - 28 * 86400000;
  const rows = fs.readFileSync(log, "utf8").trim().split("\n").map(l => { try { return JSON.parse(l); } catch { return null; } })
    .filter(r => r && Date.parse(r.ts) >= since);
  const ok = rows.filter(r => r.ok);
  const sum = (k) => ok.reduce((s, r) => s + (r[k] || 0), 0);
  console.log(`\nAI calls last 28d: ${rows.length} (${rows.length - ok.length} failed)` +
    `   input tokens: ${sum("input_tokens")}   output tokens: ${sum("output_tokens")}`);
  const byFeature = {};
  for (const r of ok) byFeature[r.feature || "?"] = (byFeature[r.feature || "?"] || 0) + 1;
  console.log("By feature: " + Object.entries(byFeature).map(([k, v]) => `${k} ${v}`).join(", "));
} else {
  console.log("\nNo AI usage logged yet.");
}
'
