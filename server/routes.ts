import type { Express, Request } from "express";
import { type Server } from "http";
import { storage } from "./storage";
import { z } from "zod";
import { WebSocketServer, WebSocket } from "ws";

// Spotify credentials from environment
const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID || "";
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET || "";
const SPOTIFY_REDIRECT_URI = process.env.SPOTIFY_REDIRECT_URI?.trim() || "";

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function getRequestOrigin(req: Request): string {
  return trimTrailingSlash(`${req.protocol}://${req.get("host")}`);
}

function getPublicAppUrl(req: Request): string {
  const configured = process.env.PUBLIC_APP_URL?.trim();
  return trimTrailingSlash(configured || getRequestOrigin(req));
}

function getSpotifyRedirectUri(req: Request): string {
  return trimTrailingSlash(SPOTIFY_REDIRECT_URI || `${getRequestOrigin(req)}/api/spotify/callback`);
}

function generateRoomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 5; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

// Format milliseconds to m:ss
function formatMs(ms: number): string {
  const totalSecs = Math.floor(ms / 1000);
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

// WebSocket room subscriptions
const roomSubscriptions = new Map<string, Set<WebSocket>>();

function broadcastToRoom(roomCode: string, data: object) {
  const subs = roomSubscriptions.get(roomCode);
  if (!subs) return;
  const msg = JSON.stringify(data);
  subs.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(msg);
    }
  });
}

// Spotify API helpers
async function spotifySearchTracks(query: string, token: string): Promise<any[]> {
  const res = await fetch(
    `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=8`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) return [];
  const data = await res.json();
  return (data.tracks?.items || []).map((t: any) => ({
    title: t.name,
    artist: t.artists.map((a: any) => a.name).join(", "),
    albumArt: t.album?.images?.[1]?.url || t.album?.images?.[0]?.url || "",
    duration: formatMs(t.duration_ms),
    spotifyUri: t.uri,
  }));
}

async function spotifyPlay(token: string, deviceId: string, uri: string): Promise<boolean> {
  const res = await fetch(
    `https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`,
    {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ uris: [uri] }),
    }
  );
  return res.ok || res.status === 204;
}

