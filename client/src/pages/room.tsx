import { useState } from "react";
import { useParams } from "wouter";
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
} from "lucide-react";
import { useLocation } from "wouter";
import type { QueueEntry } from "@shared/schema";
import { AppFooter } from "@/components/AppFooter";
import { useRoomWebSocket } from "@/hooks/use-websocket";

function generateUserId(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let id = "user_";
  for (let i = 0; i < 8; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

let sessionUserId = generateUserId();

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
  const code = params.code?.toUpperCase() || "";
  const [, navigate] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);

  // WebSocket for real-time updates
  useRoomWebSocket(code, (data) => {
    if (data.type === "queue_update" || data.type === "playback_update") {
      queryClient.invalidateQueries({ queryKey: ["/api/rooms", code, "queue"] });
    }
  });

  const roomQuery = useQuery<{ id: number; code: string; name: string; isActive: boolean; hasSpotify: boolean }>({
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
    refetchInterval: 5000, // Fallback polling, WebSocket handles most updates
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

  const queue = queueQuery.data?.queue || [];
  const nowPlaying = queueQuery.data?.nowPlaying;
  const mySongsInQueue = queue.filter((e) => e.addedBy === sessionUserId).length;

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
        <p className="text-sm text-muted-foreground mb-6 text-center">
          This room code doesn't exist or the session has ended.
        </p>
        <Button onClick={() => navigate("/")} variant="outline" className="rounded-full" data-testid="button-go-home">
          Go Home
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col max-w-lg mx-auto">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-background/80 backdrop-blur-xl border-b border-border px-4 py-3">
        <div className="flex items-center justify-between">
          <button onClick={() => navigate("/")} className="text-muted-foreground hover:text-foreground transition-colors" data-testid="button-back">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="text-center">
            <h1 className="text-sm font-semibold text-foreground" data-testid="text-room-name">{roomQuery.data.name}</h1>
            <div className="flex items-center justify-center gap-1.5">
              <p className="text-xs text-muted-foreground font-mono">{code}</p>
              {roomQuery.data.hasSpotify && (
                <span className="text-[10px] text-primary font-medium px-1.5 py-0.5 bg-primary/10 rounded">Spotify</span>
              )}
            </div>
          </div>
          <div className="w-5" />
        </div>
      </header>

      {/* Now Playing */}
      {nowPlaying && (
        <div className="px-4 py-4 border-b border-border">
          <div className="flex items-center gap-1.5 mb-3">
            <SoundBars />
            <span className="text-xs font-medium text-primary uppercase tracking-wider">Now Playing</span>
          </div>
          <div className="flex items-center gap-3">
            <AlbumArt src={nowPlaying.albumArt} size="w-14 h-14" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground truncate" data-testid="text-now-playing-title">{nowPlaying.songTitle}</p>
              <p className="text-xs text-muted-foreground truncate">{nowPlaying.artist}</p>
            </div>
            {nowPlaying.duration && (
              <span className="text-xs text-muted-foreground font-mono">{nowPlaying.duration}</span>
            )}
          </div>
        </div>
      )}

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
                  className="bg-card border-border pl-9 h-10 text-sm text-foreground placeholder:text-muted-foreground"
                  data-testid="input-search-songs"
                />
              </div>
              <button onClick={() => { setIsSearching(false); setSearchQuery(""); }} className="text-muted-foreground hover:text-foreground transition-colors p-2" data-testid="button-close-search">
                <X className="w-5 h-5" />
              </button>
            </div>

            {searchQuery.length >= 2 && (
              <div className="space-y-1">
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
                    data-testid={`button-add-song-${i}`}
                  >
                    <AlbumArt src={song.albumArt} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground truncate">{song.title}</p>
                      <p className="text-xs text-muted-foreground truncate">{song.artist}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground font-mono">{song.duration}</span>
                      <Plus className="w-4 h-4 text-primary" />
                    </div>
                  </button>
                ))}
                {searchResults.data?.length === 0 && !searchResults.isLoading && (
                  <p className="text-sm text-muted-foreground text-center py-6">No songs found</p>
                )}
              </div>
            )}
          </div>
        ) : (
          <Button
            onClick={() => setIsSearching(true)}
            disabled={mySongsInQueue >= 3}
            className="w-full h-11 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-sm rounded-full"
            data-testid="button-open-search"
          >
            <Plus className="w-4 h-4 mr-2" />
            {mySongsInQueue >= 3 ? "Song limit reached (3 max)" : "Add a Song"}
          </Button>
        )}

        <div className="flex items-center justify-center gap-1.5 mt-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className={`w-2 h-2 rounded-full transition-colors ${i < mySongsInQueue ? "bg-primary" : "bg-muted"}`} />
          ))}
          <span className="text-xs text-muted-foreground ml-1">{mySongsInQueue}/3 songs added</span>
        </div>
      </div>

      {/* Queue */}
      <div className="flex-1 px-4 pb-8">
        <div className="flex items-center gap-2 mb-3 mt-2">
          <ListMusic className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground">Queue</h2>
          <span className="text-xs text-muted-foreground">{queue.length} {queue.length === 1 ? "song" : "songs"}</span>
        </div>

        {queue.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-16 h-16 rounded-full bg-card flex items-center justify-center mb-4">
              <Music className="w-7 h-7 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">Queue is empty</p>
            <p className="text-xs text-muted-foreground mt-1">Be the first to add a song</p>
          </div>
        ) : (
          <div className="space-y-1">
            {queue.map((entry, index) => (
              <div key={entry.id} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-card/50 transition-colors group" data-testid={`queue-entry-${entry.id}`}>
                <span className="w-5 text-xs text-muted-foreground font-mono text-right shrink-0">{index + 1}</span>
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
                <div className="flex items-center gap-2">
                  {entry.duration && <span className="text-xs text-muted-foreground font-mono">{entry.duration}</span>}
                  {entry.addedBy === sessionUserId && (
                    <button onClick={() => removeSong.mutate(entry.id)} className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive p-1" data-testid={`button-remove-${entry.id}`}>
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="pb-4">
        <AppFooter />
      </div>
    </div>
  );
}
