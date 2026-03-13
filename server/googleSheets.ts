// Integration: Google Sheets (connection:conn_google-sheet_01KK65XEJ8ER8YYFKDG3JJZX8F)
import { google } from 'googleapis';
import { db } from './db';
import { scannerSettings } from '@shared/schema';

let connectionSettings: any;

const DEFAULT_SPREADSHEET_ID = '1LgFgRFsgM_Rggu0ZegFBtHBIeh5gkVSnQ-rudSb_MvY';

async function getSpreadsheetId(): Promise<string> {
  try {
    const [settings] = await db.select({ googleSheetId: scannerSettings.googleSheetId }).from(scannerSettings).limit(1);
    if (settings?.googleSheetId) return settings.googleSheetId;
  } catch {}
  return DEFAULT_SPREADSHEET_ID;
}

async function getAccessToken() {
  if (connectionSettings && connectionSettings.settings.expires_at && new Date(connectionSettings.settings.expires_at).getTime() > Date.now()) {
    return connectionSettings.settings.access_token;
  }

  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? 'repl ' + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
    ? 'depl ' + process.env.WEB_REPL_RENEWAL
    : null;

  if (!xReplitToken) {
    throw new Error('X-Replit-Token not found for repl/depl');
  }

  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=google-sheet',
    {
      headers: {
        'Accept': 'application/json',
        'X-Replit-Token': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  const accessToken = connectionSettings?.settings?.access_token || connectionSettings.settings?.oauth?.credentials?.access_token;

  if (!connectionSettings || !accessToken) {
    throw new Error('Google Sheet not connected');
  }
  return accessToken;
}

async function getUncachableGoogleSheetClient() {
  const accessToken = await getAccessToken();
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: accessToken });
  return google.sheets({ version: 'v4', auth: oauth2Client });
}

export async function appendAttendanceRow(data: {
  date: string;
  name: string;
  identifier: string;
  className: string;
  checkInTime: string;
  checkOutTime: string;
  status: string;
  role: string;
}) {
  try {
    const SPREADSHEET_ID = await getSpreadsheetId();
    const sheets = await getUncachableGoogleSheetClient();
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Sheet1!A:H',
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[
          data.date,
          data.name,
          data.identifier,
          data.className || '-',
          data.checkInTime || '-',
          data.checkOutTime || '-',
          data.status,
          data.role,
        ]]
      }
    });
    console.log('Attendance row appended to Google Sheets');
  } catch (error) {
    console.error('Failed to append to Google Sheets:', error);
  }
}

export async function updateAttendanceRow(date: string, identifier: string, checkOutTime: string, status: string) {
  try {
    const SPREADSHEET_ID = await getSpreadsheetId();
    const sheets = await getUncachableGoogleSheetClient();
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Sheet1!A:H',
    });
    const rows = response.data.values || [];
    let rowIndex = -1;
    for (let i = rows.length - 1; i >= 0; i--) {
      if (rows[i][0] === date && rows[i][2] === identifier) {
        rowIndex = i;
        break;
      }
    }
    if (rowIndex >= 0) {
      const rowNum = rowIndex + 1;
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `Sheet1!F${rowNum}:G${rowNum}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [[checkOutTime, status]]
        }
      });
      console.log(`Attendance row ${rowNum} updated in Google Sheets (checkout)`);
    } else {
      console.log('No matching row found for update, skipping');
    }
  } catch (error) {
    console.error('Failed to update attendance row in Google Sheets:', error);
  }
}

export async function readUsersFromSheet(sheetTab: string): Promise<string[][]> {
  const SPREADSHEET_ID = await getSpreadsheetId();
  const sheets = await getUncachableGoogleSheetClient();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${sheetTab}!A2:Z1000`,
  });
  return response.data.values || [];
}

export async function getSheetTabs(): Promise<string[]> {
  const SPREADSHEET_ID = await getSpreadsheetId();
  const sheets = await getUncachableGoogleSheetClient();
  const info = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  return info.data.sheets?.map((s: any) => s.properties.title) || [];
}

export async function clearAttendanceSheet() {
  try {
    const SPREADSHEET_ID = await getSpreadsheetId();
    const sheets = await getUncachableGoogleSheetClient();
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Sheet1!A:H',
    });
    const rowCount = response.data.values?.length || 0;
    if (rowCount > 1) {
      await sheets.spreadsheets.values.clear({
        spreadsheetId: SPREADSHEET_ID,
        range: `Sheet1!A2:H${rowCount}`,
      });
    }
    console.log(`Cleared ${rowCount - 1} attendance rows from Google Sheets`);
    return { cleared: rowCount - 1 };
  } catch (error) {
    console.error('Failed to clear Google Sheets attendance:', error);
    throw error;
  }
}

export async function initSheetHeaders() {
  try {
    const SPREADSHEET_ID = await getSpreadsheetId();
    const sheets = await getUncachableGoogleSheetClient();
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Sheet1!A1:H1',
    });
    if (!response.data.values || response.data.values.length === 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: 'Sheet1!A1:H1',
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [['Tanggal', 'Nama', 'NISN/NIP', 'Kelas', 'Jam Datang', 'Jam Pulang', 'Status', 'Role']]
        }
      });
    }
  } catch (error) {
    console.error('Failed to init sheet headers:', error);
  }
}