async function spotifyPause(token: string, deviceId: string): Promise<boolean> {
  const res = await fetch(
    `https://api.spotify.com/v1/me/player/pause?device_id=${deviceId}`,
    {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  return res.ok || res.status === 204;
}

async function spotifyResume(token: string, deviceId: string): Promise<boolean> {
  const res = await fetch(
    `https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`,
    {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  return res.ok || res.status === 204;
}

async function refreshSpotifyToken(refreshToken: string): Promise<{ access_token: string; expires_in: number } | null> {
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString("base64")}`,
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });
  if (!res.ok) return null;
  return res.json();
}

async function getValidToken(roomCode: string): Promise<string | null> {
  const room = await storage.getRoomByCode(roomCode);
  if (!room?.spotifyToken) return null;

  // Check if token is expired (with 60s buffer)
  if (room.spotifyTokenExpiry && Date.now() > (room.spotifyTokenExpiry - 60000)) {
    if (room.spotifyRefreshToken) {
      const refreshed = await refreshSpotifyToken(room.spotifyRefreshToken);
      if (refreshed) {
        await storage.updateRoomSpotifyToken(
          roomCode,
          refreshed.access_token,
          room.spotifyRefreshToken,
          Date.now() + refreshed.expires_in * 1000
        );
        return refreshed.access_token;
      }
    }
    return null;
  }
  return room.spotifyToken;
}

// Client credentials token for search (doesn't need user auth)
let clientCredToken: string | null = null;
let clientCredExpiry = 0;

async function getClientCredentialsToken(): Promise<string | null> {
  if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET) return null;
  if (clientCredToken && Date.now() < clientCredExpiry - 60000) return clientCredToken;

  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString("base64")}`,
    },
    body: new URLSearchParams({ grant_type: "client_credentials" }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  clientCredToken = data.access_token;
  clientCredExpiry = Date.now() + data.expires_in * 1000;
  return clientCredToken;
}

const MAX_SONGS_PER_USER = 3;

// Fallback mock songs if no Spotify credentials
const MOCK_SONGS = [
  { title: "Blinding Lights", artist: "The Weeknd", albumArt: "", duration: "3:20", spotifyUri: "" },
  { title: "Levitating", artist: "Dua Lipa", albumArt: "", duration: "3:23", spotifyUri: "" },
  { title: "Stay", artist: "The Kid LAROI, Justin Bieber", albumArt: "", duration: "2:21", spotifyUri: "" },
  { title: "Lose Yourself", artist: "Eminem", albumArt: "", duration: "5:26", spotifyUri: "" },
  { title: "Stronger", artist: "Kanye West", albumArt: "", duration: "5:11", spotifyUri: "" },
  { title: "Eye of the Tiger", artist: "Survivor", albumArt: "", duration: "4:05", spotifyUri: "" },
  { title: "Till I Collapse", artist: "Eminem ft. Nate Dogg", albumArt: "", duration: "4:57", spotifyUri: "" },
  { title: "Levels", artist: "Avicii", albumArt: "", duration: "3:18", spotifyUri: "" },
  { title: "Titanium", artist: "David Guetta ft. Sia", albumArt: "", duration: "4:05", spotifyUri: "" },
  { title: "Can't Hold Us", artist: "Macklemore & Ryan Lewis", albumArt: "", duration: "4:18", spotifyUri: "" },
  { title: "Heat Waves", artist: "Glass Animals", albumArt: "", duration: "3:58", spotifyUri: "" },
  { title: "Good 4 U", artist: "Olivia Rodrigo", albumArt: "", duration: "2:58", spotifyUri: "" },
  { title: "Butter", artist: "BTS", albumArt: "", duration: "2:44", spotifyUri: "" },
  { title: "Dynamite", artist: "BTS", albumArt: "", duration: "3:19", spotifyUri: "" },
  { title: "Watermelon Sugar", artist: "Harry Styles", albumArt: "", duration: "2:54", spotifyUri: "" },
  { title: "Power", artist: "Kanye West", albumArt: "", duration: "4:52", spotifyUri: "" },
  { title: "Remember the Name", artist: "Fort Minor", albumArt: "", duration: "3:50", spotifyUri: "" },
  { title: "Pump It", artist: "Black Eyed Peas", albumArt: "", duration: "3:33", spotifyUri: "" },
  { title: "Industry Baby", artist: "Lil Nas X, Jack Harlow", albumArt: "", duration: "3:32", spotifyUri: "" },
  { title: "Mood", artist: "24kGoldn ft. Iann Dior", albumArt: "", duration: "2:20", spotifyUri: "" },
];

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  // === WebSocket setup ===
  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });
  wss.on("connection", (ws, req) => {
    const url = new URL(req.url || "", `http://${req.headers.host}`);
    const roomCode = url.searchParams.get("room")?.toUpperCase();
    if (!roomCode) {
      ws.close();
      return;
    }

    if (!roomSubscriptions.has(roomCode)) {
      roomSubscriptions.set(roomCode, new Set());
    }
    roomSubscriptions.get(roomCode)!.add(ws);

    ws.on("close", () => {
      const subs = roomSubscriptions.get(roomCode);
      if (subs) {
        subs.delete(ws);
        if (subs.size === 0) roomSubscriptions.delete(roomCode);
      }
    });
  });

  // === Spotify config endpoint ===
  app.get("/api/spotify/config", (_req, res) => {
    res.json({
      clientId: SPOTIFY_CLIENT_ID,
      hasCredentials: !!(SPOTIFY_CLIENT_ID && SPOTIFY_CLIENT_SECRET),
    });
  });

  // === Spotify OAuth ===
  app.get("/api/spotify/auth", (req, res) => {
    const roomCode = req.query.room as string;
    if (!SPOTIFY_CLIENT_ID) {
      return res.status(400).json({ error: "Spotify credentials not configured" });
    }

    const redirectUri = getSpotifyRedirectUri(req);
    const scopes = "streaming user-read-email user-read-private user-modify-playback-state user-read-playback-state";
    const state = roomCode || "";

    const authUrl = `https://accounts.spotify.com/authorize?${new URLSearchParams({
      response_type: "code",
      client_id: SPOTIFY_CLIENT_ID,
      scope: scopes,
      redirect_uri: redirectUri,
      state,
      show_dialog: "true",
    })}`;

    res.json({ authUrl });
  });

  app.get("/api/spotify/callback", async (req, res) => {
    const code = req.query.code as string;
    const roomCode = (req.query.state as string)?.toUpperCase();
    const redirectUri = getSpotifyRedirectUri(req);
    const publicAppUrl = getPublicAppUrl(req);

    if (!code || !roomCode) {
      return res.redirect(`${publicAppUrl}/#/?error=auth_failed`);
    }

    try {
      const tokenRes = await fetch("https://accounts.spotify.com/api/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString("base64")}`,
        },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: redirectUri,
        }),
      });

      if (!tokenRes.ok) {
        const errorText = await tokenRes.text();
        console.error("Spotify token exchange failed", {
          status: tokenRes.status,
          statusText: tokenRes.statusText,
          roomCode,
          redirectUri,
          body: errorText,
        });
        return res.redirect(`${publicAppUrl}/#/host/${roomCode}?error=token_failed`);
      }

      const tokenData = await tokenRes.json();
      await storage.updateRoomSpotifyToken(
        roomCode,
        tokenData.access_token,
        tokenData.refresh_token,
        Date.now() + tokenData.expires_in * 1000
      );

      // Redirect back to host page
      res.redirect(`${publicAppUrl}/#/host/${roomCode}?spotify=connected`);
    } catch (err) {
      console.error("Spotify callback auth error", {
        roomCode,
        redirectUri,
        error: err instanceof Error ? err.message : String(err),
      });
      res.redirect(`${publicAppUrl}/#/host/${roomCode}?error=auth_error`);
    }
  });

  // Get Spotify token for client-side Web Playback SDK
  app.get("/api/rooms/:code/spotify-token", async (req, res) => {
    const code = req.params.code.toUpperCase();
    const token = await getValidToken(code);
    if (!token) return res.status(401).json({ error: "Not authenticated with Spotify" });
    res.json({ token });
  });

  // Register device ID from Web Playback SDK
  app.post("/api/rooms/:code/device", async (req, res) => {
    const code = req.params.code.toUpperCase();
    const body = z.object({ deviceId: z.string() }).safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: "Invalid device ID" });

    await storage.updateRoomDeviceId(code, body.data.deviceId);
    res.json({ success: true });
  });

  // === Room routes ===
  app.post("/api/rooms", async (_req, res) => {
    const body = z.object({ name: z.string().min(1).max(50) }).safeParse(_req.body);
    if (!body.success) return res.status(400).json({ error: "Invalid room name" });

    let code = generateRoomCode();
    while (await storage.getRoomByCode(code)) {
      code = generateRoomCode();
    }

    const room = await storage.createRoom({
      code,
      name: body.data.name,
      isActive: true,
      spotifyToken: null,
      spotifyRefreshToken: null,
      spotifyTokenExpiry: null,
      spotifyDeviceId: null,
    });
    res.json(room);
  });

  app.get("/api/rooms/:code", async (req, res) => {
    const room = await storage.getRoomByCode(req.params.code.toUpperCase());
    if (!room) return res.status(404).json({ error: "Room not found" });
    // Don't send tokens to the client
    res.json({
      id: room.id,
      code: room.code,
      name: room.name,
      isActive: room.isActive,
      hasSpotify: !!room.spotifyToken,
      hasDevice: !!room.spotifyDeviceId,
    });
  });

  // === Song search ===
  app.get("/api/songs/search", async (req, res) => {
    const q = (req.query.q as string || "").toLowerCase();
    const roomCode = (req.query.room as string || "").toUpperCase();
    if (!q || q.length < 2) return res.json([]);

    // Try Spotify search first (using user token or client credentials)
    let token = roomCode ? await getValidToken(roomCode) : null;
    if (!token) token = await getClientCredentialsToken();

    if (token) {
      const results = await spotifySearchTracks(q, token);
      if (results.length > 0) return res.json(results);
    }

    // Fallback to mock data
    const results = MOCK_SONGS.filter(
      (s) => s.title.toLowerCase().includes(q) || s.artist.toLowerCase().includes(q)
    ).slice(0, 8);
    res.json(results);
  });

  // === Queue routes ===
  app.get("/api/rooms/:code/queue", async (req, res) => {
    const room = await storage.getRoomByCode(req.params.code.toUpperCase());
    if (!room) return res.status(404).json({ error: "Room not found" });

    const queue = await storage.getQueue(room.code);
    const nowPlaying = await storage.getNowPlaying(room.code);
    res.json({ queue, nowPlaying });
  });

  app.post("/api/rooms/:code/queue", async (req, res) => {
    const roomCode = req.params.code.toUpperCase();
    const room = await storage.getRoomByCode(roomCode);
    if (!room) return res.status(404).json({ error: "Room not found" });

    const body = z.object({
      songTitle: z.string(),
      artist: z.string(),
      albumArt: z.string().nullable().optional(),
      duration: z.string().nullable().optional(),
      spotifyUri: z.string().nullable().optional(),
      addedBy: z.string(),
    }).safeParse(req.body);

    if (!body.success) return res.status(400).json({ error: "Invalid song data" });

    const count = await storage.countUserSongs(roomCode, body.data.addedBy);
    if (count >= MAX_SONGS_PER_USER) {
      return res.status(429).json({
        error: `You can only have ${MAX_SONGS_PER_USER} songs in the queue at a time`,
      });
    }

    const entry = await storage.addToQueue({
      roomCode,
      songTitle: body.data.songTitle,
      artist: body.data.artist,
      albumArt: body.data.albumArt || null,
      duration: body.data.duration || null,
      spotifyUri: body.data.spotifyUri || null,
      addedBy: body.data.addedBy,
      status: "queued",
      addedAt: new Date(),
    });

    // Broadcast queue update
    broadcastToRoom(roomCode, { type: "queue_update" });
    res.json(entry);
  });

  app.delete("/api/queue/:id", async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
    await storage.removeEntry(id);
    res.json({ success: true });
  });

  // === Playback routes ===
  app.post("/api/rooms/:code/play", async (req, res) => {
    const roomCode = req.params.code.toUpperCase();
    const room = await storage.getRoomByCode(roomCode);
    if (!room) return res.status(404).json({ error: "Room not found" });

    const current = await storage.getNowPlaying(roomCode);
    if (current) {
      // Resume playback if something is already marked as playing
      if (room.spotifyToken && room.spotifyDeviceId && current.spotifyUri) {
        await spotifyResume(room.spotifyToken, room.spotifyDeviceId);
      }
      return res.json({ nowPlaying: current });
    }

    const next = await storage.skipToNext(roomCode);
    if (next && room.spotifyToken && room.spotifyDeviceId && next.spotifyUri) {
      await spotifyPlay(room.spotifyToken, room.spotifyDeviceId, next.spotifyUri);
    }

    broadcastToRoom(roomCode, { type: "playback_update" });
    res.json({ nowPlaying: next || null });
  });

  app.post("/api/rooms/:code/pause", async (req, res) => {
    const roomCode = req.params.code.toUpperCase();
    const room = await storage.getRoomByCode(roomCode);
    if (!room) return res.status(404).json({ error: "Room not found" });

    if (room.spotifyToken && room.spotifyDeviceId) {
      await spotifyPause(room.spotifyToken, room.spotifyDeviceId);
    }

    broadcastToRoom(roomCode, { type: "playback_update" });
    res.json({ success: true });
  });

  app.post("/api/rooms/:code/skip", async (req, res) => {
    const roomCode = req.params.code.toUpperCase();
    const room = await storage.getRoomByCode(roomCode);
    if (!room) return res.status(404).json({ error: "Room not found" });

    const next = await storage.skipToNext(roomCode);
    if (next && room.spotifyToken && room.spotifyDeviceId && next.spotifyUri) {
      await spotifyPlay(room.spotifyToken, room.spotifyDeviceId, next.spotifyUri);
    }

    broadcastToRoom(roomCode, { type: "playback_update" });
    res.json({ nowPlaying: next || null });
  });

  return httpServer;
}
