# Deployment

This project is configured for the simplest live setup that matches the current codebase:

- Frontend: Vercel Hobby
- Backend: Render free web service
- Database: Neon free Postgres

This keeps the existing stack intact:

- React + Vite frontend
- Express + WebSocket backend
- PostgreSQL + Drizzle

## What You Need To Do On Websites

You still need to do these website-side actions yourself:

1. Create a Neon project and copy the Postgres connection string.
2. Create a Render web service from this GitHub repo.
3. Create a Vercel project from this GitHub repo.
4. Rotate your Spotify client secret if the old one was exposed.
5. Add the correct Spotify redirect URI in the Spotify developer dashboard.

## 1. Neon

Create a Neon project and database named `qdrop`.

Use the connection string in this shape:

```env
DATABASE_URL=postgres://USERNAME:PASSWORD@HOST/qdrop?sslmode=require
DATABASE_SSL=true
```

Keep the Neon URL private. Do not commit it.

## 2. Render Backend

Create a new Render Web Service:

- Repo: `rishukumark19/spotify-QDrop`
- Branch: `main`
- Runtime: `Node`
- Instance type: `Free`

Render will pick up [render.yaml](/D:/coding/projects/spotify-QDrop/render.yaml).

### Render environment variables

Set these in the Render dashboard:

```text
NODE_ENV=production
DATABASE_URL=<your Neon connection string>
DATABASE_SSL=true
PUBLIC_APP_URL=https://<your-vercel-project>.vercel.app
CLIENT_ORIGIN=https://<your-vercel-project>.vercel.app
SPOTIFY_CLIENT_ID=<your spotify client id>
SPOTIFY_CLIENT_SECRET=<your rotated spotify client secret>
SPOTIFY_REDIRECT_URI=https://<your-render-service>.onrender.com/api/spotify/callback
```

### Notes

- Render free web services spin down after 15 minutes of inactivity.
- Render recommends pre-deploy commands for migrations. This repo already uses:

```text
preDeployCommand: npm run db:push
```

After the first successful deploy, copy your backend URL:

```text
https://<your-render-service>.onrender.com
```

## 3. Vercel Frontend

Create a Vercel project from the same GitHub repo.

The repo already includes [vercel.json](/D:/coding/projects/spotify-QDrop/vercel.json), so the frontend should use:

- Build command: `npm run build:client`
- Output directory: `dist/public`

### Vercel environment variable

Set this in Vercel:

```text
VITE_API_BASE_URL=https://<your-render-service>.onrender.com
```

After deploy, copy your frontend URL:

```text
https://<your-vercel-project>.vercel.app
```

Then update Render:

```text
PUBLIC_APP_URL=https://<your-vercel-project>.vercel.app
CLIENT_ORIGIN=https://<your-vercel-project>.vercel.app
```

Redeploy Render once after those are set.

## 4. Spotify Dashboard

In the Spotify developer dashboard:

1. Rotate the client secret if needed.
2. Add this Redirect URI exactly:

```text
https://<your-render-service>.onrender.com/api/spotify/callback
```

For local testing, also keep:

```text
http://localhost:5000/api/spotify/callback
```

## 5. Local Environment

Your local `.env` should contain at minimum:

```env
NODE_ENV=development
PORT=5000
DATABASE_URL=<your local or Neon Postgres URL>
DATABASE_SSL=true
SPOTIFY_CLIENT_ID=<your spotify client id>
SPOTIFY_CLIENT_SECRET=<your spotify client secret>
SPOTIFY_REDIRECT_URI=http://localhost:5000/api/spotify/callback
PUBLIC_APP_URL=http://localhost:5000
CLIENT_ORIGIN=http://localhost:5000
VITE_API_BASE_URL=
```

## Validation Order

Use this order:

1. `npm run check`
2. `npm run build`
3. `npm run db:push`
4. `npm run dev`
5. Verify `http://localhost:5000/api/health`
6. Deploy Render
7. Deploy Vercel
8. Update Spotify redirect URI
9. Test room creation, queue updates, and Spotify connect
