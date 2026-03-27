import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Laptop, Smartphone, Speaker, Check, RefreshCw, Monitor, HelpCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "@/hooks/use-toast";

interface Device {
  id: string;
  is_active: boolean;
  is_private_session: boolean;
  is_restricted: boolean;
  name: string;
  type: string;
  volume_percent: number;
}

interface SpotifyDevicePickerProps {
  token: string;
  onDeviceSelected?: (deviceId: string) => void;
}

export function SpotifyDevicePicker({ token, onDeviceSelected }: SpotifyDevicePickerProps) {
  const [isRefreshing, setIsRefreshing] = useState(false);

  const devicesQuery = useQuery<Device[]>({
    queryKey: ["/api/spotify/devices", token],
    queryFn: async () => {
      const res = await fetch("https://api.spotify.com/v1/me/player/devices", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to fetch devices");
      const data = await res.json();
      return data.devices || [];
    },
    refetchInterval: 30000, // Sync every 30s
  });

  const refreshDevices = async () => {
    setIsRefreshing(true);
    await devicesQuery.refetch();
    setTimeout(() => setIsRefreshing(false), 1000);
    toast({ title: "Refreshing devices...", description: "Checking your Spotify for active speakers." });
  };

  const getDeviceIcon = (type: string) => {
    switch (type.toLowerCase()) {
      case "computer": return <Monitor className="w-5 h-5" />;
      case "smartphone": return <Smartphone className="w-5 h-5" />;
      case "speaker": return <Speaker className="w-5 h-5" />;
      default: return <Laptop className="w-5 h-5" />;
    }
  };

  const devices = devicesQuery.data || [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
          Your Spotify Devices
          <HelpCircle className="w-3 h-3 cursor-help text-muted-foreground/50" />
        </h3>
        <Button 
          variant="ghost" 
          size="icon" 
          className="w-8 h-8 rounded-full"
          onClick={refreshDevices}
          disabled={isRefreshing}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
        </Button>
      </div>

      <div className="grid gap-2">
        {devicesQuery.isLoading ? (
          <div className="py-8 text-center"><RefreshCw className="w-6 h-6 animate-spin mx-auto text-primary/30" /></div>
        ) : devices.length === 0 ? (
          <div className="p-6 text-center border-2 border-dashed rounded-2xl border-border/50">
            <p className="text-sm text-muted-foreground font-medium mb-1">No active devices found</p>
            <p className="text-[10px] text-muted-foreground/70">Open Spotify on your phone or computer to start listening.</p>
          </div>
        ) : (
          devices.map((device) => (
            <button
              key={device.id}
              onClick={() => onDeviceSelected?.(device.id)}
              disabled={device.is_restricted}
              className={`
                group w-full flex items-center gap-4 p-4 rounded-2xl text-left transition-all border-2
                ${device.is_active 
                  ? "bg-primary/5 border-primary shadow-sm" 
                  : "bg-muted/30 border-transparent hover:bg-muted/50 hover:border-border"
                }
                ${device.is_restricted ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
              `}
            >
              <div className={`
                w-10 h-10 rounded-xl flex items-center justify-center transition-colors
                ${device.is_active ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground group-hover:text-foreground"}
              `}>
                {getDeviceIcon(device.type)}
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-bold truncate ${device.is_active ? "text-primary" : "text-foreground"}`}>
                  {device.name}
                </p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold">
                  {device.type} {device.is_active && "• Active"}
                </p>
              </div>
              {device.is_active && (
                <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center animate-in zoom-in-50 duration-300">
                  <Check className="w-3.5 h-3.5 text-primary-foreground" />
                </div>
              )}
            </button>
          ))
        )}
      </div>
    </div>
  );
}
