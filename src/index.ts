import { bfvApi } from "bfv-api";
import { Parser as Json2CsvParser } from "json2csv";
import ExcelJS from "exceljs";
import { createEvents } from "ics";
import type { EventAttributes } from "ics";
import {
  writeFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
} from "fs";
import path from "path";

// === CONFIGURATION ===

// List of teams to export (add more as needed)
const TEAMS = [
  { id: "016PBQB78C000000VV0AG80NVV8OQVTB", name: "Gädheim-Untereuerheim" },
  { id: "02IDHSKCTG000000VS5489B2VU2I8R4H", name: "Gädheim-Untereuerheim II" },
];

// Output directory for all exports and HTML
const EXPORT_DIR = "./exports";

// === TYPES ===

// Structure of a row in the CSV/XLSX export (Match-ID removed)
interface ExportMatch {
  mannschaft: string;
  wettbewerb: string;
  wettbewerbstyp: string;
  datum: string;
  uhrzeit: string;
  heim: string;
  gast: string;
  ergebnis: string;
  vorabVeröffentlicht: string;
}

// === UTILS ===

/**
 * Helper to parse German date/time (DD.MM.YYYY, HH:mm) to [YYYY, M, D, H, M]
 */
function parseDateTime(date: string, time: string): [number, number, number, number, number] {
  const [dayStr, monthStr, yearStr] = date.split(".");
  const [hourStr, minuteStr] = time.split(":");
  const day = Number(dayStr) || 0;
  const month = Number(monthStr) || 0;
  const year = Number(yearStr) || 0;
  const hour = Number(hourStr) || 0;
  const minute = Number(minuteStr) || 0;
  return [year, month, day, hour, minute];
}

/**
 * Ensures the export directory exists.
 */
function ensureExportDir() {
  if (!existsSync(EXPORT_DIR)) {
    mkdirSync(EXPORT_DIR);
  }
}

/**
 * Returns a timestamp string for filenames, e.g. 2025-08-02_14-30-00
 */
function getTimestamp(): string {
  const now = new Date();
  const pad = (n: number) => n.toString().padStart(2, "0");
  return (
    now.getFullYear() +
    "-" +
    pad(now.getMonth() + 1) +
    "-" +
    pad(now.getDate()) +
    "_" +
    pad(now.getHours()) +
    "-" +
    pad(now.getMinutes()) +
    "-" +
    pad(now.getSeconds())
  );
}

/**
 * Sanitizes a string for use in filenames (umlauts, spaces, special chars)
 */
function sanitizeFilename(name: string): string {
  return name
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-zA-Z0-9_-]/g, "_");
}

/**
 * Formats a date string, returns empty string if null
 */
function formatDate(date: string | null): string {
  return date ?? "";
}

/**
 * Formats a time string, returns empty string if null
 */
function formatTime(time: string | null): string {
  return time ?? "";
}

/**
 * Converts a file size in bytes to a human-readable string
 */
function humanFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

// === EXPORT FUNCTIONS ===

/**
 * Exports matches as an ICS calendar file.
 */
function exportToICS(matches: ExportMatch[], filename: string) {
  const events: EventAttributes[] = matches
    .filter(m => m.datum && m.uhrzeit)
    .map(m => ({
      title: `${m.heim} vs ${m.gast}`,
      start: parseDateTime(m.datum, m.uhrzeit),
      duration: { hours: 2 }, // Required by ics
      description: `Wettbewerb: ${m.wettbewerb}\nTyp: ${m.wettbewerbstyp}\nErgebnis: ${m.ergebnis}`,
    }));

  createEvents(events, (error, value) => {
    if (error) {
      console.error("ICS export error:", error);
      return;
    }
    writeFileSync(path.join(EXPORT_DIR, filename), value, "utf8");
    console.log(`✅ ICS exportiert: ${path.join(EXPORT_DIR, filename)}`);
  });
}

/**
 * Exports matches as a Jira-compatible CSV file for task import.
 */
function exportToJiraCSV(matches: ExportMatch[], filename: string) {
  // Jira expects columns like Summary, Description, Due Date, Issue Type
  const jiraRows = matches.map(m => ({
    Summary: `Match: ${m.heim} vs ${m.gast}`,
    Description: `Wettbewerb: ${m.wettbewerb}\nTyp: ${m.wettbewerbstyp}\nErgebnis: ${m.ergebnis}`,
    "Due Date": m.datum.split('.').reverse().join('-'), // Converts DD.MM.YYYY to YYYY-MM-DD
    "Issue Type": "Task",
  }));

  const parser = new Json2CsvParser({ header: true, fields: ["Summary", "Description", "Due Date", "Issue Type"] });
  const csv = parser.parse(jiraRows);
  const csvWithBom = "\uFEFF" + csv;
  writeFileSync(path.join(EXPORT_DIR, filename), csvWithBom, "utf8");
  console.log(`✅ Jira CSV exportiert: ${path.join(EXPORT_DIR, filename)}`);
}

