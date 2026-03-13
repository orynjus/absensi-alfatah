import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import QRCode from "react-qr-code";
import {
  LogOut, Users, History, FileText, User, CheckCircle, XCircle,
  Search, Clock, UserCheck, UserX, AlertTriangle, Download, ExternalLink, Image
} from "lucide-react";

export default function HomeroomDashboard() {
  const { user, logout } = useAuth();
  const { toast } = useToast();
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [selectedClass, setSelectedClass] = useState(user?.className || "");
  const [searchClass, setSearchClass] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");

  const { data: classes } = useQuery<string[]>({ queryKey: ["/api/classes"] });
  const { data: attendance } = useQuery<any[]>({ queryKey: ["/api/attendance/history"] });
  const { data: classAttendance } = useQuery<any[]>({
    queryKey: ["/api/class/attendance", selectedDate, selectedClass],
    queryFn: async () => {
      const cls = selectedClass || user?.className || "";
      const res = await fetch(`/api/class/attendance?date=${selectedDate}&className=${encodeURIComponent(cls)}`);
      return res.json();
    },
  });
  const { data: classStudents } = useQuery<any[]>({
    queryKey: ["/api/class/students", selectedClass],
    queryFn: async () => {
      const cls = selectedClass || user?.className || "";
      const res = await fetch(`/api/class/students?className=${encodeURIComponent(cls)}`);
      return res.json();
    },
  });
  const { data: excuses } = useQuery<any[]>({ queryKey: ["/api/excuses"] });

  const excuseStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      await apiRequest("PUT", `/api/excuses/${id}/status`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/excuses"] });
      toast({ title: "Status izin diperbarui" });
    },
  });

  const stats = {
    total: classAttendance?.length || 0,
    hadir: classAttendance?.filter(i => i.attendance?.status === "hadir").length || 0,
    telat: classAttendance?.filter(i => i.attendance?.status === "telat").length || 0,
    izin: classAttendance?.filter(i => i.attendance?.status === "izin").length || 0,
    sakit: classAttendance?.filter(i => i.attendance?.status === "sakit").length || 0,
    alpha: classAttendance?.filter(i => !i.attendance || i.attendance?.status === "alpha").length || 0,
  };

  const filteredClass = classAttendance?.filter(item => {
    if (searchClass) {
      const q = searchClass.toLowerCase();
      if (!item.student.name?.toLowerCase().includes(q) && !item.student.identifier?.toLowerCase().includes(q)) return false;
    }
    if (filterStatus !== "all") {
      if (filterStatus === "belum") return !item.attendance;
      return item.attendance?.status === filterStatus;
    }
    return true;
  }) || [];

  const handleExportClass = () => {
    if (!classAttendance || classAttendance.length === 0) return;
    const header = "No,Nama,NISN,Jam Datang,Jam Pulang,Status";
    const rows = classAttendance.map((item: any, i: number) =>
      `${i + 1},"${item.student.name}","${item.student.identifier}","${item.attendance?.checkInTime || '-'}","${item.attendance?.checkOutTime || '-'}","${item.attendance?.status || 'alpha'}"`
    );
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `absensi_kelas_${selectedClass || user?.className}_${selectedDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container mx-auto px-3 sm:px-4 py-3 sm:py-4 flex items-center justify-between max-w-5xl">
          <div className="min-w-0 flex-1 mr-2">
            <h1 className="font-bold text-base sm:text-lg truncate" data-testid="text-homeroom-name">{user?.name}</h1>
            <p className="text-xs sm:text-sm text-muted-foreground truncate">NIP: {user?.identifier} | Wali Kelas: {user?.className || "-"}</p>
          </div>
          <Button variant="outline" size="sm" onClick={logout} data-testid="button-logout" className="flex-shrink-0"><LogOut className="w-4 h-4 sm:mr-1" /><span className="hidden sm:inline">Keluar</span></Button>
        </div>
      </header>

      <div className="container mx-auto px-3 sm:px-4 py-4 sm:py-6 max-w-5xl">
        <Tabs defaultValue="class">
          <div className="overflow-x-auto -mx-1 px-1 mb-4">
            <TabsList className="w-max">
              <TabsTrigger value="class" data-testid="tab-class" className="text-xs sm:text-sm"><Users className="w-4 h-4 sm:mr-1" /><span className="hidden sm:inline">Monitor</span></TabsTrigger>
              <TabsTrigger value="students" data-testid="tab-students" className="text-xs sm:text-sm"><User className="w-4 h-4 sm:mr-1" /><span className="hidden sm:inline">Siswa</span></TabsTrigger>
              <TabsTrigger value="excuses" data-testid="tab-excuses" className="text-xs sm:text-sm"><FileText className="w-4 h-4 sm:mr-1" /><span className="hidden sm:inline">Izin</span></TabsTrigger>
              <TabsTrigger value="profile" data-testid="tab-profile" className="text-xs sm:text-sm"><User className="w-4 h-4 sm:mr-1" /><span className="hidden sm:inline">Profil</span></TabsTrigger>
              <TabsTrigger value="history" data-testid="tab-history" className="text-xs sm:text-sm"><History className="w-4 h-4 sm:mr-1" /><span className="hidden sm:inline">Riwayat</span></TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="class">
            <div className="space-y-4">
              <div className="flex items-center gap-2 flex-wrap">
                <Select value={selectedClass} onValueChange={setSelectedClass}>
                  <SelectTrigger className="w-[140px]" data-testid="select-class">
                    <SelectValue placeholder="Pilih Kelas" />
                  </SelectTrigger>
                  <SelectContent>
                    {classes?.map(c => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} className="w-auto" data-testid="input-class-date" />
                <Button variant="outline" size="sm" onClick={() => setSelectedDate(new Date().toISOString().split("T")[0])} data-testid="button-today">
                  Hari Ini
                </Button>
                <div className="ml-auto">
                  <Button variant="outline" size="sm" onClick={handleExportClass} disabled={!classAttendance?.length} data-testid="button-export-class">
                    <Download className="w-4 h-4 mr-1" />Export CSV
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 sm:gap-2">
                <Card className="cursor-pointer hover:ring-2 ring-primary transition-all" onClick={() => setFilterStatus("all")} data-testid="stat-total">
                  <CardContent className="p-2 sm:p-3 text-center">
                    <Users className="w-4 h-4 sm:w-5 sm:h-5 mx-auto mb-0.5 sm:mb-1 text-primary" />
                    <p className="text-lg sm:text-2xl font-bold">{stats.total}</p>
                    <p className="text-[10px] sm:text-xs text-muted-foreground">Total</p>
                  </CardContent>
                </Card>
                <Card className="cursor-pointer hover:ring-2 ring-green-500 transition-all" onClick={() => setFilterStatus("hadir")} data-testid="stat-hadir">
                  <CardContent className="p-2 sm:p-3 text-center">
                    <UserCheck className="w-4 h-4 sm:w-5 sm:h-5 mx-auto mb-0.5 sm:mb-1 text-green-600" />
                    <p className="text-lg sm:text-2xl font-bold text-green-600">{stats.hadir}</p>
                    <p className="text-[10px] sm:text-xs text-muted-foreground">Hadir</p>
                  </CardContent>
                </Card>
                <Card className="cursor-pointer hover:ring-2 ring-orange-500 transition-all" onClick={() => setFilterStatus("telat")} data-testid="stat-telat">
                  <CardContent className="p-2 sm:p-3 text-center">
                    <Clock className="w-4 h-4 sm:w-5 sm:h-5 mx-auto mb-0.5 sm:mb-1 text-orange-600" />
                    <p className="text-lg sm:text-2xl font-bold text-orange-600">{stats.telat}</p>
                    <p className="text-[10px] sm:text-xs text-muted-foreground">Telat</p>
                  </CardContent>
                </Card>
                <Card className="cursor-pointer hover:ring-2 ring-blue-500 transition-all" onClick={() => setFilterStatus("izin")} data-testid="stat-izin">
                  <CardContent className="p-2 sm:p-3 text-center">
                    <FileText className="w-4 h-4 sm:w-5 sm:h-5 mx-auto mb-0.5 sm:mb-1 text-blue-600" />
                    <p className="text-lg sm:text-2xl font-bold text-blue-600">{stats.izin}</p>
                    <p className="text-[10px] sm:text-xs text-muted-foreground">Izin</p>
                  </CardContent>
                </Card>
                <Card className="cursor-pointer hover:ring-2 ring-yellow-500 transition-all" onClick={() => setFilterStatus("sakit")} data-testid="stat-sakit">
                  <CardContent className="p-2 sm:p-3 text-center">
                    <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5 mx-auto mb-0.5 sm:mb-1 text-yellow-600" />
                    <p className="text-lg sm:text-2xl font-bold text-yellow-600">{stats.sakit}</p>
                    <p className="text-[10px] sm:text-xs text-muted-foreground">Sakit</p>
                  </CardContent>
                </Card>
                <Card className="cursor-pointer hover:ring-2 ring-red-500 transition-all" onClick={() => setFilterStatus("belum")} data-testid="stat-alpha">
                  <CardContent className="p-2 sm:p-3 text-center">
                    <UserX className="w-4 h-4 sm:w-5 sm:h-5 mx-auto mb-0.5 sm:mb-1 text-red-600" />
                    <p className="text-lg sm:text-2xl font-bold text-red-600">{stats.alpha}</p>
                    <p className="text-[10px] sm:text-xs text-muted-foreground">Alpha</p>
                  </CardContent>
                </Card>
              </div>

              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Cari nama atau NISN..."
                    value={searchClass}
                    onChange={e => setSearchClass(e.target.value)}
                    className="pl-9"
                    data-testid="input-search-class"
                  />
                </div>
                {filterStatus !== "all" && (
                  <Button variant="ghost" size="sm" onClick={() => setFilterStatus("all")} data-testid="button-clear-filter">
                    Hapus Filter
                  </Button>
                )}
              </div>

              <div className="border rounded-lg overflow-auto">
                <table className="w-full text-xs sm:text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="px-2 sm:px-4 py-2 text-left">No</th>
                      <th className="px-2 sm:px-4 py-2 text-left">Nama</th>
                      <th className="px-2 sm:px-4 py-2 text-left hidden sm:table-cell">NISN</th>
                      <th className="px-2 sm:px-4 py-2 text-left">Datang</th>
                      <th className="px-2 sm:px-4 py-2 text-left">Pulang</th>
                      <th className="px-2 sm:px-4 py-2 text-left">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredClass.map((item: any, i: number) => (
                      <tr key={item.student.id} className="border-t" data-testid={`row-class-student-${item.student.id}`}>
                        <td className="px-2 sm:px-4 py-1.5 sm:py-2">{i + 1}</td>
                        <td className="px-2 sm:px-4 py-1.5 sm:py-2 font-medium">{item.student.name}</td>
                        <td className="px-2 sm:px-4 py-1.5 sm:py-2 font-mono text-xs hidden sm:table-cell">{item.student.identifier}</td>
                        <td className="px-2 sm:px-4 py-1.5 sm:py-2">{item.attendance?.checkInTime || "-"}</td>
                        <td className="px-2 sm:px-4 py-1.5 sm:py-2">{item.attendance?.checkOutTime || "-"}</td>
                        <td className="px-2 sm:px-4 py-1.5 sm:py-2">
                          <StatusBadge status={item.attendance?.status} />
                        </td>
                      </tr>
                    ))}
                    {filteredClass.length === 0 && (
                      <tr><td colSpan={6} className="px-2 sm:px-4 py-8 text-center text-muted-foreground">
                        {searchClass || filterStatus !== "all" ? "Tidak ada hasil yang cocok" : "Tidak ada siswa"}
                      </td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              {searchClass && <p className="text-xs text-muted-foreground">Menampilkan {filteredClass.length} dari {classAttendance?.length || 0} siswa</p>}
            </div>
          </TabsContent>

          <TabsContent value="students">
            <StudentListTab students={classStudents} className={selectedClass || user?.className} />
          </TabsContent>

          <TabsContent value="excuses">
            <ExcusesTab excuses={excuses} excuseStatusMutation={excuseStatusMutation} />
          </TabsContent>

          <TabsContent value="profile">
            <Card>
              <CardContent className="p-6 flex flex-col items-center">
                <div className="bg-white p-4 rounded-xl shadow-sm mb-4">
                  <QRCode value={user?.qrCode || ""} size={180} />
                </div>
                <h2 className="text-xl font-bold">{user?.name}</h2>
                <p className="text-muted-foreground">NIP: {user?.identifier}</p>
                <p className="text-muted-foreground">Kelas: {user?.className || "-"}</p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="history">
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
                    <tr><td colSpan={4} className="px-2 sm:px-4 py-8 text-center text-muted-foreground">Belum ada data</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

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

function getDriveThumbnail(driveFileId: string, size = 400) {
  return `https://drive.google.com/thumbnail?id=${driveFileId}&sz=w${size}`;
}
function getDriveViewLink(driveFileId: string) {
  return `https://drive.google.com/file/d/${driveFileId}/view`;
}

