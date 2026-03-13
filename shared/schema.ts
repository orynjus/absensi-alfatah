import { sql } from "drizzle-orm";
import { pgTable, text, varchar, boolean, timestamp, date, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: text("name").notNull(),
  identifier: text("identifier").notNull().unique(),
  password: text("password").notNull(),
  role: text("role").notNull().$type<"siswa" | "guru" | "wali_kelas" | "admin">(),
  className: text("class_name"),
  parentPhone: text("parent_phone"),
  parentName: text("parent_name"),
  qrCode: text("qr_code").notNull().unique(),
});

export const attendance = pgTable("attendance", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("user_id").notNull().references(() => users.id),
  date: text("date").notNull(),
  checkInTime: text("check_in_time"),
  checkOutTime: text("check_out_time"),
  status: text("status").notNull().$type<"hadir" | "telat" | "izin" | "sakit" | "alpha">().default("hadir"),
});

export const excuses = pgTable("excuses", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("user_id").notNull().references(() => users.id),
  date: text("date").notNull(),
  type: text("type").notNull().$type<"sakit" | "izin">(),
  description: text("description").notNull(),
  photoUrl: text("photo_url"),
  driveFileId: text("drive_file_id"),
  status: text("status").notNull().$type<"pending" | "approved" | "rejected">().default("pending"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const scannerSettings = pgTable("scanner_settings", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  isLocked: boolean("is_locked").notNull().default(true),
  lockPin: text("lock_pin").notNull().default("1234"),
  lateThreshold: text("late_threshold").notNull().default("07:15"),
  checkInStart: text("check_in_start").notNull().default("06:30"),
  checkInEnd: text("check_in_end").notNull().default("08:00"),
  checkOutStart: text("check_out_start").notNull().default("14:00"),
  checkOutEnd: text("check_out_end").notNull().default("16:00"),
  weeklySchedule: text("weekly_schedule"),
  defaultHolidayDays: text("default_holiday_days").notNull().default("0,6"),
  autoHolidayEnabled: boolean("auto_holiday_enabled").notNull().default(false),
  autoHolidayTime: text("auto_holiday_time").notNull().default("09:00"),
  alphaNotifTime: text("alpha_notif_time").notNull().default("09:00"),
  fonnteToken: text("fonnte_token"),
  googleSheetId: text("google_sheet_id"),
  googleDriveFolderId: text("google_drive_folder_id"),
  csvUrlSiswa: text("csv_url_siswa"),
  csvUrlGuru: text("csv_url_guru"),
  csvUrlWaliKelas: text("csv_url_wali_kelas"),
  sheetsWebhookUrl: text("sheets_webhook_url"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const holidays = pgTable("holidays", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  date: text("date").notNull().unique(),
  description: text("description").notNull(),
});

export const insertUserSchema = createInsertSchema(users).omit({ id: true });
export const insertAttendanceSchema = createInsertSchema(attendance).omit({ id: true });
export const insertExcuseSchema = createInsertSchema(excuses).omit({ id: true, createdAt: true });
export const insertScannerSettingsSchema = createInsertSchema(scannerSettings).omit({ id: true, updatedAt: true });
export const insertHolidaySchema = createInsertSchema(holidays).omit({ id: true });

export const loginSchema = z.object({
  identifier: z.string().min(1),
  password: z.string().min(1),
  role: z.enum(["siswa", "guru", "wali_kelas", "admin"]),
});

export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type Attendance = typeof attendance.$inferSelect;
export type InsertAttendance = z.infer<typeof insertAttendanceSchema>;
export type Excuse = typeof excuses.$inferSelect;
export type InsertExcuse = z.infer<typeof insertExcuseSchema>;
export type ScannerSettings = typeof scannerSettings.$inferSelect;
export type InsertScannerSettings = z.infer<typeof insertScannerSettingsSchema>;
export type Holiday = typeof holidays.$inferSelect;
export type InsertHoliday = z.infer<typeof insertHolidaySchema>;
