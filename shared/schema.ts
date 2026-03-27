import { pgTable, text, integer, serial, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const rooms = pgTable("rooms", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  spotifyToken: text("spotify_token"),
  spotifyRefreshToken: text("spotify_refresh_token"),
  spotifyTokenExpiry: integer("spotify_token_expiry"),
  spotifyDeviceId: text("spotify_device_id"),
  mode: text("mode").notNull().default("default"), // 'default' | 'listen_along'
  listenAlongEnabled: boolean("listen_along_enabled").notNull().default(false),
  isPlaying: boolean("is_playing").notNull().default(false),
  maxListeners: integer("max_listeners"),
  roomType: text("room_type").notNull().default("remote_listen_along"), // in_room | remote_listen_along | scheduled
});

export const queueEntries = pgTable("queue_entries", {
  id: serial("id").primaryKey(),
  roomCode: text("room_code").notNull(),
  songTitle: text("song_title").notNull(),
  artist: text("artist").notNull(),
  albumArt: text("album_art"),
  duration: text("duration"),
  spotifyUri: text("spotify_uri"),
  addedBy: text("added_by").notNull(),
  status: text("status").notNull().default("queued"), // queued | playing | played
  addedAt: timestamp("added_at").notNull().defaultNow(),
  startedAt: timestamp("started_at"),
  initialPositionMs: integer("initial_position_ms").default(0),
});

export const listeners = pgTable("listeners", {
  id: serial("id").primaryKey(),
  roomCode: text("room_code").notNull(),
  socketId: text("socket_id").notNull().unique(), 
  deviceId: text("device_id"),
  deviceName: text("device_name"),
  status: text("status").notNull().default("synced"), // synced | catching_up | failed | control_only
  lastSeen: timestamp("last_seen").notNull().defaultNow(),
});

export const insertRoomSchema = createInsertSchema(rooms).omit({ id: true });
export const insertQueueEntrySchema = createInsertSchema(queueEntries).omit({ id: true });
export const insertListenerSchema = createInsertSchema(listeners).omit({ id: true });

export type InsertRoom = z.infer<typeof insertRoomSchema>;
export type Room = typeof rooms.$inferSelect;
export type InsertQueueEntry = z.infer<typeof insertQueueEntrySchema>;
export type QueueEntry = typeof queueEntries.$inferSelect;
export type InsertListener = z.infer<typeof insertListenerSchema>;
export type Listener = typeof listeners.$inferSelect;
