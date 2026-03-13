import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Lock, Unlock, GraduationCap, BookOpen, Users, Shield, QrCode, CheckCircle, XCircle, Camera, KeyRound } from "lucide-react";

type ScannerStatus = {
  isLocked: boolean;
  scanWindow: "checkin" | "checkout" | "closed";
  isHoliday: boolean;
  holidayDescription: string | null;
  currentTime: string;
  currentDate: string;
};

type ScanResult = {
  success: boolean;
  type?: "datang" | "pulang";
  name?: string;
  time?: string;
  className?: string;
  status?: string;
  message: string;
};

function playSound(type: "success" | "error") {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    if (type === "success") {
      osc.frequency.setValueAtTime(800, ctx.currentTime);
      osc.frequency.setValueAtTime(1200, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.3);
    } else {
      osc.frequency.setValueAtTime(300, ctx.currentTime);
      osc.type = "square";
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.5);
    }
  } catch (e) {}
}

function ScanPopup({ result, onClose }: { result: ScanResult; onClose: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-in fade-in duration-200">
      <div className={`rounded-2xl p-8 shadow-2xl max-w-sm w-full mx-4 text-center transform animate-in zoom-in-95 duration-300 ${
        result.success ? "bg-green-50 dark:bg-green-950 border-2 border-green-500" : "bg-red-50 dark:bg-red-950 border-2 border-red-500"
      }`}>
        <div className="flex justify-center mb-4">
          {result.success ? (
            <CheckCircle className="w-16 h-16 text-green-500 animate-in spin-in-180 duration-500" />
          ) : (
            <XCircle className="w-16 h-16 text-red-500 animate-in spin-in-180 duration-500" />
          )}
        </div>
        <h3 className={`text-xl font-bold mb-2 ${result.success ? "text-green-700 dark:text-green-300" : "text-red-700 dark:text-red-300"}`}>
          {result.success ? "Berhasil!" : "Gagal!"}
        </h3>
        {result.name && (
          <p className="text-lg font-semibold text-foreground">{result.name}</p>
        )}
        {result.className && (
          <p className="text-sm text-muted-foreground">{result.className}</p>
        )}
        {result.type && (
          <p className={`text-sm font-medium mt-1 ${result.success ? result.status === "telat" ? "text-yellow-600 dark:text-yellow-400" : "text-green-600 dark:text-green-400" : ""}`}>
            {result.status === "telat" ? "Terlambat" : result.type === "datang" ? "Absen Datang" : "Absen Pulang"} - {result.time}
          </p>
        )}
        <p className="text-sm text-muted-foreground mt-2">{result.message}</p>
      </div>
    </div>
  );
}

function QRScanner({ onScan, disabled }: { onScan: (code: string) => void; disabled: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanningRef = useRef(false);
  const animationRef = useRef<number>(0);

  useEffect(() => {
    let mounted = true;

    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment", width: { ideal: 640 }, height: { ideal: 480 } }
        });
        if (!mounted) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          scanLoop();
        }
      } catch (err) {
        console.error("Camera error:", err);
      }
    }

    async function scanLoop() {
      if (!mounted || !videoRef.current || !canvasRef.current) return;
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      if (!ctx || video.readyState !== video.HAVE_ENOUGH_DATA) {
        animationRef.current = requestAnimationFrame(scanLoop);
        return;
      }

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0);

      if (!disabled && !scanningRef.current) {
        try {
          const { default: jsQR } = await import("jsqr");
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(imageData.data, imageData.width, imageData.height);
          if (code) {
            scanningRef.current = true;
            onScan(code.data);
            setTimeout(() => { scanningRef.current = false; }, 3000);
          }
        } catch (e) {}
      }

      animationRef.current = requestAnimationFrame(scanLoop);
    }

    startCamera();

    return () => {
      mounted = false;
      cancelAnimationFrame(animationRef.current);
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, [disabled, onScan]);

  return (
    <div className="relative w-full aspect-[4/3] bg-black rounded-xl overflow-hidden">
      <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
      <canvas ref={canvasRef} className="hidden" />
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="w-48 h-48 border-2 border-white/50 rounded-lg">
          <div className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-white rounded-tl-lg" />
          <div className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-white rounded-tr-lg" />
          <div className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-white rounded-bl-lg" />
          <div className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-white rounded-br-lg" />
        </div>
      </div>
      {disabled && (
        <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
          <p className="text-white/80 text-sm">Menunggu cooldown...</p>
        </div>
      )}
    </div>
  );
}

