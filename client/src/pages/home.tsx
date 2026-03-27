import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Music, Plus, LogIn, Dumbbell } from "lucide-react";
import { PerplexityAttribution } from "@/components/PerplexityAttribution";

export default function Home() {
  const [, navigate] = useLocation();
  const [roomName, setRoomName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [activeTab, setActiveTab] = useState<"create" | "join">("create");
  const currentOrigin = typeof window !== "undefined" ? window.location.origin : "";
  const currentHost = currentOrigin.replace(/^https?:\/\//, "");

  const createRoom = useMutation({
    mutationFn: async (name: string) => {
      const res = await apiRequest("POST", "/api/rooms", { name });
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

  return (
    <div className="min-h-screen bg-background flex flex-col">
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
        <p className="text-sm text-muted-foreground mt-1">
          Shared music queue. Scan, drop, play.
        </p>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col items-center px-6 pb-8">
        <div className="w-full max-w-sm">
          {/* Tab switcher */}
          <div className="flex rounded-lg bg-card p-1 mb-6" data-testid="tab-switcher">
            <button
              onClick={() => setActiveTab("create")}
              className={`flex-1 py-2.5 px-4 rounded-md text-sm font-medium transition-all ${
                activeTab === "create"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              data-testid="button-tab-create"
            >
              <Plus className="w-4 h-4 inline-block mr-1.5 -mt-0.5" />
              Create Room
            </button>
            <button
              onClick={() => setActiveTab("join")}
              className={`flex-1 py-2.5 px-4 rounded-md text-sm font-medium transition-all ${
                activeTab === "join"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              data-testid="button-tab-join"
            >
              <LogIn className="w-4 h-4 inline-block mr-1.5 -mt-0.5" />
              Join Room
            </button>
          </div>

          {activeTab === "create" ? (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Room Name
                </label>
                <Input
                  placeholder="e.g. Iron Paradise, Gold's Gym"
                  value={roomName}
                  onChange={(e) => setRoomName(e.target.value)}
                  className="bg-card border-border h-12 text-foreground placeholder:text-muted-foreground"
                  maxLength={50}
                  data-testid="input-room-name"
                />
              </div>
              <Button
                onClick={() => createRoom.mutate(roomName || "My Room")}
                disabled={createRoom.isPending}
                className="w-full h-12 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-sm rounded-full"
                data-testid="button-create-room"
              >
                {createRoom.isPending ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                    Creating...
                  </span>
                ) : (
                  <>
                    <Dumbbell className="w-4 h-4 mr-2" />
                    Create Room
                  </>
                )}
              </Button>
              <p className="text-xs text-muted-foreground text-center">
                You'll get a QR code others can scan to join
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Room Code
                </label>
                <Input
                  placeholder="Enter 5-letter code"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  className="bg-card border-border h-12 text-foreground placeholder:text-muted-foreground text-center text-lg tracking-[0.3em] font-mono uppercase"
                  maxLength={5}
                  data-testid="input-join-code"
                />
              </div>
              <Button
                onClick={handleJoin}
                disabled={joinCode.trim().length < 4}
                className="w-full h-12 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-sm rounded-full"
                data-testid="button-join-room"
              >
                <LogIn className="w-4 h-4 mr-2" />
                Join Room
              </Button>
              <p className="text-xs text-muted-foreground text-center">
                Ask the person controlling the speaker for the code
              </p>
            </div>
          )}
        </div>

        {/* How it works */}
        <div className="w-full max-w-sm mt-10">
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
        <div className="w-full max-w-sm mt-12 pt-8 border-t border-border/50 text-center">
          <h2 className="text-sm font-semibold text-foreground mb-3">
            About QDrop
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            QDrop is a real-time collaborative music queue. Host a room, share the QR code, and let everyone drop their favorite tracks seamlessly.
          </p>
          {currentOrigin && (
            <div className="mt-4 flex flex-col gap-2">
              <p className="text-[10px] text-muted-foreground/60 uppercase tracking-widest">
                Running At
              </p>
              <a
                href={currentOrigin}
                className="text-xs font-mono text-primary hover:underline transition-all"
              >
                {currentHost}
              </a>
            </div>
          )}
        </div>

        <div className="pb-6">
          <PerplexityAttribution />
        </div>
      </div>
    </div>
  );
}
