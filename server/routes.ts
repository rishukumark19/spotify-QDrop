import type { Express, Request } from "express";
import { type Server } from "http";
import { storage } from "./storage";
import { z } from "zod";
import { WebSocketServer, WebSocket } from "ws";

// Spotify credentials from environment
const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID || "";
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET || "";
const SPOTIFY_REDIRECT_URI = process.env.SPOTIFY_REDIRECT_URI?.trim() || "";
const TOKEN_EXPIRY_BUFFER_SECONDS = 60;

function getUnixTimeSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

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

// WebSocket room subscriptions (using socket IDs)
const roomSubscriptions = new Map<string, Map<string, WebSocket>>();

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

// Global heartbeat for Listen Along
setInterval(async () => {
  for (const [roomCode, subs] of roomSubscriptions.entries()) {
    if (subs.size === 0) continue;

    try {
      const room = await storage.getRoomByCode(roomCode);
      if (!room || !room.listenAlongEnabled || !room.isPlaying) {
        // Still send stats even if not playing
        const stats = await storage.getListenerStats(roomCode);
        broadcastToRoom(roomCode, { type: "stats", ...stats });
        continue;
      }

      const current = await storage.getNowPlaying(roomCode);
      if (!current || !current.startedAt || !current.spotifyUri) {
        const stats = await storage.getListenerStats(roomCode);
        broadcastToRoom(roomCode, { type: "stats", ...stats });
        continue;
      }

      const positionMs = current.initialPositionMs! + (Date.now() - current.startedAt.getTime());
      const stats = await storage.getListenerStats(roomCode);

      broadcastToRoom(roomCode, {
        type: "heartbeat",
        trackId: current.spotifyUri,
        expectedPositionMs: positionMs,
        isPlaying: true,
        stats
      });
    } catch (err) {
      console.error(`Heartbeat error for room ${roomCode}:`, err);
    }
  }
}, 5000);

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

  // Stored as unix seconds so it fits in the existing integer column.
  if (room.spotifyTokenExpiry && getUnixTimeSeconds() > (room.spotifyTokenExpiry - TOKEN_EXPIRY_BUFFER_SECONDS)) {
    if (room.spotifyRefreshToken) {
      const refreshed = await refreshSpotifyToken(room.spotifyRefreshToken);
      if (refreshed) {
        await storage.updateRoomSpotifyToken(
          roomCode,
          refreshed.access_token,
          room.spotifyRefreshToken,
          getUnixTimeSeconds() + refreshed.expires_in
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
    const socketId = Math.random().toString(36).substring(2, 11);
    (ws as any).id = socketId;

    if (!roomCode) {
      ws.close();
      return;
    }

    if (!roomSubscriptions.has(roomCode)) {
      roomSubscriptions.set(roomCode, new Map());
    }
    
    // Check max listeners
    storage.getRoomByCode(roomCode).then(room => {
      const subs = roomSubscriptions.get(roomCode)!;
      if (room && room.maxListeners && subs.size >= room.maxListeners) {
        ws.send(JSON.stringify({ type: "error", message: "Room is full (max listeners reached)" }));
        ws.close();
        return;
      }
      
      subs.set(socketId, ws);

      // Initial listener tracking
      storage.upsertListener({
        roomCode,
        socketId,
        status: "synced",
      });
    });

    ws.on("message", async (msg) => {
      try {
        const data = JSON.parse(msg.toString());
        if (data.type === "listener_status") {
          await storage.upsertListener({
            roomCode,
            socketId,
            status: data.status, // synced | catching_up | failed | control_only
            deviceId: data.deviceId,
            deviceName: data.deviceName
          });
        }
      } catch (err) {
        console.error("WS Message error:", err);
      }
    });

    ws.on("close", async () => {
      const subs = roomSubscriptions.get(roomCode);
      if (subs) {
        subs.delete(socketId);
        if (subs.size === 0) roomSubscriptions.delete(roomCode);
      }
      await storage.removeListenerBySocketId(socketId);
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
        getUnixTimeSeconds() + tokenData.expires_in
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

  // Guest Spotify Login callback (for Listen Along)
  app.get("/api/spotify/guest-callback", async (req, res) => {
    // This is for guests who want to listen along on their own Spotify
    // We don't save their token to the DB, they keep it in their local storage
    const code = req.query.code as string;
    const roomCode = (req.query.state as string)?.toUpperCase();
    const redirectUri = `${getRequestOrigin(req)}/api/spotify/guest-callback`;
    const publicAppUrl = getPublicAppUrl(req);

    if (!code) return res.redirect(`${publicAppUrl}/#/?error=auth_failed`);

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

      if (!tokenRes.ok) return res.redirect(`${publicAppUrl}/#/room/${roomCode}?error=token_failed`);

      const tokenData = await tokenRes.json();
      // Redirect back with the token in the hash (fragment) so the client can save it
      // In a real app, we might use a session or a more secure way, but this is simple for v1
      res.redirect(`${publicAppUrl}/#/room/${roomCode}?guest_token=${tokenData.access_token}&expires_in=${tokenData.expires_in}`);
    } catch (err) {
      res.redirect(`${publicAppUrl}/#/room/${roomCode}?error=auth_error`);
    }
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
    const schema = z.object({
      name: z.string().min(1).max(50),
      mode: z.enum(["default", "listen_along"]).optional(),
      listenAlongEnabled: z.boolean().optional(),
      maxListeners: z.number().nullable().optional(),
      roomType: z.enum(["in_room", "remote_listen_along", "scheduled"]).optional(),
    });
    const body = schema.safeParse(_req.body);
    if (!body.success) return res.status(400).json({ error: "Invalid room data" });

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
      mode: body.data.mode || "default",
      listenAlongEnabled: body.data.listenAlongEnabled || false,
      isPlaying: false,
      maxListeners: body.data.maxListeners || null,
      roomType: body.data.roomType || "remote_listen_along",
    });
    res.json(room);
  });

  app.patch("/api/rooms/:code/mode", async (req, res) => {
    const code = req.params.code.toUpperCase();
    const schema = z.object({
      mode: z.enum(["default", "listen_along"]),
      listenAlongEnabled: z.boolean(),
    });
    const body = schema.safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: "Invalid mode data" });

    await storage.updateRoomMode(code, body.data.mode, body.data.listenAlongEnabled);
    broadcastToRoom(code, { type: "room_update" });
    res.json({ success: true });
  });

  app.patch("/api/rooms/:code/settings", async (req, res) => {
    const code = req.params.code.toUpperCase();
    const schema = z.object({
      maxListeners: z.number().nullable().optional(),
      roomType: z.enum(["in_room", "remote_listen_along", "scheduled"]).optional(),
    });
    const body = schema.safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: "Invalid settings data" });

    await storage.updateRoomSettings(code, body.data);
    broadcastToRoom(code, { type: "room_update" });
    res.json({ success: true });
  });

  app.post("/api/rooms/:code/resync", async (req, res) => {
    const code = req.params.code.toUpperCase();
    const room = await storage.getRoomByCode(code);
    if (!room) return res.status(404).json({ error: "Room not found" });

    const current = await storage.getNowPlaying(code);
    if (!current || !current.startedAt) return res.status(400).json({ error: "Nothing playing" });

    const positionMs = current.initialPositionMs! + (Date.now() - current.startedAt.getTime());
    
    broadcastToRoom(code, {
      type: "resync",
      trackId: current.spotifyUri,
      expectedPositionMs: positionMs,
    });

    res.json({ success: true });
  });

  app.get("/api/rooms/:code/listeners", async (req, res) => {
    const listeners = await storage.getListeners(req.params.code.toUpperCase());
    res.json(listeners);
  });

  app.get("/api/rooms/:code", async (req, res) => {
    const room = await storage.getRoomByCode(req.params.code.toUpperCase());
    if (!room) return res.status(404).json({ error: "Room not found" });
    const stats = await storage.getListenerStats(room.code);
    // Don't send tokens to the client
    res.json({
      id: room.id,
      code: room.code,
      name: room.name,
      isActive: room.isActive,
      mode: room.mode,
      roomType: room.roomType,
      maxListeners: room.maxListeners,
      listenAlongEnabled: room.listenAlongEnabled,
      isPlaying: room.isPlaying,
      hasSpotify: !!room.spotifyToken,
      hasDevice: !!room.spotifyDeviceId,
      stats
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
      // Resume playback
      if (room.spotifyToken && room.spotifyDeviceId && current.spotifyUri) {
        await spotifyResume(room.spotifyToken, room.spotifyDeviceId);
      }
      await storage.updateRoomPlaybackState(roomCode, true);
      // When resuming, we need to update startedAt to now - current position
      // For simplicity, we just keep current startedAt if it was paused
      // But we should track pause/resume properly. For v1, resume from start of the pause.
      await storage.updateEntryStatus(current.id, "playing", new Date(), current.initialPositionMs || 0);
      
      broadcastToRoom(roomCode, { type: "playback_update" });
      return res.json({ nowPlaying: current });
    }

    const next = await storage.skipToNext(roomCode);
    if (next) {
      await storage.updateRoomPlaybackState(roomCode, true);
      if (room.spotifyToken && room.spotifyDeviceId && next.spotifyUri) {
        await spotifyPlay(room.spotifyToken, room.spotifyDeviceId, next.spotifyUri);
      }
    }

    broadcastToRoom(roomCode, { type: "playback_update" });
    res.json({ nowPlaying: next || null });
  });

  app.post("/api/rooms/:code/pause", async (req, res) => {
    const roomCode = req.params.code.toUpperCase();
    const room = await storage.getRoomByCode(roomCode);
    if (!room) return res.status(404).json({ error: "Room not found" });

    const current = await storage.getNowPlaying(roomCode);
    if (current && current.startedAt) {
      const positionMs = current.initialPositionMs! + (Date.now() - current.startedAt.getTime());
      await storage.updateEntryStatus(current.id, "playing", new Date(0), positionMs); // Set startedAt to far past to stop calculation
    }

    await storage.updateRoomPlaybackState(roomCode, false);
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
    if (next) {
      await storage.updateRoomPlaybackState(roomCode, true);
      if (room.spotifyToken && room.spotifyDeviceId && next.spotifyUri) {
        await spotifyPlay(room.spotifyToken, room.spotifyDeviceId, next.spotifyUri);
      }
    } else {
      await storage.updateRoomPlaybackState(roomCode, false);
    }

    broadcastToRoom(roomCode, { type: "playback_update" });
    res.json({ nowPlaying: next || null });
  });

  return httpServer;
}
