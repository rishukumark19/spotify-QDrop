import { useState, useEffect, useRef } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Search,
  Plus,
  Music,
  ListMusic,
  ArrowLeft,
  X,
  Headphones,
  Settings,
} from "lucide-react";
import type { QueueEntry } from "@shared/schema";
import { AppFooter } from "@/components/AppFooter";
import { useRoomWebSocket } from "@/hooks/use-websocket";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Tablet,
  Monitor,
  Smartphone,
  Volume2,
  CheckCircle2,
  RotateCcw,
  Speaker,
} from "lucide-react";
import { AboutOverlay } from "@/components/AboutOverlay";

function sanitizeRoomCode(value?: string) {
  return (value || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5);
}

function generateUserId(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let id = "user_";
  for (let i = 0; i < 8; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

const sessionUserId = generateUserId();

function SoundBars() {
  return (
    <div className="flex items-end gap-[2px] h-4">
      <div className="w-[3px] bg-primary rounded-full soundbar-1" />
      <div className="w-[3px] bg-primary rounded-full soundbar-2" />
      <div className="w-[3px] bg-primary rounded-full soundbar-3" />
      <div className="w-[3px] bg-primary rounded-full soundbar-4" />
    </div>
  );
}

function AlbumArt({ src, size = "w-10 h-10" }: { src?: string | null; size?: string }) {
  if (src) {
    return (
      <img
        src={src}
        alt=""
        className={`${size} rounded object-cover shrink-0`}
        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
      />
    );
  }
  return (
    <div className={`${size} rounded bg-card flex items-center justify-center shrink-0`}>
      <Music className="w-4 h-4 text-muted-foreground" />
    </div>
  );
}

interface Song {
  title: string;
  artist: string;
  albumArt: string;
  duration: string;
  spotifyUri: string;
}

export default function Room() {
  const params = useParams<{ code: string }>();
  const code = sanitizeRoomCode(params.code);
  const [, navigate] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [guestToken, setGuestToken] = useState<string | null>(localStorage.getItem(`spotify_token_${code}`));
  const [joinMode, setJoinMode] = useState<"control" | "listen" | null>(null);
  const [activeDeviceName, setActiveDeviceName] = useState<string | null>(null);
  const [isFirstVisit, setIsFirstVisit] = useState(false);
  const [isSynced, setIsSynced] = useState(false);

  useEffect(() => {
    const visited = localStorage.getItem("qdrop_visited");
    if (!visited) {
      setIsFirstVisit(true);
      localStorage.setItem("qdrop_visited", "true");
    }
  }, []);
  const lastSyncRef = useRef<number>(0);

  // Parse token from URL if returned from callback
  useEffect(() => {
    const hash = window.location.hash || "";
    const queryString = hash.includes("?") ? hash.slice(hash.indexOf("?") + 1) : "";
    const searchParams = new URLSearchParams(queryString || window.location.search);
    const token = searchParams.get("guest_token");
    if (token) {
      setGuestToken(token);
      localStorage.setItem(`spotify_token_${code}`, token);
      setJoinMode("listen");
      // Clean URL: Keep the hash path but remove params
      const cleanHash = hash.split("?")[0];
      window.history.replaceState(null, "", cleanHash);
    } else if (guestToken) {
      setJoinMode("listen");
    }
  }, [code, guestToken]);

  const [listenerStats, setListenerStats] = useState({ synced: 0, controlOnly: 0 });
  const [availableDevices, setAvailableDevices] = useState<any[]>([]);
  const [showDevicePicker, setShowDevicePicker] = useState(false);

  // WebSocket for real-time updates
  const { sendMessage } = useRoomWebSocket(code, (data) => {
    if (data.type === "queue_update" || data.type === "playback_update" || data.type === "room_update") {
      queryClient.invalidateQueries({ queryKey: ["/api/rooms", code] });
      queryClient.invalidateQueries({ queryKey: ["/api/rooms", code, "queue"] });
    } else if (data.type === "heartbeat") {
      if (data.stats) setListenerStats(data.stats);

      if (guestToken && data.isPlaying && joinMode === "listen") {
        const now = Date.now();
        // Sync every 5s for better real-time feel
        if (now - lastSyncRef.current > 5000) {
          syncToHost(data.trackId, data.expectedPositionMs);
          lastSyncRef.current = now;
        }
      }
    } else if (data.type === "stats") {
      setListenerStats({ synced: data.synced, controlOnly: data.controlOnly });
    } else if (data.type === "resync" && guestToken && joinMode === "listen") {
      syncToHost(data.trackId, data.expectedPositionMs, true);
    }
  });

  const reportStatus = (status: string, deviceId?: string, deviceName?: string) => {
    sendMessage({
      type: "listener_status",
      status,
      deviceId,
      deviceName
    });
  };

  const fetchDevices = async () => {
    if (!guestToken) return;
    try {
      const res = await fetch("https://api.spotify.com/v1/me/player/devices", {
        headers: { Authorization: `Bearer ${guestToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        setAvailableDevices(data.devices || []);
      }
    } catch (err) {
      console.error("Error fetching devices:", err);
    }
  };

  useEffect(() => {
    if (guestToken && joinMode === "listen") {
      fetchDevices();
      reportStatus("synced");
    } else if (joinMode === "control") {
      reportStatus("control_only");
    }
  }, [guestToken, joinMode]);

  const syncToHost = async (trackId: string, positionMs: number, force = false) => {
    if (!guestToken || joinMode !== "listen") return;
    try {
      const res = await fetch("https://api.spotify.com/v1/me/player", {
        headers: { Authorization: `Bearer ${guestToken}` },
      });

      if (res.status === 401) {
        setGuestToken(null);
        localStorage.removeItem(`spotify_token_${code}`);
        reportStatus("failed");
        return;
      }

      if (res.status === 204) {
        reportStatus("control_only");
        return;
      }

      const data = await res.json();
      const currentTrackId = data.item?.uri;
      const currentPosition = data.progress_ms;
      const drift = Math.abs(currentPosition - positionMs);
      const deviceId = data.device?.id;
      const deviceName = data.device?.name;
      setActiveDeviceName(deviceName || null);

      if (currentTrackId !== trackId || drift > 3000 || force) {
        reportStatus("catching_up", deviceId, deviceName);

        const playRes = await fetch("https://api.spotify.com/v1/me/player/play" + (deviceId ? `?device_id=${deviceId}` : ""), {
          method: "PUT",
          headers: { Authorization: `Bearer ${guestToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({ uris: [trackId], position_ms: Math.floor(positionMs) }),
        });

        if (playRes.ok) {
          setIsSynced(true);
          reportStatus("synced", deviceId, deviceName);
        } else {
          setIsSynced(false);
          reportStatus("failed", deviceId, deviceName);
        }
      } else {
        setIsSynced(true);
        reportStatus("synced", deviceId, deviceName);
      }
    } catch (err) {
      console.error("Sync error:", err);
      reportStatus("failed");
    }
  };

  const selectDevice = async (deviceId: string) => {
    if (!guestToken) return;
    try {
      const res = await fetch("https://api.spotify.com/v1/me/player", {
        method: "PUT",
        headers: { Authorization: `Bearer ${guestToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ device_ids: [deviceId], play: true }),
      });
      if (res.ok) {
        setShowDevicePicker(false);
        setTimeout(() => syncToHost(nowPlaying?.spotifyUri || "", 0, true), 1000);
      }
    } catch (err) {
      console.error("Device select error:", err);
    }
  };

  const getDeviceIcon = (type: string) => {
    switch (type.toLowerCase()) {
      case "computer": return <Monitor className="w-4 h-4" />;
      case "smartphone": return <Smartphone className="w-4 h-4" />;
      case "tablet": return <Tablet className="w-4 h-4" />;
      default: return <Volume2 className="w-4 h-4" />;
    }
  };

  const connectSpotify = async () => {
    try {
      const res = await apiRequest("GET", `/api/spotify/auth?room=${code}&guest=true`);
      const { authUrl } = await res.json();
      window.location.href = authUrl;
    } catch (err) { console.error("Guest auth failed", err); }
  };

  const roomQuery = useQuery<{
    id: number;
    code: string;
    name: string;
    isActive: boolean;
    mode: string;
    roomType: string;
    maxListeners: number | null;
    listenAlongEnabled: boolean;
    isPlaying: boolean;
    hasSpotify: boolean;
    stats?: { synced: number; controlOnly: number };
  }>({
    queryKey: ["/api/rooms", code],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/rooms/${code}`);
      const data = await res.json();
      if (data.stats) setListenerStats(data.stats);
      return data;
    },
    enabled: code.length >= 4,
  });

  const queueQuery = useQuery<{ queue: QueueEntry[]; nowPlaying: QueueEntry | null }>({
    queryKey: ["/api/rooms", code, "queue"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/rooms/${code}/queue`);
      return res.json();
    },
    enabled: code.length >= 4 && !!roomQuery.data,
    refetchInterval: 5000,
  });

  const searchResults = useQuery<Song[]>({
    queryKey: ["/api/songs/search", searchQuery, code],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/songs/search?q=${encodeURIComponent(searchQuery)}&room=${code}`);
      return res.json();
    },
    enabled: searchQuery.length >= 2,
  });

  const addSong = useMutation({
    mutationFn: async (song: Song) => {
      const res = await apiRequest("POST", `/api/rooms/${code}/queue`, {
        songTitle: song.title,
        artist: song.artist,
        albumArt: song.albumArt,
        duration: song.duration,
        spotifyUri: song.spotifyUri,
        addedBy: sessionUserId,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rooms", code, "queue"] });
      setSearchQuery("");
      setIsSearching(false);
    },
  });

  const removeSong = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/queue/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rooms", code, "queue"] });
    },
  });

  const roomData = roomQuery.data;
  const queue = queueQuery.data?.queue || [];
  const nowPlaying = queueQuery.data?.nowPlaying;
  const mySongsInQueue = queue.filter((e) => e.addedBy === sessionUserId).length;

  const resyncMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", `/api/rooms/${code}/resync`);
    }
  });

  if (roomQuery.isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (roomQuery.isError || !roomData) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6">
        <Music className="w-12 h-12 text-muted-foreground mb-4" />
        <h2 className="text-lg font-semibold text-foreground mb-2">Room not found</h2>
        <p className="text-sm text-muted-foreground mb-6 text-center">
          This room code doesn't exist or the session has ended.
        </p>
        <Button onClick={() => navigate("/")} variant="outline" className="rounded-full">
          Go Home
        </Button>
      </div>
    );
  }

  // Phase 1: Join Choice Screen
  if (!joinMode) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-primary/10 via-background to-background overflow-hidden relative">
        <div className="absolute top-0 left-0 w-full h-full bg-[linear-gradient(to_bottom,transparent_0%,rgba(0,0,0,0.4)_100%)] pointer-events-none" />
        
        {/* Floating Info Pill */}
        <div className="absolute top-6 right-6 z-50">
          <AboutOverlay initialOpen={isFirstVisit} />
        </div>

        <header className="text-center mb-12 w-full animate-in fade-in slide-in-from-top-4 duration-500 relative z-10">
          <div className="w-24 h-24 rounded-[2rem] bg-primary flex items-center justify-center mx-auto mb-6 shadow-[0_20px_50px_rgba(29,185,84,0.3)] rotate-3 hover:rotate-0 transition-transform duration-500">
            <Music className="w-12 h-12 text-primary-foreground" />
          </div>
          <h1 className="text-3xl font-black text-foreground tracking-tighter leading-none mb-2">Welcome to {roomData.name}</h1>
          <div className="flex items-center justify-center gap-3">
            <span className="px-3 py-1 bg-card border border-border/50 text-muted-foreground rounded-full text-[10px] font-black uppercase tracking-widest shadow-sm">
              Code: <span className="text-primary">{code}</span>
            </span>
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            <span className="text-[10px] items-center font-black uppercase tracking-widest text-muted-foreground/60">Live Party</span>
          </div>
        </header>

        {/* Main Grid: Priority Choices with Vibrant Cards */}
        <div className="grid gap-6 w-full max-w-[400px] relative z-10 px-2">
          <button 
            onClick={() => setJoinMode("control")}
            className="group relative overflow-hidden bg-gradient-to-br from-card to-card/50 backdrop-blur-md p-8 rounded-[2.5rem] border-2 border-border/10 text-left transition-all hover:scale-[1.02] active:scale-[0.98] hover:border-primary/40 shadow-xl"
          >
            {/* Background Glow */}
            <div className="absolute -right-4 -top-4 w-32 h-32 bg-primary/10 blur-3xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
            
            <div className="flex flex-col gap-6 relative z-10">
              <div className="w-16 h-16 rounded-3xl bg-primary/10 flex items-center justify-center text-primary group-hover:scale-110 group-hover:bg-primary group-hover:text-primary-foreground transition-all duration-300 shadow-inner">
                <Speaker className="w-8 h-8" />
              </div>
              <div className="space-y-2">
                <h2 className="text-2xl font-black tracking-tighter text-foreground leading-tight">Use Host Speakers</h2>
                <p className="text-sm font-medium text-muted-foreground leading-relaxed">
                  Join the room and add songs to the physical speakers. <span className="text-primary/80 font-bold italic">Fast & No Login.</span>
                </p>
              </div>
            </div>
          </button>

          <div className="relative flex items-center justify-center py-2">
            <div className="h-[1px] w-full bg-gradient-to-r from-transparent via-border/50 to-transparent" />
            <span className="absolute bg-background px-4 text-[10px] font-black uppercase tracking-[0.4em] text-muted-foreground/40">Remote?</span>
          </div>

          <button 
            onClick={connectSpotify}
            className="group relative overflow-hidden bg-gradient-to-br from-primary/20 to-primary/5 backdrop-blur-md p-8 rounded-[2.5rem] border-2 border-primary/30 text-left transition-all hover:scale-[1.02] active:scale-[0.98] hover:border-primary/60 shadow-lg shadow-primary/5"
          >
            <div className="absolute -right-4 -top-4 w-32 h-32 bg-primary/20 blur-3xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
            
            <div className="flex flex-col gap-6 relative z-10">
              <div className="w-16 h-16 rounded-3xl bg-primary text-primary-foreground flex items-center justify-center group-hover:rotate-12 transition-transform shadow-xl shadow-primary/40">
                <Headphones className="w-8 h-8" />
              </div>
              <div className="space-y-2">
                <h2 className="text-2xl font-black tracking-tighter text-primary leading-tight">Listen Along</h2>
                <p className="text-sm font-medium text-primary/70 leading-relaxed">
                  Streaming audio to your own phone. Requires <span className="font-bold underline decoration-primary/30 text-primary">Spotify login</span> to keep everything in sync.
                </p>
              </div>
            </div>
          </button>
        </div>

        <div className="mt-12 opacity-40 hover:opacity-100 transition-opacity cursor-default relative z-10">
          <p className="text-[10px] text-muted-foreground uppercase tracking-[0.3em] font-black">QDrop Guest Portal</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col max-w-lg mx-auto">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-background/80 backdrop-blur-xl border-b border-border px-4 py-3">
        <div className="flex items-center justify-between">
          <button onClick={() => navigate("/")} className="text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="text-center">
            <h1 className="text-sm font-semibold text-foreground">{roomData.name}</h1>
            <div className="flex flex-col items-center">
              <div className="flex items-center justify-center gap-1.5 leading-none">
                <p className="text-[10px] text-muted-foreground font-mono uppercase bg-muted px-1 rounded-sm">{code}</p>
                <span className="w-1 h-1 rounded-full bg-border" />
                <p className="text-[10px] font-black text-primary tracking-tight uppercase">
                  {joinMode === "listen" ? "Listening Along" : "Control Only"}
                </p>
                {joinMode === "listen" && (
                  <>
                    <span className="w-1 h-1 rounded-full bg-border" />
                    <button 
                      onClick={() => setShowDevicePicker(true)}
                      className="text-[10px] font-bold text-muted-foreground hover:text-primary transition-all flex items-center gap-1"
                    >
                      {activeDeviceName ? <span>on {activeDeviceName}</span> : <span>Pick Device</span>}
                      <span className="bg-primary/10 text-primary px-1 rounded-sm text-[8px] uppercase tracking-tighter">Change</span>
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
          <AboutOverlay />
        </div>
      </header>

      {/* Mode Status Pill / Toggle (Floating) */}
      {roomData.listenAlongEnabled && (
        <div className="px-4 pt-3">
          <div className="bg-card/40 border border-border/50 rounded-2xl p-2 px-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-full bg-primary/10 text-primary">
                {joinMode === "listen" ? <Headphones className="w-3 h-3" /> : <Music className="w-3 h-3" />}
              </div>
              <p className="text-[10px] font-bold uppercase tracking-tight">
                {joinMode === "listen" ? "Listen Mode" : "Control Mode"}
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-[9px] font-bold rounded-full hover:bg-primary/10 uppercase tracking-tighter"
              onClick={() => {
                if (joinMode === "listen") setJoinMode("control");
                else if (guestToken) setJoinMode("listen");
                else connectSpotify();
              }}
            >
              Switch Mode
            </Button>
          </div>
        </div>
      )}

      {/* Now Playing */}
      <div className="px-4 py-4 border-b border-border">
        <div className="bg-card rounded-xl p-4 border border-border shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-1.5">
              {nowPlaying ? <SoundBars /> : <Music className="w-4 h-4 text-muted-foreground" />}
              <span className="text-xs font-medium text-primary uppercase tracking-wider">{nowPlaying ? "Now Playing" : "Nothing Playing"}</span>
            </div>
            {joinMode === "listen" && guestToken && (
               <Dialog open={showDevicePicker} onOpenChange={setShowDevicePicker}>
               <DialogTrigger asChild>
                 <Button variant="ghost" size="sm" className="h-7 text-[10px] gap-1 px-2 rounded-full font-bold" onClick={fetchDevices}>
                   <Smartphone className="w-3 h-3" /> Tap to change device
                 </Button>
               </DialogTrigger>
               <DialogContent className="max-w-[320px] rounded-3xl p-0 overflow-hidden border-none shadow-2xl">
                 <div className="p-4 bg-background border-b border-border flex items-center justify-between">
                   <h2 className="font-bold text-sm tracking-tight text-foreground">Where are you listening?</h2>
                   <Button variant="ghost" size="icon" className="w-8 h-8 rounded-full" onClick={() => setShowDevicePicker(false)}>
                     <X className="w-4 h-4" />
                   </Button>
                 </div>
                 <div className="p-2 max-h-[360px] overflow-y-auto">
                   {availableDevices.length > 0 ? (
                     <div className="space-y-1">
                       {availableDevices.map((d) => (
                         <button
                           key={d.id}
                           onClick={() => selectDevice(d.id)}
                           className={`w-full flex items-center justify-between p-3 rounded-xl text-left transition-all ${d.is_active ? 'bg-primary/10 border border-primary/20 shadow-sm' : 'hover:bg-muted border border-transparent'}`}
                         >
                           <div className="flex items-center gap-3">
                             <div className={`p-2 rounded-lg ${d.is_active ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'}`}>
                               {getDeviceIcon(d.type)}
                             </div>
                             <div>
                               <p className="text-xs font-bold tracking-tight">{d.name}</p>
                               <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                                 {d.is_active ? (
                                   <>
                                     <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                                     Active Device
                                   </>
                                 ) : (
                                   "Tap to connect"
                                 )}
                               </p>
                             </div>
                           </div>
                           {d.is_active && <CheckCircle2 className="w-4 h-4 text-primary" />}
                         </button>
                       ))}
                     </div>
                   ) : (
                     <div className="py-12 text-center px-6">
                       <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-4 opacity-50">
                         <Volume2 className="w-6 h-6 text-muted-foreground" />
                       </div>
                       <p className="text-[11px] font-bold text-foreground">No Spotify Devices Found</p>
                       <p className="text-[10px] text-muted-foreground mt-1 leading-relaxed">
                         Open Spotify on your phone, laptop, or speaker to sync audio.
                       </p>
                       <Button
                         variant="outline"
                         size="sm"
                         className="mt-6 rounded-full text-[10px] h-8 px-4 font-bold"
                         onClick={fetchDevices}
                       >
                         Refresh Devices
                       </Button>
                     </div>
                   )}
                 </div>
               </DialogContent>
             </Dialog>
            )}
          </div>

          {nowPlaying ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <AlbumArt src={nowPlaying.albumArt} size="w-14 h-14" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground truncate">{nowPlaying.songTitle}</p>
                  <p className="text-xs text-muted-foreground truncate font-medium">{nowPlaying.artist}</p>
                </div>
                {nowPlaying.duration && (
                  <span className="text-[10px] text-muted-foreground font-mono bg-muted/50 px-1.5 py-0.5 rounded shrink-0">{nowPlaying.duration}</span>
                )}
              </div>

              {joinMode === "listen" && guestToken && (
                <div className="pt-3 mt-1 border-t border-border/50 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className={`p-1.5 rounded-full ${isSynced ? 'bg-green-500/10 text-green-500' : 'bg-amber-500/10 text-amber-500'}`}>
                      <Headphones className="w-3.5 h-3.5" />
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Audio Sync</span>
                      <div className="flex items-center gap-1.5">
                        {isSynced ? (
                          <span className="text-[10px] text-green-500 font-bold flex items-center gap-1">
                            Aligned with Host
                          </span>
                        ) : (
                          <span className="text-[10px] text-amber-500 font-bold flex items-center gap-1">
                            Catching up...
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 rounded-full text-[10px] gap-1.5 hover:bg-muted font-bold"
                    onClick={() => syncToHost(nowPlaying?.spotifyUri || "", 0, true)}
                  >
                    <RotateCcw className="w-3 h-3" /> Resync Now
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="py-4 text-center">
              <p className="text-sm text-muted-foreground italic font-medium">Waiting for host to start playback...</p>
            </div>
          )}
        </div>
      </div>

      {/* Search section */}
      <div className="px-4 py-3">
        {isSearching ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  autoFocus
                  placeholder="Search songs or artists..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="bg-card border-border pl-9 h-10 text-sm"
                />
              </div>
              <button onClick={() => { setIsSearching(false); setSearchQuery(""); }} className="text-muted-foreground hover:text-foreground transition-colors p-2">
                <X className="w-5 h-5" />
              </button>
            </div>

            {searchQuery.length >= 2 && (
              <div className="max-h-[300px] overflow-y-auto space-y-1 pr-1">
                {searchResults.isLoading && (
                  <div className="flex justify-center py-6">
                    <div className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                  </div>
                )}
                {searchResults.data?.map((song, i) => (
                  <button
                    key={`${song.title}-${song.spotifyUri || i}`}
                    onClick={() => addSong.mutate(song)}
                    disabled={addSong.isPending || mySongsInQueue >= 3}
                    className="w-full flex items-center gap-3 p-2.5 rounded-lg hover:bg-card transition-colors text-left disabled:opacity-40"
                  >
                    <AlbumArt src={song.albumArt} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground truncate">{song.title}</p>
                      <p className="text-xs text-muted-foreground truncate">{song.artist}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Plus className="w-4 h-4 text-primary" />
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <Button
            onClick={() => setIsSearching(true)}
            disabled={mySongsInQueue >= 3}
            className="w-full h-11 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-sm rounded-full shadow-lg shadow-primary/20"
          >
            <Plus className="w-4 h-4 mr-2" />
            {mySongsInQueue >= 3 ? "Song limit reached (3 max)" : "Add a Song"}
          </Button>
        )}

        <div className="flex items-center justify-center gap-1.5 mt-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className={`w-2 h-2 rounded-full transition-colors ${i < mySongsInQueue ? "bg-primary" : "bg-muted"}`} />
          ))}
          <span className="text-[10px] text-muted-foreground ml-1 uppercase tracking-tight">{mySongsInQueue}/3 songs added</span>
        </div>
      </div>

      {/* Queue */}
      <div className="flex-1 px-4 pb-8 overflow-y-auto">
        <div className="flex items-center gap-2 mb-3 mt-2">
          <ListMusic className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground">Queue</h2>
          <span className="text-xs text-muted-foreground">{queue.length} {queue.length === 1 ? "song" : "songs"}</span>
        </div>

        {queue.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center border-2 border-dashed border-border rounded-2xl">
            <div className="w-16 h-16 rounded-full bg-card flex items-center justify-center mb-4">
              <Music className="w-7 h-7 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">Queue is empty</p>
            <p className="text-xs text-muted-foreground mt-1">Be the first to add a song</p>
          </div>
        ) : (
          <div className="space-y-1">
            {queue.map((entry, index) => (
              <div key={entry.id} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-card/50 transition-colors group">
                <span className="w-5 text-[10px] text-muted-foreground font-mono text-right shrink-0">{index + 1}</span>
                <AlbumArt src={entry.albumArt} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground truncate">{entry.songTitle}</p>
                  <div className="flex items-center gap-1.5">
                    <p className="text-xs text-muted-foreground truncate">{entry.artist}</p>
                    {entry.addedBy === sessionUserId && (
                      <span className="text-[10px] text-primary font-medium px-1.5 py-0.5 bg-primary/10 rounded">You</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {entry.addedBy === sessionUserId && (
                    <button onClick={() => removeSong.mutate(entry.id)} className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive p-1">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="pb-4 shrink-0">
        <AppFooter />
      </div>
    </div>
  );
}
