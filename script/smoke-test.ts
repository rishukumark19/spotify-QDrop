import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import assert from "node:assert/strict";

type JsonRecord = Record<string, unknown>;

async function waitForHealth(baseUrl: string, timeoutMs: number): Promise<void> {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${baseUrl}/api/health`);
      if (res.ok) {
        return;
      }
    } catch {
      // Server is still starting.
    }

    await delay(500);
  }

  throw new Error(`Timed out waiting for ${baseUrl}/api/health`);
}

async function requestJson<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(input, init);
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;

  if (!res.ok) {
    throw new Error(`${init?.method || "GET"} ${input} failed with ${res.status}: ${text}`);
  }

  return data as T;
}

async function expectStatus(
  input: string,
  expectedStatus: number,
  init?: RequestInit,
): Promise<JsonRecord | null> {
  const res = await fetch(input, init);
  const text = await res.text();
  const data = text ? (JSON.parse(text) as JsonRecord) : null;

  assert.equal(
    res.status,
    expectedStatus,
    `Expected ${expectedStatus} from ${init?.method || "GET"} ${input}, received ${res.status} with body ${text}`,
  );

  return data;
}

async function main(): Promise<void> {
  const port = process.env.SMOKE_TEST_PORT || "5051";
  const baseUrl = `http://127.0.0.1:${port}`;
  const child = spawnServer(port);

  try {
    await waitForHealth(baseUrl, 20_000);

    const room = await requestJson<{ code: string; name: string }>(`${baseUrl}/api/rooms`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Smoke Test Room" }),
    });

    assert.match(room.code, /^[A-Z0-9]{5}$/);
    assert.equal(room.name, "Smoke Test Room");

    const roomDetails = await requestJson<{
      code: string;
      hasSpotify: boolean;
      hasDevice: boolean;
    }>(`${baseUrl}/api/rooms/${room.code}`);

    assert.equal(roomDetails.code, room.code);
    assert.equal(roomDetails.hasSpotify, false);
    assert.equal(roomDetails.hasDevice, false);

    const searchResults = await requestJson<Array<{ title: string; artist: string }>>(
      `${baseUrl}/api/songs/search?q=light&room=${room.code}`,
    );

    assert.ok(searchResults.length > 0, "Expected search results for fallback query");

    const songPayload = {
      songTitle: "Blinding Lights",
      artist: "The Weeknd",
      albumArt: "",
      duration: "3:20",
      spotifyUri: "",
      addedBy: "smoke-user",
    };

    for (let index = 0; index < 3; index += 1) {
      const entry = await requestJson<{ id: number; songTitle: string }>(`${baseUrl}/api/rooms/${room.code}/queue`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(songPayload),
      });

      assert.equal(entry.songTitle, "Blinding Lights");
      assert.ok(entry.id > 0);
    }

    const limitBody = await expectStatus(`${baseUrl}/api/rooms/${room.code}/queue`, 429, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(songPayload),
    });

    assert.match(String(limitBody?.error || ""), /only have 3 songs/i);

    const queueBeforePlay = await requestJson<{
      queue: Array<{ id: number }>;
      nowPlaying?: { id: number } | null;
    }>(`${baseUrl}/api/rooms/${room.code}/queue`);

    assert.equal(queueBeforePlay.queue.length, 3);
    assert.equal(queueBeforePlay.nowPlaying ?? null, null);

    const playResult = await requestJson<{ nowPlaying: { id: number } }>(`${baseUrl}/api/rooms/${room.code}/play`, {
      method: "POST",
    });

    assert.equal(playResult.nowPlaying.id, queueBeforePlay.queue[0].id);

    const afterPlay = await requestJson<{
      queue: Array<{ id: number }>;
      nowPlaying: { id: number };
    }>(`${baseUrl}/api/rooms/${room.code}/queue`);

    assert.equal(afterPlay.queue.length, 2);
    assert.equal(afterPlay.nowPlaying.id, queueBeforePlay.queue[0].id);

    const skipResult = await requestJson<{ nowPlaying: { id: number } }>(`${baseUrl}/api/rooms/${room.code}/skip`, {
      method: "POST",
    });

    assert.equal(skipResult.nowPlaying.id, afterPlay.queue[0].id);

    const afterSkip = await requestJson<{
      queue: Array<{ id: number }>;
      nowPlaying: { id: number };
    }>(`${baseUrl}/api/rooms/${room.code}/queue`);

    assert.equal(afterSkip.queue.length, 1);
    assert.equal(afterSkip.nowPlaying.id, afterPlay.queue[0].id);

    console.log("Smoke test passed");
  } finally {
    await stopServer(child);
  }
}

function spawnServer(port: string): ChildProcess {
  const child = spawn(process.execPath, ["dist/index.cjs"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: "production",
      PORT: port,
      DATABASE_URL: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  child.stdout?.on("data", (chunk) => {
    process.stdout.write(`[server] ${chunk}`);
  });

  child.stderr?.on("data", (chunk) => {
    process.stderr.write(`[server] ${chunk}`);
  });

  child.on("exit", (code) => {
    if (code && code !== 0) {
      process.stderr.write(`[server] exited with code ${code}\n`);
    }
  });

  return child;
}

async function stopServer(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.killed) {
    return;
  }

  child.kill();
  await Promise.race([
    once(child, "exit"),
    delay(5_000).then(() => {
      if (child.exitCode === null) {
        child.kill("SIGKILL");
      }
    }),
  ]);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
