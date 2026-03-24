# GA4Harvest

https://github.com/user-attachments/assets/f8464feb-2d9a-4468-bbc0-222c8d546f61

Google Analytics 4's reporting UI is built around a single property at a time. For anyone managing analytics across multiple clients or brands, that means running the same report dozens of times and stitching together spreadsheets by hand.

GA4Harvest fixes that. It connects to the GA4 Data API via a service account, lists every property you have access to, and lets you run a single parameterized query across all of them simultaneously — returning unified results you can export in one click.

Built with a FastAPI backend and a React/TypeScript frontend. Queries stream in real time over SSE so you see results property-by-property as they arrive rather than waiting for a single blocking request. Results persist to the local filesystem between sessions and lazy-load on demand so the UI stays fast regardless of history size.

<a href="https://www.buymeacoffee.com/michaelkofron" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/default-orange.png" alt="Buy Me A Coffee" height="41" width="174"></a>

---

## Features

- **Multi-property queries** — run a single report across any combination of GA4 properties simultaneously; properties are grouped by account with collapsible headings and select-all per account
- **Metrics & dimensions** — add any GA4 metric or dimension by name with live autocomplete pulled from the API; filter results by dimension value with exact, contains, begins with, ends with, and regexp matching
- **Date ranges** — built-in presets (Last 7/28/90 days, This month, Last month, Year to date) plus custom ranges; all presets end on yesterday to match GA4's fully-processed data convention
- **Comparison mode** — toggle Compare to run the previous period alongside your main query; results show an inline delta table with Δ and Δ% per metric, color-coded green/red; dimensions are fully supported — each unique property × dimension combination gets its own delta row
- **Real-time streaming** — results arrive property by property over SSE with a live progress bar; quota errors are retried with exponential backoff automatically
- **Query history** — every query persists to `/storage/queries/` and reloads on startup; cards lazy-load their rows so the UI stays fast regardless of history size
- **Export** — Excel (.xlsx), JSON, and copy-to-clipboard (TSV) on every result card; comparison exports include main, compare, Δ, and Δ% columns per metric with green/red color-coded delta cells

---

## Requirements

- Python 3.11+
- Node 18+

---

## Google setup

You need a service account with access to your GA4 properties. Do this once.

**1. Create a service account**

Go to [console.cloud.google.com](https://console.cloud.google.com) → APIs & Services → Credentials → Create Credentials → Service Account. Name it whatever, skip the optional steps.

Once created, click into it → Keys tab → Add Key → Create new key → JSON. Save that file.

**2. Enable two APIs**

In the same Google Cloud project, go to APIs & Services → Library and enable:

- Google Analytics Data API
- Google Analytics Admin API

**3. Grant the service account access to GA4**

The service account has an email like `name@project.iam.gserviceaccount.com`. Add it as a Viewer in GA4:

- [analytics.google.com](https://analytics.google.com) → Admin → Account Access Management → + Add users
- Paste the service account email, set role to Viewer, click Add

Adding it at the account level gives it access to all properties under that account. You can also add it per-property if you prefer.

**4. Add your credentials**

Two options — use whichever fits your setup:

**Option A — drop the file in the project (simplest)**

```bash
cp ~/Downloads/your-key-file.json backend/credentials.json
```

`backend/credentials.json` is in `.gitignore` and won't be committed.

**Option B — point to the file from anywhere on disk**

Copy the example env file and set the path:

```bash
cp .env.example .env
# edit .env and uncomment GOOGLE_APPLICATION_CREDENTIALS=/path/to/your-key.json
```

Use this if you manage credentials centrally or prefer to keep them outside the project.

---

## Install

```bash
./install.sh
```

Creates a Python venv, installs backend deps, runs `npm install` for the frontend.

---

## Run

```bash
./start.sh
```

Opens at [http://localhost:5173](http://localhost:5173). Press Ctrl+C to stop.

---

## Dependencies

**Python** (`backend/requirements.txt`)
- `fastapi` + `uvicorn` — API server
- `google-analytics-admin` — lists accounts and properties
- `google-analytics-data` — runs reports
- `python-dotenv` — loads `.env` file if present

**Node** (`frontend/package.json`)
- `react`, `vite`, `typescript`