function LoginDialog({ open, onClose, title, role, icon: Icon }: {
  open: boolean;
  onClose: () => void;
  title: string;
  role: string;
  icon: any;
}) {
  const { login } = useAuth();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const loginPassword = role === "admin" ? password : identifier;
      await login({ identifier, password: loginPassword, role });
      onClose();
    } catch (err: any) {
      setError(err.message || "Login gagal");
    } finally {
      setLoading(false);
    }
  };

  const getPlaceholder = () => {
    if (role === "siswa") return "NISN";
    if (role === "guru" || role === "wali_kelas") return "NIP";
    return "Username";
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon className="w-5 h-5" />
            {title}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="identifier">{getPlaceholder()}</Label>
            <Input
              id="identifier"
              data-testid="input-identifier"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder={`Masukkan ${getPlaceholder()}`}
              required
            />
          </div>
          {role === "admin" && (
            <div>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                data-testid="input-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Masukkan password"
                required
              />
            </div>
          )}
          {error && <p className="text-sm text-destructive" data-testid="text-login-error">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading} data-testid="button-login-submit">
            {loading ? "Memproses..." : "Masuk"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function LandingPage() {
  const [loginDialog, setLoginDialog] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [cooldown, setCooldown] = useState(false);
  const [showPinDialog, setShowPinDialog] = useState(false);
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState("");

  const { data: status, refetch } = useQuery<ScannerStatus>({
    queryKey: ["/api/scanner/status"],
    refetchInterval: 10000,
  });

  const togglePinMutation = useMutation({
    mutationFn: async (pinCode: string) => {
      const res = await apiRequest("POST", "/api/scanner/toggle-pin", { pin: pinCode });
      return res.json();
    },
    onSuccess: () => {
      setShowPinDialog(false);
      setPin("");
      setPinError("");
      refetch();
    },
    onError: (err: any) => {
      setPinError("PIN salah");
    },
  });

  const scanMutation = useMutation({
    mutationFn: async (qrCode: string) => {
      const res = await apiRequest("POST", "/api/scan", { qrCode });
      return res.json();
    },
    onSuccess: (data) => {
      playSound("success");
      setScanResult({ ...data, success: true });
      setCooldown(true);
      setTimeout(() => setCooldown(false), 3000);
      refetch();
    },
    onError: (error: any) => {
      playSound("error");
      let message = "Scan gagal";
      try {
        const parsed = JSON.parse(error.message.split(": ").slice(1).join(": "));
        message = parsed.message || message;
      } catch { message = error.message; }
      setScanResult({ success: false, message });
      setCooldown(true);
      setTimeout(() => setCooldown(false), 3000);
    },
  });

  const handleScan = useCallback((code: string) => {
    if (!cooldown && !scanMutation.isPending) {
      scanMutation.mutate(code);
    }
  }, [cooldown, scanMutation]);

  const scannerActive = status && !status.isLocked && status.scanWindow !== "closed" && !status.isHoliday;

  const loginCards = [
    { role: "siswa", title: "Login Siswa", subtitle: "Masuk dengan NISN", icon: GraduationCap, color: "from-blue-500 to-blue-600" },
    { role: "guru", title: "Login Guru", subtitle: "Masuk dengan NIP", icon: BookOpen, color: "from-emerald-500 to-emerald-600" },
    { role: "wali_kelas", title: "Login Wali Kelas", subtitle: "Masuk dengan NIP", icon: Users, color: "from-amber-500 to-amber-600" },
    { role: "admin", title: "Login Admin", subtitle: "Username & Password", icon: Shield, color: "from-purple-500 to-purple-600" },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 dark:from-gray-950 dark:via-gray-900 dark:to-blue-950">
      <div className="container mx-auto px-3 sm:px-4 py-4 sm:py-8 max-w-5xl">
        <div className="text-center mb-4 sm:mb-8">
          <div className="inline-flex items-center gap-2 sm:gap-3 mb-2">
            <QrCode className="w-7 h-7 sm:w-10 sm:h-10 text-primary" />
            <h1 className="text-xl sm:text-3xl md:text-4xl font-bold text-foreground" data-testid="text-title">
              MTs Al Fatah Talun
            </h1>
          </div>
          <p className="text-sm sm:text-base text-muted-foreground">Scan QR Code untuk absensi kehadiran</p>
        </div>

        <Card className="mb-4 sm:mb-8 overflow-hidden border-2">
          <CardHeader className="bg-gradient-to-r from-primary/10 to-primary/5 pb-3">
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Camera className="w-5 h-5" />
                <span>Scanner QR Code</span>
              </div>
              <button
                onClick={() => { setShowPinDialog(true); setPin(""); setPinError(""); }}
                className="flex items-center gap-1 text-sm font-normal px-2 py-1 rounded-md hover:bg-muted transition-colors"
                data-testid="button-pin-toggle"
              >
                {status?.isLocked ? (
                  <span className="flex items-center gap-1 text-destructive">
                    <Lock className="w-4 h-4" /> Terkunci
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
                    <Unlock className="w-4 h-4" /> Aktif
                  </span>
                )}
                <KeyRound className="w-3 h-3 ml-1 text-muted-foreground" />
              </button>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            {status?.isLocked ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <Lock className="w-16 h-16 mb-4 opacity-30" />
                <p className="text-lg font-medium">Scanner Dikunci oleh Admin</p>
                <p className="text-sm">Hubungi admin untuk mengaktifkan scanner</p>
              </div>
            ) : status?.isHoliday ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <QrCode className="w-16 h-16 mb-4 opacity-30" />
                <p className="text-lg font-medium">Hari Libur</p>
                <p className="text-sm">{status.holidayDescription}</p>
              </div>
            ) : status?.scanWindow === "closed" ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <QrCode className="w-16 h-16 mb-4 opacity-30" />
                <p className="text-lg font-medium">Di Luar Jadwal Scan</p>
                <p className="text-sm">Waktu saat ini: {status?.currentTime}</p>
              </div>
            ) : (
              <div>
                <div className="mb-2 text-center">
                  <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                    status?.scanWindow === "checkin" 
                      ? "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300" 
                      : "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300"
                  }`} data-testid="text-scan-window">
                    {status?.scanWindow === "checkin" ? "Absen Datang" : "Absen Pulang"}
                  </span>
                </div>
                <QRScanner onScan={handleScan} disabled={cooldown || scanMutation.isPending} />
                {cooldown && (
                  <p className="text-center text-sm text-muted-foreground mt-2">Cooldown 3 detik...</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-4">
          {loginCards.map((card) => (
            <Card
              key={card.role}
              className="cursor-pointer transition-all hover:shadow-lg hover:-translate-y-1 border"
              onClick={() => setLoginDialog(card.role)}
              data-testid={`card-login-${card.role}`}
            >
              <CardContent className="p-3 sm:p-4 text-center">
                <div className={`w-10 h-10 sm:w-12 sm:h-12 mx-auto mb-2 sm:mb-3 rounded-xl bg-gradient-to-br ${card.color} flex items-center justify-center`}>
                  <card.icon className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
                </div>
                <h3 className="font-semibold text-xs sm:text-sm">{card.title}</h3>
                <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5 sm:mt-1">{card.subtitle}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {scanResult && (
        <ScanPopup result={scanResult} onClose={() => setScanResult(null)} />
      )}

      <LoginDialog
        open={loginDialog === "siswa"}
        onClose={() => setLoginDialog(null)}
        title="Login Siswa"
        role="siswa"
        icon={GraduationCap}
      />
      <LoginDialog
        open={loginDialog === "guru"}
        onClose={() => setLoginDialog(null)}
        title="Login Guru"
        role="guru"
        icon={BookOpen}
      />
      <LoginDialog
        open={loginDialog === "wali_kelas"}
        onClose={() => setLoginDialog(null)}
        title="Login Wali Kelas"
        role="wali_kelas"
        icon={Users}
      />
      <LoginDialog
        open={loginDialog === "admin"}
        onClose={() => setLoginDialog(null)}
        title="Login Admin"
        role="admin"
        icon={Shield}
      />

      <Dialog open={showPinDialog} onOpenChange={setShowPinDialog}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="w-5 h-5" />
              {status?.isLocked ? "Buka Kunci Scanner" : "Kunci Scanner"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); togglePinMutation.mutate(pin); }} className="space-y-4">
            <div>
              <Label htmlFor="pin">Masukkan PIN</Label>
              <Input
                id="pin"
                type="password"
                inputMode="numeric"
                maxLength={6}
                value={pin}
                onChange={(e) => { setPin(e.target.value); setPinError(""); }}
                placeholder="****"
                className="text-center text-2xl tracking-widest"
                data-testid="input-pin"
                autoFocus
              />
            </div>
            {pinError && <p className="text-sm text-destructive text-center" data-testid="text-pin-error">{pinError}</p>}
            <Button type="submit" className="w-full" disabled={!pin || togglePinMutation.isPending} data-testid="button-pin-submit">
              {togglePinMutation.isPending ? "Memproses..." : status?.isLocked ? "Buka Kunci" : "Kunci Scanner"}
            </Button>
            <p className="text-xs text-muted-foreground text-center">Hubungi admin jika lupa PIN</p>
          </form>
        </DialogContent>
      </Dialog>

      <div className="text-center py-4 mt-4">
        <p className="text-[10px] text-muted-foreground/50" data-testid="text-credit">Developed by Bangkit Cerdas Mandiri</p>
      </div>
    </div>
  );
}
