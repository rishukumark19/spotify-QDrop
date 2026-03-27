import "dotenv/config";
import {
  type Room, type InsertRoom, rooms,
  type QueueEntry, type InsertQueueEntry, queueEntries,
} from "@shared/schema";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
const { Pool } = pg;
import { eq, and, asc } from "drizzle-orm";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required. Copy .env.example to .env and set your Postgres connection string.");
}

const requireSsl =
  process.env.DATABASE_SSL === "true" ||
  /(?:^|[?&])sslmode=require(?:&|$)/i.test(databaseUrl);

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: requireSsl ? { rejectUnauthorized: false } : undefined,
});

export const db = drizzle(pool);

export interface IStorage {
  createRoom(room: InsertRoom): Promise<Room>;
  getRoomByCode(code: string): Promise<Room | undefined>;
  updateRoomSpotifyToken(code: string, token: string, refreshToken: string, expiry: number): Promise<void>;
  updateRoomDeviceId(code: string, deviceId: string): Promise<void>;
  getQueue(roomCode: string): Promise<QueueEntry[]>;
  addToQueue(entry: InsertQueueEntry): Promise<QueueEntry>;
  countUserSongs(roomCode: string, addedBy: string): Promise<number>;
  updateEntryStatus(id: number, status: string): Promise<void>;
  removeEntry(id: number): Promise<void>;
  getNowPlaying(roomCode: string): Promise<QueueEntry | undefined>;
  skipToNext(roomCode: string): Promise<QueueEntry | undefined>;
}

export class DatabaseStorage implements IStorage {
  async createRoom(room: InsertRoom): Promise<Room> {
    const [newRoom] = await db.insert(rooms).values(room).returning();
    return newRoom;
  }

  async getRoomByCode(code: string): Promise<Room | undefined> {
    const [room] = await db.select().from(rooms).where(eq(rooms.code, code));
    return room;
  }

  async updateRoomSpotifyToken(code: string, token: string, refreshToken: string, expiry: number): Promise<void> {
    await db.update(rooms)
      .set({ spotifyToken: token, spotifyRefreshToken: refreshToken, spotifyTokenExpiry: expiry })
      .where(eq(rooms.code, code));
  }

  async updateRoomDeviceId(code: string, deviceId: string): Promise<void> {
    await db.update(rooms)
      .set({ spotifyDeviceId: deviceId })
      .where(eq(rooms.code, code));
  }

  async getQueue(roomCode: string): Promise<QueueEntry[]> {
    return await db
      .select()
      .from(queueEntries)
      .where(and(eq(queueEntries.roomCode, roomCode), eq(queueEntries.status, "queued")))
      .orderBy(asc(queueEntries.addedAt));
  }

  async addToQueue(entry: InsertQueueEntry): Promise<QueueEntry> {
    const [newEntry] = await db.insert(queueEntries).values(entry).returning();
    return newEntry;
  }

  async countUserSongs(roomCode: string, addedBy: string): Promise<number> {
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

  async updateEntryStatus(id: number, status: string): Promise<void> {
    await db.update(queueEntries).set({ status }).where(eq(queueEntries.id, id));
  }

  async removeEntry(id: number): Promise<void> {
    await db.delete(queueEntries).where(eq(queueEntries.id, id));
  }

  async getNowPlaying(roomCode: string): Promise<QueueEntry | undefined> {
    const [entry] = await db
      .select()
      .from(queueEntries)
      .where(and(eq(queueEntries.roomCode, roomCode), eq(queueEntries.status, "playing")));
    return entry;
  }

  async skipToNext(roomCode: string): Promise<QueueEntry | undefined> {
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
      await this.updateEntryStatus(next.id, "playing");
    }
    return next;
  }
}

export const storage = new DatabaseStorage();
