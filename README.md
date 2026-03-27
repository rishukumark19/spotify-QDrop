# 🎵 QDrop: The Venue-Grade Shared Music Queue

**QDrop** is not just a Spotify wrapper. It's a full-stack, real-time "social brain" for your speakers, designed for shared spaces where one person owns the audio but everyone wants a say.

Whether it's a **gym, café, office, or a house party**, QDrop bridges the gap between the host's Premium account and the crowd's requests—without requiring guests to even have a Spotify account.

---

## 🚀 Why QDrop? (Beyond Spotify Jam)

> [!TIP]
> **v1.1 Update: Listen Along is here!**
> We've just upgraded QDrop to support **Remote Synchronization**. Now, remote guests can connect their own Spotify accounts to a room and listen to the host's playback in real-time. Whether it's a long-distance jam or a private radio show, QDrop keeps everyone in sync.

While Spotify Jam is great for small groups of friends with Premium accounts, QDrop is built for **venues and public spaces**.

| Feature | Spotify Jam | QDrop |
| :--- | :---: | :---: |
| **Guest Requirements** | Spotify App + Account | **Mobile Browser Only** |
| **Account Tier** | Usually Premium for all | **Only Host needs Premium** |
| **Moderation** | Limited | **Host-only controls & limits** |
| **Fairness** | Auto-ordered | **Custom per-user queue limits** |
| **Public Use** | Difficult to manage | **QR Code + Join Code ready** |
| **Persistence** | Dissolves after session | **Trackable room history & stats** |

---

## 🔥 Killer Use-Cases

1.  **🏋️ Gym / Café Request Box**: Put a QR code on the wall. Customers drop songs without logging in. The host uses smart filters to keep the vibe clean.
2.  **🕙 Office Focus Radio**: Teammates suggest songs, but the host maintains control to avoid repeats and enforce "lo-fi only" focus blocks.
3.  **🏠 Flatmate / Hostel Speaker**: A persistent room with play history and soft limits so one person can’t hijack the queue all night.
4.  **🎮 Gaming / Discord Rooms**: Remote groups can sync the vibe while only the "Streamer" needs the actual playback active.
5.  **🎧 Listen Along (New!)**: Remote guests can sync their own Spotify accounts to the host's session, perfect for "Remote Jams" or shared listening parties.

---

## ✨ Core Capabilities

### 🛠️ The Product Model: Owner ≠ Audience
QDrop models a **DJ + Crowd** dynamic. 
- **The Host**: Connects one Spotify Premium account to power the real audio. They control volume, skipping, and room settings from a dedicated dashboard.
- **The Guests**: Join via a short code or QR. They can search the entire Spotify catalog and add songs without any login or app installation.

### 🧠 Smart Features
- **Listen Along Mode**: Optional real-time playback synchronization for remote guests.
- **Real-Time Synchronization**: Powered by native WebSockets for instant queue updates across all devices.
- **Fairness Engine**: Hard limits on guest contributions (e.g., max 3 songs per guest) to ensure everyone gets a turn.
- **Auth-Free Search**: Guests can search for tracks using Spotify's catalog even if the host hasn't authenticated yet (via client-credentials fallback).
- **Resilient Infrastructure**: Automatic fallback to in-memory storage if the database is unavailable for local development.

---

## 🛠️ Tech Stack & Architecture

QDrop is a production-minded project with a single-repo, multi-package feel.

- **Frontend**: React 18 + TypeScript + Vite (Fast, typed, and modern)
- **Styling**: Tailwind CSS + shadcn/ui + **Framer Motion** (Premium, highly animated interface)
- **Backend**: Express 5 + TypeScript (Robust API & OAuth handling)
- **Database**: PostgreSQL + Drizzle ORM (Type-safe migrations and queries)
- **Real-Time**: Native `ws` (Lowest latency for queue updates)
- **Infra**: Designed for the Vercel (Frontend) + Render (Backend) + Neon (DB) split.

---

## 🛤️ Roadmap: Moving Beyond the "Control Wrapper"
- [x] **Listen Along Sync (v1.1)**: Real-time playback synchronization for remote listeners.
- [ ] **Guest Device Picker (v1.2)**: Allow guests to choose their sync device (phone, browser, or desktop).
- [ ] **Advanced Listener Stats**: Real-time count of "Synced" vs "Control-only" guests in the room header.
- [ ] **Host "Hard Sync"**: A dedicated button to force a resync across all remote listeners.
- [ ] **Smart Fairness Queue**: Round-robin weighting so everyone gets a turn automatically.
- [ ] **Live Voting Bar**: Songs float up/down based on guest votes.
- [ ] **Vibe Meter**: Visual energy/danceability metrics of the current queue.
- [ ] **Room Presets**: Quick-start modes for "Physical Venue" vs "Remote DJ Session".
- [ ] **Scheduled Sessions**: Set a room to go live at a future time.

---

## 🏁 Quick Start

### ⚡ Option 1: Fast Start (No Spotify required)
The fastest way to test the UI and room flow.
1. `npm install`
2. `copy .env.example .env`
3. `npm run dev`
4. Open `http://127.0.0.1:5000`

### 🎧 Option 2: Full Local Setup (Spotify Playback)
1. Follow Option 1.
2. Create an app in the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard).
3. Set your `.env` variables (IDs, Secrets, and Redirects).
4. Run `npm run db:push` to apply the schema.
5. Add your Spotify account as a **Test User** in the Spotify dashboard.

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/rishukumark19/spotify-QDrop)

---

## 🛡️ License
MIT. Built with ❤️ for better shared audio.
