# QDrop

Shared music queue app for parties, gyms, offices, and any shared speaker setup.

## Stack

- Frontend: React 18 + TypeScript + Vite
- Routing: Wouter with hash-based routes
- Styling: Tailwind CSS + shadcn/ui
- Backend: Express 5 + TypeScript
- Realtime: native `ws` WebSocket server
- Database: PostgreSQL + Drizzle ORM
- Package manager: npm
- Build output: Vite client build in `dist/public`, bundled Node server in `dist/index.cjs`

## Production Gaps That Were Fixed

- Local scripts are now cross-platform, so `npm run dev` works on Windows too.
- Server-side env loading now uses `.env` via `dotenv/config`.
- Frontend can now target a separate backend with `VITE_API_BASE_URL`.
- Backend now supports optional CORS for Vercel-to-Render deployments.
- Spotify OAuth redirects now return to the frontend URL via `PUBLIC_APP_URL`.
- Database config now fails fast if `DATABASE_URL` is missing and supports hosted Postgres SSL.

## Local Setup

1. Install dependencies:

```bash
npm install
```

2. Copy the example env file to `.env` and fill in your values:

```bash
copy .env.example .env
```

3. Set `DATABASE_URL` to either:

- Local Postgres: `postgres://postgres:postgres@localhost:5432/qdrop`
- Hosted Postgres: `postgres://user:password@host/database?sslmode=require`

4. Apply the schema:

```bash
npm run db:push
```

5. Start the app:

```bash
npm run dev
```

The app runs at [http://localhost:5000](http://localhost:5000).

## Environment Variables

### Required for local and production

- `DATABASE_URL`: PostgreSQL connection string
- `NODE_ENV`: `development` or `production`

### Usually required in production

- `PUBLIC_APP_URL`: public frontend URL used after Spotify OAuth callback
- `CLIENT_ORIGIN`: allowed frontend origin for CORS, for example `https://your-app.vercel.app`
- `DATABASE_SSL`: set to `true` for hosted Postgres if your connection string needs SSL

### Optional

- `PORT`: defaults to `5000`
- `SPOTIFY_CLIENT_ID`
- `SPOTIFY_CLIENT_SECRET`
- `SPOTIFY_REDIRECT_URI`
- `VITE_API_BASE_URL`: frontend-only API base URL, for example `https://your-api.onrender.com`

## Scripts

- `npm run dev`: start Express with Vite middleware for local development
- `npm run build`: build both client and server for production
- `npm run build:client`: build only the frontend, used by Vercel
- `npm run start`: run the built server from `dist/index.cjs`
- `npm run check`: run TypeScript type-checking
- `npm run db:push`: apply the Drizzle schema to PostgreSQL

## Recommended Free Deployment

This app already has a working Express backend and already uses PostgreSQL. Because of that, switching to MongoDB Atlas would add unnecessary rewrite work. The simplest stable free setup is:

- Frontend: Vercel Hobby
- Backend: Render free web service
- Database: Neon free Postgres

Why this setup:

- Vercel is a good fit for the Vite frontend.
- Render supports a long-running Node server and WebSockets.
- Neon keeps the existing PostgreSQL + Drizzle stack intact.

For the exact website-side setup steps, use [DEPLOYMENT.md](/D:/coding/projects/spotify-QDrop/DEPLOYMENT.md).

## Deploy Frontend on Vercel

Use the repo root as the project root.

Set these project settings:

- Build Command: `npm run build:client`
- Output Directory: `dist/public`
- Install Command: `npm install`

Set this environment variable in Vercel:

- `VITE_API_BASE_URL=https://your-render-service.onrender.com`

The included `vercel.json` already sets the build command and output directory.

## Deploy Backend on Render

Use the repo root as the service root. The included `render.yaml` sets the main configuration.

Runtime settings:

- Build Command: `npm ci && npm run build && npm run db:push`
- Start Command: `npm start`
- Health Check Path: `/api/health`

Environment variables to set in Render:

- `NODE_ENV=production`
- `DATABASE_URL=postgres://...`
- `DATABASE_SSL=true`
- `PUBLIC_APP_URL=https://your-vercel-app.vercel.app`
- `CLIENT_ORIGIN=https://your-vercel-app.vercel.app`
- `SPOTIFY_CLIENT_ID=...` optional
- `SPOTIFY_CLIENT_SECRET=...` optional
- `SPOTIFY_REDIRECT_URI=https://your-render-service.onrender.com/api/spotify/callback` optional unless Spotify playback is enabled

For Spotify, add this redirect URI in the Spotify developer dashboard:

- `https://your-render-service.onrender.com/api/spotify/callback`

Set Spotify secrets only in your local `.env` or the Render dashboard. Do not commit real values into the repository.

## Create the Database

Use a free Neon Postgres project and copy the pooled or direct connection string into `DATABASE_URL`.

If Neon provides an SSL-enabled URL, keep `?sslmode=require` on the URL and set:

- `DATABASE_SSL=true`

After adding the connection string, run:

```bash
npm run db:push
```

## Project Structure

```text
client/          React frontend
server/          Express API, Spotify OAuth, WebSocket server
shared/          Shared Drizzle schema and inferred types
script/build.ts  Production build script
render.yaml      Render backend config
vercel.json      Vercel frontend config
```

## Notes

- Render free web services spin down after 15 minutes of inactivity.
- Vercel Hobby is free for personal and small-scale use.
- Guests can use the app without Spotify. The host needs Spotify credentials and a Premium account for real playback.

## License

MIT
