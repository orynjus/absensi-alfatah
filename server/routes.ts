import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import multer from "multer";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { loginSchema, insertUserSchema, insertHolidaySchema } from "@shared/schema";
import { readUsersFromSheet, getSheetTabs } from "./googleSheets";
import { sheetAppendAttendance, sheetUpdateAttendance, sheetInitHeaders, sheetClearAttendance, testWebhook, APPS_SCRIPT_CODE } from "./appsScript";
import { uploadExcusePhoto } from "./googleDrive";
import { sendCheckInNotification, sendLateNotification, sendCheckOutNotification, sendManualAttendanceNotification, sendExcuseNotificationToHomeroom, sendAlphaNotification } from "./fonnte";
import crypto from "crypto";

let wss: WebSocketServer;

function broadcastUpdate(type: string, data?: any) {
  if (!wss) return;
  const message = JSON.stringify({ type, data, timestamp: Date.now() });
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

function titleCase(str: string): string {
  return str.trim().replace(/\s+/g, ' ').split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
}

function formatClassName(raw: string | null | undefined): string | null {
  if (!raw || !raw.trim()) return null;
  const s = raw.trim().replace(/\s+/g, ' ');
  const arabicToRoman: Record<string, string> = { '10': 'X', '11': 'XI', '12': 'XII', '7': 'VII', '8': 'VIII', '9': 'IX' };
  const parts = s.split(/[\s\-_]+/);
  if (parts.length === 0) return s.toUpperCase();
  let grade = parts[0].toUpperCase();
  if (arabicToRoman[parts[0]]) grade = arabicToRoman[parts[0]];
  const romanNumerals = ['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII'];
  if (!romanNumerals.includes(grade) && !arabicToRoman[parts[0]]) grade = parts[0].toUpperCase();
  if (parts.length === 1) return grade;
  if (parts.length === 2) {
    const second = parts[1];
    if (/^\d+$/.test(second)) return `${grade}-${second}`;
    return `${grade}-${second.toUpperCase()}`;
  }
  const jurusan = parts[1].toUpperCase();
  const rest = parts.slice(2).join('-');
  return `${grade}-${jurusan}-${rest}`;
}

declare module "express-session" {
  interface SessionData {
    userId: number;
    role: string;
  }
}

function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  next();
}

function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.session.userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    if (!roles.includes(req.session.role!)) {
      return res.status(403).json({ message: "Forbidden" });
    }
    next();
  };
}

function getCurrentDate(): string {
  const now = new Date();
  const offset = 7 * 60;
  const wib = new Date(now.getTime() + (offset + now.getTimezoneOffset()) * 60000);
  return wib.toISOString().split('T')[0];
}

function getCurrentTime(): string {
  const now = new Date();
  const offset = 7 * 60;
  const wib = new Date(now.getTime() + (offset + now.getTimezoneOffset()) * 60000);
  return wib.toTimeString().slice(0, 5);
}

function isTimeInRange(current: string, start: string, end: string): boolean {
  return current >= start && current <= end;
}

function getCurrentDayOfWeek(): number {
  const now = new Date();
  const offset = 7 * 60;
  const wib = new Date(now.getTime() + (offset + now.getTimezoneOffset()) * 60000);
  return wib.getDay();
}

const DAY_NAMES = ["minggu", "senin", "selasa", "rabu", "kamis", "jumat", "sabtu"];

function getDaySchedule(settings: any): { checkInStart: string; checkInEnd: string; checkOutStart: string; checkOutEnd: string; enabled: boolean } {
  const dayIndex = getCurrentDayOfWeek();
  const dayName = DAY_NAMES[dayIndex];
  if (settings.weeklySchedule) {
    try {
      const weekly = JSON.parse(settings.weeklySchedule);
      if (weekly[dayName]) {
        return {
          checkInStart: weekly[dayName].checkInStart || settings.checkInStart,
          checkInEnd: weekly[dayName].checkInEnd || settings.checkInEnd,
          checkOutStart: weekly[dayName].checkOutStart || settings.checkOutStart,
          checkOutEnd: weekly[dayName].checkOutEnd || settings.checkOutEnd,
          enabled: weekly[dayName].enabled !== false,
        };
      }
    } catch {}
  }
  return {
    checkInStart: settings.checkInStart,
    checkInEnd: settings.checkInEnd,
    checkOutStart: settings.checkOutStart,
    checkOutEnd: settings.checkOutEnd,
    enabled: true,
  };
}

function isDefaultHoliday(settings: any): boolean {
  const dayIndex = getCurrentDayOfWeek();
  const defaultDays = (settings.defaultHolidayDays || "0,6").split(",").map((d: string) => parseInt(d.trim()));
  return defaultDays.includes(dayIndex);
}

