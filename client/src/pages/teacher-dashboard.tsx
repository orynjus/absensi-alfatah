import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import QRCode from "react-qr-code";
import {
  LogOut, User, History, Users, Search, Clock, UserCheck, UserX,
  AlertTriangle, FileText, Download
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

export default function TeacherDashboard() {
  const { user, logout } = useAuth();
  const { data: attendance } = useQuery<any[]>({ queryKey: ["/api/attendance/history"] });
  const { data: classes } = useQuery<string[]>({ queryKey: ["/api/classes"] });

  const [selectedClass, setSelectedClass] = useState("");
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [searchClass, setSearchClass] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");

  const { data: classAttendance } = useQuery<any[]>({
    queryKey: ["/api/class/attendance", selectedClass, selectedDate],
    queryFn: async () => {
      const res = await fetch(`/api/class/attendance?className=${encodeURIComponent(selectedClass)}&date=${selectedDate}`);
      return res.json();
    },
    enabled: !!selectedClass,
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
    a.download = `absensi_${selectedClass}_${selectedDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container mx-auto px-3 sm:px-4 py-3 sm:py-4 flex items-center justify-between max-w-5xl">
          <div className="min-w-0 flex-1 mr-2">
            <h1 className="font-bold text-base sm:text-lg truncate" data-testid="text-teacher-name">{user?.name}</h1>
            <p className="text-xs sm:text-sm text-muted-foreground truncate">NIP: {user?.identifier}</p>
          </div>
          <Button variant="outline" size="sm" onClick={logout} data-testid="button-logout" className="flex-shrink-0"><LogOut className="w-4 h-4 sm:mr-1" /><span className="hidden sm:inline">Keluar</span></Button>
        </div>
      </header>

      <div className="container mx-auto px-3 sm:px-4 py-4 sm:py-6 max-w-5xl">
        <Tabs defaultValue="monitor">
          <TabsList className="mb-4 w-full sm:w-auto">
            <TabsTrigger value="monitor" data-testid="tab-monitor" className="flex-1 sm:flex-initial text-xs sm:text-sm"><Users className="w-4 h-4 sm:mr-1" /><span className="hidden sm:inline">Monitor Kelas</span></TabsTrigger>
            <TabsTrigger value="profile" data-testid="tab-profile" className="flex-1 sm:flex-initial text-xs sm:text-sm"><User className="w-4 h-4 sm:mr-1" /><span className="hidden sm:inline">Profil</span></TabsTrigger>
            <TabsTrigger value="history" data-testid="tab-history" className="flex-1 sm:flex-initial text-xs sm:text-sm"><History className="w-4 h-4 sm:mr-1" /><span className="hidden sm:inline">Riwayat</span></TabsTrigger>
          </TabsList>

          <TabsContent value="monitor">
            <div className="space-y-4">
              <div className="flex items-center gap-2 flex-wrap">
                <Label>Kelas:</Label>
                <Select value={selectedClass} onValueChange={setSelectedClass}>
                  <SelectTrigger className="w-44" data-testid="select-class">
                    <SelectValue placeholder="Pilih Kelas" />
                  </SelectTrigger>
                  <SelectContent>
                    {classes?.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Label>Tanggal:</Label>
                <Input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} className="w-auto" data-testid="input-class-date" />
                <Button variant="outline" size="sm" onClick={() => setSelectedDate(new Date().toISOString().split("T")[0])} data-testid="button-today">
                  Hari Ini
                </Button>
                {selectedClass && classAttendance && classAttendance.length > 0 && (
                  <div className="ml-auto">
                    <Button variant="outline" size="sm" onClick={handleExportClass} data-testid="button-export-class">
                      <Download className="w-4 h-4 mr-1" />Export CSV
                    </Button>
                  </div>
                )}
              </div>

              {!selectedClass ? (
                <Card>
                  <CardContent className="p-8 text-center text-muted-foreground">
                    <Users className="w-12 h-12 mx-auto mb-3 opacity-40" />
                    <p>Pilih kelas untuk melihat data kehadiran siswa</p>
                  </CardContent>
                </Card>
              ) : (
                <>
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
                            {searchClass || filterStatus !== "all" ? "Tidak ada hasil yang cocok" : "Tidak ada siswa di kelas ini"}
                          </td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  {searchClass && <p className="text-xs text-muted-foreground">Menampilkan {filteredClass.length} dari {classAttendance?.length || 0} siswa</p>}
                </>
              )}
            </div>
          </TabsContent>

          <TabsContent value="profile">
            <Card>
              <CardContent className="p-6 flex flex-col items-center">
                <div className="bg-white p-4 rounded-xl shadow-sm mb-4">
                  <QRCode value={user?.qrCode || ""} size={180} />
                </div>
                <h2 className="text-xl font-bold">{user?.name}</h2>
                <p className="text-muted-foreground">NIP: {user?.identifier}</p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="history">
            <div className="border rounded-lg overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-4 py-2 text-left">Tanggal</th>
                    <th className="px-4 py-2 text-left">Jam Datang</th>
                    <th className="px-4 py-2 text-left">Jam Pulang</th>
                    <th className="px-4 py-2 text-left">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {attendance?.map((a: any) => (
                    <tr key={a.id} className="border-t" data-testid={`row-attendance-${a.id}`}>
                      <td className="px-4 py-2">{a.date}</td>
                      <td className="px-4 py-2">{a.checkInTime || "-"}</td>
                      <td className="px-4 py-2">{a.checkOutTime || "-"}</td>
                      <td className="px-4 py-2">
                        <StatusBadge status={a.status} />
                      </td>
                    </tr>
                  ))}
                  {(!attendance || attendance.length === 0) && (
                    <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">Belum ada data</td></tr>
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
