import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import QRCode from "react-qr-code";
import {
  LogOut, User, History, FileText, Upload, UserCheck, Clock, AlertTriangle, UserX
} from "lucide-react";

function StatusBadge({ status }: { status?: string }) {
  if (!status) return <Badge variant="outline">Belum</Badge>;
  switch (status) {
    case "hadir":
      return <Badge variant="default">Hadir</Badge>;
    case "telat":
      return <Badge variant="secondary" className="bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300">Telat</Badge>;
    case "izin":
      return <Badge variant="secondary" className="bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300">Izin</Badge>;
    case "sakit":
      return <Badge variant="secondary" className="bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300">Sakit</Badge>;
    case "alpha":
      return <Badge variant="destructive">Alpha</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

export default function StudentDashboard() {
  const { user, logout } = useAuth();
  const { toast } = useToast();

  const { data: attendance } = useQuery<any[]>({ queryKey: ["/api/attendance/history"] });
  const { data: excuses } = useQuery<any[]>({ queryKey: ["/api/excuses"] });

  const [excuseDate, setExcuseDate] = useState("");
  const [excuseType, setExcuseType] = useState("sakit");
  const [excuseDesc, setExcuseDesc] = useState("");
  const [excusePhoto, setExcusePhoto] = useState<File | null>(null);

  const excuseMutation = useMutation({
    mutationFn: async () => {
      const formData = new FormData();
      formData.append("date", excuseDate);
      formData.append("type", excuseType);
      formData.append("description", excuseDesc);
      if (excusePhoto) formData.append("photo", excusePhoto);
      const res = await fetch("/api/excuses", { method: "POST", body: formData, credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/excuses"] });
      queryClient.invalidateQueries({ queryKey: ["/api/attendance/history"] });
      setExcuseDate(""); setExcuseDesc(""); setExcusePhoto(null);
      toast({ title: "Izin berhasil diajukan" });
    },
    onError: (err: any) => toast({ title: "Gagal", description: err.message, variant: "destructive" }),
  });

  const stats = {
    hadir: attendance?.filter(a => a.status === "hadir").length || 0,
    telat: attendance?.filter(a => a.status === "telat").length || 0,
    izin: attendance?.filter(a => a.status === "izin").length || 0,
    sakit: attendance?.filter(a => a.status === "sakit").length || 0,
    alpha: attendance?.filter(a => a.status === "alpha").length || 0,
  };
  const totalDays = attendance?.length || 0;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container mx-auto px-3 sm:px-4 py-3 sm:py-4 flex items-center justify-between max-w-4xl">
          <div className="min-w-0 flex-1 mr-2">
            <h1 className="font-bold text-base sm:text-lg truncate" data-testid="text-student-name">{user?.name}</h1>
            <p className="text-xs sm:text-sm text-muted-foreground truncate">NISN: {user?.identifier} | Kelas: {user?.className || "-"}</p>
          </div>
          <Button variant="outline" size="sm" onClick={logout} data-testid="button-logout" className="flex-shrink-0"><LogOut className="w-4 h-4 sm:mr-1" /><span className="hidden sm:inline">Keluar</span></Button>
        </div>
      </header>

      <div className="container mx-auto px-3 sm:px-4 py-4 sm:py-6 max-w-4xl">
        <Tabs defaultValue="history">
          <TabsList className="mb-4 w-full sm:w-auto">
            <TabsTrigger value="history" data-testid="tab-history" className="flex-1 sm:flex-initial text-xs sm:text-sm"><History className="w-4 h-4 sm:mr-1" /><span className="hidden sm:inline">Riwayat</span></TabsTrigger>
            <TabsTrigger value="profile" data-testid="tab-profile" className="flex-1 sm:flex-initial text-xs sm:text-sm"><User className="w-4 h-4 sm:mr-1" /><span className="hidden sm:inline">Profil</span></TabsTrigger>
            <TabsTrigger value="excuse" data-testid="tab-excuse" className="flex-1 sm:flex-initial text-xs sm:text-sm"><FileText className="w-4 h-4 sm:mr-1" /><span className="hidden sm:inline">Izin</span></TabsTrigger>
          </TabsList>

          <TabsContent value="history">
            <div className="space-y-4">
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5 sm:gap-2">
                <Card data-testid="stat-hadir">
                  <CardContent className="p-2 sm:p-3 text-center">
                    <UserCheck className="w-4 h-4 sm:w-5 sm:h-5 mx-auto mb-0.5 sm:mb-1 text-green-600" />
                    <p className="text-lg sm:text-2xl font-bold text-green-600">{stats.hadir}</p>
                    <p className="text-[10px] sm:text-xs text-muted-foreground">Hadir</p>
                  </CardContent>
                </Card>
                <Card data-testid="stat-telat">
                  <CardContent className="p-2 sm:p-3 text-center">
                    <Clock className="w-4 h-4 sm:w-5 sm:h-5 mx-auto mb-0.5 sm:mb-1 text-orange-600" />
                    <p className="text-lg sm:text-2xl font-bold text-orange-600">{stats.telat}</p>
                    <p className="text-[10px] sm:text-xs text-muted-foreground">Telat</p>
                  </CardContent>
                </Card>
                <Card data-testid="stat-izin">
                  <CardContent className="p-2 sm:p-3 text-center">
                    <FileText className="w-4 h-4 sm:w-5 sm:h-5 mx-auto mb-0.5 sm:mb-1 text-blue-600" />
                    <p className="text-lg sm:text-2xl font-bold text-blue-600">{stats.izin}</p>
                    <p className="text-[10px] sm:text-xs text-muted-foreground">Izin</p>
                  </CardContent>
                </Card>
                <Card data-testid="stat-sakit">
                  <CardContent className="p-2 sm:p-3 text-center">
                    <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5 mx-auto mb-0.5 sm:mb-1 text-yellow-600" />
                    <p className="text-lg sm:text-2xl font-bold text-yellow-600">{stats.sakit}</p>
                    <p className="text-[10px] sm:text-xs text-muted-foreground">Sakit</p>
                  </CardContent>
                </Card>
                <Card data-testid="stat-alpha">
                  <CardContent className="p-2 sm:p-3 text-center">
                    <UserX className="w-4 h-4 sm:w-5 sm:h-5 mx-auto mb-0.5 sm:mb-1 text-red-600" />
                    <p className="text-lg sm:text-2xl font-bold text-red-600">{stats.alpha}</p>
                    <p className="text-[10px] sm:text-xs text-muted-foreground">Alpha</p>
                  </CardContent>
                </Card>
              </div>

              {totalDays > 0 && (
                <Card>
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Total {totalDays} hari tercatat</span>
                      <span className="font-medium" data-testid="text-attendance-rate">
                        Kehadiran: {Math.round(((stats.hadir + stats.telat) / totalDays) * 100)}%
                      </span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2.5 mt-2">
                      <div className="flex h-2.5 rounded-full overflow-hidden">
                        <div className="bg-green-500" style={{ width: `${(stats.hadir / totalDays) * 100}%` }} />
                        <div className="bg-orange-500" style={{ width: `${(stats.telat / totalDays) * 100}%` }} />
                        <div className="bg-blue-500" style={{ width: `${(stats.izin / totalDays) * 100}%` }} />
                        <div className="bg-yellow-500" style={{ width: `${(stats.sakit / totalDays) * 100}%` }} />
                        <div className="bg-red-500" style={{ width: `${(stats.alpha / totalDays) * 100}%` }} />
                      </div>
                    </div>
                    <div className="flex gap-3 mt-2 text-xs text-muted-foreground flex-wrap">
                      <span className="flex items-center gap-1"><span className="w-2 h-2 bg-green-500 rounded-full inline-block" />Hadir</span>
                      <span className="flex items-center gap-1"><span className="w-2 h-2 bg-orange-500 rounded-full inline-block" />Telat</span>
                      <span className="flex items-center gap-1"><span className="w-2 h-2 bg-blue-500 rounded-full inline-block" />Izin</span>
                      <span className="flex items-center gap-1"><span className="w-2 h-2 bg-yellow-500 rounded-full inline-block" />Sakit</span>
                      <span className="flex items-center gap-1"><span className="w-2 h-2 bg-red-500 rounded-full inline-block" />Alpha</span>
                    </div>
                  </CardContent>
                </Card>
              )}

              <div className="border rounded-lg overflow-auto">
                <table className="w-full text-xs sm:text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="px-2 sm:px-4 py-2 text-left">Tanggal</th>
                      <th className="px-2 sm:px-4 py-2 text-left">Datang</th>
                      <th className="px-2 sm:px-4 py-2 text-left">Pulang</th>
                      <th className="px-2 sm:px-4 py-2 text-left">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {attendance?.map((a: any) => (
                      <tr key={a.id} className="border-t" data-testid={`row-attendance-${a.id}`}>
                        <td className="px-2 sm:px-4 py-1.5 sm:py-2">{a.date}</td>
                        <td className="px-2 sm:px-4 py-1.5 sm:py-2">{a.checkInTime || "-"}</td>
                        <td className="px-2 sm:px-4 py-1.5 sm:py-2">{a.checkOutTime || "-"}</td>
                        <td className="px-2 sm:px-4 py-1.5 sm:py-2">
                          <StatusBadge status={a.status} />
                        </td>
                      </tr>
                    ))}
                    {(!attendance || attendance.length === 0) && (
                      <tr><td colSpan={4} className="px-2 sm:px-4 py-8 text-center text-muted-foreground">Belum ada data kehadiran</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="profile">
            <Card>
              <CardContent className="p-6 flex flex-col items-center">
                <div className="bg-white p-4 rounded-xl shadow-sm mb-4">
                  <QRCode value={user?.qrCode || ""} size={180} />
                </div>
                <h2 className="text-xl font-bold">{user?.name}</h2>
                <p className="text-muted-foreground">NISN: {user?.identifier}</p>
                <p className="text-muted-foreground">Kelas: {user?.className || "-"}</p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="excuse">
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader><CardTitle>Ajukan Izin</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <div><Label>Tanggal</Label><Input type="date" value={excuseDate} onChange={e => setExcuseDate(e.target.value)} data-testid="input-excuse-date" /></div>
                  <div>
                    <Label>Jenis</Label>
                    <Select value={excuseType} onValueChange={setExcuseType}>
                      <SelectTrigger data-testid="select-excuse-type"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="sakit">Sakit</SelectItem>
                        <SelectItem value="izin">Izin</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label>Keterangan</Label><Textarea value={excuseDesc} onChange={e => setExcuseDesc(e.target.value)} placeholder="Jelaskan alasan..." data-testid="input-excuse-desc" /></div>
                  <div><Label>Foto Bukti</Label><Input type="file" accept="image/*" onChange={e => setExcusePhoto(e.target.files?.[0] || null)} data-testid="input-excuse-photo" /></div>
                  <Button onClick={() => excuseMutation.mutate()} disabled={!excuseDate || !excuseDesc || excuseMutation.isPending} className="w-full" data-testid="button-submit-excuse">
                    <Upload className="w-4 h-4 mr-2" />{excuseMutation.isPending ? "Mengirim..." : "Kirim Izin"}
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle>Riwayat Izin</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {excuses?.map((e: any) => (
                      <div key={e.id} className="border rounded-lg p-3" data-testid={`card-excuse-${e.id}`}>
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="font-medium">{e.date} - {e.type === "sakit" ? "Sakit" : "Izin"}</p>
                            <p className="text-sm text-muted-foreground">{e.description}</p>
                          </div>
                          <Badge variant={e.status === "approved" ? "default" : e.status === "rejected" ? "destructive" : "outline"}>
                            {e.status === "approved" ? "Disetujui" : e.status === "rejected" ? "Ditolak" : "Menunggu"}
                          </Badge>
                        </div>
                      </div>
                    ))}
                    {(!excuses || excuses.length === 0) && (
                      <p className="text-muted-foreground text-center py-4">Belum ada izin</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
