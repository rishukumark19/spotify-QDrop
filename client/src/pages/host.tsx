import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import {
  Music,
  SkipForward,
  Play,
  Pause,
  Users,
  ArrowLeft,
  Copy,
  Check,
  ListMusic,
  X,
  Wifi,
  WifiOff,
  Headphones,
  Settings,
  RotateCcw
} from "lucide-react";
import { Input } from "@/components/ui/input";

import { QRCodeSVG } from "qrcode.react";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import type { QueueEntry } from "@shared/schema";
import { AppFooter } from "@/components/AppFooter";
import { useRoomWebSocket } from "@/hooks/use-websocket";
import { toast } from "@/hooks/use-toast";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronDown, ShieldCheck } from "lucide-react";

function sanitizeRoomCode(value?: string) {
  return (value || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5);
}

declare global {
  interface Window {
    Spotify: any;
    onSpotifyWebPlaybackSDKReady: () => void;
  }
}

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
        className={`${size} rounded-lg object-cover shrink-0`}
        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
      />
    );
  }
  return (
    <div className={`${size} rounded-lg bg-background flex items-center justify-center shrink-0`}>
      <Music className="w-6 h-6 text-primary" />
    </div>
  );
}

function useSpotifyFlashMessage() {
  return useMemo(() => {
    if (typeof window === "undefined") return null;
    const hash = window.location.hash || "";
    const queryString = hash.includes("?") ? hash.slice(hash.indexOf("?") + 1) : "";
    const params = new URLSearchParams(queryString);
    if (params.get("spotify") === "connected") {
      return { tone: "success" as const, title: "Spotify connected", description: "Your account connected successfully." };
    }
    const error = params.get("error");
    if (!error) return null;
    return { tone: "error" as const, title: "Spotify connection failed", description: "Spotify setup could not be completed." };
  }, []);
}

