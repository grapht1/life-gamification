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
See [Deployment](#deployment) below for a Docker-based path.

## API

- `POST /api/actions` — create a habit type: `{ "name": "workout", "xpValue": 20 }`
- `GET /api/actions` — list habit types
- `POST /api/log` — log a completion: `{ "action": "workout" }` → awards XP,
  updates the streak, returns updated level/XP/streak. Logging the same
  action twice in one day is a no-op (no double XP).
- `GET /api/stats` — current level, XP progress, and streak per action

## Wiring up a Shortcut

Shortcuts can't be authored as a text file you drop into a repo — the
`.shortcut` format is a signed plist that only the Shortcuts app can
produce, and one built by hand outside the app isn't reliably importable.
The steps below are exact enough to recreate in the Shortcuts app in a
couple of minutes.

### "Log Workout" (one Shortcut per habit)

1. Shortcuts app → **+** → name it "Log Workout".
2. Add **Get Contents of URL**:
   - URL: `https://your-host/api/log`
   - Method: `POST`
   - Headers: `x-api-key` → `<your API_KEY>`, `Content-Type` → `application/json`
   - Request Body: **JSON**, add field `action` (Text) → `workout`
3. Add **Get Dictionary from Input**, input = the previous action's result.
4. Add **Get Dictionary Value** for key `level`, then again for `streak`,
   `xpAwarded`, and `alreadyLoggedToday` (four separate Get Dictionary Value
   actions, each reading from the dictionary in step 3).
5. Add **Show Notification** (or **Show Result**) with text:
   `+\(xpAwarded) XP · Level \(level) · \(streak) day streak`
   — tap each `\(...)` placeholder and insert the matching Get Dictionary
   Value action's output as a variable.
6. Optional: rename the Shortcut so Siri picks it up automatically
   ("Hey Siri, Log Workout"), or add it to your Home Screen / Action Button.

Duplicate this Shortcut per habit, only changing the `action` value in step 2
and the notification wording.

### "Log Habit" (one Shortcut, pick from a menu)

If you'd rather have a single Shortcut for all habits instead of one per
habit:

1. Add **Get Contents of URL** → `GET https://your-host/api/actions`,
   header `x-api-key`.
2. **Get Dictionary Value** for key `actions` (a list of `{name, xpValue}`).
3. **Repeat with Each** over that list → inside the loop, **Get Dictionary
   Value** for key `name` → **Add to Variable** (`habitNames`).
4. After the loop, **Choose from Menu** using `habitNames` as the menu items.
5. In each menu case (or using the chosen item directly as input), **Get
   Contents of URL** → `POST https://your-host/api/log` with JSON body
   `{ "action": "<chosen menu item>" }`.
6. **Show Notification** as in the single-habit version above.

### "My Stats"

1. **Get Contents of URL** → `GET https://your-host/api/stats`, header
   `x-api-key`.
2. **Get Dictionary Value** for `level`, `totalXp`, `xpForNextLevel`.
3. **Show Result** with text:
   `Level \(level) — \(totalXp)/\(xpForNextLevel) XP to next level`

## Deployment

A `Dockerfile` and `docker-compose.yml` are included so the API can run
anywhere Docker does (a VPS, a home server, Fly.io, Render's Docker deploys,
etc.). SQLite data is written to `/data/data.sqlite` inside the container,
bind-mounted to `./data` on the host so it survives restarts/rebuilds.

```bash
cp .env.example .env   # set a real API_KEY
docker compose up -d --build
```

The API is then reachable at `http://<host>:3000`. Point your Shortcuts at
that host — over Tailscale/Cloudflare Tunnel for a home server, or the
provider's public hostname for Fly.io/Render/a VPS. Since Shortcuts sends
your API key in a header on every request, prefer an HTTPS endpoint (a
tunnel or your hosting provider's TLS termination) over plain HTTP if the
traffic leaves your LAN.

To deploy without Docker, just `npm install --omit=dev && npm start` on
any host with Node 20+, setting `PORT`, `API_KEY`, and optionally `DB_PATH`
via environment variables.