async function seedData() {
  const adminExists = await storage.getUserByIdentifier("admin");
  if (!adminExists) {
    await storage.createUser({
      name: "Administrator",
      identifier: "admin",
      password: "admin123",
      role: "admin",
      className: null,
      parentPhone: null,
      parentName: null,
      qrCode: crypto.randomUUID(),
    });
    console.log("Default admin created (admin/admin123)");
  }
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  wss = new WebSocketServer({ server: httpServer, path: "/ws" });
  wss.on("connection", (ws) => {
    ws.send(JSON.stringify({ type: "connected" }));
  });

  const PgSession = connectPgSimple(session);

  app.use(
    session({
      store: new PgSession({
        conString: process.env.DATABASE_URL,
        createTableIfMissing: true,
      }),
      secret: process.env.SESSION_SECRET || "attendance-secret-key",
      resave: false,
      saveUninitialized: false,
      cookie: {
        maxAge: 24 * 60 * 60 * 1000,
        httpOnly: true,
        secure: false,
        sameSite: "lax",
      },
    })
  );

  await seedData();
  sheetInitHeaders().catch(console.error);

  // AUTH ROUTES
  app.post("/api/auth/login", async (req: Request, res: Response) => {
    try {
      const parsed = loginSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Data login tidak valid" });
      }
      const { identifier, password, role } = parsed.data;
      const user = await storage.getUserByIdentifier(identifier);

      if (!user || user.role !== role) {
        return res.status(401).json({ message: "Identifier atau role tidak ditemukan" });
      }

      if (role === "siswa" || role === "guru" || role === "wali_kelas") {
        if (user.identifier !== password) {
          return res.status(401).json({ message: "Password salah" });
        }
      } else {
        if (user.password !== password) {
          return res.status(401).json({ message: "Password salah" });
        }
      }

      req.session.userId = user.id;
      req.session.role = user.role;
      const { password: _, ...safeUser } = user;
      res.json({ user: safeUser });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.post("/api/auth/logout", (req: Request, res: Response) => {
    req.session.destroy((err) => {
      if (err) return res.status(500).json({ message: "Logout failed" });
      res.json({ message: "Logged out" });
    });
  });

  app.get("/api/auth/me", async (req: Request, res: Response) => {
    if (!req.session.userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    const user = await storage.getUser(req.session.userId);
    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }
    const { password: _, ...safeUser } = user;
    res.json({ user: safeUser });
  });

  app.post("/api/auth/change-password", requireAuth, async (req: Request, res: Response) => {
    try {
      const { currentPassword, newPassword } = req.body;
      if (!currentPassword || !newPassword) return res.status(400).json({ message: "Password lama dan baru wajib diisi" });
      if (newPassword.length < 4) return res.status(400).json({ message: "Password baru minimal 4 karakter" });
      const user = await storage.getUser(req.session.userId!);
      if (!user) return res.status(404).json({ message: "User tidak ditemukan" });
      if (user.password !== currentPassword) return res.status(400).json({ message: "Password lama salah" });
      await storage.updateUser(user.id, { password: newPassword });
      res.json({ success: true, message: "Password berhasil diubah" });
    } catch (error) {
      console.error("Change password error:", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  // SCANNER ROUTES
  app.get("/api/scanner/status", async (_req: Request, res: Response) => {
    try {
      const settings = await storage.getScannerSettings();
      const currentTime = getCurrentTime();
      const currentDate = getCurrentDate();
      const holiday = await storage.getHolidayByDate(currentDate);
      const defaultHoliday = isDefaultHoliday(settings);
      const daySchedule = getDaySchedule(settings);

      let scanWindow: "checkin" | "checkout" | "closed" = "closed";
      if (!settings.isLocked && !holiday && !defaultHoliday && daySchedule.enabled) {
        if (isTimeInRange(currentTime, daySchedule.checkInStart, daySchedule.checkInEnd)) {
          scanWindow = "checkin";
        } else if (isTimeInRange(currentTime, daySchedule.checkOutStart, daySchedule.checkOutEnd)) {
          scanWindow = "checkout";
        }
      }

      const dayName = DAY_NAMES[getCurrentDayOfWeek()];

      res.json({
        isLocked: settings.isLocked,
        scanWindow,
        isHoliday: !!holiday || defaultHoliday,
        holidayDescription: holiday?.description || (defaultHoliday ? `Libur ${dayName.charAt(0).toUpperCase() + dayName.slice(1)}` : null),
        checkInStart: daySchedule.checkInStart,
        checkInEnd: daySchedule.checkInEnd,
        checkOutStart: daySchedule.checkOutStart,
        checkOutEnd: daySchedule.checkOutEnd,
        lateThreshold: settings.lateThreshold,
        currentTime,
        currentDate,
        currentDay: dayName,
        dayEnabled: daySchedule.enabled,
      });
    } catch (error) {
      console.error("Scanner status error:", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.put("/api/scanner/settings", requireRole("admin"), async (req: Request, res: Response) => {
    try {
      const { isLocked, checkInStart, checkInEnd, checkOutStart, checkOutEnd, lockPin, lateThreshold, weeklySchedule, defaultHolidayDays, autoHolidayEnabled, autoHolidayTime, alphaNotifTime, fonnteToken, googleSheetId, googleDriveFolderId, csvUrlSiswa, csvUrlGuru, csvUrlWaliKelas, sheetsWebhookUrl } = req.body;
      const updateData: any = {};
      if (isLocked !== undefined) updateData.isLocked = isLocked;
      if (checkInStart) updateData.checkInStart = checkInStart;
      if (checkInEnd) updateData.checkInEnd = checkInEnd;
      if (checkOutStart) updateData.checkOutStart = checkOutStart;
      if (checkOutEnd) updateData.checkOutEnd = checkOutEnd;
      if (lockPin) updateData.lockPin = lockPin;
      if (lateThreshold) updateData.lateThreshold = lateThreshold;
      if (weeklySchedule !== undefined) updateData.weeklySchedule = typeof weeklySchedule === "string" ? weeklySchedule : JSON.stringify(weeklySchedule);
      if (defaultHolidayDays !== undefined) updateData.defaultHolidayDays = defaultHolidayDays;
      if (autoHolidayEnabled !== undefined) updateData.autoHolidayEnabled = autoHolidayEnabled;
      if (autoHolidayTime !== undefined) updateData.autoHolidayTime = autoHolidayTime;
      if (alphaNotifTime !== undefined) updateData.alphaNotifTime = alphaNotifTime;
      if (fonnteToken !== undefined) updateData.fonnteToken = fonnteToken || null;
      if (googleSheetId !== undefined) updateData.googleSheetId = googleSheetId || null;
      if (googleDriveFolderId !== undefined) updateData.googleDriveFolderId = googleDriveFolderId || null;
      if (csvUrlSiswa !== undefined) updateData.csvUrlSiswa = csvUrlSiswa || null;
      if (csvUrlGuru !== undefined) updateData.csvUrlGuru = csvUrlGuru || null;
      if (csvUrlWaliKelas !== undefined) updateData.csvUrlWaliKelas = csvUrlWaliKelas || null;
      if (sheetsWebhookUrl !== undefined) updateData.sheetsWebhookUrl = sheetsWebhookUrl || null;
      const updated = await storage.updateScannerSettings(updateData);
      res.json(updated);
    } catch (error) {
      console.error("Scanner settings error:", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/scanner/full-settings", requireRole("admin"), async (_req: Request, res: Response) => {
    try {
      const settings = await storage.getScannerSettings();
      res.json(settings);
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
  });

  app.post("/api/scanner/toggle-pin", async (req: Request, res: Response) => {
    try {
      const { pin } = req.body;
      if (!pin) {
        return res.status(400).json({ message: "PIN diperlukan" });
      }
      const settings = await storage.getScannerSettings();
      if (pin !== settings.lockPin) {
        return res.status(401).json({ message: "PIN salah" });
      }
      const updated = await storage.updateScannerSettings({ isLocked: !settings.isLocked });
      res.json({ isLocked: updated.isLocked, message: updated.isLocked ? "Scanner dikunci" : "Scanner dibuka" });
    } catch (error) {
      console.error("Scanner toggle error:", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  // SCAN QR CODE
  app.post("/api/scan", async (req: Request, res: Response) => {
    try {
      const { qrCode } = req.body;
      if (!qrCode) {
        return res.status(400).json({ success: false, message: "QR code tidak valid" });
      }

      const settings = await storage.getScannerSettings();
      if (settings.isLocked) {
        return res.status(403).json({ success: false, message: "Scanner dikunci oleh admin" });
      }

      const currentDate = getCurrentDate();
      const currentTime = getCurrentTime();

      if (isDefaultHoliday(settings)) {
        const dayName = DAY_NAMES[getCurrentDayOfWeek()];
        return res.status(403).json({ success: false, message: `Hari libur: Libur ${dayName.charAt(0).toUpperCase() + dayName.slice(1)}` });
      }

      const holiday = await storage.getHolidayByDate(currentDate);
      if (holiday) {
        return res.status(403).json({ success: false, message: `Hari libur: ${holiday.description}` });
      }

      const daySchedule = getDaySchedule(settings);
      if (!daySchedule.enabled) {
        return res.status(403).json({ success: false, message: "Scanner tidak aktif pada hari ini" });
      }

      let scanType: "checkin" | "checkout" | null = null;
      if (isTimeInRange(currentTime, daySchedule.checkInStart, daySchedule.checkInEnd)) {
        scanType = "checkin";
      } else if (isTimeInRange(currentTime, daySchedule.checkOutStart, daySchedule.checkOutEnd)) {
        scanType = "checkout";
      }

      if (!scanType) {
        return res.status(403).json({
          success: false,
          message: `Di luar jadwal scan. Check-in: ${daySchedule.checkInStart}-${daySchedule.checkInEnd}, Check-out: ${daySchedule.checkOutStart}-${daySchedule.checkOutEnd}`
        });
      }

      const user = await storage.getUserByQrCode(qrCode);
      if (!user) {
        return res.status(404).json({ success: false, message: "QR code tidak terdaftar" });
      }

      const existing = await storage.getAttendance(user.id, currentDate);

      if (scanType === "checkin") {
        if (existing && existing.checkInTime) {
          return res.status(409).json({
            success: false,
            message: `${user.name} sudah absen datang hari ini (${existing.checkInTime})`
          });
        }

        const threshold = settings.lateThreshold || "07:15";
        const isLate = currentTime > threshold;
        const checkInStatus = isLate ? "telat" : "hadir";

        if (existing) {
          await storage.updateAttendance(existing.id, { checkInTime: currentTime, status: checkInStatus });
        } else {
          await storage.createAttendance({
            userId: user.id,
            date: currentDate,
            checkInTime: currentTime,
            checkOutTime: null,
            status: checkInStatus,
          });
        }

        if (user.role === "siswa" && user.parentPhone) {
          if (isLate) {
            sendLateNotification(user.parentPhone, user.name, currentTime).catch(console.error);
          } else {
            sendCheckInNotification(user.parentPhone, user.name, currentTime).catch(console.error);
          }
        }

        sheetAppendAttendance({
          date: currentDate,
          name: user.name,
          identifier: user.identifier,
          className: user.className || "-",
          checkInTime: currentTime,
          checkOutTime: "-",
          status: checkInStatus,
          role: user.role,
        }).catch(console.error);

        broadcastUpdate("attendance", { action: "checkin", userName: user.name });

        return res.json({
          success: true,
          type: "datang",
          name: user.name,
          time: currentTime,
          className: user.className,
          status: checkInStatus,
          message: `${user.name} - ${isLate ? "Terlambat" : "Absen Datang"} ${currentTime}`,
        });
      }

      if (scanType === "checkout") {
        if (!existing || !existing.checkInTime) {
          return res.status(400).json({
            success: false,
            message: `${user.name} belum absen datang hari ini`
          });
        }
        if (existing.checkOutTime) {
          return res.status(409).json({
            success: false,
            message: `${user.name} sudah absen pulang hari ini (${existing.checkOutTime})`
          });
        }

        await storage.updateAttendance(existing.id, { checkOutTime: currentTime });

        if (user.role === "siswa" && user.parentPhone) {
          sendCheckOutNotification(user.parentPhone, user.name, currentTime).catch(console.error);
        }

        sheetUpdateAttendance(currentDate, user.identifier, currentTime, "pulang").catch(console.error);

        broadcastUpdate("attendance", { action: "checkout", userName: user.name });

        return res.json({
          success: true,
          type: "pulang",
          name: user.name,
          time: currentTime,
          className: user.className,
          message: `${user.name} - Absen Pulang ${currentTime}`,
        });
      }
    } catch (error) {
      console.error("Scan error:", error);
      res.status(500).json({ success: false, message: "Server error" });
    }
  });

  // MANUAL ATTENDANCE (admin)
  app.post("/api/admin/manual-attendance", requireRole("admin"), async (req: Request, res: Response) => {
    try {
      const { userId, date, type, time, sendWa } = req.body;
      if (!userId || !date || !type) {
        return res.status(400).json({ message: "Data tidak lengkap" });
      }
      const targetUser = await storage.getUser(userId);
      if (!targetUser) {
        return res.status(404).json({ message: "User tidak ditemukan" });
      }
      const existing = await storage.getAttendance(userId, date);
      const settings = await storage.getScannerSettings();
      const currentTime = time || getCurrentTime();
      let responseMessage = "";
      let waType = type;

      if (type === "checkin") {
        if (existing && existing.checkInTime) {
          return res.status(409).json({ message: `${targetUser.name} sudah absen datang pada ${date}` });
        }
        const threshold = settings.lateThreshold || "07:15";
        const isLate = currentTime > threshold;
        const status = isLate ? "telat" : "hadir";
        if (isLate) waType = "telat";
        if (existing) {
          await storage.updateAttendance(existing.id, { checkInTime: currentTime, status });
        } else {
          await storage.createAttendance({ userId, date, checkInTime: currentTime, checkOutTime: null, status });
        }
        sheetAppendAttendance({ date, name: targetUser.name, identifier: targetUser.identifier, className: targetUser.className || "-", checkInTime: currentTime, checkOutTime: "-", status, role: targetUser.role }).catch(console.error);
        responseMessage = `${targetUser.name} - Absen Datang Manual (${currentTime})${isLate ? " [Telat]" : ""}`;
      } else if (type === "checkout") {
        if (!existing || !existing.checkInTime) {
          return res.status(400).json({ message: `${targetUser.name} belum absen datang pada ${date}` });
        }
        if (existing.checkOutTime) {
          return res.status(409).json({ message: `${targetUser.name} sudah absen pulang pada ${date}` });
        }
        await storage.updateAttendance(existing.id, { checkOutTime: currentTime });
        sheetUpdateAttendance(date, targetUser.identifier, currentTime, "pulang").catch(console.error);
        responseMessage = `${targetUser.name} - Absen Pulang Manual (${currentTime})`;
      } else if (type === "izin" || type === "sakit" || type === "alpha") {
        if (existing) {
          await storage.updateAttendance(existing.id, { status: type });
        } else {
          await storage.createAttendance({ userId, date, checkInTime: null, checkOutTime: null, status: type });
        }
        sheetAppendAttendance({ date, name: targetUser.name, identifier: targetUser.identifier, className: targetUser.className || "-", checkInTime: "-", checkOutTime: "-", status: type, role: targetUser.role }).catch(console.error);
        responseMessage = `${targetUser.name} - Status ${type} (${date})`;
      } else {
        return res.status(400).json({ message: "Tipe absensi tidak valid" });
      }

      let waSent = false;
      if (sendWa && targetUser.role === "siswa" && targetUser.parentPhone) {
        if (waType === "telat") {
          waSent = await sendLateNotification(targetUser.parentPhone, targetUser.name, currentTime).catch(() => false) as boolean;
        } else {
          const timeForWa = (type === "checkin" || type === "checkout") ? currentTime : undefined;
          waSent = await sendManualAttendanceNotification(targetUser.parentPhone, targetUser.name, waType, date, timeForWa).catch(() => false) as boolean;
        }
        if (waSent) responseMessage += " | WA terkirim";
        else responseMessage += " | WA gagal terkirim";
      } else if (sendWa && targetUser.role === "siswa" && !targetUser.parentPhone) {
        responseMessage += " | No HP ortu belum diisi";
      }

      broadcastUpdate("attendance", { action: "manual", userName: targetUser.name });
      return res.json({ success: true, message: responseMessage, waSent });
    } catch (error) {
      console.error("Manual attendance error:", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  // HOLIDAYS
  app.get("/api/holidays", async (_req: Request, res: Response) => {
    const list = await storage.getHolidays();
    res.json(list);
  });

  app.post("/api/holidays", requireRole("admin"), async (req: Request, res: Response) => {
    try {
      const parsed = insertHolidaySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Data tidak valid" });
      }
      const holiday = await storage.createHoliday(parsed.data);
      res.json(holiday);
    } catch (error) {
      console.error("Create holiday error:", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.delete("/api/holidays/:id", requireRole("admin"), async (req: Request, res: Response) => {
    await storage.deleteHoliday(parseInt(req.params.id));
    res.json({ message: "Deleted" });
  });

  // ADMIN ROUTES
  app.get("/api/admin/users", requireRole("admin"), async (req: Request, res: Response) => {
    const { role, className } = req.query;
    const list = await storage.getUsers(role as string | undefined, className as string | undefined);
    const safeList = list.map(({ password, ...u }) => u);
    res.json(safeList);
  });

  app.post("/api/admin/users", requireRole("admin"), async (req: Request, res: Response) => {
    try {
      const { name, identifier, role, className, parentPhone, parentName } = req.body;
      if (!name || !identifier || !role) {
        return res.status(400).json({ message: "Data tidak lengkap" });
      }

      const existingUser = await storage.getUserByIdentifier(identifier);
      if (existingUser) {
        return res.status(409).json({ message: "Identifier sudah digunakan" });
      }

      const user = await storage.createUser({
        name: titleCase(name),
        identifier,
        password: role === "admin" ? req.body.password || identifier : identifier,
        role,
        className: formatClassName(className),
        parentPhone: parentPhone || null,
        parentName: parentName ? titleCase(parentName) : null,
        qrCode: crypto.randomUUID(),
      });
      const { password: _, ...safeUser } = user;
      res.json(safeUser);
    } catch (error) {
      console.error("Create user error:", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.put("/api/admin/users/:id", requireRole("admin"), async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const { name, identifier, role, className, parentPhone, parentName } = req.body;
      const updated = await storage.updateUser(id, {
        name: name ? titleCase(name) : undefined,
        identifier,
        role,
        className: className !== undefined ? formatClassName(className) : undefined,
        parentPhone,
        parentName: parentName ? titleCase(parentName) : parentName,
      });
      if (!updated) {
        return res.status(404).json({ message: "User not found" });
      }
      const { password: _, ...safeUser } = updated;
      res.json(safeUser);
    } catch (error) {
      console.error("Update user error:", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.delete("/api/admin/users/:id", requireRole("admin"), async (req: Request, res: Response) => {
    await storage.deleteUser(parseInt(req.params.id));
    res.json({ message: "Deleted" });
  });

  app.get("/api/admin/sheet-tabs", requireRole("admin"), async (_req: Request, res: Response) => {
    try {
      const tabs = await getSheetTabs();
      res.json({ tabs });
    } catch (error: any) {
      console.error("Failed to get sheet tabs:", error);
      res.status(500).json({ message: "Gagal membaca Google Sheet: " + error.message });
    }
  });

  const ALLOWED_IMPORT_TABS = ["Siswa", "Guru", "Wali Kelas"];

  app.get("/api/admin/sheet-preview", requireRole("admin"), async (req: Request, res: Response) => {
    try {
      const tab = req.query.tab as string;
      if (!tab || !ALLOWED_IMPORT_TABS.includes(tab)) return res.status(400).json({ message: "Tab tidak valid. Gunakan: Siswa, Guru, atau Wali Kelas" });
      const rows = await readUsersFromSheet(tab);
      res.json({ rows, tab });
    } catch (error: any) {
      console.error("Failed to read sheet:", error);
      res.status(500).json({ message: "Gagal membaca data dari sheet: " + error.message });
    }
  });

  app.post("/api/admin/import-users", requireRole("admin"), async (req: Request, res: Response) => {
    try {
      const { tab } = req.body;
      if (!tab || !ALLOWED_IMPORT_TABS.includes(tab)) return res.status(400).json({ message: "Tab tidak valid. Gunakan: Siswa, Guru, atau Wali Kelas" });

      const rows = await readUsersFromSheet(tab);
      if (rows.length === 0) {
        return res.status(400).json({ message: "Sheet kosong, tidak ada data untuk diimport" });
      }

      let imported = 0;
      let skipped = 0;
      let errors: string[] = [];

      const tabLower = tab.toLowerCase();

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        try {
          if (tabLower === "siswa") {
            const [name, nisn, className, parentPhone, parentName] = row;
            if (!name || !nisn) { skipped++; errors.push(`Baris ${i + 2}: Nama atau NISN kosong`); continue; }
            const existing = await storage.getUserByIdentifier(nisn);
            if (existing) { skipped++; errors.push(`Baris ${i + 2}: NISN ${nisn} sudah terdaftar`); continue; }
            await storage.createUser({
              name: titleCase(name),
              identifier: nisn.trim(),
              password: nisn.trim(),
              role: "siswa",
              className: formatClassName(className),
              parentPhone: parentPhone?.trim() || null,
              parentName: parentName ? titleCase(parentName) : null,
              qrCode: crypto.randomUUID(),
            });
            imported++;
          } else if (tabLower === "guru") {
            const [name, nip, phone] = row;
            if (!name || !nip) { skipped++; errors.push(`Baris ${i + 2}: Nama atau NIP kosong`); continue; }
            const existing = await storage.getUserByIdentifier(nip);
            if (existing) { skipped++; errors.push(`Baris ${i + 2}: NIP ${nip} sudah terdaftar`); continue; }
            await storage.createUser({
              name: titleCase(name),
              identifier: nip.trim(),
              password: nip.trim(),
              role: "guru",
              className: null,
              parentPhone: phone?.trim() || null,
              parentName: null,
              qrCode: crypto.randomUUID(),
            });
            imported++;
          } else if (tabLower === "wali kelas") {
            const [name, nip, className, phone] = row;
            if (!name || !nip) { skipped++; errors.push(`Baris ${i + 2}: Nama atau NIP kosong`); continue; }
            const existing = await storage.getUserByIdentifier(nip);
            if (existing) { skipped++; errors.push(`Baris ${i + 2}: NIP ${nip} sudah terdaftar`); continue; }
            await storage.createUser({
              name: titleCase(name),
              identifier: nip.trim(),
              password: nip.trim(),
              role: "wali_kelas",
              className: formatClassName(className),
              parentPhone: phone?.trim() || null,
              parentName: null,
              qrCode: crypto.randomUUID(),
            });
            imported++;
          } else {
            return res.status(400).json({ message: `Tab "${tab}" tidak dikenali. Gunakan tab: Siswa, Guru, atau Wali Kelas` });
          }
        } catch (err: any) {
          skipped++;
          errors.push(`Baris ${i + 2}: ${err.message}`);
        }
      }

      res.json({ imported, skipped, errors: errors.slice(0, 20), total: rows.length });
    } catch (error: any) {
      console.error("Import users error:", error);
      res.status(500).json({ message: "Gagal import data: " + error.message });
    }
  });

  app.post("/api/admin/import-from-url", requireRole("admin"), async (req: Request, res: Response) => {
    try {
      const { csvUrl, role } = req.body;
      if (!csvUrl) return res.status(400).json({ message: "csvUrl harus diisi" });
      const allowedRoles = ["siswa", "guru", "wali_kelas"];
      const importRole = role || "siswa";
      if (!allowedRoles.includes(importRole)) return res.status(400).json({ message: "Role tidak valid" });

      const resp = await fetch(csvUrl);
      if (!resp.ok) return res.status(400).json({ message: "Gagal mengambil data dari URL" });
      const text = await resp.text();

      const lines = text.trim().split("\n").map(l => l.trim()).filter(Boolean);
      if (lines.length < 2) return res.status(400).json({ message: "Data CSV kosong" });

      const parseRow = (line: string): string[] => {
        const result: string[] = [];
        let cur = "";
        let inQuote = false;
        for (let i = 0; i < line.length; i++) {
          const ch = line[i];
          if (ch === '"') { inQuote = !inQuote; }
          else if (ch === ',' && !inQuote) { result.push(cur.trim()); cur = ""; }
          else { cur += ch; }
        }
        result.push(cur.trim());
        return result;
      };

      const normalizeNisn = (val: string): string => {
        if (!val) return val;
        const v = val.trim().replace(/`/g, "");
        if (/^[\d.]+[eE][+\-]?\d+$/.test(v)) {
          return String(Math.round(Number(v)));
        }
        return v.replace(/\.0+$/, "");
      };

      const rows = lines.slice(1).map(parseRow);
      let imported = 0, skipped = 0;
      const errors: string[] = [];

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        try {
          if (importRole === "siswa") {
            const [rawNisn, name, className, parentPhone, parentName] = row;
            const nisn = normalizeNisn(rawNisn);
            if (!name || !nisn) { skipped++; errors.push(`Baris ${i + 2}: Nama atau NISN kosong`); continue; }
            const existing = await storage.getUserByIdentifier(nisn);
            if (existing) { skipped++; errors.push(`Baris ${i + 2}: NISN ${nisn} sudah terdaftar`); continue; }
            await storage.createUser({
              name: titleCase(name),
              identifier: nisn,
              password: nisn,
              role: "siswa",
              className: formatClassName(className),
              parentPhone: parentPhone?.trim() || null,
              parentName: parentName ? titleCase(parentName) : null,
              qrCode: crypto.randomUUID(),
            });
            imported++;
          } else if (importRole === "guru") {
            const [nip, name, phone] = row;
            const nipClean = nip?.trim();
            if (!name || !nipClean) { skipped++; errors.push(`Baris ${i + 2}: Nama atau NIP kosong`); continue; }
            const existing = await storage.getUserByIdentifier(nipClean);
            if (existing) { skipped++; errors.push(`Baris ${i + 2}: NIP ${nipClean} sudah terdaftar`); continue; }
            await storage.createUser({
              name: titleCase(name),
              identifier: nipClean,
              password: nipClean,
              role: "guru",
              className: null,
              parentPhone: phone?.trim() || null,
              parentName: null,
              qrCode: crypto.randomUUID(),
            });
            imported++;
          } else if (importRole === "wali_kelas") {
            const [nip, name, className, phone] = row;
            const nipClean = nip?.trim();
            if (!name || !nipClean) { skipped++; errors.push(`Baris ${i + 2}: Nama atau NIP kosong`); continue; }
            const existing = await storage.getUserByIdentifier(nipClean);
            if (existing) { skipped++; errors.push(`Baris ${i + 2}: NIP ${nipClean} sudah terdaftar`); continue; }
            await storage.createUser({
              name: titleCase(name),
              identifier: nipClean,
              password: nipClean,
              role: "wali_kelas",
              className: formatClassName(className),
              parentPhone: phone?.trim() || null,
              parentName: null,
              qrCode: crypto.randomUUID(),
            });
            imported++;
          }
        } catch (err: any) {
          skipped++;
          errors.push(`Baris ${i + 2}: ${err.message}`);
        }
      }

      res.json({ imported, skipped, errors: errors.slice(0, 20), total: rows.length });
    } catch (error: any) {
      console.error("Import from URL error:", error);
      res.status(500).json({ message: "Gagal import: " + error.message });
    }
  });

  app.post("/api/admin/sync-users", requireRole("admin"), async (_req: Request, res: Response) => {
    try {
      let added = 0, updated = 0, unchanged = 0, deleted = 0, errorsList: string[] = [];
      const sheetIdentifiers: Record<string, Set<string>> = { siswa: new Set(), guru: new Set(), wali_kelas: new Set() };

      const syncTab = async (tab: string, role: string, parseRow: (row: string[]) => { identifier: string; name: string; className?: string | null; parentPhone?: string | null; parentName?: string | null } | null) => {
        let rows: string[][] = [];
        try {
          rows = await readUsersFromSheet(tab);
        } catch (err: any) {
          errorsList.push(`Tab "${tab}": ${err.message}`);
          return;
        }
        for (let i = 0; i < rows.length; i++) {
          try {
            const parsed = parseRow(rows[i]);
            if (!parsed) { errorsList.push(`${tab} baris ${i + 2}: Data tidak lengkap`); continue; }
            sheetIdentifiers[role].add(parsed.identifier);
            const existing = await storage.getUserByIdentifier(parsed.identifier);
            if (existing) {
              let hasChanges = false;
              const updates: any = {};
              if (existing.name !== parsed.name) { updates.name = parsed.name; hasChanges = true; }
              if ((existing.className || null) !== (parsed.className || null)) { updates.className = parsed.className || null; hasChanges = true; }
              if ((existing.parentPhone || null) !== (parsed.parentPhone || null)) { updates.parentPhone = parsed.parentPhone || null; hasChanges = true; }
              if ((existing.parentName || null) !== (parsed.parentName || null)) { updates.parentName = parsed.parentName || null; hasChanges = true; }
              if (hasChanges) {
                await storage.updateUser(existing.id, updates);
                updated++;
              } else {
                unchanged++;
              }
            } else {
              await storage.createUser({
                name: parsed.name,
                identifier: parsed.identifier,
                password: parsed.identifier,
                role: role as any,
                className: parsed.className || null,
                parentPhone: parsed.parentPhone || null,
                parentName: parsed.parentName || null,
                qrCode: crypto.randomUUID(),
              });
              added++;
            }
          } catch (err: any) {
            errorsList.push(`${tab} baris ${i + 2}: ${err.message}`);
          }
        }
      };

      await syncTab("Siswa", "siswa", (row) => {
        const [name, nisn, className, parentPhone, parentName] = row;
        if (!name?.trim() || !nisn?.trim()) return null;
        return { name: titleCase(name), identifier: nisn.trim(), className: formatClassName(className), parentPhone: parentPhone?.trim(), parentName: parentName ? titleCase(parentName) : undefined };
      });

      await syncTab("Guru", "guru", (row) => {
        const [name, nip, phone] = row;
        if (!name?.trim() || !nip?.trim()) return null;
        return { name: titleCase(name), identifier: nip.trim(), parentPhone: phone?.trim() };
      });

      await syncTab("Wali Kelas", "wali_kelas", (row) => {
        const [name, nip, className, phone] = row;
        if (!name?.trim() || !nip?.trim()) return null;
        return { name: titleCase(name), identifier: nip.trim(), className: formatClassName(className), parentPhone: phone?.trim() };
      });

      for (const role of ["siswa", "guru", "wali_kelas"] as const) {
        if (sheetIdentifiers[role].size === 0) continue;
        const existingUsers = await storage.getUsers(role);
        for (const user of existingUsers) {
          if (!sheetIdentifiers[role].has(user.identifier)) {
            try {
              await storage.deleteUser(user.id);
              deleted++;
            } catch (err: any) {
              errorsList.push(`Gagal hapus ${user.name}: ${err.message}`);
            }
          }
        }
      }

      console.log(`Sync users: ${added} added, ${updated} updated, ${unchanged} unchanged, ${deleted} deleted`);
      res.json({ added, updated, unchanged, deleted, errors: errorsList.slice(0, 20) });
    } catch (error: any) {
      console.error("Sync users error:", error);
      res.status(500).json({ message: "Gagal sinkronisasi: " + error.message });
    }
  });

  app.post("/api/admin/sync-from-urls", requireRole("admin"), async (_req: Request, res: Response) => {
    try {
      const settings = await storage.getScannerSettings();
      const urlMap: Record<string, string | null | undefined> = {
        siswa: settings.csvUrlSiswa,
        guru: settings.csvUrlGuru,
        wali_kelas: settings.csvUrlWaliKelas,
      };

      const parseRowCsv = (line: string): string[] => {
        const result: string[] = [];
        let cur = "", inQuote = false;
        for (let i = 0; i < line.length; i++) {
          const ch = line[i];
          if (ch === '"') { inQuote = !inQuote; }
          else if (ch === ',' && !inQuote) { result.push(cur.trim()); cur = ""; }
          else { cur += ch; }
        }
        result.push(cur.trim());
        return result;
      };

      const normalizeId = (val: string): string => {
        if (!val) return val;
        const v = val.trim().replace(/`/g, "");
        if (/^[\d.]+[eE][+\-]?\d+$/.test(v)) return String(Math.round(Number(v)));
        return v.replace(/\.0+$/, "");
      };

      let added = 0, updated = 0, unchanged = 0, errorsList: string[] = [];
      const synced: string[] = [];

      for (const [role, csvUrl] of Object.entries(urlMap)) {
        if (!csvUrl) continue;
        synced.push(role);
        let text = "";
        try {
          const resp = await fetch(csvUrl);
          if (!resp.ok) { errorsList.push(`${role}: Gagal mengambil CSV`); continue; }
          text = await resp.text();
        } catch { errorsList.push(`${role}: Gagal koneksi ke URL`); continue; }

        const lines = text.trim().split("\n").map(l => l.trim()).filter(Boolean);
        if (lines.length < 2) { errorsList.push(`${role}: Sheet kosong`); continue; }
        const rows = lines.slice(1).map(parseRowCsv);

        for (let i = 0; i < rows.length; i++) {
          try {
            const row = rows[i];
            let identifier = "", name = "", className: string | null = null, parentPhone: string | null = null, parentName: string | null = null;

            if (role === "siswa") {
              const [rawNisn, rawName, rawClass, rawPhone, rawParent] = row;
              identifier = normalizeId(rawNisn);
              name = titleCase(rawName || "");
              className = formatClassName(rawClass);
              parentPhone = rawPhone?.trim() || null;
              parentName = rawParent ? titleCase(rawParent) : null;
            } else if (role === "guru") {
              const [rawNip, rawName, rawPhone] = row;
              identifier = rawNip?.trim();
              name = titleCase(rawName || "");
              parentPhone = rawPhone?.trim() || null;
            } else if (role === "wali_kelas") {
              const [rawNip, rawName, rawClass, rawPhone] = row;
              identifier = rawNip?.trim();
              name = titleCase(rawName || "");
              className = formatClassName(rawClass);
              parentPhone = rawPhone?.trim() || null;
            }

            if (!identifier || !name) { errorsList.push(`${role} baris ${i + 2}: ID atau nama kosong`); continue; }

            const existing = await storage.getUserByIdentifier(identifier);
            if (existing) {
              const updates: any = {};
              let hasChanges = false;
              if (existing.name !== name) { updates.name = name; hasChanges = true; }
              if ((existing.className || null) !== (className || null)) { updates.className = className; hasChanges = true; }
              if ((existing.parentPhone || null) !== (parentPhone || null)) { updates.parentPhone = parentPhone; hasChanges = true; }
              if ((existing.parentName || null) !== (parentName || null)) { updates.parentName = parentName; hasChanges = true; }
              if (existing.role !== role) { updates.role = role; hasChanges = true; }
              if (hasChanges) { await storage.updateUser(existing.id, updates); updated++; }
              else { unchanged++; }
            } else {
              await storage.createUser({ name, identifier, password: identifier, role: role as any, className, parentPhone, parentName, qrCode: crypto.randomUUID() });
              added++;
            }
          } catch (err: any) {
            errorsList.push(`${role} baris ${i + 2}: ${err.message}`);
          }
        }
      }

      const label = synced.length ? synced.join(", ") : "tidak ada URL yang dikonfigurasi";
      console.log(`Sync from URLs (${label}): +${added} updated:${updated} unchanged:${unchanged}`);
      res.json({ added, updated, unchanged, synced, errors: errorsList.slice(0, 20) });
    } catch (error: any) {
      console.error("Sync from URLs error:", error);
      res.status(500).json({ message: "Gagal sync: " + error.message });
    }
  });

  app.get("/api/admin/sheets-script", requireRole("admin"), (_req: Request, res: Response) => {
    res.json({ code: APPS_SCRIPT_CODE });
  });

  app.post("/api/admin/test-sheets-webhook", requireRole("admin"), async (_req: Request, res: Response) => {
    const result = await testWebhook();
    res.json(result);
  });

  app.get("/api/admin/attendance", requireRole("admin"), async (req: Request, res: Response) => {
    const { startDate, endDate, className, role, status } = req.query;
    const records = await storage.getAttendanceFiltered({
      startDate: startDate as string | undefined,
      endDate: endDate as string | undefined,
      className: className as string | undefined,
      role: role as string | undefined,
      status: status as string | undefined,
    });
    res.json(records);
  });

  app.delete("/api/admin/attendance/clear", requireRole("admin"), async (req: Request, res: Response) => {
    try {
      const { target } = req.query;
      let dbDeleted = 0;
      let sheetCleared = 0;

      if (target === "all" || target === "db") {
        const result = await storage.clearAllAttendance();
        dbDeleted = result;
      }
      if (target === "all" || target === "sheet") {
        try {
          await sheetClearAttendance();
          sheetCleared = true;
        } catch (err) {
          console.error("Failed to clear sheet:", err);
        }
      }

      broadcastUpdate("attendance", { action: "cleared" });
      res.json({ success: true, dbDeleted, sheetCleared });
    } catch (error) {
      console.error("Clear attendance error:", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/admin/attendance/export", requireRole("admin"), async (req: Request, res: Response) => {
    const { startDate, endDate, className, role, status } = req.query;
    const records = await storage.getAttendanceFiltered({
      startDate: startDate as string | undefined,
      endDate: endDate as string | undefined,
      className: className as string | undefined,
      role: role as string | undefined,
      status: status as string | undefined,
    });

    const csvHeader = "No,Tanggal,Nama,NISN/NIP,Kelas,Jam Datang,Jam Pulang,Status\n";
    const csvRows = records.map((r, i) =>
      `${i + 1},"${r.date}","${r.user.name}","${r.user.identifier}","${r.user.className || '-'}","${r.checkInTime || '-'}","${r.checkOutTime || '-'}","${r.status}"`
    ).join("\n");

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=rekap-absensi.csv');
    res.send('\uFEFF' + csvHeader + csvRows);
  });

  app.get("/api/admin/qrcode/:userId", requireRole("admin"), async (req: Request, res: Response) => {
    const user = await storage.getUser(parseInt(req.params.userId));
    if (!user) return res.status(404).json({ message: "User not found" });
    const { password: _, ...safeUser } = user;
    res.json(safeUser);
  });

  app.get("/api/admin/qrcodes", requireRole("admin"), async (req: Request, res: Response) => {
    const { role, className } = req.query;
    const list = await storage.getUsers(role as string | undefined, className as string | undefined);
    const safeList = list
      .filter(u => u.role !== "admin")
      .map(({ password, ...u }) => u);
    res.json(safeList);
  });

  // EXCUSE ROUTES
  app.post("/api/excuses", requireAuth, upload.single("photo"), async (req: Request, res: Response) => {
    try {
      const { date, type, description } = req.body;
      if (!date || !type || !description) {
        return res.status(400).json({ message: "Data tidak lengkap" });
      }

      let photoUrl: string | null = null;
      let driveFileId: string | null = null;

      if (req.file) {
        const user = await storage.getUser(req.session.userId!);
        const fileName = `izin_${user?.name}_${date}_${Date.now()}.${req.file.originalname.split('.').pop()}`;
        const result = await uploadExcusePhoto(req.file.buffer, fileName, req.file.mimetype);
        if (result) {
          driveFileId = result.fileId;
          photoUrl = result.webViewLink;
        }
      }

      const excuse = await storage.createExcuse({
        userId: req.session.userId!,
        date,
        type: type as "sakit" | "izin",
        description,
        photoUrl,
        driveFileId,
        status: "pending",
      });

      const existing = await storage.getAttendance(req.session.userId!, date);
      if (!existing) {
        await storage.createAttendance({
          userId: req.session.userId!,
          date,
          checkInTime: null,
          checkOutTime: null,
          status: type as "sakit" | "izin",
        });
      } else {
        await storage.updateAttendance(existing.id, { status: type as "sakit" | "izin" });
      }

      const student = await storage.getUser(req.session.userId!);
      if (student) {
        sheetAppendAttendance({ date, name: student.name, identifier: student.identifier, className: student.className || "-", checkInTime: "-", checkOutTime: "-", status: type, role: student.role }).catch(console.error);
      }
      if (student?.className) {
        const homeroomTeachers = await storage.getUsers("wali_kelas", student.className);
        for (const wali of homeroomTeachers) {
          if (wali.parentPhone) {
            const driveLink = driveFileId ? `https://drive.google.com/file/d/${driveFileId}/view` : undefined;
            sendExcuseNotificationToHomeroom(
              wali.parentPhone, wali.name, student.name, student.className,
              type, date, description, driveLink
            ).catch(err => console.error("Failed to send WA to homeroom:", err));
          }
        }
      }

      broadcastUpdate("attendance", { action: "excuse", userName: student?.name });
      res.json(excuse);
    } catch (error) {
      console.error("Create excuse error:", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/excuses", requireAuth, async (req: Request, res: Response) => {
    const role = req.session.role!;
    if (role === "admin") {
      const list = await storage.getExcuses();
      return res.json(list);
    }
    if (role === "wali_kelas") {
      const user = await storage.getUser(req.session.userId!);
      if (user?.className) {
        const list = await storage.getExcusesByClass(user.className);
        return res.json(list);
      }
    }
    const list = await storage.getExcuses(req.session.userId!);
    res.json(list);
  });

  app.put("/api/excuses/:id/status", requireRole("admin", "wali_kelas"), async (req: Request, res: Response) => {
    try {
      const { status } = req.body;
      if (!["approved", "rejected"].includes(status)) {
        return res.status(400).json({ message: "Status tidak valid" });
      }
      const updated = await storage.updateExcuseStatus(parseInt(req.params.id), status);
      if (!updated) return res.status(404).json({ message: "Not found" });
      res.json(updated);
    } catch (error) {
      console.error("Update excuse error:", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  // ATTENDANCE HISTORY (for logged-in users)
  app.get("/api/attendance/history", requireAuth, async (req: Request, res: Response) => {
    const records = await storage.getUserAttendanceHistory(req.session.userId!);
    res.json(records);
  });

  // CLASS ATTENDANCE (for wali_kelas and guru)
  app.get("/api/class/attendance", requireRole("wali_kelas", "guru"), async (req: Request, res: Response) => {
    const user = await storage.getUser(req.session.userId!);
    const { date, className: qClassName } = req.query;
    const targetClass = (qClassName as string) || user?.className;
    if (!targetClass) return res.json([]);
    const targetDate = (date as string) || getCurrentDate();
    const students = await storage.getUsers("siswa", targetClass);
    const result = [];
    for (const student of students) {
      const att = await storage.getAttendance(student.id, targetDate);
      const { password: _, ...safeStudent } = student;
      result.push({
        student: safeStudent,
        attendance: att || null,
      });
    }
    res.json(result);
  });

  app.get("/api/class/students", requireRole("wali_kelas", "guru"), async (req: Request, res: Response) => {
    const user = await storage.getUser(req.session.userId!);
    const { className: qClassName } = req.query;
    const targetClass = (qClassName as string) || user?.className;
    if (!targetClass) return res.json([]);
    const students = await storage.getUsers("siswa", targetClass);
    const safeList = students.map(({ password, ...u }) => u);
    res.json(safeList);
  });

  app.get("/api/classes", requireRole("guru", "wali_kelas", "admin"), async (_req: Request, res: Response) => {
    const allStudents = await storage.getUsers("siswa");
    const classes = [...new Set(allStudents.map(s => s.className).filter(Boolean))].sort();
    res.json(classes);
  });

  async function checkAutoHoliday() {
    try {
      const settings = await storage.getScannerSettings();
      if (!settings.autoHolidayEnabled) return;

      const now = new Date();
      const currentTime = getCurrentTime();
      const currentDate = getCurrentDate();

      if (currentTime < settings.autoHolidayTime) return;

      const dayOfWeek = now.getDay().toString();
      const holidayDays = (settings.defaultHolidayDays || "0,6").split(",").map(d => d.trim());
      if (holidayDays.includes(dayOfWeek)) return;

      const existingHoliday = await storage.getHolidayByDate(currentDate);
      if (existingHoliday) return;

      const allUsers = await storage.getUsers("siswa");
      const guruUsers = await storage.getUsers("guru");
      const waliUsers = await storage.getUsers("wali_kelas");
      const totalUsers = allUsers.length + guruUsers.length + waliUsers.length;
      if (totalUsers === 0) return;

      let hasAnyAttendance = false;
      for (const u of [...allUsers, ...guruUsers, ...waliUsers]) {
        const att = await storage.getAttendance(u.id, currentDate);
        if (att && att.checkInTime) {
          hasAnyAttendance = true;
          break;
        }
      }

      if (!hasAnyAttendance) {
        await storage.createHoliday({ date: currentDate, description: "Libur Otomatis (tidak ada absensi)" });
        console.log(`Auto-holiday created for ${currentDate}`);
        broadcastUpdate("holiday", { date: currentDate });
      }
    } catch (err) {
      console.error("Auto-holiday check error:", err);
    }
  }

  let alphaSentToday = "";
  async function checkAlphaNotifications() {
    try {
      const settings = await storage.getScannerSettings();
      if (!settings.fonnteToken) return;

      const currentTime = getCurrentTime();
      const currentDate = getCurrentDate();

      if (alphaSentToday === currentDate) return;

      const now = new Date();
      const dayOfWeek = now.getDay().toString();
      const holidayDays = (settings.defaultHolidayDays || "0,6").split(",").map(d => d.trim());
      if (holidayDays.includes(dayOfWeek)) return;

      const existingHoliday = await storage.getHolidayByDate(currentDate);
      if (existingHoliday) return;

      const alphaNotifTime = settings.alphaNotifTime || "09:00";
      if (currentTime < alphaNotifTime) return;

      const allUsers = await storage.getUsers("siswa");
      const guruUsers = await storage.getUsers("guru");
      const waliUsers = await storage.getUsers("wali_kelas");
      const everyone = [...allUsers, ...guruUsers, ...waliUsers];

      let hasAnyAttendance = false;
      for (const u of everyone) {
        const att = await storage.getAttendance(u.id, currentDate);
        if (att && att.checkInTime) {
          hasAnyAttendance = true;
          break;
        }
      }

      if (!hasAnyAttendance && settings.autoHolidayEnabled) {
        await checkAutoHoliday();
        const holiday = await storage.getHolidayByDate(currentDate);
        if (holiday) {
          alphaSentToday = currentDate;
          console.log(`No attendance today, marked as holiday — skipping alpha notifications for ${currentDate}`);
          return;
        }
      }

      const students = allUsers;
      let sent = 0;
      let marked = 0;
      for (const student of students) {
        const att = await storage.getAttendance(student.id, currentDate);
        const isAbsent = !att || (!att.checkInTime && att.status !== "izin" && att.status !== "sakit");
        if (!isAbsent) continue;

        if (!att) {
          await storage.createAttendance({
            userId: student.id,
            date: currentDate,
            checkInTime: null,
            checkOutTime: null,
            status: "alpha",
          });
          marked++;
          sheetAppendAttendance({
            date: currentDate,
            name: student.name,
            identifier: student.identifier,
            className: student.className || "-",
            checkInTime: "-",
            checkOutTime: "-",
            status: "alpha",
            role: student.role,
          }).catch(console.error);
        } else if (att.status !== "alpha") {
          await storage.updateAttendance(att.id, { status: "alpha" });
          marked++;
        }

        if (student.parentPhone) {
          sendAlphaNotification(student.parentPhone, student.name, currentDate).catch(console.error);
          sent++;
        }
      }

      alphaSentToday = currentDate;
      if (marked > 0) console.log(`${marked} students marked as alpha for ${currentDate}`);
      if (sent > 0) console.log(`Alpha notifications sent to ${sent} parents for ${currentDate}`);
      broadcastUpdate();
    } catch (err) {
      console.error("Alpha notification check error:", err);
    }
  }

  setInterval(checkAutoHoliday, 60000);
  setTimeout(checkAutoHoliday, 5000);
  setInterval(checkAlphaNotifications, 60000);
  setTimeout(checkAlphaNotifications, 10000);

  return httpServer;
}
