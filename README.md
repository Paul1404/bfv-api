# BFV Team Match Exporter

**Automated exporter for Bayerischer Fußball-Verband (BFV) team matches, with CSV/XLSX output and GitHub Pages publishing.**

[![Exports](https://img.shields.io/badge/Download-BFV%20Exports-blue)](https://sg-spielplan.untereuerheim.com/)

---

## 🚀 Features

- Fetches all matches for one or more BFV teams via the [bfv-api-js](https://github.com/SebastianSiedler/bfv-api-js) client
- Exports each team's matches as **CSV**, **XLSX** (Excel), **ICS** (calendar), and **Jira CSV**, with German column names
- Exports a combined file for all teams
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

### Once a year: the new season

This is the only manual step. A BFV `teamPermanentId` is bound to a single season, so it does **not** roll over on its own. When the new season's fixtures are published (usually July), each team gets a fresh permanent id.

1. Open each team's match-plan widget on [bfv.de](https://www.bfv.de) and copy the new `teamPermanentId` (the 32-character token in the widget URL).
2. Replace the ids in the `TEAMS` array in `src/index.ts`.
3. Commit and push. The next run picks up the new season automatically.

The generated site shows the active season (e.g. "Saison 2025/26") at the top, and the build logs print `Saison: ...`, so you can confirm at a glance which season the ids currently resolve to.

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
A: Edit the `TEAMS` array in `src/index.ts` with the desired team IDs and names.

**Q: The site still shows last season. What do I do?**  
A: Each `teamPermanentId` is tied to one season and does not advance by itself. Get the new season's permanent IDs from the BFV widget and update the `TEAMS` array. See "Once a year: the new season" above.

**Q: How do I change the export schedule?**  
A: Edit the `cron` line in `.github/workflows/publish-gh-pages.yml`.

**Q: Can I use this for other football associations?**  
A: This tool is tailored for the BFV API, but can be adapted for similar APIs.