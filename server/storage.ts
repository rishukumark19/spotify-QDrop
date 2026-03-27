import "dotenv/config";
import {
  type Room, type InsertRoom, rooms,
  type QueueEntry, type InsertQueueEntry, queueEntries,
} from "@shared/schema";
import { eq, and, asc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";

const { Pool } = pg;

const databaseUrl = process.env.DATABASE_URL;
const hasDatabase = Boolean(databaseUrl);

const requireSsl = databaseUrl
  ? process.env.DATABASE_SSL === "true" ||
    /(?:^|[?&])sslmode=require(?:&|$)/i.test(databaseUrl)
  : false;

const pool = databaseUrl
  ? new Pool({
      connectionString: databaseUrl,
      ssl: requireSsl ? { rejectUnauthorized: false } : undefined,
    })
  : null;

export const db = pool ? drizzle(pool) : null;

export interface IStorage {
  createRoom(room: InsertRoom): Promise<Room>;
  getRoomByCode(code: string): Promise<Room | undefined>;
  updateRoomSpotifyToken(code: string, token: string, refreshToken: string | null, expiry: number): Promise<void>;
  updateRoomDeviceId(code: string, deviceId: string): Promise<void>;
  updateRoomMode(code: string, mode: string, listenAlongEnabled: boolean): Promise<void>;
  updateRoomPlaybackState(code: string, isPlaying: boolean): Promise<void>;
  getQueue(roomCode: string): Promise<QueueEntry[]>;
  addToQueue(entry: InsertQueueEntry): Promise<QueueEntry>;
  countUserSongs(roomCode: string, addedBy: string): Promise<number>;
  updateEntryStatus(id: number, status: string, startedAt?: Date, initialPositionMs?: number): Promise<void>;
  removeEntry(id: number): Promise<void>;
  getNowPlaying(roomCode: string): Promise<QueueEntry | undefined>;
  skipToNext(roomCode: string, initialPositionMs?: number): Promise<QueueEntry | undefined>;
}

export class MemoryStorage implements IStorage {
  private rooms: Room[] = [];
  private queueEntries: QueueEntry[] = [];
  private nextRoomId = 1;
  private nextQueueEntryId = 1;

  async createRoom(room: InsertRoom): Promise<Room> {
    const newRoom: Room = {
      id: this.nextRoomId++,
      code: room.code,
      name: room.name,
      isActive: room.isActive ?? true,
      spotifyToken: room.spotifyToken ?? null,
      spotifyRefreshToken: room.spotifyRefreshToken ?? null,
      spotifyTokenExpiry: room.spotifyTokenExpiry ?? null,
      spotifyDeviceId: room.spotifyDeviceId ?? null,
      mode: room.mode ?? "default",
      listenAlongEnabled: room.listenAlongEnabled ?? false,
      isPlaying: room.isPlaying ?? false,
    };

    this.rooms.push(newRoom);
    return newRoom;
  }

  async updateRoomMode(code: string, mode: string, listenAlongEnabled: boolean): Promise<void> {
    const room = await this.getRoomByCode(code);
    if (!room) return;
    room.mode = mode;
    room.listenAlongEnabled = listenAlongEnabled;
  }

  async updateRoomPlaybackState(code: string, isPlaying: boolean): Promise<void> {
    const room = await this.getRoomByCode(code);
    if (!room) return;
    room.isPlaying = isPlaying;
  }

  async getRoomByCode(code: string): Promise<Room | undefined> {
    return this.rooms.find((room) => room.code === code);
  }

  async updateRoomSpotifyToken(code: string, token: string, refreshToken: string | null, expiry: number): Promise<void> {
    const room = await this.getRoomByCode(code);
    if (!room) return;
    room.spotifyToken = token;
    room.spotifyRefreshToken = refreshToken;
    room.spotifyTokenExpiry = expiry;
  }

  async updateRoomDeviceId(code: string, deviceId: string): Promise<void> {
    const room = await this.getRoomByCode(code);
    if (!room) return;
    room.spotifyDeviceId = deviceId;
  }

  async getQueue(roomCode: string): Promise<QueueEntry[]> {
    return this.queueEntries
      .filter((entry) => entry.roomCode === roomCode && entry.status === "queued")
      .sort((a, b) => a.addedAt.getTime() - b.addedAt.getTime());
  }

  async addToQueue(entry: InsertQueueEntry): Promise<QueueEntry> {
    const newEntry: QueueEntry = {
      id: this.nextQueueEntryId++,
      roomCode: entry.roomCode,
      songTitle: entry.songTitle,
      artist: entry.artist,
      albumArt: entry.albumArt ?? null,
      duration: entry.duration ?? null,
      spotifyUri: entry.spotifyUri ?? null,
      addedBy: entry.addedBy,
      status: entry.status ?? "queued",
      addedAt: entry.addedAt ?? new Date(),
      startedAt: null,
      initialPositionMs: 0,
    };

    this.queueEntries.push(newEntry);
    return newEntry;
  }

  async countUserSongs(roomCode: string, addedBy: string): Promise<number> {
    return this.queueEntries.filter(
      (entry) =>
        entry.roomCode === roomCode &&
        entry.addedBy === addedBy &&
        entry.status === "queued",
    ).length;
  }

  async updateEntryStatus(id: number, status: string, startedAt?: Date, initialPositionMs?: number): Promise<void> {
    const entry = this.queueEntries.find((queueEntry) => queueEntry.id === id);
    if (!entry) return;
    entry.status = status;
    if (startedAt !== undefined) entry.startedAt = startedAt;
    if (initialPositionMs !== undefined) entry.initialPositionMs = initialPositionMs;
  }

  async removeEntry(id: number): Promise<void> {
    this.queueEntries = this.queueEntries.filter((entry) => entry.id !== id);
  }

  async getNowPlaying(roomCode: string): Promise<QueueEntry | undefined> {
    return this.queueEntries.find(
      (entry) => entry.roomCode === roomCode && entry.status === "playing",
    );
  }

  async skipToNext(roomCode: string, initialPositionMs: number = 0): Promise<QueueEntry | undefined> {
    const current = await this.getNowPlaying(roomCode);
    if (current) {
      await this.updateEntryStatus(current.id, "played");
    }

    const next = this.queueEntries
      .filter((entry) => entry.roomCode === roomCode && entry.status === "queued")
      .sort((a, b) => a.addedAt.getTime() - b.addedAt.getTime())[0];

    if (next) {
      await this.updateEntryStatus(next.id, "playing", new Date(), initialPositionMs);
    }

    return next;
  }
}

export class DatabaseStorage implements IStorage {
  async createRoom(room: InsertRoom): Promise<Room> {
    if (!db) {
      throw new Error("Database is not configured");
    }

    const [newRoom] = await db.insert(rooms).values(room).returning();
    return newRoom;
  }

  async getRoomByCode(code: string): Promise<Room | undefined> {
    if (!db) {
      throw new Error("Database is not configured");
    }

    const [room] = await db.select().from(rooms).where(eq(rooms.code, code));
    return room;
  }

  async updateRoomSpotifyToken(code: string, token: string, refreshToken: string | null, expiry: number): Promise<void> {
    if (!db) {
      throw new Error("Database is not configured");
    }

    await db.update(rooms)
      .set({ spotifyToken: token, spotifyRefreshToken: refreshToken, spotifyTokenExpiry: expiry })
      .where(eq(rooms.code, code));
  }

  async updateRoomDeviceId(code: string, deviceId: string): Promise<void> {
    if (!db) {
      throw new Error("Database is not configured");
    }

    await db.update(rooms)
      .set({ spotifyDeviceId: deviceId })
      .where(eq(rooms.code, code));
  }

  async updateRoomMode(code: string, mode: string, listenAlongEnabled: boolean): Promise<void> {
    if (!db) {
      throw new Error("Database is not configured");
    }

    await db.update(rooms)
      .set({ mode, listenAlongEnabled })
      .where(eq(rooms.code, code));
  }

  async updateRoomPlaybackState(code: string, isPlaying: boolean): Promise<void> {
    if (!db) {
      throw new Error("Database is not configured");
    }

    await db.update(rooms)
      .set({ isPlaying })
      .where(eq(rooms.code, code));
  }

  async getQueue(roomCode: string): Promise<QueueEntry[]> {
    if (!db) {
      throw new Error("Database is not configured");
    }

    return await db
      .select()
      .from(queueEntries)
      .where(and(eq(queueEntries.roomCode, roomCode), eq(queueEntries.status, "queued")))
      .orderBy(asc(queueEntries.addedAt));
  }

  async addToQueue(entry: InsertQueueEntry): Promise<QueueEntry> {
    if (!db) {
      throw new Error("Database is not configured");
    }

    const [newEntry] = await db.insert(queueEntries).values(entry).returning();
    return newEntry;
  }

  async countUserSongs(roomCode: string, addedBy: string): Promise<number> {
    if (!db) {
      throw new Error("Database is not configured");
    }

    const results = await db
      .select()
      .from(queueEntries)
      .where(
        and(
          eq(queueEntries.roomCode, roomCode),
          eq(queueEntries.addedBy, addedBy),
          eq(queueEntries.status, "queued")
        )
      );
    return results.length;
  }

  async updateEntryStatus(id: number, status: string, startedAt?: Date, initialPositionMs?: number): Promise<void> {
    if (!db) {
      throw new Error("Database is not configured");
    }

    const updateData: any = { status };
    if (startedAt !== undefined) updateData.startedAt = startedAt;
    if (initialPositionMs !== undefined) updateData.initialPositionMs = initialPositionMs;

    await db.update(queueEntries).set(updateData).where(eq(queueEntries.id, id));
  }

  async removeEntry(id: number): Promise<void> {
    if (!db) {
      throw new Error("Database is not configured");
    }

    await db.delete(queueEntries).where(eq(queueEntries.id, id));
  }

  async getNowPlaying(roomCode: string): Promise<QueueEntry | undefined> {
    if (!db) {
      throw new Error("Database is not configured");
    }

    const [entry] = await db
      .select()
      .from(queueEntries)
      .where(and(eq(queueEntries.roomCode, roomCode), eq(queueEntries.status, "playing")));
    return entry;
  }

  async skipToNext(roomCode: string, initialPositionMs: number = 0): Promise<QueueEntry | undefined> {
    if (!db) {
      throw new Error("Database is not configured");
    }

    const current = await this.getNowPlaying(roomCode);
    if (current) {
      await this.updateEntryStatus(current.id, "played");
    }
    const [next] = await db
      .select()
      .from(queueEntries)
      .where(and(eq(queueEntries.roomCode, roomCode), eq(queueEntries.status, "queued")))
      .orderBy(asc(queueEntries.addedAt))
      .limit(1);
    if (next) {
      await this.updateEntryStatus(next.id, "playing", new Date(), initialPositionMs);
    }
    return next;
  }
}

export const storage: IStorage = hasDatabase ? new DatabaseStorage() : new MemoryStorage();
