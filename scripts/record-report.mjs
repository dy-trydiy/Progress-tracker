#!/usr/bin/env node
// Parses a "Daily check-in" issue-form body, updates data/log.json, and
// writes GitHub Actions outputs used for the confirmation comment.
//
// Env in:  ISSUE_BODY, ISSUE_NUMBER
// Outputs: ok, error, date, status, summary

import { readFileSync, writeFileSync, appendFileSync } from "node:fs";

const CONFIG_PATH = "data/config.json";
const LOG_PATH = "data/log.json";

function setOutput(name, value) {
  const out = process.env.GITHUB_OUTPUT;
  const delim = `EOF_${Math.random().toString(36).slice(2)}`;
  const line = `${name}<<${delim}\n${value}\n${delim}\n`;
  if (out) appendFileSync(out, line);
  else process.stdout.write(line);
}

function fail(message) {
  setOutput("ok", "false");
  setOutput("error", message);
  process.exit(0);
}

// Issue forms render as "### <label>\n\n<answer>" sections.
function parseSections(body) {
  const sections = {};
  const parts = body.split(/^### /m).slice(1);
  for (const part of parts) {
    const newline = part.indexOf("\n");
    if (newline === -1) continue;
    const label = part.slice(0, newline).trim();
    const value = part.slice(newline + 1).trim();
    sections[label] = value === "_No response_" ? "" : value;
  }
  return sections;
}

function todayIn(timezone) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function dayCount(startDate, endDate) {
  const ms = Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`);
  return Math.round(ms / 86400000) + 1;
}

const config = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
const log = JSON.parse(readFileSync(LOG_PATH, "utf8"));
if (!log.entries || typeof log.entries !== "object") log.entries = {};

const body = process.env.ISSUE_BODY ?? "";
const issueNumber = Number(process.env.ISSUE_NUMBER) || null;
const sections = parseSections(body);

const statusRaw = sections["How did it go?"] ?? "";
let status;
if (/partial/i.test(statusRaw)) status = "partial";
else if (/success/i.test(statusRaw)) status = "success";
else if (/slip/i.test(statusRaw)) status = "slip";
else fail("Couldn't find a **How did it go?** answer in the form. Please use the *Daily check-in* issue template.");

let date = (sections["Date"] ?? "").trim();
if (!date) date = todayIn(config.timezone || "UTC");
if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) {
  fail(`\`${date}\` is not a valid date — please use the \`YYYY-MM-DD\` format.`);
}
if (date < config.startDate || date > config.endDate) {
  fail(`\`${date}\` is outside the challenge window (${config.startDate} → ${config.endDate}).`);
}
const today = todayIn(config.timezone || "UTC");
if (date > today) {
  fail(`\`${date}\` is in the future — you can only report days that already happened.`);
}

const previous = log.entries[date];
log.entries[date] = {
  status,
  note: sections["Note (optional)"] ?? "",
  reportedAt: new Date().toISOString(),
  issue: issueNumber,
};
writeFileSync(LOG_PATH, JSON.stringify(log, null, 2) + "\n");

// Build the confirmation summary. Walk the challenge window day by day so
// streaks and bonuses match the dashboard exactly: success = full reward and
// extends the streak; partial = half reward, resets the streak; slip or a
// missed past day = nothing, resets the streak. Every completed block of
// `bonus.streakDays` consecutive successes pays `bonus.percent`% of that
// block's base reward.
const totalDays = dayCount(config.startDate, config.endDate);
const perDay = config.rewardTotal / totalDays;
const bonusDays = config.bonus?.streakDays || 5;
const bonusPct = config.bonus?.percent || 20;
const bonusBlock = (bonusDays * perDay * bonusPct) / 100;

let clean = 0, partialCt = 0, slips = 0, base = 0, bonusEarned = 0, run = 0;
const startMs = Date.parse(`${config.startDate}T00:00:00Z`);
const stopMs = Math.min(Date.parse(`${today}T00:00:00Z`), Date.parse(`${config.endDate}T00:00:00Z`));
for (let ms = startMs; ms <= stopMs; ms += 86400000) {
  const d = new Date(ms).toISOString().slice(0, 10);
  const e = log.entries[d];
  if (!e) { if (d !== today) run = 0; continue; }
  if (e.status === "success") {
    clean++; base += perDay; run++;
    if (run % bonusDays === 0) bonusEarned += bonusBlock;
  } else if (e.status === "partial") { partialCt++; base += perDay / 2; run = 0; }
  else { slips++; run = 0; }
}
const earned = base + bonusEarned;
const streak = run;

const money = (n) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: config.currency || "USD" }).format(n);

let verdict;
if (status === "success") {
  verdict = `**${date} recorded as a full success** — ${money(perDay)} added. 🎉`;
  if (streak > 0 && streak % bonusDays === 0) {
    verdict += ` And that completes a ${streak}-day streak: **+${money(bonusBlock)} bonus!** 🏆`;
  } else if (streak > 0) {
    verdict += ` Streak: ${streak} day${streak === 1 ? "" : "s"} — ${bonusDays - (streak % bonusDays)} more to a +${money(bonusBlock)} bonus.`;
  }
} else if (status === "partial") {
  verdict = `**${date} recorded as a partial day** — half reward, ${money(perDay / 2)} added. The bonus streak resets, but the money still counts.`;
} else {
  verdict = `**${date} recorded as a slip** — no reward for this day, and that's the whole consequence. Tomorrow is a fresh ${money(perDay)}.`;
}

const summary = [
  verdict,
  ...(previous ? [`_(This replaces the earlier report for ${date}: ${previous.status}.)_`] : []),
  "",
  `| Earned so far | Streak bonus | ✅ Full | 🌓 Partial | ❌ Slips | Streak |`,
  `|---|---|---|---|---|---|`,
  `| **${money(earned)}** of ${money(config.rewardTotal)} | ${money(bonusEarned)} | ${clean} | ${partialCt} | ${slips} | ${streak}d |`,
].join("\n");

setOutput("ok", "true");
setOutput("date", date);
setOutput("status", status);
setOutput("summary", summary);
