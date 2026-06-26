# BFV Team Match Exporter

**Automated exporter for Bayerischer Fußball-Verband (BFV) team matches, with CSV/XLSX output and GitHub Pages publishing.**

[![Exports](https://img.shields.io/badge/Download-BFV%20Exports-blue)](https://sg-spielplan.untereuerheim.com/)

---

## 🚀 Features

- Fetches all matches for one or more BFV teams via the [bfv-api-js](https://github.com/SebastianSiedler/bfv-api-js) client
- Exports each team's matches as **CSV**, **XLSX** (Excel), **ICS** (calendar), and **Jira CSV**, with German column names
- Exports a combined file for all teams
- **Season-proof**: resolves each team's current match-plan id from the club page on every run, so a new season needs no config change
- **Stable file names** (no timestamps), so download links and calendar subscriptions keep working forever
- Subscribe-once calendar feeds via `webcal://` with stable event IDs (no duplicate events)
- Generates a modern, responsive `index.html` for easy download and one-click calendar subscription
- Publishes all exports to **GitHub Pages** via Actions (no gh-pages branch needed)
- Fully automated: runs on push, manual trigger, or nightly via cron
- Resilient: retries the BFV API with backoff, and aborts the run on failure so the last good site stays online
- Hands-off dependencies: Dependabot patch/minor updates auto-merge once CI passes

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

File names are stable (no timestamps), so a bookmark or calendar subscription set once keeps working.

- **Per-team:**
  - `Spiele_<Teamname>.csv`
  - `Spiele_<Teamname>.xlsx`
  - `Spiele_<Teamname>.ics`
  - `Jira_Spiele_<Teamname>.csv`
- **Combined:**
  - `Spiele_Alle_Teams.csv`
  - `Spiele_Alle_Teams.xlsx`
  - `Spiele_Alle_Teams.ics`
  - `Jira_Spiele_Alle_Teams.csv`
- **index.html:**
  - Lists and links all files, with file size and last update, plus one-click calendar subscription

All files are UTF-8 encoded and Excel-compatible (CSV includes BOM for umlauts).

---

## 📅 Calendar subscription

Subscribe once and the calendar updates itself on every run. In Google Calendar, Apple Calendar, or Outlook, add a calendar "from URL":

```
https://sg-spielplan.untereuerheim.com/Spiele_Alle_Teams.ics
```

Per-team feeds use the same pattern, e.g. `Spiele_Gaedheim-Untereuerheim.ics`. The site also offers `webcal://` buttons that open directly in the calendar app.

---

## 🌐 GitHub Pages

Latest exports and downloads:  
👉 [https://sg-spielplan.untereuerheim.com/](https://sg-spielplan.untereuerheim.com/)

---

## 🔧 Maintenance (basically none)

The goal is set-and-forget. Three things keep it running on its own:

- **Resilience:** if the BFV API is down, the run retries with backoff and then fails. A failed run does not deploy, so the previous good site stays online until the next nightly run succeeds.
- **Dependencies:** Dependabot batches patch and minor updates into one weekly PR per ecosystem, CI (`ci.yml`) builds them, and `dependabot-auto-merge.yml` auto-merges them. Major updates come as individual PRs and wait for a human.
- **Alerting:** a failed run opens (or comments on) a single tracking issue labelled `deploy-failure`, and the next successful run closes it automatically. The repo only asks for attention when a run actually breaks.

### Seasons: nothing to do

A BFV team match-plan id is bound to a single season and changes when the new season is published, but the club id is permanent. Each run reads the club page and resolves every team's current id from it (`resolveTeamIds` in `src/index.ts`), so the new season is picked up on its own. No yearly id edit.

If the club page can't be read, each team falls back to its last known id (`fallbackId`), so a scrape issue or a BFV outage never takes the site down. The generated page shows the active season (e.g. "Saison 2025/26") and the build logs print which id each team resolved to and whether it came from the club page (`live`) or the fallback (`hinterlegt`).

You only touch the config when the club itself changes (adding or removing a team, or a team slug changes): edit the `TEAMS` array, where each entry has a `slug`, a display `name`, and a `fallbackId`. The stable `CLUB_ID` is set once.

One-time repo settings for auto-merge to work:

1. Settings → General → enable **Allow auto-merge**.
2. Settings → Branches → protect `main` and mark the **CI / build** check as required, so nothing merges before the build passes.

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
A: Add an entry to the `TEAMS` array in `src/index.ts` with the team's `slug` (from its bfv.de team-page URL), a display `name`, and a `fallbackId` (its current widget id).

**Q: Do I need to update IDs every season?**  
A: No. Team ids are resolved from the club page on each run, so a new season is picked up automatically. The `fallbackId` values are only a safety net for when the club page can't be read. See "Seasons: nothing to do" above.

**Q: How do I change the export schedule?**  
A: Edit the `cron` line in `.github/workflows/publish-gh-pages.yml`.

**Q: Can I use this for other football associations?**  
A: This tool is tailored for the BFV API, but can be adapted for similar APIs.