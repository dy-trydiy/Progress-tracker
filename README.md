# Progress Tracker

A reward-based habit tracker: set a goal (e.g. *six months gluten-free*), a total reward
(e.g. **$2,000**), and self-report every day. Every clean day earns an equal share of the
reward; a slip day simply isn't counted — no penalties, no resets. The whole thing runs on
GitHub: Issues for check-ins, Actions for the nudge and data updates, Pages for a shareable
dashboard.

## How it works

| Piece | What it does |
|---|---|
| **Dashboard** (`index.html`) | Live progress page on GitHub Pages: money earned, streaks, a per-day calendar, an earnings chart. Share its URL with anyone. |
| **Daily check-in** (issue form) | You open a [pre-filled issue](../../issues/new?template=daily-report.yml), pick ✅ Success or ❌ Slip, optionally add a note, and submit. Takes ~10 seconds, works great from the GitHub mobile app. |
| **Recorder** (`record-report.yml`) | An Action parses the check-in, updates `data/log.json`, replies with your running totals, closes the issue, and closes that day's reminder. |
| **Nudge** (`nudge.yml`) | A scheduled Action checks every evening whether today was reported. If not, it opens a reminder issue assigned to you — GitHub notifies you by email/app push. |
| **Deploy** (`pages.yml`) | Every data update redeploys the dashboard automatically. |

## One-time setup

1. **Enable GitHub Pages**: repo **Settings → Pages → Source: GitHub Actions**.
2. **Merge/push this to `main`** — the first deploy runs automatically. The dashboard lives at
   `https://<owner>.github.io/Progress-tracker/`.
3. **Turn on notifications** for this repo (Watch → All activity, or at least Issues) so the
   nudge reaches your phone/inbox.
4. Optionally run the **Daily check-in nudge** workflow once manually (Actions tab →
   *Daily check-in nudge* → Run workflow) to see a reminder appear.

## Configure your goal

Everything lives in [`data/config.json`](data/config.json):

```json
{
  "goalName": "Gluten-Free Challenge",
  "startDate": "2026-08-16",
  "endDate": "2027-02-15",
  "rewardTotal": 2000,
  "currency": "USD",
  "timezone": "UTC",
  "participant": "dy-trydiy"
}
```

- The per-day reward is `rewardTotal ÷ number of days` — with the dates above, **$10.87/day**.
- `timezone` (an IANA name like `Europe/Berlin`) controls what "today" means for check-ins
  and nudges. Also adjust the cron time in `.github/workflows/nudge.yml` (it's in UTC) to
  your preferred evening reminder hour.
- `participant` is the GitHub username that gets assigned the reminder issues.

## Daily use

- **Report**: open [New daily check-in](../../issues/new?template=daily-report.yml), pick the
  result, submit. Leave the date blank for today, or set `YYYY-MM-DD` to backfill a missed day.
- **Fix a mistake**: submit the form again for the same date — the newer report wins. You can
  also edit the body of a previous check-in issue; it will be re-processed.
- Only the repo owner and collaborators can record check-ins; reports from anyone else are ignored.

## Sharing

The dashboard is a public read-only page — send the Pages URL to whoever is holding the reward
(or cheering you on). They don't need a GitHub account.
