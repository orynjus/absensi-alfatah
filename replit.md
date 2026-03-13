# Sistem Absensi Digital

## Overview
A comprehensive school attendance system with QR code scanning, Google Sheets/Drive integration, and WhatsApp notifications (Fonnte API).

## Architecture
- **Frontend**: React + Vite + TypeScript + Tailwind CSS + shadcn/ui
- **Backend**: Express.js + TypeScript
- **Database**: PostgreSQL with Drizzle ORM
- **Routing**: wouter (frontend), Express (backend)
- **State Management**: TanStack React Query

## Project Structure
```
shared/schema.ts      - Drizzle ORM schema & Zod validation schemas
server/routes.ts      - All API routes (auth, scanner, admin, excuses)
server/storage.ts     - Database storage layer (CRUD operations)
server/db.ts          - Database connection
server/googleSheets.ts - Google Sheets integration
server/googleDrive.ts  - Google Drive integration (excuse photo uploads)
server/fonnte.ts       - Fonnte WhatsApp API integration
client/src/App.tsx     - Main app with routing & auth provider
client/src/lib/auth.tsx - Auth context & hooks
client/src/pages/landing.tsx          - Landing page with QR scanner & login
client/src/pages/admin-dashboard.tsx  - Admin panel (users, scanner, QR, recap)
client/src/pages/student-dashboard.tsx - Student dashboard
client/src/pages/teacher-dashboard.tsx - Teacher dashboard
client/src/pages/homeroom-dashboard.tsx - Homeroom teacher dashboard
```

## Database Tables
- `users` - Students, teachers, homeroom teachers, admins (with QR codes)
- `attendance` - Daily attendance records (check-in/check-out times)
- `excuses` - Excuse submissions with photo uploads
- `scanner_settings` - Scanner lock/unlock state, schedule, weekly per-day schedules, default holiday days, Fonnte token, Google Sheet ID, Google Drive Folder ID
- `holidays` - Holiday dates (specific dates)

## Key Features
- QR code scanner on landing page (camera-based, jsQR library)
- Admin lock/unlock control for scanner
- PIN-based lock/unlock from landing page (default PIN: 1234, configurable in admin)
- Per-day weekly schedules (each day can have its own check-in/check-out times and can be enabled/disabled)
- Default weekly holiday days (e.g., Saturday & Sunday off by default, configurable)
- Schedule-based scanning (check-in/check-out windows, per-day or fallback to default)
- Late detection: check-in after lateThreshold (default 07:15) → status "telat"
- Attendance statuses: hadir, telat, izin, sakit, alpha
- Holiday management (default weekly holidays + specific date holidays)
- 3-second cooldown between scans
- Sound effects (Web Audio API)
- Google Sheets sync for attendance data
- Google Drive upload for excuse photos
- WhatsApp notifications to parents via Fonnte API
- WhatsApp notifications to homeroom teachers when students submit excuses
- Import users from Google Sheets (tabs: Siswa, Guru, Wali Kelas) with duplicate detection
- CSV export for attendance reports
- Bulk QR code printing + individual QR print (SVG serialization)

## Default Credentials
- Admin: username=admin, password=admin123
- Students: NISN as both identifier and password
- Teachers: NIP as both identifier and password

## Environment Variables
- `DATABASE_URL` - PostgreSQL connection string
- `SESSION_SECRET` - Express session secret
- `FONNTE_TOKEN` - Fonnte WhatsApp API token (optional)

## Integrations
- Google Sheets — OAuth integration (connector:ccfg_google-sheet_E42A9F6CA62546F68A1FECA0E8) was dismissed by user.
  - DO NOT attempt to use Replit OAuth integration for Google Sheets — user does not want to authorize it.
  - Attendance sync uses Google Apps Script Webhook instead (sheetsWebhookUrl in scanner_settings).
  - User import uses public CSV URLs (csvUrlSiswa, csvUrlGuru, csvUrlWaliKelas in scanner_settings).
  - Sheet ID: 1LgFgRFsgM_Rggu0ZegFBtHBIeh5gkVSnQ-rudSb_MvY
  - Attendance sheet (gid=0): Tanggal, Nama, NISN/NIP, Kelas, Jam Datang, Jam Pulang, Status, Role
- Google Drive (conn_google-drive_01KK5X8MNV44DMMVRK0X3PA3KW)
  - Folder ID: 11vJgEVtglUa50h9P1hZcVf0ceqeVq5tJ

## Responsive Design
All pages use consistent mobile-first responsive patterns:
- Headers: `px-3 sm:px-4`, text truncation, icon-only logout on mobile
- Stat cards: `grid-cols-3 sm:grid-cols-6`, smaller text/icons on mobile (`text-lg sm:text-2xl`, `w-4 h-4 sm:w-5 sm:h-5`)
- Tables: `text-xs sm:text-sm`, `px-2 sm:px-4`, NISN columns hidden on mobile via `hidden sm:table-cell`
- Tab navigation: scrollable overflow on mobile for homeroom (5 tabs), flex-1 equal-width for teacher/student
- Excuse cards: compact padding, hidden thumbnails on mobile, smaller approve/reject buttons

## Running
- `npm run dev` starts Express + Vite on port 5000
- `npm run db:push` syncs database schema
