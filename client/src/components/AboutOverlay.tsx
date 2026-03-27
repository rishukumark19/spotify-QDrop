import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Info, Music, Headphones, Users, Mic2 } from "lucide-react";

export function AboutOverlay() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="w-9 h-9 rounded-full text-muted-foreground hover:text-foreground">
          <Info className="w-5 h-5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-[400px] rounded-3xl p-6 border-none shadow-2xl">
        <DialogHeader className="mb-4">
          <DialogTitle className="text-xl font-bold tracking-tight text-center">How QDrop Works</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6">
          <div className="space-y-4">
            <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary text-center">Three Roles</h3>
            
            <div className="grid gap-3">
              <div className="bg-muted/50 p-4 rounded-2xl flex gap-4">
                <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <Mic2 className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold">The Host (DJ)</h4>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">You're the DJ. One Spotify Premium account powers the physical speakers.</p>
                </div>
              </div>

              <div className="bg-muted/50 p-4 rounded-2xl flex gap-4">
                <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold">Guests (Add Songs)</h4>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">Join with a code to drop songs into the queue. No Spotify account required.</p>
                </div>
              </div>

              <div className="bg-muted/50 p-4 rounded-2xl flex gap-4">
                <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <Headphones className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold">Listen Along (Optional)</h4>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">Remote? Connect your Spotify to hear everything in sync on your own device.</p>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-4 pt-2">
            <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary text-center">Two Main Modes</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="border border-border p-3 rounded-xl">
                <div className="w-8 h-8 rounded-lg bg-card border border-border flex items-center justify-center mb-2">
                  <Music className="w-4 h-4 text-muted-foreground" />
                </div>
                <h4 className="text-[11px] font-bold uppercase tracking-tight mb-1">In-Room</h4>
                <p className="text-[10px] text-muted-foreground leading-tight">Shared speakers in a physical venue.</p>
              </div>
              <div className="border border-border p-3 rounded-xl">
                <div className="w-8 h-8 rounded-lg bg-card border border-border flex items-center justify-center mb-2">
                  <Headphones className="w-4 h-4 text-muted-foreground" />
                </div>
                <h4 className="text-[11px] font-bold uppercase tracking-tight mb-1">Remote Jam</h4>
                <p className="text-[10px] text-muted-foreground leading-tight">Sync audio across multiple locations.</p>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-8 text-center">
          <p className="text-[10px] text-muted-foreground italic font-medium">QDrop: Built for shared speakers, quick joins, and social vibes.</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
