import { db } from './db';
import { scannerSettings } from '@shared/schema';

const FONNTE_API_URL = 'https://api.fonnte.com/send';

async function getFonnteToken(): Promise<string | null> {
  try {
    const [settings] = await db.select({ fonnteToken: scannerSettings.fonnteToken }).from(scannerSettings).limit(1);
    if (settings?.fonnteToken) return settings.fonnteToken;
  } catch {}
  return process.env.FONNTE_TOKEN || null;
}

async function sendWhatsApp(phone: string, message: string): Promise<boolean> {
  const token = await getFonnteToken();
  if (!token) {
    console.warn('Fonnte API token not configured. Skipping WhatsApp notification.');
    return false;
  }

  try {
    const response = await fetch(FONNTE_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        target: phone,
        message: message,
      }),
    });

    const data = await response.json();
    console.log('Fonnte response:', data);
    return data.status === true;
  } catch (error) {
    console.error('Failed to send WhatsApp notification:', error);
    return false;
  }
}

export async function sendCheckInNotification(
  parentPhone: string,
  studentName: string,
  time: string
): Promise<boolean> {
  const message = `Assalamualaikum,\n\nDiberitahukan bahwa ananda *${studentName}* telah hadir di sekolah pada pukul *${time}*.\n\nTerima kasih.\n\n_Sistem Absensi Digital_`;
  return sendWhatsApp(parentPhone, message);
}

export async function sendLateNotification(
  parentPhone: string,
  studentName: string,
  time: string
): Promise<boolean> {
  const message = `Assalamualaikum,\n\nDiberitahukan bahwa ananda *${studentName}* hadir di sekolah pada pukul *${time}* dan tercatat *TERLAMBAT*.\n\nMohon agar ananda dapat hadir tepat waktu.\n\nTerima kasih.\n\n_Sistem Absensi Digital_`;
  return sendWhatsApp(parentPhone, message);
}

export async function sendCheckOutNotification(
  parentPhone: string,
  studentName: string,
  time: string
): Promise<boolean> {
  const message = `Assalamualaikum,\n\nDiberitahukan bahwa ananda *${studentName}* telah pulang dari sekolah pada pukul *${time}*.\n\nTerima kasih.\n\n_Sistem Absensi Digital_`;
  return sendWhatsApp(parentPhone, message);
}

export async function sendExcuseNotificationToHomeroom(
  homeroomPhone: string,
  homeroomName: string,
  studentName: string,
  studentClass: string,
  type: string,
  date: string,
  description: string,
  driveLink?: string
): Promise<boolean> {
  const typeLabel = type === "sakit" ? "Sakit" : "Izin";
  let message = `Assalamualaikum Bapak/Ibu *${homeroomName}*,\n\nDiberitahukan bahwa siswa kelas *${studentClass}*:\n\nNama: *${studentName}*\nJenis: *${typeLabel}*\nTanggal: *${date}*\nKeterangan: ${description}`;
  if (driveLink) {
    message += `\nBukti Foto: ${driveLink}`;
  }
  message += `\n\nSilakan cek dashboard wali kelas untuk menyetujui atau menolak izin ini.\n\nTerima kasih.\n\n_Sistem Absensi Digital_`;
  return sendWhatsApp(homeroomPhone, message);
}

export async function sendAlphaNotification(
  parentPhone: string,
  studentName: string,
  date: string
): Promise<boolean> {
  const message = `Assalamualaikum,\n\nDiberitahukan bahwa ananda *${studentName}* tercatat *TIDAK HADIR (Alpha)* di sekolah pada tanggal *${date}* tanpa keterangan.\n\nMohon konfirmasi kepada pihak sekolah jika ada informasi terkait ketidakhadiran ananda.\n\nTerima kasih.\n\n_Sistem Absensi Digital MTs Al Fatah Talun_`;
  return sendWhatsApp(parentPhone, message);
}

export async function sendManualAttendanceNotification(
  parentPhone: string,
  studentName: string,
  type: string,
  date: string,
  time?: string
): Promise<boolean> {
  const statusLabels: Record<string, string> = {
    checkin: "hadir (datang)",
    checkout: "pulang",
    izin: "izin",
    sakit: "sakit",
    alpha: "alpha (tidak hadir)",
    telat: "terlambat",
  };
  const label = statusLabels[type] || type;
  const timeInfo = time ? ` pukul *${time}*` : "";
  const message = `Assalamualaikum,\n\nDiberitahukan bahwa ananda *${studentName}* tercatat *${label}*${timeInfo} pada tanggal *${date}* (dicatat manual oleh admin).\n\nTerima kasih.\n\n_Sistem Absensi Digital_`;
  return sendWhatsApp(parentPhone, message);
}