/**
 * Exports matches to a CSV file with UTF-8 BOM for Excel compatibility.
 */
function exportToCSV(matches: ExportMatch[], filename: string) {
  const parser = new Json2CsvParser({ header: true });
  const csv = parser.parse(matches);
  const csvPath = path.join(EXPORT_DIR, filename);

  // Write UTF-8 BOM for Excel compatibility with umlauts
  const csvWithBom = "\uFEFF" + csv;

  if (existsSync(csvPath)) {
    console.warn(`⚠️  Datei ${csvPath} existiert bereits und wird überschrieben.`);
  }
  writeFileSync(csvPath, csvWithBom, "utf8");
  console.log(`✅ CSV exportiert: ${csvPath}`);
}

/**
 * Exports matches to an XLSX file with styled header and zebra striping.
 */
async function exportToXLSX(matches: ExportMatch[], filename: string) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Spiele");

  // Define columns (Match-ID removed)
  worksheet.columns = [
    { header: "Mannschaft", key: "mannschaft", width: 20 },
    { header: "Wettbewerb", key: "wettbewerb", width: 25 },
    { header: "Wettbewerbstyp", key: "wettbewerbstyp", width: 20 },
    { header: "Datum", key: "datum", width: 12 },
    { header: "Uhrzeit", key: "uhrzeit", width: 10 },
    { header: "Heim", key: "heim", width: 25 },
    { header: "Gast", key: "gast", width: 25 },
    { header: "Ergebnis", key: "ergebnis", width: 10 },
    { header: "Vorab veröffentlicht", key: "vorabVeröffentlicht", width: 18 },
  ];

  // Add all match rows
  matches.forEach((match) => worksheet.addRow(match));

  // Auto-fit columns to content
  worksheet.columns.forEach((column) => {
    let maxLength = column.header!.toString().length;
    column.eachCell?.({ includeEmpty: true }, (cell) => {
      const cellValue = cell.value ? cell.value.toString() : "";
      maxLength = Math.max(maxLength, cellValue.length);
    });
    column.width = Math.max(column.width ?? 10, maxLength + 2);
  });

  // Style header row
  worksheet.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF0070C0" }, // blue
    };
    cell.alignment = { vertical: "middle", horizontal: "center" };
    cell.border = {
      top: { style: "thin" },
      left: { style: "thin" },
      bottom: { style: "thin" },
      right: { style: "thin" },
    };
  });

  // Zebra striping for rows
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // skip header
    if (rowNumber % 2 === 0) {
      row.eachCell((cell) => {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFE6F0FA" }, // light blue
        };
      });
    }
  });

  const xlsxPath = path.join(EXPORT_DIR, filename);

  if (existsSync(xlsxPath)) {
    console.warn(`⚠️  Datei ${xlsxPath} existiert bereits und wird überschrieben.`);
  }
  await workbook.xlsx.writeFile(xlsxPath);
  console.log(`✅ XLSX exportiert: ${xlsxPath}`);
}

// === HTML GENERATION ===

/**
 * Returns the latest files with a given extension, sorted by modification time.
 */
function getLatestFiles(dir: string, ext: string, count: number): { name: string; mtime: number; size: number }[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(ext))
    .map((f) => {
      const stats = statSync(path.join(dir, f));
      return { name: f, mtime: stats.mtimeMs, size: stats.size };
    })
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, count);
}

/**
 * Generates a fancy, mobile-friendly, auto-refreshing index.html listing all exports.
 */