export default function Host() {
  const params = useParams<{ code: string }>();
  const code = sanitizeRoomCode(params.code);
  const [, navigate] = useLocation();
  const [copied, setCopied] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [playerReady, setPlayerReady] = useState(false);
  const [spotifyConnecting, setSpotifyConnecting] = useState(false);
  const playerRef = useRef<any>(null);
  const flashMessage = useSpotifyFlashMessage();

  useEffect(() => {
    if (!flashMessage) return;
    toast({ title: flashMessage.title, description: flashMessage.description, variant: flashMessage.tone === "error" ? "destructive" : "default" });
    const cleanHash = `#/host/${code}`;
    if (window.location.hash !== cleanHash) window.history.replaceState(null, "", cleanHash);
  }, [flashMessage, code]);

  const [listenerStats, setListenerStats] = useState({ synced: 0, controlOnly: 0 });

  useRoomWebSocket(code, (data) => {
    if (data.type === "queue_update" || data.type === "playback_update" || data.type === "room_update") {
      queryClient.invalidateQueries({ queryKey: ["/api/rooms", code] });
      queryClient.invalidateQueries({ queryKey: ["/api/rooms", code, "queue"] });
    } else if (data.type === "heartbeat" || data.type === "stats") {
      if (data.stats) setListenerStats(data.stats);
      else if (data.type === "stats") setListenerStats({ synced: data.synced, controlOnly: data.controlOnly });
    }
  });

  const spotifyConfig = useQuery<{ clientId: string; hasCredentials: boolean }>({
    queryKey: ["/api/spotify/config"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/spotify/config");
      return res.json();
    },
  });

  const roomQuery = useQuery<{
    id: number;
    code: string;
    name: string;
    isActive: boolean;
    mode: string;
    roomType: string;
    maxListeners: number | null;
    listenAlongEnabled: boolean;
    hasSpotify: boolean;
    hasDevice: boolean;
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

  const initializePlayer = useCallback(async () => {
    if (!roomQuery.data?.hasSpotify || playerRef.current) return;
    try {
      const tokenRes = await apiRequest("GET", `/api/rooms/${code}/spotify-token`);
      const { token } = await tokenRes.json();
      if (!token) return;
      if (!window.Spotify) {
        const script = document.createElement("script");
        script.src = "https://sdk.scdn.co/spotify-player.js";
        script.async = true;
        document.body.appendChild(script);
      }
      const initPlayer = () => {
        const player = new window.Spotify.Player({
          name: "QDrop Player",
          getOAuthToken: (cb: (t: string) => void) => {
            apiRequest("GET", `/api/rooms/${code}/spotify-token`)
              .then((r) => r.json())
              .then((d) => cb(d.token))
              .catch(() => cb(token));
          },
          volume: 0.8,
        });
        player.addListener("ready", ({ device_id }: { device_id: string }) => {
          apiRequest("POST", `/api/rooms/${code}/device`, { deviceId: device_id });
          setPlayerReady(true);
          queryClient.invalidateQueries({ queryKey: ["/api/rooms", code] });
        });
        player.addListener("player_state_changed", (state: any) => {
          if (!state) return;
          setIsPaused(state.paused);
          if (state.paused && state.position === 0 && state.track_window?.previous_tracks?.length > 0) {
            apiRequest("POST", `/api/rooms/${code}/skip`).then(() => {
              queryClient.invalidateQueries({ queryKey: ["/api/rooms", code, "queue"] });
            });
          }
        });
        player.connect();
        playerRef.current = player;
      };
      if (window.Spotify) initPlayer();
      else window.onSpotifyWebPlaybackSDKReady = initPlayer;
    } catch (err) { console.error(err); }
  }, [code, roomQuery.data?.hasSpotify]);

  useEffect(() => {
    initializePlayer();
    return () => { if (playerRef.current) playerRef.current.disconnect(); };
  }, [initializePlayer]);

  const connectSpotify = async () => {
    setSpotifyConnecting(true);
    try {
      const res = await apiRequest("GET", `/api/spotify/auth?room=${code}`);
      const { authUrl } = await res.json();
      window.location.href = authUrl;
    } catch (err) { setSpotifyConnecting(false); }
  };

  const skipSong = useMutation({
    mutationFn: async () => apiRequest("POST", `/api/rooms/${code}/skip`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rooms", code] });
      queryClient.invalidateQueries({ queryKey: ["/api/rooms", code, "queue"] });
      setIsPaused(false);
    },
  });

  const playSong = useMutation({
    mutationFn: async () => apiRequest("POST", `/api/rooms/${code}/play`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rooms", code] });
      queryClient.invalidateQueries({ queryKey: ["/api/rooms", code, "queue"] });
      setIsPaused(false);
    },
  });

  const pauseSong = useMutation({
    mutationFn: async () => apiRequest("POST", `/api/rooms/${code}/pause`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rooms", code] });
      setIsPaused(true);
    },
  });

  const updateMode = useMutation({
    mutationFn: async (params: { mode: string; listenAlongEnabled: boolean }) => {
      const res = await apiRequest("PATCH", `/api/rooms/${code}/mode`, params);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rooms", code] });
      toast({ title: "Room updated", description: "Playback mode changed." });
    },
  });

  const forceResync = useMutation({
    mutationFn: async () => apiRequest("POST", `/api/rooms/${code}/resync`),
    onSuccess: () => {
      toast({ title: "Force Resync sent", description: "Broadcasting hard seek to all listeners." });
    },
  });

  const updateSettings = useMutation({
    mutationFn: async (params: { maxListeners?: number; roomType?: string }) => {
      const res = await apiRequest("PATCH", `/api/rooms/${code}/settings`, params);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rooms", code] });
      toast({ title: "Settings updated", description: "Room configuration saved." });
    },
  });

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const roomData = roomQuery.data;
  const queue = queueQuery.data?.queue || [];
  const nowPlaying = queueQuery.data?.nowPlaying;

  const joinUrl = typeof window !== "undefined"
    ? `${window.location.origin}${window.location.pathname}#/room/${code}`
    : `#/room/${code}`;

  if (roomQuery.isLoading) return <div className="min-h-screen bg-background flex items-center justify-center"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>;
  if (!roomData) return <div className="min-h-screen bg-background flex flex-col items-center justify-center"><Music className="w-12 h-12 text-muted-foreground mb-4" /><h2>Room not found</h2><Button onClick={() => navigate("/")}>Go Home</Button></div>;

  return (
    <div className="min-h-screen bg-background flex flex-col max-w-2xl mx-auto">
      <header className="sticky top-0 z-20 bg-background/80 backdrop-blur-xl border-b border-border px-4 py-3">
        <div className="flex items-center justify-between">
          <button onClick={() => navigate("/")} className="text-muted-foreground hover:text-foreground transition-colors"><ArrowLeft className="w-5 h-5" /></button>
          <div className="text-center">
            <h1 className="text-xs font-bold text-muted-foreground uppercase tracking-widest leading-none mb-1">Host Console</h1>
            <div className="flex flex-col items-center">
              <h2 className="text-sm font-semibold text-foreground leading-tight">{roomData.name}</h2>
              <div className="flex items-center justify-center gap-1 mt-0.5">
                <span className="text-[9px] font-bold text-primary font-mono bg-primary/10 px-1.5 py-0.5 rounded leading-none">
                  {code}
                </span>
                <span className="w-1 h-1 rounded-full bg-border" />
                <p className="text-[9px] text-muted-foreground leading-none">
                  {listenerStats.synced} listeners • {listenerStats.controlOnly} guests
                </p>
              </div>
            </div>
          </div>
          <div className="w-5" />
        </div>
      </header>

      <div className="flex-1 px-4 py-4 space-y-6">
        <div className="flex flex-col items-center">
          <div className="bg-white p-4 rounded-2xl mb-4 shadow-xl"><QRCodeSVG value={joinUrl} size={160} level="H" /></div>
          <p className="text-sm text-muted-foreground mb-1">Scan to join the queue</p>
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold tracking-[0.2em] font-mono">{code}</span>
            <button onClick={handleCopy} className="text-muted-foreground hover:text-primary transition-colors">{copied ? <Check className="w-4 h-4 text-primary" /> : <Copy className="w-4 h-4" />}</button>
          </div>
        </div>

        {spotifyConfig.data?.hasCredentials && !roomData.hasSpotify && (
          <div className="bg-card rounded-xl p-4 border border-border">
            <div className="flex items-center gap-2 mb-2"><Music className="w-5 h-5 text-primary" /><span className="text-sm font-semibold">Connect Spotify</span></div>
            <p className="text-xs text-muted-foreground mb-3">Enable real music playback with your Spotify Premium account.</p>
            <Button onClick={connectSpotify} disabled={spotifyConnecting} className="w-full rounded-full">{spotifyConnecting ? "Connecting..." : "Log in with Spotify"}</Button>
          </div>
        )}

        <div className="bg-card rounded-xl p-4 border border-border shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-1.5">
              {nowPlaying ? <SoundBars /> : <Music className="w-4 h-4 text-muted-foreground" />}
              <span className="text-xs font-medium uppercase tracking-wider">{nowPlaying ? "Now Playing" : "Nothing Playing"}</span>
            </div>
            {nowPlaying && roomData.mode === "listen_along" && (
              <Button 
                variant="outline" 
                size="sm" 
                className="h-7 text-[10px] gap-1 px-2 rounded-full border-primary/20 text-primary hover:bg-primary/5"
                onClick={() => forceResync.mutate()}
                disabled={forceResync.isPending}
              >
                <RotateCcw className="w-3 h-3" /> Force Resync All
              </Button>
            )}
          </div>
          {nowPlaying ? (
            <div className="flex items-center gap-3">
              <AlbumArt src={nowPlaying.albumArt} size="w-14 h-14" />
              <div className="min-w-0 flex-1"><p className="text-sm font-semibold truncate">{nowPlaying.songTitle}</p><p className="text-xs text-muted-foreground truncate">{nowPlaying.artist}</p></div>
              <div className="flex items-center gap-2">
                {roomData.hasSpotify && <Button onClick={() => isPaused ? playSong.mutate() : pauseSong.mutate()} disabled={playSong.isPending || pauseSong.isPending} size="sm" variant="outline" className="rounded-full w-9 h-9 p-0">{isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}</Button>}
                <Button onClick={() => skipSong.mutate()} disabled={skipSong.isPending} size="sm" variant="outline" className="rounded-full w-9 h-9 p-0"><SkipForward className="w-4 h-4" /></Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between"><p className="text-sm text-muted-foreground">{queue.length > 0 ? "Ready to play" : "Waiting for songs..."}</p>{queue.length > 0 && <Button onClick={() => playSong.mutate()} className="rounded-full">Play</Button>}</div>
          )}
        </div>
        <div className="bg-card rounded-2xl border border-border overflow-hidden shadow-sm">
          <Collapsible>
            <CollapsibleTrigger className="w-full px-4 py-3 bg-muted/20 hover:bg-muted/40 transition-colors flex items-center justify-between group">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                  <ShieldCheck className="w-4 h-4 text-primary" />
                </div>
                <div className="text-left">
                  <p className="text-xs font-bold text-foreground">Admin & Power Tools</p>
                  <p className="text-[10px] text-muted-foreground">Manage listeners, sync, and limits</p>
                </div>
              </div>
              <ChevronDown className="w-4 h-4 text-muted-foreground group-data-[state=open]:rotate-180 transition-transform" />
            </CollapsibleTrigger>
            
            <CollapsibleContent className="divide-y divide-border/50 border-t border-border/50">
              {/* Force Resync (Broadcaster) */}
              <div className="p-4 flex items-center justify-between">
                <div className="flex flex-col gap-0.5">
                  <Label className="text-xs font-bold">Hard Re-Sync</Label>
                  <p className="text-[10px] text-muted-foreground">Forces all listeners to jump to your current spot.</p>
                </div>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="h-8 text-[10px] font-bold rounded-full gap-1.5 px-3 border-primary/20 text-primary hover:bg-primary/5"
                  onClick={() => forceResync.mutate()}
                  disabled={forceResync.isPending || !nowPlaying}
                >
                  <RotateCcw className="w-3 h-3" /> Broadcast Seek
                </Button>
              </div>

              {/* Listen Along Toggle */}
              <div className="p-4 flex items-center justify-between">
                <div className="flex flex-col gap-0.5">
                  <Label htmlFor="host-listen-along" className="text-xs font-bold">
                    Allow Listen Along
                  </Label>
                  <p className="text-[10px] text-muted-foreground">Guests can join your playback stream via Spotify.</p>
                </div>
                <Switch 
                  id="host-listen-along" 
                  checked={roomData.mode === "listen_along"} 
                  onCheckedChange={(checked) => updateMode.mutate({ mode: checked ? "listen_along" : "default", listenAlongEnabled: checked })} 
                  disabled={updateMode.isPending} 
                />
              </div>

              {/* Advanced Settings */}
              <div className="p-4 space-y-4">
                <div className="space-y-2">
                  <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">Global Constraints</Label>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium">Room Type</span>
                    <select 
                      className="bg-muted border border-border rounded-lg px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-primary transition-all pr-8 appearance-none cursor-pointer"
                      value={roomData.roomType}
                      onChange={(e) => updateSettings.mutate({ roomType: e.target.value })}
                    >
                      <option value="in_room">🔊 In-Room (Speaker only)</option>
                      <option value="remote_listen_along">🌍 Remote Jam (Listen Along)</option>
                      <option value="scheduled">⏱ Scheduled Session</option>
                    </select>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium">Max Listener Count</span>
                    <div className="flex items-center gap-2">
                      <Input 
                        type="number" 
                        min="1"
                        max="100"
                        className="w-16 h-8 text-xs bg-muted border-border text-center rounded-lg"
                        placeholder="25"
                        value={roomData.maxListeners || 25}
                        onChange={(e) => updateSettings.mutate({ maxListeners: parseInt(e.target.value) || 25 })}
                      />
                      <span className="text-[10px] text-muted-foreground font-bold uppercase">Users</span>
                    </div>
                  </div>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>


        <div>
          <div className="flex items-center gap-2 mb-3"><ListMusic className="w-4 h-4 text-muted-foreground" /><h2 className="text-sm font-semibold">Queue</h2><span className="text-xs text-muted-foreground">{queue.length} songs</span></div>
          {queue.length === 0 ? <div className="py-10 text-center text-sm text-muted-foreground border-2 border-dashed rounded-xl">Share the QR code to start the party!</div> : (
            <div className="space-y-1">
              {queue.map((entry, index) => (
                <div key={entry.id} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-card/50 transition-colors group">
                  <span className="w-5 text-[10px] text-muted-foreground font-mono text-right">{index + 1}</span>
                  <AlbumArt src={entry.albumArt} />
                  <div className="min-w-0 flex-1"><p className="text-sm font-medium truncate">{entry.songTitle}</p><p className="text-xs text-muted-foreground truncate">{entry.artist}</p></div>
                  <button onClick={() => skipSong.mutate()} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive p-1"><X className="w-3.5 h-3.5" /></button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="pb-4 shrink-0"><AppFooter /></div>
    </div>
  );
}
