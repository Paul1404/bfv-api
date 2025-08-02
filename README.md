# BFV Team Match Exporter

**Automated exporter for Bayerischer Fußball-Verband (BFV) team matches, with CSV/XLSX output and GitHub Pages publishing.**

[![Exports](https://img.shields.io/badge/Download-BFV%20Exports-blue)](https://sg-spielplan.untereuerheim.com/)

---

## 🚀 Features

- Fetches all matches for one or more BFV teams via the [bfv-api-js](https://github.com/SebastianSiedler/bfv-api-js) client
- Exports each team's matches as **CSV** and **XLSX** (Excel) with German column names
- Exports a combined file for all teams
- All files timestamped and named in German (umlauts handled)
- Generates a modern, responsive `index.html` for easy download
- Publishes all exports to **GitHub Pages** via Actions (no gh-pages branch needed)
- Fully automated: runs on push, manual trigger, or nightly via cron
- Secure: no vulnerable dependencies, only safe libraries for writing files

---

## 📦 Installation

```bash
git clone https://github.com/Paul1404/bfv-api.git
cd bfv-api
pnpm install
```

---

## ⚙️ Usage

### **Manual Run**

```bash
pnpm tsc
node dist/index.js
```

- Exports will be written to the `exports/` directory.

### **Automated via GitHub Actions**

- On every push to `main`, manual trigger, or nightly (2:00 AM UTC), the workflow:
  - Builds the project
  - Runs the exporter
  - Publishes the latest files to GitHub Pages

---

## 📂 Output

- **Per-team:**  
  - `Spiele_<Teamname>_<timestamp>.csv`
  - `Spiele_<Teamname>_<timestamp>.xlsx`
- **Combined:**  
  - `Spiele_Alle_Teams_<timestamp>.csv`
  - `Spiele_Alle_Teams_<timestamp>.xlsx`
- **index.html:**  
  - Lists and links all files, with file size and last update

All files are UTF-8 encoded and Excel-compatible (CSV includes BOM for umlauts).

---

## 🌐 GitHub Pages

Latest exports and downloads:  
👉 [https://sg-spielplan.untereuerheim.com/](https://sg-spielplan.untereuerheim.com/)

---

## 🔒 Security

- No vulnerable `xlsx`/SheetJS dependency (uses only `exceljs` for writing)
- No user input is processed; only BFV API data is exported

---

## 🤝 Contributing

1. Fork and clone the repo
2. Create a feature branch
3. Make your changes (TypeScript, best practices, tests welcome!)
4. Open a pull request

---

## 📄 License

MIT License

---

## 🙋 FAQ

**Q: How do I add more teams?**  
A: Edit the `TEAMS` array in `src/index.ts` with the desired team IDs and names.

**Q: How do I change the export schedule?**  
A: Edit the `cron` line in `.github/workflows/publish-pages.yml`.

**Q: Can I use this for other football associations?**  
A: This tool is tailored for the BFV API, but can be adapted for similar APIs.