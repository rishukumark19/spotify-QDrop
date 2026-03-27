# QDrop

QDrop is a shared music queue app for real rooms: gyms, parties, offices, studios, and anywhere one device controls the speakers while everyone else wants input.

The host creates a room, shares a QR code or room code, and guests join from their own phone to add tracks. Spotify is only required on the host side for real playback.

## What It Does

- Create a live room with a short join code
- Let guests join from a phone without taking over the host device
- Search songs and add them to a shared queue
- Limit each guest to 3 queued songs
- Show queue updates in real time with WebSockets
- Connect Spotify on the host device for real playback
- Control play, pause, and skip from the host view

## Product Model

- Guests do not need Spotify login
- The host connects one Spotify Premium account
- Search can still work without host auth through Spotify client-credentials or fallback mock data
- Real playback requires:
  - valid Spotify credentials on the backend
  - a host Spotify login
  - an active playback device in the host browser

## Stack

- Frontend: React 18 + TypeScript + Vite
- Routing: Wouter with hash-based routes
- Styling: Tailwind CSS + shadcn/ui
- Backend: Express 5 + TypeScript
- Realtime: native `ws`
- Database: PostgreSQL + Drizzle ORM
- Build output:
  - client: `dist/public`
  - server: `dist/index.cjs`

## Project Structure

```text
client/          React frontend
server/          Express API, Spotify OAuth, WebSocket server
shared/          Shared Drizzle schema and inferred types
script/build.ts  Production build script
render.yaml      Render backend config
vercel.json      Vercel frontend config
```

## Quick Start

### Option 1: Run fast without caring about Spotify yet

This is the fastest way to test the UI and room flow.

1. Install dependencies:

```bash
npm install
```

2. Copy env file:

```bash
copy .env.example .env
```

3. Start the app:

```bash
npm run dev
```

4. Open:

```text
http://127.0.0.1:5000
```

Notes:
- If local Postgres is unavailable, the app now falls back to in-memory storage for local development.
- Room creation, joining, and queue behavior still work in this mode.
- Real Spotify playback will not work until credentials and Spotify auth are configured.

### Option 2: Full local setup with Spotify

1. Install dependencies:

```bash
npm install
```

2. Copy env file:

```bash
copy .env.example .env
```

3. Set up environment variables:

- `SPOTIFY_CLIENT_ID`
- `SPOTIFY_CLIENT_SECRET`
- `SPOTIFY_REDIRECT_URI=http://127.0.0.1:5000/api/spotify/callback`
- `PUBLIC_APP_URL=http://127.0.0.1:5000`
- `CLIENT_ORIGIN=http://127.0.0.1:5000,http://localhost:5000`

4. If using Postgres, set:

- `DATABASE_URL=postgres://postgres:postgres@localhost:5432/qdrop`

5. Apply schema:

```bash
npm run db:push
```

6. Start app:

```bash
npm run dev
```

7. In Spotify Developer Dashboard:

- add redirect URI:
  - `http://127.0.0.1:5000/api/spotify/callback`
- if the app is in Development mode, add your Spotify account as a test user

## Environment Variables

### Core

- `NODE_ENV`: `development` or `production`
- `PORT`: defaults to `5000`
- `PUBLIC_APP_URL`: frontend URL used after Spotify OAuth callback
- `CLIENT_ORIGIN`: allowed frontend origin(s), comma-separated

### Database

- `DATABASE_URL`: PostgreSQL connection string
- `DATABASE_SSL`: `true` when hosted Postgres requires SSL

### Spotify

- `SPOTIFY_CLIENT_ID`
- `SPOTIFY_CLIENT_SECRET`
- `SPOTIFY_REDIRECT_URI`

### Frontend API Targeting

- `VITE_API_BASE_URL`

Use `VITE_API_BASE_URL` when the frontend and backend run on different hosts, such as:
- frontend on Vercel
- backend on Render

## Scripts

- `npm run dev`: start Express with Vite middleware for local development
- `npm run build`: build both client and server for production
- `npm run build:client`: build only the frontend
- `npm run start`: run the production server from `dist/index.cjs`
- `npm run check`: TypeScript type-check
- `npm run db:push`: apply Drizzle schema

## Local Development Notes

- Use `127.0.0.1` instead of `localhost` for Spotify redirect URIs when testing locally
- If port `5000` is busy:

```powershell
$env:PORT='5001'
npm run dev
```

- If you change `.env`, restart the server fully
- Guests can still test queue behavior without Spotify auth
- Spotify auth success is not enough by itself; the host also needs a playback device active in-browser

## Deployment

Recommended split:

- Frontend: Vercel
- Backend: Render
- Database: Neon Postgres

Why this setup:

- Vercel fits the Vite frontend well
- Render handles the long-running Express server and WebSockets
- Neon keeps the current PostgreSQL + Drizzle architecture intact

For detailed deployment steps, use [DEPLOYMENT.md](D:/coding/projects/spotify-QDrop/DEPLOYMENT.md).

### Vercel Frontend

Use the repo root as project root.

Settings:

- Build Command: `npm run build:client`
- Output Directory: `dist/public`
- Install Command: `npm install`

Set:

- `VITE_API_BASE_URL=https://your-render-service.onrender.com`

### Render Backend

Use the repo root as service root.

Settings:

- Build Command: `npm ci && npm run build && npm run db:push`
- Start Command: `npm start`
- Health Check Path: `/api/health`

Set:

- `NODE_ENV=production`
- `DATABASE_URL=postgres://...`
- `DATABASE_SSL=true`
- `PUBLIC_APP_URL=https://qdrop.live`
- `CLIENT_ORIGIN=https://qdrop.live,https://www.qdrop.live`
- `SPOTIFY_CLIENT_ID=...`
- `SPOTIFY_CLIENT_SECRET=...`
- `SPOTIFY_REDIRECT_URI=https://spotify-qdrop.onrender.com/api/spotify/callback`

### Spotify Production Requirement

Spotify redirect URIs must match exactly.

Example production callback:

```text
https://spotify-qdrop.onrender.com/api/spotify/callback
```

If the Spotify app stays in Development mode:
- the Spotify account used for login must be explicitly added as a test user

## Recent Production Fixes

- local room creation now works even if Postgres is unavailable
- Spotify callback failures are now logged more clearly
- Spotify token expiry is stored in Unix seconds so it fits the current Postgres integer column
- host route sanitizes room codes so auth query strings do not corrupt the UI
- homepage includes working `How It Works` and `About Us` links

## Known Operational Gotchas

- Render free services may cold start
- Vercel Hobby can block auto deploys if the committer cannot be matched to the owning GitHub/Vercel account
- Spotify login failures are often caused by one of:
  - wrong client secret
  - redirect URI mismatch
  - missing Spotify test-user access
  - backend failing to save token state

## License

MIT