function generateFancyIndexHtml(dir: string) {
  // List all CSV and XLSX files, newest first
  const allCSVs = getLatestFiles(dir, ".csv", 100);
  const allXLSXs = getLatestFiles(dir, ".xlsx", 100);

  // Generates a table row for a file
  const fileRow = (file: { name: string; mtime: number; size: number }, type: "csv" | "xlsx") => `
    <tr>
      <td style="text-align:center;">
        ${type === "csv"
          ? '<span title="CSV" style="font-size:1.5em;">📄</span>'
          : '<span title="Excel" style="font-size:1.5em;">📊</span>'}
      </td>
      <td>
        <a href="${file.name}" download>${file.name}</a>
      </td>
      <td>${humanFileSize(file.size)}</td>
      <td>${new Date(file.mtime).toLocaleString("de-DE")}</td>
    </tr>
  `;

  // HTML page with responsive table and auto-refresh
  const html = `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <title>BFV Exports</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="refresh" content="300">
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; margin: 2em; background: #f4f8fb; }
    h1 { color: #0070C0; }
    .table-responsive { overflow-x: auto; width: 100%; display: block; }
    table { border-collapse: collapse; width: 100%; background: #fff; box-shadow: 0 2px 8px #0001; min-width: 600px; }
    th, td { padding: 0.7em 1em; }
    th { background: #0070C0; color: #fff; text-align: left; }
    tr:nth-child(even) { background: #e6f0fa; }
    tr:hover { background: #d0e6f7; }
    a { color: #0070C0; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .footer { margin-top: 2em; color: #888; font-size: 0.95em; }
    @media (max-width: 600px) {
      .table-responsive { overflow-x: auto; width: 100%; display: block; }
      table { min-width: 600px; }
      th, td { padding: 0.5em 0.5em; }
      tr { margin-bottom: 1em; }
    }
  </style>
</head>
<body>
  <h1>BFV Exports</h1>
  <p>Hier finden Sie die neuesten Exportdateien (CSV &amp; Excel) zum Download.<br>
  Die Seite aktualisiert sich automatisch jede Minute.</p>
  <div class="table-responsive">
    <table>
      <thead>
        <tr>
          <th>Typ</th>
          <th>Dateiname</th>
          <th>Größe</th>
          <th>Letzte Änderung</th>
        </tr>
      </thead>
      <tbody>
        ${allCSVs.map((f) => fileRow(f, "csv")).join("\n")}
        ${allXLSXs.map((f) => fileRow(f, "xlsx")).join("\n")}
      </tbody>
    </table>
  </div>
  <div class="footer">
    Letzte Aktualisierung: ${new Date().toLocaleString("de-DE")}<br>
    <a href="https://github.com/Paul1404/bfv-api" target="_blank">Projekt auf GitHub</a>
  </div>
  <script>
    setTimeout(() => window.location.reload(), 300000);
  </script>
</body>
</html>
`;

  writeFileSync(path.join(dir, "index.html"), html, "utf8");
  console.log(`✅ index.html generiert: ${path.join(dir, "index.html")}`);
}

// === MAIN ===

/**
 * Main entrypoint: fetches matches, exports per-team and combined files, generates HTML.
 */
async function main() {
  console.log("Spiele werden abgerufen...");
  ensureExportDir();
  const timestamp = getTimestamp();

  // Collect all matches for combined export
  let allMatches: ExportMatch[] = [];

  // Export per-team files
  for (const team of TEAMS) {
    try {
      // Fetch matches for this team
      const { data } = await bfvApi.listMatches({ params: { teamPermanentId: team.id } });
      // Map API data to export format (without Match-ID)
      const teamMatches: ExportMatch[] = data.matches.map((match: any) => ({
        mannschaft: data.team.name,
        wettbewerb: match.competitionName,
        wettbewerbstyp: match.competitionType,
        datum: formatDate(match.kickoffDate),
        uhrzeit: formatTime(match.kickoffTime),
        heim: match.homeTeamName,
        gast: match.guestTeamName,
        ergebnis: match.result ?? "",
        vorabVeröffentlicht: match.prePublished ? "Ja" : "Nein",
      }));

      // Add to combined list
      allMatches = allMatches.concat(teamMatches);

      // Sanitize team name for filenames
      const sanitized = sanitizeFilename(team.name);

      // Export per-team CSV and XLSX
      const csvName = `Spiele_${sanitized}_${timestamp}.csv`;
      const xlsxName = `Spiele_${sanitized}_${timestamp}.xlsx`;
      exportToCSV(teamMatches, csvName);
      await exportToXLSX(teamMatches, xlsxName);

      // Export per-team ICS
      const icsName = `Spiele_${sanitized}_${timestamp}.ics`;
      exportToICS(teamMatches, icsName);

      // Export per-team Jira CSV
      const jiraCsvName = `Jira_Spiele_${sanitized}_${timestamp}.csv`;
      exportToJiraCSV(teamMatches, jiraCsvName);

    } catch (error) {
      console.error(
        `❌ Fehler beim Abrufen der Spiele für Team ${team.name}:`,
        error
      );
    }
  }

  // Export combined CSV and XLSX for all teams
  const csvNameAll = `Spiele_Alle_Teams_${timestamp}.csv`;
  const xlsxNameAll = `Spiele_Alle_Teams_${timestamp}.xlsx`;
  exportToCSV(allMatches, csvNameAll);
  await exportToXLSX(allMatches, xlsxNameAll);

  // Export combined ICS for all teams
  const icsNameAll = `Spiele_Alle_Teams_${timestamp}.ics`;
  exportToICS(allMatches, icsNameAll);

  // Export combined Jira CSV for all teams
  const jiraCsvNameAll = `Jira_Spiele_Alle_Teams_${timestamp}.csv`;
  exportToJiraCSV(allMatches, jiraCsvNameAll);

  // Generate the HTML index page
  generateFancyIndexHtml(EXPORT_DIR);
  console.log("Fertig! 🚀");
}

// Run the main function and handle fatal errors
main().catch((err) => {
  console.error("Fataler Fehler:", err);
  process.exit(1);
});