import { bfvApi } from "bfv-api";
import { Parser as Json2CsvParser } from "json2csv";
import ExcelJS from "exceljs";
import {
  writeFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
} from "fs";
import path from "path";

// === CONFIGURATION ===
const TEAM_IDS = [
  "016PBQB78C000000VV0AG80NVV8OQVTB",
  "02IDHSKCTG000000VS5489B2VU2I8R4H",
];
const EXPORT_DIR = "./exports";
const BASE_FILENAME = "matches";

// === TYPES ===
interface ExportMatch {
  mannschaft: string;
  matchId: string;
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
function ensureExportDir() {
  if (!existsSync(EXPORT_DIR)) {
    mkdirSync(EXPORT_DIR);
  }
}

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

function formatDate(date: string | null): string {
  return date ?? "";
}

function formatTime(time: string | null): string {
  return time ?? "";
}

function humanFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

// === MAIN LOGIC ===
async function fetchAllMatches(): Promise<ExportMatch[]> {
  const allMatches: ExportMatch[] = [];
  for (const teamPermanentId of TEAM_IDS) {
    try {
      const { data } = await bfvApi.listMatches({ params: { teamPermanentId } });
      const team = data.team;
      for (const match of data.matches) {
        allMatches.push({
          mannschaft: team.name,
          matchId: match.matchId,
          wettbewerb: match.competitionName,
          wettbewerbstyp: match.competitionType,
          datum: formatDate(match.kickoffDate),
          uhrzeit: formatTime(match.kickoffTime),
          heim: match.homeTeamName,
          gast: match.guestTeamName,
          ergebnis: match.result ?? "",
          vorabVeröffentlicht: match.prePublished ? "Ja" : "Nein",
        });
      }
    } catch (error) {
      console.error(
        `❌ Fehler beim Abrufen der Spiele für Team ${teamPermanentId}:`,
        error
      );
    }
  }
  return allMatches;
}

function exportToCSV(matches: ExportMatch[], timestamp: string) {
  const parser = new Json2CsvParser({ header: true });
  const csv = parser.parse(matches);
  const csvFilename = `${BASE_FILENAME}_${timestamp}.csv`;
  const csvPath = path.join(EXPORT_DIR, csvFilename);

  // Write UTF-8 BOM for Excel compatibility with umlauts
  const csvWithBom = "\uFEFF" + csv;

  if (existsSync(csvPath)) {
    console.warn(`⚠️  Datei ${csvPath} existiert bereits und wird überschrieben.`);
  }
  writeFileSync(csvPath, csvWithBom, "utf8");
  console.log(`✅ CSV exportiert: ${csvPath}`);
  return csvFilename;
}

async function exportToXLSX(matches: ExportMatch[], timestamp: string) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Spiele");

  worksheet.columns = [
    { header: "Mannschaft", key: "mannschaft", width: 20 },
    { header: "Match-ID", key: "matchId", width: 20 },
    { header: "Wettbewerb", key: "wettbewerb", width: 25 },
    { header: "Wettbewerbstyp", key: "wettbewerbstyp", width: 20 },
    { header: "Datum", key: "datum", width: 12 },
    { header: "Uhrzeit", key: "uhrzeit", width: 10 },
    { header: "Heim", key: "heim", width: 25 },
    { header: "Gast", key: "gast", width: 25 },
    { header: "Ergebnis", key: "ergebnis", width: 10 },
    { header: "Vorab veröffentlicht", key: "vorabVeröffentlicht", width: 18 },
  ];

  matches.forEach((match) => worksheet.addRow(match));

  // Auto-fit columns
  worksheet.columns.forEach((column) => {
    let maxLength = column.header!.toString().length;
    column.eachCell?.({ includeEmpty: true }, (cell) => {
      const cellValue = cell.value ? cell.value.toString() : "";
      maxLength = Math.max(maxLength, cellValue.length);
    });
    column.width = maxLength + 2;
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

  const xlsxFilename = `${BASE_FILENAME}_${timestamp}.xlsx`;
  const xlsxPath = path.join(EXPORT_DIR, xlsxFilename);

  if (existsSync(xlsxPath)) {
    console.warn(`⚠️  Datei ${xlsxPath} existiert bereits und wird überschrieben.`);
  }
  await workbook.xlsx.writeFile(xlsxPath);
  console.log(`✅ XLSX exportiert: ${xlsxPath}`);
  return xlsxFilename;
}

// === HTML GENERATION ===
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

function generateFancyIndexHtml(dir: string) {
  const latestCSVs = getLatestFiles(dir, ".csv", 2);
  const latestXLSXs = getLatestFiles(dir, ".xlsx", 2);

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

  const html = `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <title>BFV Exports</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; margin: 2em; background: #f4f8fb; }
    h1 { color: #0070C0; }
    table { border-collapse: collapse; width: 100%; background: #fff; box-shadow: 0 2px 8px #0001; }
    th, td { padding: 0.7em 1em; }
    th { background: #0070C0; color: #fff; text-align: left; }
    tr:nth-child(even) { background: #e6f0fa; }
    tr:hover { background: #d0e6f7; }
    a { color: #0070C0; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .footer { margin-top: 2em; color: #888; font-size: 0.95em; }
    @media (max-width: 600px) {
      table, thead, tbody, th, td, tr { display: block; }
      th, td { padding: 0.5em 0.5em; }
      th { background: #0070C0; }
      tr { margin-bottom: 1em; }
    }
  </style>
</head>
<body>
  <h1>BFV Exports</h1>
  <p>Hier finden Sie die neuesten Exportdateien (CSV &amp; Excel) zum Download.</p>
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
      ${latestCSVs.map((f) => fileRow(f, "csv")).join("\n")}
      ${latestXLSXs.map((f) => fileRow(f, "xlsx")).join("\n")}
    </tbody>
  </table>
  <div class="footer">
    Letzte Aktualisierung: ${new Date().toLocaleString("de-DE")}<br>
    <a href="https://github.com/Paul1404/bfv-api" target="_blank">Projekt auf GitHub</a>
  </div>
</body>
</html>
`;

  writeFileSync(path.join(dir, "index.html"), html, "utf8");
  console.log(`✅ index.html generiert: ${path.join(dir, "index.html")}`);
}

// === ENTRYPOINT ===
async function main() {
  console.log("Spiele werden abgerufen...");
  ensureExportDir();
  const matches = await fetchAllMatches();
  if (matches.length === 0) {
    console.log("Keine Spiele für die angegebenen Teams gefunden.");
    return;
  }
  const timestamp = getTimestamp();
  exportToCSV(matches, timestamp);
  await exportToXLSX(matches, timestamp);
  generateFancyIndexHtml(EXPORT_DIR);
  console.log("Fertig! 🚀");
}

main().catch((err) => {
  console.error("Fataler Fehler:", err);
  process.exit(1);
});