# Krillion local snapshots

JSON storage for the Krillion answers module (MVP). No database required.

## Layout

- `latest.json` — newest official game-date snapshot (used by the today page)
- `index.json` — archive index (only useful dates are listed for UI)
- `days/YYYY-MM-DD.json` — per-day snapshot with prompts, answers, optional popularity

## Refresh

```bash
node scripts/fetch-krillion.js
```

Optional lock (manual/cron only):

```bash
set KRILLION_REQUIRE_TOKEN=1
set KRILLION_REFRESH_TOKEN=your-secret
node scripts/fetch-krillion.js --token your-secret
```

Suggested cadence while pending: 15m / 30m / 60m, then every few hours. Do not poll the upstream APIs from the public website.

## Tests

```bash
node scripts/__tests__/test-krillion.js
```
