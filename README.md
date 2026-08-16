# Progress Tracker

A reward-based habit tracker: set a goal, a total reward (e.g. **$2,000**), and self-report
every day. Runs entirely on GitHub
(Issues + Actions + Pages), with a shareable dashboard where the participant reports from
the browser — **no GitHub account needed for them**.

## Scoring

Each day is reported as one of three results:

| Result | Reward | Bonus streak |
|---|---|---|
| ✅ **Success** — fully on track | `rates.success` per day (e.g. $10) | extends it |
| 🌓 **Partial** — reduced reward | `rates.partial` per day (e.g. $3) | resets it |
| ❌ **Slip** — off track | nothing (and no penalty) | resets it |

`rewardTotal` is the **goal for the period** — the number the progress bar and hero figure
measure against. With fixed daily rates, a perfect run (plus bonuses) can pay more than the
goal, so the goal stays reachable even with some slips.

**Streak bonus**: every block of consecutive full successes (default **5 days**) pays a bonus
of **20%** of that block's success-rate reward on top (5 × $10 × 20% = +$10) — a 10-day run
earns two bonuses. Partial days,
slips, and unreported days all reset the streak. Configure via `bonus` in `data/config.json`:
`{ "streakDays": 5, "percent": 20 }`.

## Roles

| Role | Who | Can do |
|---|---|---|
| **Administrator** | The repo owner (and collaborators) | Change the challenge parameters (`data/config.json`: name, dates, reward, timezone, participant email), manage the report code, see everything. GitHub's own permissions enforce this — nobody else can touch settings. |
| **Participant** | Whoever you share the dashboard link with | See the dashboard and report ✅ success / ❌ slip (with an optional note) right on the page, using a report code you give them once. Nothing else. |

## How it works

| Piece | What it does |
|---|---|
| **Dashboard** (`index.html`, GitHub Pages) | Live progress: money earned, streaks, per-day calendar, earnings chart — plus the check-in panel. |
| **In-page check-in** | The participant picks ✅/❌; the page files a `daily-report` issue via the GitHub API using the report code. The code is stored only in their browser, never in this repo or the page source. |
| **Recorder** (`record-report.yml`) | Parses the check-in, updates `data/log.json`, comments the running totals, closes the issue and that day's reminder. Re-reporting a date corrects it (newest wins). Only issues authored by the owner/collaborators are accepted — the report code is the admin's token, so participant reports qualify. |
| **Nudge** (`nudge.yml`) | Every evening (18:00 UTC by default), if today is unreported: emails the participant (optional, see below) and opens a reminder issue assigned to the admin. Auto-closes once the check-in lands. |
| **Deploy** (`pages.yml`) | Every data update redeploys the dashboard automatically. |

## Admin: changing the challenge parameters

Edit [`data/config.json`](data/config.json) (the dashboard footer has a direct
"Admin: challenge settings" link):

```json
{
  "goalName": "Gluten-Free Challenge",
  "startDate": "2026-08-16",
  "endDate": "2027-02-15",
  "rewardTotal": 2000,
  "rates": { "success": 10, "partial": 3, "slip": 0 },
  "currency": "USD",
  "timezone": "UTC",
  "participant": "dy-trydiy",
  "participantEmail": ""
}
```

- Daily rates are fixed amounts from `rates` (if `rates` is omitted, the success rate falls
  back to `rewardTotal ÷ days` and partial to half). Changing rates, dates, or the bonus
  mid-challenge re-prices every day, past and future — set the terms up front.
- `participant` is a display name (it doesn't need to be a GitHub account).
- `timezone` (IANA name, e.g. `Europe/Berlin`) defines what "today" means. The nudge hour
  is the cron line in `.github/workflows/nudge.yml` (UTC).
- Only repo collaborators can edit this file, so parameters are admin-only by construction.

## Admin: creating the participant's report code

The report code is a **fine-grained personal access token** that can do exactly one thing:
write issues in this repo.

1. GitHub → your avatar → **Settings → Developer settings → Personal access tokens →
   Fine-grained tokens → Generate new token**.
2. Name it `progress-tracker-report`, set expiration past the challenge end date.
3. **Repository access**: *Only select repositories* → this repo.
4. **Permissions → Repository permissions → Issues: Read and write**. Nothing else.
5. Generate, copy the token, and send it to the participant over a private channel
   (not in a public place — anyone holding it could file issues in this repo).
6. The participant opens the dashboard, and the check-in panel asks for the code once;
   it's remembered in their browser (there's a "forget code" link to remove it).

Lost or leaked? Revoke the token in the same settings screen and issue a new one —
nothing else changes.

## Admin: email nudge for the participant (optional)

The participant has no GitHub account, so reminders reach them by email:

1. Set `participantEmail` in `data/config.json`.
2. Repo **Settings → Secrets and variables → Actions → New repository secret**, add:
   - `MAIL_USERNAME` — a Gmail address to send from (yours works),
   - `MAIL_PASSWORD` — an [app password](https://myaccount.google.com/apppasswords) for it
     (requires 2-step verification; a normal password won't work).
3. Done — every evening an unreported day triggers an email with a dashboard link.

Without these secrets the nudge still opens a reminder issue assigned to the admin, so you
can pass the reminder along yourself.

## Daily use (participant)

Open the dashboard, tap **✅ Success**, **🌓 Partial**, or **❌ Slip**, optionally add a note, and
**Record this day**. The date field lets you backfill a missed day; re-recording a date
corrects it. The page confirms and refreshes itself when the data lands (a minute or two).

Dashboard: `https://<owner>.github.io/Progress-tracker/`

## One-time setup (already done for this repo)

1. Settings → Pages → Source: **GitHub Actions**.
2. Push to `main` → the dashboard deploys automatically.
3. Admin: Watch the repo (Issues) to get reminder notifications.
