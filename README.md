# life-gamification

A tiny XP / level / streak backend for iPhone Shortcuts to log against. You
define "actions" (habits), Shortcuts call this API when you complete one,
and it tracks XP, your overall level, and daily streaks per action.

## Setup

```bash
npm install
cp .env.example .env   # then edit .env and set a real API_KEY
npm start
```

The server listens on `PORT` (default 3000). All `/api/*` routes require an
`x-api-key` header matching `API_KEY` in `.env`.

To run it somewhere your iPhone can reach it: expose it on your LAN, put it
behind a tunnel (e.g. Cloudflare Tunnel, Tailscale), or deploy it to a small
host (Render, Fly.io, a VPS). Shortcuts just needs a URL and your API key.

## API

- `POST /api/actions` — create a habit type: `{ "name": "workout", "xpValue": 20 }`
- `GET /api/actions` — list habit types
- `POST /api/log` — log a completion: `{ "action": "workout" }` → awards XP,
  updates the streak, returns updated level/XP/streak. Logging the same
  action twice in one day is a no-op (no double XP).
- `GET /api/stats` — current level, XP progress, and streak per action

## Wiring up a Shortcut

1. Create one Shortcut per habit (e.g. "Log Workout").
2. Add a **Get Contents of URL** action:
   - URL: `https://your-host/api/log`
   - Method: `POST`
   - Headers: `x-api-key: <your API_KEY>`, `Content-Type: application/json`
   - Request Body (JSON): `{ "action": "workout" }`
3. Add a **Show Notification** (or **Show Result**) action showing fields
   from the response, e.g. `Level \(level) — \(streak) day streak!`
4. Optionally trigger it via Siri ("Hey Siri, log workout"), a Home Screen
   icon, or a time/location-based Automation.

For a stats-check Shortcut, point **Get Contents of URL** at `GET /api/stats`
with the same header and display the JSON fields you care about.
