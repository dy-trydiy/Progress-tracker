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
if (/success/i.test(statusRaw)) status = "success";
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

// Build the confirmation summary.
const totalDays = dayCount(config.startDate, config.endDate);
const perDay = config.rewardTotal / totalDays;
const entries = Object.entries(log.entries);
const clean = entries.filter(([, e]) => e.status === "success").length;
const slips = entries.filter(([, e]) => e.status === "slip").length;
const earned = clean * perDay;

// Current streak of consecutive clean days ending at the latest reported day.
let streak = 0;
const dates = entries.map(([d]) => d).sort();
if (dates.length) {
  let cursor = dates[dates.length - 1];
  while (log.entries[cursor]?.status === "success") {
    streak += 1;
    const prev = new Date(Date.parse(`${cursor}T00:00:00Z`) - 86400000);
    cursor = prev.toISOString().slice(0, 10);
  }
}

const money = (n) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: config.currency || "USD" }).format(n);

const verdict =
  status === "success"
    ? `**${date} recorded as a clean day** — ${money(perDay)} added. 🎉`
    : `**${date} recorded as a slip** — no reward for this day, and that's the whole consequence. Tomorrow is a fresh ${money(perDay)}.`;

const summary = [
  verdict,
  ...(previous ? [`_(This replaces the earlier report for ${date}: ${previous.status}.)_`] : []),
  "",
  `| Earned so far | Clean days | Slips | Current streak |`,
  `|---|---|---|---|`,
  `| **${money(earned)}** of ${money(config.rewardTotal)} | ${clean} | ${slips} | ${streak} day${streak === 1 ? "" : "s"} |`,
].join("\n");

setOutput("ok", "true");
setOutput("date", date);
setOutput("status", status);
setOutput("summary", summary);
