// Integration: Google Drive (connection:conn_google-drive_01KK5X8MNV44DMMVRK0X3PA3KW)
import { ReplitConnectors } from "@replit/connectors-sdk";
import { db } from './db';
import { scannerSettings } from '@shared/schema';

const DEFAULT_FOLDER_ID = '11vJgEVtglUa50h9P1hZcVf0ceqeVq5tJ';

async function getDriveFolderId(): Promise<string> {
  try {
    const [settings] = await db.select({ googleDriveFolderId: scannerSettings.googleDriveFolderId }).from(scannerSettings).limit(1);
    if (settings?.googleDriveFolderId) return settings.googleDriveFolderId;
  } catch {}
  return DEFAULT_FOLDER_ID;
}

export async function uploadExcusePhoto(
  fileBuffer: Buffer,
  fileName: string,
  mimeType: string
): Promise<{ fileId: string; webViewLink: string } | null> {
  try {
    const FOLDER_ID = await getDriveFolderId();
    const connectors = new ReplitConnectors();

    const boundary = '-------314159265358979323846';
    const metadata = JSON.stringify({
      name: fileName,
      parents: [FOLDER_ID],
    });

    const multipartBody = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\nContent-Transfer-Encoding: base64\r\n\r\n`
      ),
      Buffer.from(fileBuffer.toString('base64')),
      Buffer.from(`\r\n--${boundary}--`),
    ]);

    const response = await connectors.proxy("google-drive", "/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink", {
      method: "POST",
      headers: {
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body: multipartBody.toString(),
    });

    const responseText = await response.text();
    console.log('Drive upload response status:', response.status);

    if (response.status !== 200) {
      console.error('Google Drive upload failed with status', response.status, ':', responseText.substring(0, 200));
      return null;
    }

    let data;
    try {
      data = JSON.parse(responseText);
    } catch (parseErr) {
      console.error('Failed to parse Drive response as JSON:', responseText.substring(0, 200));
      return null;
    }

    if (!data.id) {
      console.error('Drive response missing file id:', data);
      return null;
    }

    console.log('File uploaded to Google Drive:', data.id);
    const webViewLink = data.webViewLink || `https://drive.google.com/file/d/${data.id}/view`;
    return { fileId: data.id, webViewLink };
  } catch (error) {
    console.error('Failed to upload to Google Drive:', error);
    return null;
  }
}
