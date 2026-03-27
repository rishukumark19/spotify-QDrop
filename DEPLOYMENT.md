# Deployment

This project is configured for the simplest live setup that matches the current codebase:

- Frontend: Vercel Hobby
- Backend: Render free web service
- Database: Neon free Postgres

This keeps the existing stack intact:

- React + Vite frontend
- Express + WebSocket backend
- PostgreSQL + Drizzle

## Current Production Shape

- Frontend: Vercel, custom domain `qdrop.live`
- Backend: Render web service
- Database: Neon Postgres
- Spotify OAuth callback: Render backend URL

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

Render will pick up [render.yaml](./render.yaml).

### Render environment variables

Set these in the Render dashboard:

```text
NODE_ENV=production
DATABASE_URL=<your Neon connection string>
DATABASE_SSL=true
PUBLIC_APP_URL=https://qdrop.live
CLIENT_ORIGIN=https://qdrop.live,https://www.qdrop.live
SPOTIFY_CLIENT_ID=<your spotify client id>
SPOTIFY_CLIENT_SECRET=<your spotify client secret>
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

The Vercel project is already created and serving the frontend.

The repo already includes [vercel.json](/D:/coding/projects/spotify-QDrop/vercel.json), so the frontend should use:

- Build command: `npm run build:client`
- Output directory: `dist/public`

### Vercel environment variable

Set this in Vercel:

```text
VITE_API_BASE_URL=https://<your-render-service>.onrender.com
```

The custom domains already added to the project are:

```text
https://qdrop.live
https://www.qdrop.live
```

At your DNS provider, point both hosts to Vercel:

```text
A qdrop.live 76.76.21.21
A www.qdrop.live 76.76.21.21
```

After Render is live, keep Vercel pointing to that backend through `VITE_API_BASE_URL`.

## 4. Spotify Dashboard

In the Spotify developer dashboard:

1. Keep your app credentials in Render only.
2. Add this production Redirect URI exactly:

```text
https://<your-render-service>.onrender.com/api/spotify/callback
```

For local testing, register this loopback redirect too:

```text
http://127.0.0.1:5000/api/spotify/callback
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
SPOTIFY_REDIRECT_URI=http://127.0.0.1:5000/api/spotify/callback
PUBLIC_APP_URL=http://127.0.0.1:5000
CLIENT_ORIGIN=http://127.0.0.1:5000
VITE_API_BASE_URL=
```

## Validation Order

Use this order:

1. `npm run check`
2. `npm run build`
3. `npm run db:push`
4. `npm run dev`
5. Verify `http://127.0.0.1:5000/api/health`
6. Deploy Render
7. Deploy Vercel
8. Update Spotify redirect URI
9. Test room creation, queue updates, and Spotify connect