function DriveThumb({ driveFileId, type, onClick, testId }: { driveFileId: string; type: string; onClick: () => void; testId: string }) {
  const [imgError, setImgError] = useState(false);
  return (
    <div
      className="w-24 h-24 md:w-32 md:h-32 rounded-lg border overflow-hidden cursor-pointer hover:opacity-80 transition-opacity bg-muted"
      onClick={onClick}
      data-testid={testId}
    >
      {!imgError ? (
        <img
          src={getDriveThumbnail(driveFileId)}
          alt={`Bukti ${type}`}
          className="w-full h-full object-cover"
          onError={() => setImgError(true)}
        />
      ) : (
        <div className="flex items-center justify-center w-full h-full text-muted-foreground">
          <Image className="w-6 h-6" />
        </div>
      )}
    </div>
  );
}

function ExcusesTab({ excuses, excuseStatusMutation }: { excuses?: any[]; excuseStatusMutation: any }) {
  const [searchExcuse, setSearchExcuse] = useState("");
  const [filterExcuseStatus, setFilterExcuseStatus] = useState("all");
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const filtered = excuses?.filter(e => {
    if (searchExcuse) {
      const q = searchExcuse.toLowerCase();
      if (!e.user?.name?.toLowerCase().includes(q) && !e.user?.identifier?.toLowerCase().includes(q)) return false;
    }
    if (filterExcuseStatus !== "all" && e.status !== filterExcuseStatus) return false;
    return true;
  }) || [];

  const pendingCount = excuses?.filter(e => e.status === "pending").length || 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="text-lg font-semibold">Daftar Izin Siswa</h3>
          {pendingCount > 0 && <p className="text-sm text-orange-600">{pendingCount} izin menunggu persetujuan</p>}
        </div>
        <Badge variant="outline" data-testid="badge-excuse-count">{excuses?.length || 0} izin</Badge>
      </div>

      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Cari nama atau NISN..."
            value={searchExcuse}
            onChange={e => setSearchExcuse(e.target.value)}
            className="pl-9"
            data-testid="input-search-excuse"
          />
        </div>
        <Select value={filterExcuseStatus} onValueChange={setFilterExcuseStatus}>
          <SelectTrigger className="w-36" data-testid="select-excuse-filter"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua Status</SelectItem>
            <SelectItem value="pending">Menunggu</SelectItem>
            <SelectItem value="approved">Disetujui</SelectItem>
            <SelectItem value="rejected">Ditolak</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-3">
        {filtered.map((e: any) => (
          <Card key={e.id} data-testid={`card-excuse-${e.id}`} className={e.status === "pending" ? "border-orange-300 dark:border-orange-700" : ""}>
            <CardContent className="p-3 sm:p-4">
              <div className="flex gap-2 sm:gap-4">
                {e.driveFileId && (
                  <div className="flex-shrink-0 hidden sm:block">
                    <DriveThumb driveFileId={e.driveFileId} type={e.type} onClick={() => setPreviewImage(e.driveFileId)} testId={`img-excuse-${e.id}`} />
                  </div>
                )}
                {!e.driveFileId && e.photoUrl && (
                  <div className="flex-shrink-0 hidden sm:block">
                    <a href={e.photoUrl} target="_blank" rel="noopener noreferrer" className="w-24 h-24 md:w-32 md:h-32 rounded-lg border flex items-center justify-center bg-muted hover:bg-muted/80 transition-colors" data-testid={`link-photo-${e.id}`}>
                      <div className="text-center">
                        <Image className="w-6 h-6 mx-auto text-muted-foreground mb-1" />
                        <span className="text-xs text-primary">Lihat Foto</span>
                      </div>
                    </a>
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-start gap-1 sm:gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-sm sm:text-base truncate" data-testid={`text-excuse-name-${e.id}`}>{e.user?.name || "Siswa"}</p>
                      <p className="text-[10px] sm:text-xs text-muted-foreground">{e.user?.identifier} - {e.user?.className || "-"}</p>
                      <div className="flex items-center gap-1 sm:gap-2 mt-1">
                        <Badge variant={e.type === "sakit" ? "secondary" : "outline"} className="text-[10px] sm:text-xs">
                          {e.type === "sakit" ? "Sakit" : "Izin"}
                        </Badge>
                        <span className="text-[10px] sm:text-xs text-muted-foreground">{e.date}</span>
                      </div>
                      <p className="text-xs sm:text-sm mt-1 sm:mt-2" data-testid={`text-excuse-desc-${e.id}`}>{e.description}</p>
                      {e.driveFileId && (
                        <a href={getDriveViewLink(e.driveFileId)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-1" data-testid={`link-drive-${e.id}`}>
                          <ExternalLink className="w-3 h-3" />Buka di Drive
                        </a>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1 sm:gap-2 flex-shrink-0">
                      <Badge variant={e.status === "approved" ? "default" : e.status === "rejected" ? "destructive" : "outline"} className="text-[10px] sm:text-xs" data-testid={`badge-excuse-status-${e.id}`}>
                        {e.status === "approved" ? "Disetujui" : e.status === "rejected" ? "Ditolak" : "Menunggu"}
                      </Badge>
                      {e.status === "pending" && (
                        <div className="flex gap-1">
                          <Button size="sm" variant="default" onClick={() => excuseStatusMutation.mutate({ id: e.id, status: "approved" })} disabled={excuseStatusMutation.isPending} data-testid={`button-approve-${e.id}`} className="h-7 px-2 text-xs sm:h-8 sm:px-3 sm:text-sm">
                            <CheckCircle className="w-3 h-3 sm:mr-1" /><span className="hidden sm:inline">Setujui</span>
                          </Button>
                          <Button size="sm" variant="destructive" onClick={() => excuseStatusMutation.mutate({ id: e.id, status: "rejected" })} disabled={excuseStatusMutation.isPending} data-testid={`button-reject-${e.id}`} className="h-7 px-2 text-xs sm:h-8 sm:px-3 sm:text-sm">
                            <XCircle className="w-3 h-3 sm:mr-1" /><span className="hidden sm:inline">Tolak</span>
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
        {filtered.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            <FileText className="w-10 h-10 mx-auto mb-2 opacity-40" />
            <p>{searchExcuse || filterExcuseStatus !== "all" ? "Tidak ada izin yang cocok" : "Belum ada izin"}</p>
          </div>
        )}
      </div>

      {previewImage && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={() => setPreviewImage(null)} data-testid="modal-preview-image">
          <div className="relative max-w-3xl max-h-[90vh] bg-white dark:bg-gray-900 rounded-xl overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-3 border-b">
              <span className="text-sm font-medium">Bukti Foto Izin</span>
              <div className="flex gap-2">
                <a href={getDriveViewLink(previewImage)} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline flex items-center gap-1" data-testid="link-preview-drive">
                  <ExternalLink className="w-3 h-3" />Google Drive
                </a>
                <Button size="sm" variant="ghost" onClick={() => setPreviewImage(null)} data-testid="button-close-preview">
                  <XCircle className="w-4 h-4" />
                </Button>
              </div>
            </div>
            <div className="p-2 flex items-center justify-center" style={{ maxHeight: "80vh" }}>
              <img
                src={getDriveThumbnail(previewImage, 800)}
                alt="Bukti izin"
                className="max-w-full max-h-[75vh] object-contain rounded"
                data-testid="img-preview-full"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StudentListTab({ students, className }: { students?: any[]; className?: string | null }) {
  const [search, setSearch] = useState("");

  const filtered = students?.filter(s => {
    if (!search) return true;
    const q = search.toLowerCase();
    return s.name?.toLowerCase().includes(q) || s.identifier?.toLowerCase().includes(q);
  }) || [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold" data-testid="text-class-name">Daftar Siswa {className || ""}</h3>
        <Badge variant="outline" data-testid="badge-student-count">{students?.length || 0} siswa</Badge>
      </div>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Cari nama atau NISN..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-9"
          data-testid="input-search-students"
        />
      </div>
      <div className="border rounded-lg overflow-auto">
        <table className="w-full text-xs sm:text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-2 sm:px-4 py-2 text-left">No</th>
              <th className="px-2 sm:px-4 py-2 text-left">Nama</th>
              <th className="px-2 sm:px-4 py-2 text-left hidden sm:table-cell">NISN</th>
              <th className="px-2 sm:px-4 py-2 text-left">HP Ortu</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((s: any, i: number) => (
              <tr key={s.id} className="border-t" data-testid={`row-student-${s.id}`}>
                <td className="px-2 sm:px-4 py-1.5 sm:py-2">{i + 1}</td>
                <td className="px-2 sm:px-4 py-1.5 sm:py-2 font-medium">{s.name}</td>
                <td className="px-2 sm:px-4 py-1.5 sm:py-2 font-mono text-xs hidden sm:table-cell">{s.identifier}</td>
                <td className="px-2 sm:px-4 py-1.5 sm:py-2 text-xs">{s.parentPhone || "-"}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={4} className="px-2 sm:px-4 py-8 text-center text-muted-foreground">
                {search ? "Tidak ada hasil" : "Belum ada siswa"}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
