import { eq, and, desc, gte, lte, like } from "drizzle-orm";
import { db } from "./db";
import {
  users, attendance, excuses, scannerSettings, holidays,
  type User, type InsertUser,
  type Attendance, type InsertAttendance,
  type Excuse, type InsertExcuse,
  type ScannerSettings, type InsertScannerSettings,
  type Holiday, type InsertHoliday,
} from "@shared/schema";

export interface IStorage {
  getUser(id: number): Promise<User | undefined>;
  getUserByIdentifier(identifier: string): Promise<User | undefined>;
  getUserByQrCode(qrCode: string): Promise<User | undefined>;
  getUsers(role?: string, className?: string): Promise<User[]>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: number, data: Partial<InsertUser>): Promise<User | undefined>;
  deleteUser(id: number): Promise<void>;

  getAttendance(userId: number, date: string): Promise<Attendance | undefined>;
  getAttendanceByDate(date: string): Promise<Attendance[]>;
  getAttendanceFiltered(filters: { startDate?: string; endDate?: string; className?: string; role?: string; status?: string }): Promise<(Attendance & { user: User })[]>;
  createAttendance(data: InsertAttendance): Promise<Attendance>;
  updateAttendance(id: number, data: Partial<InsertAttendance>): Promise<Attendance | undefined>;
  getUserAttendanceHistory(userId: number): Promise<Attendance[]>;
  clearAllAttendance(): Promise<number>;

  getExcuse(id: number): Promise<Excuse | undefined>;
  getExcuses(userId?: number): Promise<(Excuse & { user?: User })[]>;
  getExcusesByClass(className: string): Promise<(Excuse & { user?: User })[]>;
  createExcuse(data: InsertExcuse): Promise<Excuse>;
  updateExcuseStatus(id: number, status: "approved" | "rejected"): Promise<Excuse | undefined>;

  getScannerSettings(): Promise<ScannerSettings>;
  updateScannerSettings(data: Partial<InsertScannerSettings>): Promise<ScannerSettings>;

  getHolidays(): Promise<Holiday[]>;
  getHolidayByDate(date: string): Promise<Holiday | undefined>;
  createHoliday(data: InsertHoliday): Promise<Holiday>;
  deleteHoliday(id: number): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByIdentifier(identifier: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.identifier, identifier));
    return user;
  }

  async getUserByQrCode(qrCode: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.qrCode, qrCode));
    return user;
  }

  async getUsers(role?: string, className?: string): Promise<User[]> {
    let query = db.select().from(users);
    const conditions = [];
    if (role) conditions.push(eq(users.role, role as any));
    if (className) conditions.push(eq(users.className, className));
    if (conditions.length > 0) {
      return await query.where(and(...conditions));
    }
    return await query;
  }

  async createUser(user: InsertUser): Promise<User> {
    const [created] = await db.insert(users).values(user).returning();
    return created;
  }

  async updateUser(id: number, data: Partial<InsertUser>): Promise<User | undefined> {
    const [updated] = await db.update(users).set(data).where(eq(users.id, id)).returning();
    return updated;
  }

  async deleteUser(id: number): Promise<void> {
    await db.delete(attendance).where(eq(attendance.userId, id));
    await db.delete(excuses).where(eq(excuses.userId, id));
    await db.delete(users).where(eq(users.id, id));
  }

  async getAttendance(userId: number, date: string): Promise<Attendance | undefined> {
    const [record] = await db.select().from(attendance)
      .where(and(eq(attendance.userId, userId), eq(attendance.date, date)));
    return record;
  }

  async getAttendanceByDate(date: string): Promise<Attendance[]> {
    return await db.select().from(attendance).where(eq(attendance.date, date));
  }

  async getAttendanceFiltered(filters: { startDate?: string; endDate?: string; className?: string; role?: string; status?: string }): Promise<(Attendance & { user: User })[]> {
    const conditions = [];
    if (filters.startDate) conditions.push(gte(attendance.date, filters.startDate));
    if (filters.endDate) conditions.push(lte(attendance.date, filters.endDate));
    if (filters.status) conditions.push(eq(attendance.status, filters.status as any));

    const allAttendance = conditions.length > 0
      ? await db.select().from(attendance).where(and(...conditions)).orderBy(desc(attendance.date))
      : await db.select().from(attendance).orderBy(desc(attendance.date));

    const results: (Attendance & { user: User })[] = [];
    for (const record of allAttendance) {
      const user = await this.getUser(record.userId);
      if (!user) continue;
      if (filters.role && user.role !== filters.role) continue;
      if (filters.className && user.className !== filters.className) continue;
      results.push({ ...record, user });
    }
    return results;
  }

  async createAttendance(data: InsertAttendance): Promise<Attendance> {
    const [created] = await db.insert(attendance).values(data).returning();
    return created;
  }

  async updateAttendance(id: number, data: Partial<InsertAttendance>): Promise<Attendance | undefined> {
    const [updated] = await db.update(attendance).set(data).where(eq(attendance.id, id)).returning();
    return updated;
  }

  async getUserAttendanceHistory(userId: number): Promise<Attendance[]> {
    return await db.select().from(attendance)
      .where(eq(attendance.userId, userId))
      .orderBy(desc(attendance.date));
  }

  async clearAllAttendance(): Promise<number> {
    const all = await db.select().from(attendance);
    const count = all.length;
    await db.delete(excuses);
    await db.delete(attendance);
    return count;
  }

  async getExcuse(id: number): Promise<Excuse | undefined> {
    const [excuse] = await db.select().from(excuses).where(eq(excuses.id, id));
    return excuse;
  }

  async getExcuses(userId?: number): Promise<(Excuse & { user?: User })[]> {
    const allExcuses = userId
      ? await db.select().from(excuses).where(eq(excuses.userId, userId)).orderBy(desc(excuses.createdAt))
      : await db.select().from(excuses).orderBy(desc(excuses.createdAt));
    
    const results: (Excuse & { user?: User })[] = [];
    for (const excuse of allExcuses) {
      const user = await this.getUser(excuse.userId);
      results.push({ ...excuse, user: user || undefined });
    }
    return results;
  }

  async getExcusesByClass(className: string): Promise<(Excuse & { user?: User })[]> {
    const allExcuses = await db.select().from(excuses).orderBy(desc(excuses.createdAt));
    const results: (Excuse & { user?: User })[] = [];
    for (const excuse of allExcuses) {
      const user = await this.getUser(excuse.userId);
      if (user && user.className === className) {
        results.push({ ...excuse, user });
      }
    }
    return results;
  }

  async createExcuse(data: InsertExcuse): Promise<Excuse> {
    const [created] = await db.insert(excuses).values(data).returning();
    return created;
  }

  async updateExcuseStatus(id: number, status: "approved" | "rejected"): Promise<Excuse | undefined> {
    const [updated] = await db.update(excuses).set({ status }).where(eq(excuses.id, id)).returning();
    return updated;
  }

  async getScannerSettings(): Promise<ScannerSettings> {
    const [settings] = await db.select().from(scannerSettings);
    if (!settings) {
      const [created] = await db.insert(scannerSettings).values({
        isLocked: true,
        checkInStart: "06:30",
        checkInEnd: "08:00",
        checkOutStart: "14:00",
        checkOutEnd: "16:00",
      }).returning();
      return created;
    }
    return settings;
  }

  async updateScannerSettings(data: Partial<InsertScannerSettings>): Promise<ScannerSettings> {
    const settings = await this.getScannerSettings();
    const [updated] = await db.update(scannerSettings)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(scannerSettings.id, settings.id))
      .returning();
    return updated;
  }

  async getHolidays(): Promise<Holiday[]> {
    return await db.select().from(holidays).orderBy(holidays.date);
  }

  async getHolidayByDate(date: string): Promise<Holiday | undefined> {
    const [holiday] = await db.select().from(holidays).where(eq(holidays.date, date));
    return holiday;
  }

  async createHoliday(data: InsertHoliday): Promise<Holiday> {
    const [created] = await db.insert(holidays).values(data).returning();
    return created;
  }

  async deleteHoliday(id: number): Promise<void> {
    await db.delete(holidays).where(eq(holidays.id, id));
  }
}

export const storage = new DatabaseStorage();
