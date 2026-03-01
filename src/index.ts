import { bfvApi } from "bfv-api";
import { Parser as Json2CsvParser } from "json2csv";
import ExcelJS from "exceljs";
import { createEvents } from "ics";
import type { EventAttributes } from "ics";
type ExportFile = { name: string; mtime: number; size: number };
import {
  writeFileSync,
  copyFileSync,
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

function getFilesByTypeAndTeam(dir: string, ext: string): Record<string, ExportFile[]> {
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(ext))
    .map((f) => {
      const stats = statSync(path.join(dir, f));
      return { name: f, mtime: stats.mtimeMs, size: stats.size };
    });

  const byTeam: Record<string, ExportFile[]> = {};
  for (const file of files) {
    const match = file.name.match(/^((Jira_)?Spiele)_(.+)_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\./);
    const team = match && match[3] ? match[3] : "Unbekannt";
    if (!byTeam[team]) byTeam[team] = [];
    byTeam[team].push(file);
  }
  for (const team in byTeam) {
    if (byTeam[team]) {
      byTeam[team].sort((a, b) => b.mtime - a.mtime);
    }
  }
  return byTeam;
}

function sectionHtml(title: string, byTeam: Record<string, ExportFile[]>, ext: string, icon: string) {
  return `
    <h2>${icon} ${title}</h2>
    ${Object.entries(byTeam)
      .map(
        ([team, files]) => `
        <h3>${team.replace(/_/g, " ")}</h3>
        <div class="table-responsive">
          <table>
            <thead>
              <tr>
                <th>Dateiname</th>
                <th>Größe</th>
                <th>Letzte Änderung</th>
              </tr>
            </thead>
            <tbody>
              ${files
                .map(
                  (f) => `
                <tr>
                  <td><a href="${f.name}" download>${f.name}</a></td>
                  <td>${humanFileSize(f.size)}</td>
                  <td>${new Date(f.mtime).toLocaleString("de-DE")}</td>
                </tr>
              `
                )
                .join("\n")}
            </tbody>
          </table>
        </div>
      `
      )
      .join("\n")}
  `;
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
 * Exports matches as a Jira-compatible CSV file for Jira import.
 * Groups all games under monthly parent tasks like "Spiele Monat März 2025".
 *
 * Jira Cloud CSV import can establish hierarchy via:
 * - "Work item ID": unique ID per row
 * - "Parent": Work item ID of the parent row
 * - "Issue Type": e.g. "Task" for parents, "Sub-task" for children
 */
function exportToJiraCSV(matches: ExportMatch[], filename: string) {
  const DEFAULT_STATUS = "Backlog";
  const DEFAULT_EPIC_KEY = "SVU-119";

  if (!matches.length) {
    const parser = new Json2CsvParser({
      header: true,
      fields: ["Summary", "Description", "Due Date", "Issue Type", "Status", "Work item ID", "Parent"],
    });
    const csvWithBom = "\uFEFF" + parser.parse([]);
    writeFileSync(path.join(EXPORT_DIR, filename), csvWithBom, "utf8");
    console.log(`✅ Jira CSV exportiert (keine Spiele): ${path.join(EXPORT_DIR, filename)}`);
    return;
  }

  const MONTH_NAMES = [
    "Januar",
    "Februar",
    "März",
    "April",
    "Mai",
    "Juni",
    "Juli",
    "August",
    "September",
    "Oktober",
    "November",
    "Dezember",
  ];

  const getMonthKeyAndLabel = (datum: string): { key: string; label: string } => {
    if (!datum) {
      return { key: "ohne-datum", label: "Ohne Datum" };
    }
    const parts = datum.split(".");
    if (parts.length !== 3) {
      return { key: "ohne-datum", label: "Ohne Datum" };
    }
    const monthStr = parts[1];
    const yearStr = parts[2];
    if (!monthStr || !yearStr) {
      return { key: "ohne-datum", label: "Ohne Datum" };
    }
    const month = Number(monthStr);
    const year = Number(yearStr);
    if (!month || month < 1 || month > 12 || !year) {
      return { key: "ohne-datum", label: "Ohne Datum" };
    }
    const key = `${yearStr}-${monthStr.padStart(2, "0")}`;
    const monthName = MONTH_NAMES[month - 1];
    const label = `${monthName} ${year}`;
    return { key, label };
  };

  // Group matches by month (year + month), keeping German month labels
  const groups = new Map<string, { label: string; matches: ExportMatch[] }>();
  for (const m of matches) {
    const { key, label } = getMonthKeyAndLabel(m.datum);
    const existing = groups.get(key);
    if (existing) {
      existing.matches.push(m);
    } else {
      groups.set(key, { label, matches: [m] });
    }
  }

  // Sort months chronologically, "ohne-datum" (no date) at the end
  const monthEntries = Array.from(groups.entries());
  monthEntries.sort(([keyA], [keyB]) => {
    if (keyA === "ohne-datum" && keyB === "ohne-datum") return 0;
    if (keyA === "ohne-datum") return 1;
    if (keyB === "ohne-datum") return -1;
    return keyA.localeCompare(keyB);
  });

  // Assign Work item IDs: first months, then games
  let nextId = 1;
  const monthIdByKey = new Map<string, number>();
  const jiraRows: {
    Summary: string;
    Description: string;
    "Due Date": string;
    "Issue Type": string;
    Status: string;
    "Work item ID": number;
    Parent: number | string | "" ;
  }[] = [];

  // Parent rows: one per month (e.g. "Spiele Monat März 2025")
  for (const [key, { label }] of monthEntries) {
    const id = nextId++;
    monthIdByKey.set(key, id);

    const summary =
      key === "ohne-datum"
        ? "Spiele ohne Datum"
        : `Spiele Monat ${label}`;

    const monthDueDate = key === "ohne-datum" ? "" : `${key}-01`;

    jiraRows.push({
      Summary: summary,
      Description: "",
      "Due Date": monthDueDate,
      "Issue Type": "Task",
      Status: DEFAULT_STATUS,
      "Work item ID": id,
      Parent: DEFAULT_EPIC_KEY || "",
    });
  }

  // Helper to compare matches by date/time for stable ordering
  const compareMatchesByDateTime = (a: ExportMatch, b: ExportMatch): number => {
    const [ya, ma, da, ha, mina] = parseDateTime(a.datum, a.uhrzeit);
    const [yb, mb, db, hb, minb] = parseDateTime(b.datum, b.uhrzeit);
    if (ya !== yb) return ya - yb;
    if (ma !== mb) return ma - mb;
    if (da !== db) return da - db;
    if (ha !== hb) return ha - hb;
    return mina - minb;
  };

  // Child rows: each game as a Sub-task under the corresponding month
  for (const [key, { matches: monthMatches }] of monthEntries) {
    const parentId = monthIdByKey.get(key);
    if (!parentId) {
      continue;
    }

    const sortedMatches = [...monthMatches].sort(compareMatchesByDateTime);

    for (const m of sortedMatches) {
      const id = nextId++;
      jiraRows.push({
        Summary: `Spiel: ${m.heim} vs ${m.gast}`,
        Description: `Wettbewerb: ${m.wettbewerb}\nTyp: ${m.wettbewerbstyp}\nErgebnis: ${m.ergebnis}`,
        "Due Date": "",
        "Issue Type": "Sub-task",
        Status: DEFAULT_STATUS,
        "Work item ID": id,
        Parent: parentId,
      });
    }
  }

  const parser = new Json2CsvParser({
    header: true,
    fields: ["Summary", "Description", "Due Date", "Issue Type", "Status", "Work item ID", "Parent"],
  });
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
      fgColor: { argb: "FFFA0102" }, // SVU red
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
          fgColor: { argb: "FFFFE5E5" }, // light red
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
  const allCsvByTeam = getFilesByTypeAndTeam(dir, ".csv");
  const xlsxByTeam = getFilesByTypeAndTeam(dir, ".xlsx");
  const icsByTeam = getFilesByTypeAndTeam(dir, ".ics");

  // CSV: only match data (exclude Jira import files)
  const csvByTeam: Record<string, ExportFile[]> = {};
  for (const team in allCsvByTeam) {
    if (allCsvByTeam[team]) {
      csvByTeam[team] = allCsvByTeam[team]!.filter(f => !f.name.startsWith("Jira_"));
    }
  }

  // Jira CSV: only files starting with Jira_
  const jiraCsvByTeam: Record<string, ExportFile[]> = {};
  for (const team in allCsvByTeam) {
    if (allCsvByTeam[team]) {
      jiraCsvByTeam[team] = allCsvByTeam[team]!.filter(f => f.name.startsWith("Jira_"));
    }
  }

  const html = `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <title>Spielplan – Sportverein 1945 Untereuerheim e.V.</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="Spielplan und Exporte der SG Gädheim/Untereuerheim – Sportverein 1945 Untereuerheim e.V.">
  <link rel="icon" href="Logo.png" type="image/png">
  <meta http-equiv="refresh" content="300">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --svu-red: #FA0102;
      --svu-red-dark: #c80102;
      --svu-red-light: #ff4d4e;
      --svu-bg: #0d0d0d;
      --svu-card: #1a1a1a;
      --svu-text: #f5f5f5;
      --svu-muted: #a3a3a3;
      --svu-border: #2a2a2a;
    }
    * { box-sizing: border-box; }
    body {
      font-family: 'Outfit', -apple-system, BlinkMacSystemFont, sans-serif;
      margin: 0;
      padding: 0;
      background: var(--svu-bg);
      color: var(--svu-text);
      line-height: 1.6;
      min-height: 100vh;
    }
    .header {
      background: linear-gradient(135deg, var(--svu-red) 0%, var(--svu-red-dark) 100%);
      padding: 2rem 1.5rem;
      text-align: center;
      box-shadow: 0 4px 24px rgba(250, 1, 2, 0.3);
    }
    .header-inner {
      max-width: 900px;
      margin: 0 auto;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 1.5rem;
      flex-wrap: wrap;
    }
    .logo {
      width: 80px;
      height: 80px;
      object-fit: contain;
      filter: drop-shadow(0 2px 8px rgba(0,0,0,0.3));
    }
    .header-text h1 {
      margin: 0;
      font-size: 1.75rem;
      font-weight: 700;
      letter-spacing: -0.02em;
    }
    .header-text .tagline {
      margin: 0.25rem 0 0;
      font-size: 1rem;
      opacity: 0.95;
      font-weight: 500;
    }
    .container {
      max-width: 900px;
      margin: 0 auto;
      padding: 2rem 1.5rem;
    }
    .intro {
      background: var(--svu-card);
      border: 1px solid var(--svu-border);
      border-radius: 12px;
      padding: 1.5rem;
      margin-bottom: 2rem;
      font-size: 0.95rem;
      color: var(--svu-muted);
    }
    .intro a { color: var(--svu-red-light); text-decoration: none; }
    .intro a:hover { text-decoration: underline; }
    h2 {
      font-size: 1.25rem;
      font-weight: 600;
      margin: 2.5rem 0 1rem;
      color: var(--svu-text);
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    h3 {
      font-size: 1rem;
      font-weight: 500;
      margin: 1.25rem 0 0.5rem;
      color: var(--svu-muted);
    }
    .table-responsive {
      overflow-x: auto;
      border-radius: 10px;
      border: 1px solid var(--svu-border);
      background: var(--svu-card);
      margin-bottom: 1rem;
    }
    table {
      border-collapse: collapse;
      width: 100%;
      min-width: 500px;
    }
    th, td { padding: 0.85rem 1rem; text-align: left; }
    th {
      background: var(--svu-red);
      color: #fff;
      font-weight: 600;
      font-size: 0.875rem;
    }
    tr { border-bottom: 1px solid var(--svu-border); }
    tr:last-child { border-bottom: none; }
    tr:hover { background: rgba(250, 1, 2, 0.06); }
    a {
      color: var(--svu-red-light);
      text-decoration: none;
      font-weight: 500;
    }
    a:hover { text-decoration: underline; }
    .footer {
      margin-top: 3rem;
      padding-top: 1.5rem;
      border-top: 1px solid var(--svu-border);
      color: var(--svu-muted);
      font-size: 0.875rem;
    }
    .footer a { color: var(--svu-red-light); }
    @media (max-width: 600px) {
      .header-inner { flex-direction: column; }
      .header-text h1 { font-size: 1.4rem; }
      th, td { padding: 0.6rem 0.75rem; }
    }
  </style>
</head>
<body>
  <header class="header">
    <div class="header-inner">
      <img src="Logo.png" alt="Sportverein 1945 Untereuerheim" class="logo">
      <div class="header-text">
        <h1>Sportverein 1945 Untereuerheim e.V.</h1>
        <p class="tagline">Wir sind Untereuerheim – Spielplan & Exporte</p>
      </div>
    </div>
  </header>
  <main class="container">
    <p class="intro">
      Hier finden Sie die neuesten Spielplan-Exporte (CSV, Excel, Kalender, Jira) der SG Gädheim/Untereuerheim.
      Die Seite aktualisiert sich automatisch alle 5 Minuten.
      <a href="https://www.sv-untereuerheim.de" target="_blank" rel="noopener">→ Zum Verein</a>
    </p>
    ${sectionHtml("CSV", csvByTeam, ".csv", "📄")}
    ${sectionHtml("Excel (XLSX)", xlsxByTeam, ".xlsx", "📊")}
    ${sectionHtml("Kalender (ICS)", icsByTeam, ".ics", "📅")}
    ${sectionHtml("Jira-Import (CSV)", jiraCsvByTeam, ".csv", "📝")}
    <div class="footer">
      Letzte Aktualisierung: ${new Date().toLocaleString("de-DE")}<br>
      <a href="https://www.sv-untereuerheim.de" target="_blank" rel="noopener">Sportverein 1945 Untereuerheim e.V.</a> · Triebweg 9 · 97508 Grettstadt/Untereuerheim
    </div>
  </main>
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

  // Copy club logo to exports for favicon and header
  const logoSrc = path.join(process.cwd(), "src", "Logo.png");
  if (existsSync(logoSrc)) {
    copyFileSync(logoSrc, path.join(EXPORT_DIR, "Logo.png"));
    console.log("✅ Logo kopiert");
  }

  // Generate the HTML index page
  generateFancyIndexHtml(EXPORT_DIR);
  console.log("Fertig! 🚀");
}

// Run the main function and handle fatal errors
main().catch((err) => {
  console.error("Fataler Fehler:", err);
  process.exit(1);
});