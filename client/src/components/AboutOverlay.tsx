import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Info, Music, Headphones, Users, Mic2, X } from "lucide-react";

export function AboutOverlay() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="w-10 h-10 rounded-full bg-card/40 border border-border/40 text-muted-foreground hover:text-primary transition-all shadow-sm">
          <Info className="w-5 h-5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-[400px] w-[92vw] rounded-[2.5rem] p-8 border-none shadow-2xl overflow-hidden bg-background">
        <DialogClose className="absolute right-6 top-6 p-2 rounded-full hover:bg-muted transition-colors z-50">
          <X className="w-5 h-5 text-muted-foreground" />
        </DialogClose>

        <DialogHeader className="mb-8">
          <DialogTitle className="text-2xl font-black tracking-tighter text-center">How QDrop Works</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-8">
          <div className="space-y-5">
            <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-primary text-center">The Roles</h3>
            
            <div className="grid gap-4">
              <div className="bg-muted/30 p-5 rounded-3xl flex gap-4 border border-border/50">
                <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shrink-0 shadow-inner">
                  <Mic2 className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-sm font-bold">The Host</h4>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed font-medium">Connects Spotify Premium to power the physical speakers.</p>
                </div>
              </div>

              <div className="bg-muted/30 p-5 rounded-3xl flex gap-4 border border-border/50">
                <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shrink-0 shadow-inner">
                  <Users className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-sm font-bold">Guests</h4>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed font-medium">Join with a code to drop tracks into the room. No login needed.</p>
                </div>
              </div>

              <div className="bg-muted/30 p-5 rounded-3xl flex gap-4 border border-border/50">
                <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shrink-0 shadow-inner">
                  <Headphones className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-sm font-bold">Listeners</h4>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed font-medium">Away? Sync host audio to your own phone in real-time.</p>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-5 pt-2">
            <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-primary text-center">Room Types</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-card border-2 border-primary/10 p-4 rounded-3xl shadow-sm">
                <div className="w-10 h-10 rounded-xl bg-muted border border-border flex items-center justify-center mb-3">
                  <Music className="w-5 h-5 text-muted-foreground" />
                </div>
                <h4 className="text-xs font-bold uppercase tracking-tight mb-1">In-Room</h4>
                <p className="text-[10px] text-muted-foreground leading-snug font-medium">Parties & Shared Speakers.</p>
              </div>
              <div className="bg-primary/5 border-2 border-primary/30 p-4 rounded-3xl shadow-sm">
                <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-3">
                  <Headphones className="w-5 h-5 text-primary" />
                </div>
                <h4 className="text-xs font-bold uppercase tracking-tight mb-1 text-primary">Remote Jam</h4>
                <p className="text-[10px] text-primary/60 leading-snug font-medium">Virtual Listening Parties.</p>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-10 pt-6 border-t border-border/50 text-center">
          <p className="text-[10px] text-muted-foreground italic font-medium">Social queueing, simplified.</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
