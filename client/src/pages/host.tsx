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
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useState, useEffect, useRef, useCallback } from "react";
import type { QueueEntry } from "@shared/schema";
import { PerplexityAttribution } from "@/components/PerplexityAttribution";
import { useRoomWebSocket } from "@/hooks/use-websocket";

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

export default function Host() {
  const params = useParams<{ code: string }>();
  const code = params.code?.toUpperCase() || "";
  const [, navigate] = useLocation();
  const [copied, setCopied] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [playerReady, setPlayerReady] = useState(false);
  const [spotifyConnecting, setSpotifyConnecting] = useState(false);
  const playerRef = useRef<any>(null);

  // WebSocket for real-time updates
  useRoomWebSocket(code, (data) => {
    if (data.type === "queue_update" || data.type === "playback_update") {
      queryClient.invalidateQueries({ queryKey: ["/api/rooms", code, "queue"] });
    }
  });

  // Spotify config
  const spotifyConfig = useQuery<{ clientId: string; hasCredentials: boolean }>({
    queryKey: ["/api/spotify/config"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/spotify/config");
      return res.json();
    },
  });

  const roomQuery = useQuery<{ id: number; code: string; name: string; isActive: boolean; hasSpotify: boolean; hasDevice: boolean }>({
    queryKey: ["/api/rooms", code],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/rooms/${code}`);
      return res.json();
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

  // Initialize Spotify Web Playback SDK
  const initializePlayer = useCallback(async () => {
    if (!roomQuery.data?.hasSpotify || playerRef.current) return;

    try {
      const tokenRes = await apiRequest("GET", `/api/rooms/${code}/spotify-token`);
      const { token } = await tokenRes.json();
      if (!token) return;

      // Load SDK script if not already loaded
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
            // Always fetch fresh token
            apiRequest("GET", `/api/rooms/${code}/spotify-token`)
              .then((r) => r.json())
              .then((d) => cb(d.token))
              .catch(() => cb(token));
          },
          volume: 0.8,
        });

        player.addListener("ready", ({ device_id }: { device_id: string }) => {
          console.log("Spotify Player ready, device:", device_id);
          // Register device with backend
          apiRequest("POST", `/api/rooms/${code}/device`, { deviceId: device_id });
          setPlayerReady(true);
          queryClient.invalidateQueries({ queryKey: ["/api/rooms", code] });
        });

        player.addListener("not_ready", () => {
          setPlayerReady(false);
        });

        player.addListener("player_state_changed", (state: any) => {
          if (!state) return;
          setIsPaused(state.paused);

          // Auto-play next when track ends
          if (state.paused && state.position === 0 && state.track_window?.previous_tracks?.length > 0) {
            // Track ended, skip to next
            apiRequest("POST", `/api/rooms/${code}/skip`).then(() => {
              queryClient.invalidateQueries({ queryKey: ["/api/rooms", code, "queue"] });
            });
          }
        });

        player.connect();
        playerRef.current = player;
      };

      if (window.Spotify) {
        initPlayer();
      } else {
        window.onSpotifyWebPlaybackSDKReady = initPlayer;
      }
    } catch (err) {
      console.error("Failed to initialize Spotify player:", err);
    }
  }, [code, roomQuery.data?.hasSpotify]);

  useEffect(() => {
    initializePlayer();
    return () => {
      if (playerRef.current) {
        playerRef.current.disconnect();
        playerRef.current = null;
      }
    };
  }, [initializePlayer]);

  // Spotify auth
  const connectSpotify = async () => {
    setSpotifyConnecting(true);
    try {
      const res = await apiRequest("GET", `/api/spotify/auth?room=${code}`);
      const { authUrl } = await res.json();
      window.location.href = authUrl;
    } catch (err) {
      setSpotifyConnecting(false);
    }
  };

  const skipSong = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/rooms/${code}/skip`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rooms", code, "queue"] });
      setIsPaused(false);
    },
  });

  const playSong = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/rooms/${code}/play`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rooms", code, "queue"] });
      setIsPaused(false);
    },
  });

  const pauseSong = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", `/api/rooms/${code}/pause`);
    },
    onSuccess: () => {
      setIsPaused(true);
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

  const handleCopy = () => {
    navigator.clipboard.writeText(code).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const queue = queueQuery.data?.queue || [];
  const nowPlaying = queueQuery.data?.nowPlaying;

  const joinUrl = typeof window !== "undefined"
    ? `${window.location.origin}${window.location.pathname}#/room/${code}`
    : `#/room/${code}`;

  if (roomQuery.isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (roomQuery.isError || !roomQuery.data) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6">
        <Music className="w-12 h-12 text-muted-foreground mb-4" />
        <h2 className="text-lg font-semibold text-foreground mb-2">Room not found</h2>
        <Button onClick={() => navigate("/")} variant="outline" className="rounded-full" data-testid="button-go-home">Go Home</Button>
      </div>
    );
  }

  const hasSpotify = roomQuery.data.hasSpotify;
  const showSpotifySetup = spotifyConfig.data?.hasCredentials && !hasSpotify;

  return (
    <div className="min-h-screen bg-background flex flex-col max-w-2xl mx-auto">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-background/80 backdrop-blur-xl border-b border-border px-4 py-3">
        <div className="flex items-center justify-between">
          <button onClick={() => navigate("/")} className="text-muted-foreground hover:text-foreground transition-colors" data-testid="button-back">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="text-center">
            <h1 className="text-sm font-semibold text-foreground" data-testid="text-room-name">{roomQuery.data.name}</h1>
            <div className="flex items-center justify-center gap-1.5">
              <p className="text-xs text-primary font-medium">Host View</p>
              {hasSpotify && (
                <span className="flex items-center gap-1 text-[10px] text-primary/70">
                  {playerReady ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                  {playerReady ? "Connected" : "Connecting..."}
                </span>
              )}
            </div>
          </div>
          <div className="w-5" />
        </div>
      </header>

      <div className="flex-1 px-4 py-4 space-y-6">
        {/* QR Code + Code section */}
        <div className="flex flex-col items-center">
          <div className="bg-white p-4 rounded-2xl mb-4">
            <QRCodeSVG value={joinUrl} size={180} level="H" fgColor="#000000" bgColor="#ffffff" data-testid="qr-code" />
          </div>
          <p className="text-sm text-muted-foreground mb-2">Scan to join the queue</p>
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold tracking-[0.2em] font-mono text-foreground" data-testid="text-room-code">{code}</span>
            <button onClick={handleCopy} className="text-muted-foreground hover:text-primary transition-colors p-1" data-testid="button-copy-code">
              {copied ? <Check className="w-4 h-4 text-primary" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Spotify connect prompt */}
        {showSpotifySetup && (
          <div className="bg-card rounded-xl p-4 border border-border">
            <div className="flex items-center gap-2 mb-2">
              <svg className="w-5 h-5 text-primary" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
              </svg>
              <span className="text-sm font-semibold text-foreground">Connect Spotify</span>
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              Log in with your Spotify Premium account to enable real music playback directly from this page.
            </p>
            <Button
              onClick={connectSpotify}
              disabled={spotifyConnecting}
              className="w-full h-10 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-sm rounded-full"
              data-testid="button-connect-spotify"
            >
              {spotifyConnecting ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                  Connecting...
                </span>
              ) : (
                "Log in with Spotify"
              )}
            </Button>
          </div>
        )}

        {/* Now Playing */}
        <div className="bg-card rounded-xl p-4">
          <div className="flex items-center gap-1.5 mb-3">
            {nowPlaying ? <SoundBars /> : <Music className="w-4 h-4 text-muted-foreground" />}
            <span className={`text-xs font-medium uppercase tracking-wider ${nowPlaying ? "text-primary" : "text-muted-foreground"}`}>
              {nowPlaying ? "Now Playing" : "Nothing Playing"}
            </span>
          </div>

          {nowPlaying ? (
            <div className="flex items-center gap-3">
              <AlbumArt src={nowPlaying.albumArt} size="w-14 h-14" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground truncate" data-testid="text-host-now-playing">{nowPlaying.songTitle}</p>
                <p className="text-xs text-muted-foreground truncate">{nowPlaying.artist}</p>
              </div>
              <div className="flex items-center gap-2">
                {hasSpotify && (
                  <Button
                    onClick={() => isPaused ? playSong.mutate() : pauseSong.mutate()}
                    disabled={playSong.isPending || pauseSong.isPending}
                    size="sm"
                    variant="outline"
                    className="rounded-full shrink-0 w-9 h-9 p-0"
                    data-testid="button-pause-resume"
                  >
                    {isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
                  </Button>
                )}
                <Button
                  onClick={() => skipSong.mutate()}
                  disabled={skipSong.isPending}
                  size="sm"
                  variant="outline"
                  className="rounded-full shrink-0 w-9 h-9 p-0"
                  data-testid="button-skip"
                >
                  <SkipForward className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {queue.length > 0 ? "Ready to play" : "Waiting for songs..."}
              </p>
              {queue.length > 0 && (
                <Button
                  onClick={() => playSong.mutate()}
                  disabled={playSong.isPending}
                  size="sm"
                  className="rounded-full bg-primary hover:bg-primary/90 text-primary-foreground"
                  data-testid="button-play"
                >
                  <Play className="w-4 h-4 mr-1" />
                  Play
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Queue */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <ListMusic className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold text-foreground">Up Next</h2>
            <span className="text-xs text-muted-foreground">{queue.length} {queue.length === 1 ? "song" : "songs"}</span>
          </div>

          {queue.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <div className="w-14 h-14 rounded-full bg-card flex items-center justify-center mb-3">
                <Users className="w-6 h-6 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">Share the QR code so people can add songs</p>
            </div>
          ) : (
            <div className="space-y-1">
              {queue.map((entry, index) => (
                <div key={entry.id} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-card/50 transition-colors group" data-testid={`host-queue-entry-${entry.id}`}>
                  <span className="w-5 text-xs text-muted-foreground font-mono text-right shrink-0">{index + 1}</span>
                  <AlbumArt src={entry.albumArt} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground truncate">{entry.songTitle}</p>
                    <p className="text-xs text-muted-foreground truncate">{entry.artist}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {entry.duration && <span className="text-xs text-muted-foreground font-mono">{entry.duration}</span>}
                    <button onClick={() => removeSong.mutate(entry.id)} className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive p-1" data-testid={`button-host-remove-${entry.id}`}>
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="pb-4">
        <PerplexityAttribution />
      </div>
    </div>
  );
}
