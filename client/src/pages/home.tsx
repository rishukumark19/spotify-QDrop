import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Music, Plus, LogIn, Dumbbell, Headphones } from "lucide-react";
import { AppFooter } from "@/components/AppFooter";

const aboutCards = [
  {
    title: "What QDrop does",
    text: "QDrop lets one host control the room while everyone else joins from their own phone and adds tracks to the shared queue.",
  },
  {
    title: "Why Spotify fits",
    text: "Spotify stays on the host side. Guests do not need to log in. The host connects one Premium account to unlock real playback.",
  },
  {
    title: "How to test the idea",
    text: "Create a room, share the code or QR, let a few people add songs, and see whether the queue feels social instead of chaotic.",
  },
];

export default function Home() {
  const [, navigate] = useLocation();
  const [roomName, setRoomName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [activeTab, setActiveTab] = useState<"join" | "create">("join");
  const [preset, setPreset] = useState<"speaker" | "remote">("speaker");

  const createRoom = useMutation({
    mutationFn: async (params: { name: string; mode: string; listenAlongEnabled: boolean }) => {
      const res = await apiRequest("POST", "/api/rooms", params);
      return res.json();
    },
    onSuccess: (data) => {
      navigate(`/host/${data.code}`);
    },
  });

  const handleJoin = () => {
    const code = joinCode.trim().toUpperCase();
    if (code.length >= 4) {
      navigate(`/room/${code}`);
    }
  };

  const scrollToSection = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="px-6 pt-6">
        <div className="mx-auto flex w-full max-sm items-center justify-end gap-4 text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
          <button
            type="button"
            onClick={() => scrollToSection("how-it-works")}
            className="transition-colors hover:text-foreground"
          >
            How It Works
          </button>
          <button
            type="button"
            onClick={() => scrollToSection("about-us")}
            className="transition-colors hover:text-foreground"
          >
            About Us
          </button>
        </div>
      </div>

      {/* Header */}
      <div className="pt-12 pb-6 px-6 text-center">
        <div className="flex items-center justify-center gap-3 mb-3">
          <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center">
            <Music className="w-6 h-6 text-primary-foreground" />
          </div>
        </div>
        <h1 className="text-xl font-bold text-foreground tracking-tight" data-testid="text-title">
          QDrop
        </h1>
        <p className="text-sm text-muted-foreground mt-2 max-w-[280px] mx-auto leading-relaxed">
          Enter a room code to add songs or listen along with friends.
        </p>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col items-center px-6 pb-8">
        <div className="w-full max-w-sm">
          {/* Tab switcher */}
          <div className="flex rounded-lg bg-card p-1 mb-6 border border-border/40" data-testid="tab-switcher">
            <button
              onClick={() => setActiveTab("join")}
              className={`flex-1 py-2.5 px-4 rounded-md text-sm font-bold tracking-tight transition-all ${
                activeTab === "join"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              data-testid="button-tab-join"
            >
              <LogIn className="w-4 h-4 inline-block mr-1.5 -mt-0.5" />
              Join Room
            </button>
            <button
              onClick={() => setActiveTab("create")}
              className={`flex-1 py-2.5 px-4 rounded-md text-sm font-bold tracking-tight transition-all ${
                activeTab === "create"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              data-testid="button-tab-create"
            >
              <Plus className="w-4 h-4 inline-block mr-1.5 -mt-0.5" />
              Create Room
            </button>
          </div>

          {activeTab === "join" ? (
            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="bg-card/50 p-6 rounded-3xl border border-border shadow-sm">
                <label className="block text-[10px] items-center text-center font-bold text-muted-foreground uppercase tracking-[0.2em] mb-4">
                  Enter Room Code
                </label>
                <Input
                  placeholder="KTY5R"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  className="bg-black/30 border-primary/20 h-16 text-primary placeholder:text-primary/20 text-center text-3xl tracking-[0.4em] font-mono uppercase rounded-2xl focus:ring-primary/40 focus:border-primary/60 transition-all shadow-inner shadow-primary/5"
                  maxLength={5}
                  data-testid="input-join-code"
                />
              </div>
              <Button
                onClick={handleJoin}
                disabled={joinCode.trim().length < 4}
                className="w-full h-14 bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-sm rounded-full shadow-lg shadow-primary/10 transition-all hover:scale-[1.01] active:scale-[0.98]"
                data-testid="button-join-room"
              >
                <LogIn className="w-4 h-4 mr-2" />
                Join the Party
              </Button>
              <p className="text-[10px] text-muted-foreground text-center px-4 uppercase tracking-tighter">
                Ask the host for the room code or scan their QR.
              </p>
            </div>
          ) : (
            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="bg-card/50 p-6 rounded-3xl border border-border">
                <label className="block text-[10px] text-center font-bold text-muted-foreground uppercase tracking-[0.2em] mb-4">
                  Room Name
                </label>
                <Input
                  placeholder="Friday Night Jam 🎧"
                  value={roomName}
                  onChange={(e) => setRoomName(e.target.value)}
                  className="bg-background border-border h-14 text-foreground placeholder:text-muted-foreground/30 text-center text-sm font-medium rounded-2xl focus:ring-primary/40 focus:border-primary/60 transition-all"
                  maxLength={50}
                  data-testid="input-room-name"
                />

                <div className="mt-6 flex flex-col gap-3">
                  <label className="text-[10px] text-center font-bold text-muted-foreground uppercase tracking-[0.2em]">
                    Room Type
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setPreset("speaker")}
                      className={`flex flex-col items-center gap-2 p-3 rounded-2xl border transition-all ${
                        preset === "speaker" 
                          ? "bg-primary/5 border-primary text-primary" 
                          : "bg-background border-border text-muted-foreground grayscale hover:grayscale-0"
                      }`}
                    >
                      <Dumbbell className="w-5 h-5" />
                      <span className="text-[10px] font-bold uppercase tracking-tighter">In-Room</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreset("remote")}
                      className={`flex flex-col items-center gap-2 p-3 rounded-2xl border transition-all ${
                        preset === "remote" 
                          ? "bg-primary/5 border-primary text-primary" 
                          : "bg-background border-border text-muted-foreground grayscale hover:grayscale-0"
                      }`}
                    >
                      <Headphones className="w-5 h-5" />
                      <span className="text-[10px] font-bold uppercase tracking-tighter">Remote Jam</span>
                    </button>
                  </div>
                  <p className="text-[10px] text-center text-muted-foreground mt-1 px-2 italic leading-tight">
                    {preset === "speaker" 
                      ? "Guests add songs; music plays on a shared speaker." 
                      : "You’re the DJ; friends join from anywhere and listen on their own Spotify."}
                  </p>
                </div>
              </div>

              <Button
                onClick={() => createRoom.mutate({
                  name: roomName || "My Room",
                  mode: "listen_along",
                  listenAlongEnabled: preset === "remote"
                })}
                disabled={createRoom.isPending}
                className="w-full h-14 bg-foreground text-background hover:bg-foreground/90 font-bold text-sm rounded-full transition-all hover:scale-[1.01] active:scale-[0.98]"
                data-testid="button-create-room"
              >
                {createRoom.isPending ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-background/30 border-t-background rounded-full animate-spin" />
                    Starting...
                  </span>
                ) : (
                  <>
                    <Plus className="w-4 h-4 mr-2" />
                    Create New Room
                  </>
                )}
              </Button>
              <p className="text-xs text-muted-foreground text-center px-4">
                You'll be the Host. One Spotify Premium account will power the speakers.
              </p>
            </div>
          )}
        </div>

        {/* How it works */}
        <div id="how-it-works" className="w-full max-w-sm mt-10 scroll-mt-8">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
            How it works
          </h2>
          <div className="space-y-3">
            {[
              { step: "1", text: "Host creates a room and shares the QR code" },
              { step: "2", text: "Anyone scans the QR to join the queue" },
              { step: "3", text: "Everyone drops up to 3 songs into the shared queue" },
            ].map((item) => (
              <div key={item.step} className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-primary/15 text-primary text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                  {item.step}
                </span>
                <p className="text-sm text-muted-foreground">{item.text}</p>
              </div>
            ))}
          </div>
        </div>

        {/* About QDrop */}
        <div id="about-us" className="w-full max-w-sm mt-12 pt-8 border-t border-border/50 text-center scroll-mt-8">
          <h2 className="text-sm font-semibold text-foreground mb-3">
            About QDrop
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            QDrop is built for shared speakers, quick joins, and a cleaner way to hand music control to the room without passing around one phone.
          </p>
          <div className="mt-6 space-y-3 text-left">
            {aboutCards.map((card) => (
              <div key={card.title} className="rounded-xl border border-border/60 bg-card/60 p-4">
                <h3 className="text-sm font-semibold text-foreground">{card.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{card.text}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-col gap-2">
            <p className="text-[10px] text-muted-foreground/60 uppercase tracking-widest">
              Live At
            </p>
            <a
              href="https://qdrop.live"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-mono text-primary hover:underline transition-all"
            >
              qdrop.live
            </a>
          </div>
        </div>

        <div className="pb-6">
          <AppFooter />
        </div>
      </div>
    </div>
  );
}
