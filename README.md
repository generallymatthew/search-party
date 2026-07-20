# 🔍 Search Party — Automated Job Search Agent

> An intelligent, self-updating job search agent that finds positions matching your career, ranks them by your skills, and keeps you notified. Set it and forget it.

**Status**: Production-ready · **License**: MIT · **Node**: 18+ 

## ✨ Features

- 🤖 **Automated Daily Searches** — Scrapes 10+ job boards automatically
- 🎯 **Resume-Based Ranking** — Matches jobs to your background (0-100% compatibility)
- 📊 **Smart Filtering** — Hide low-match jobs, customize search criteria
- 🌐 **Multiple Boards** — LinkedIn, UI/UX Jobs Board, We Work Remotely, Jobicy, AIGA, and more
- 🔎 **Multi-Title Search** — Search several roles at once (e.g. UX, Product, and UI Designer)
- 📧 **Email Digests** — Daily job summaries sent to your inbox
- 💾 **Application Tracking** — Mark jobs Applied, Not a Good Fit, or Not Available
- 🎨 **Beautiful Dashboard** — Modern web UI for browsing and filtering
- ⚙️ **Fully Configurable** — Change job titles, locations, search frequency
- 🏃 **Always Running** — Scheduled background service on your machine

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- Playwright browsers (auto-installed)

### Installation

```bash
git clone https://github.com/generallymatthew/search-party.git
cd search-party
npm install
npx playwright install
```

### Setup

```bash
# Copy environment template
cp .env.example .env

# Edit .env with your preferences
nano .env

# Start the service
npm run dev
```

Visit **http://localhost:9090** in your browser.

### Deploy as Background Service (macOS)

```bash
bash install-service.sh
bash manage-service.sh status
```

See [Deployment Guide](#deployment) for Linux/Windows.

## 📋 Configuration

Edit `.env`:

```env
# Job search (customize for any roles/locations; comma-separated)
JOB_TITLE=UX Designer,Product Designer,UI Designer
SEARCH_LOCATIONS=remote,San Francisco CA,New York NY
NOTIFY_FREQUENCY=daily  # daily or weekly

# Server
# PORT is optional (defaults to 3000). Leave it unset if something else
# supplies it — the macOS service plist pins PORT=9090, and the Claude Code
# dev preview assigns its own port.
DB_PATH=./data/jobs.db

# Email (optional - for notifications)
GMAIL_USER=your-email@gmail.com
GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx
NOTIFY_EMAIL=your-email@gmail.com
```

### Get Gmail App Password
1. Go to [Google Account Security](https://myaccount.google.com/apppasswords)
2. Create an app password for "Mail" on "Windows/Mac/Linux"
3. Copy to `GMAIL_APP_PASSWORD` in `.env`

## 📖 Usage

### Dashboard

Access at **http://localhost:9090**

- **Search Now** — Trigger immediate search
- **⚙️ Settings** — Customize job titles, locations, frequency
- **🔍 Job Boards** — See which boards we're searching and job counts
- **📄 Upload & Analyze Resume** — Upload resume for personalized matching
- **Match Score Slider** — Filter by compatibility (0-100%)
- **Hide Low Matches** — Toggle to hide jobs below threshold
- **Job Actions** — Mark jobs **Applied**, **Not a Good Fit**, or **Not Available**
  (delisted); marked jobs move to their own sections at the bottom, and the
  stats row tracks a count for each status

### API

```bash
# Get all jobs
curl http://localhost:9090/api/jobs?limit=50

# Get job statistics
curl http://localhost:9090/api/stats

# Mark job as applied (status: saved | applied | rejected | offer | unavailable)
curl -X POST http://localhost:9090/api/jobs/1/apply \
  -H "Content-Type: application/json" \
  -d '{"status":"applied"}'

# Upload resume for matching
curl -X POST http://localhost:9090/api/resume \
  -H "Content-Type: text/plain" \
  --data-binary @resume.txt

# Trigger manual search
curl -X POST http://localhost:9090/api/search/now
```

## 🏗️ Architecture

```
search-party/
├── src/
│   ├── scrapers/          # Job board scrapers (LinkedIn, RemoteOK, etc.)
│   ├── db/                # SQLite schema & queries
│   ├── scheduler/         # Cron job runner
│   ├── notifications/     # Email service
│   ├── services/          # Resume parsing, job matching
│   ├── server.ts          # Express API
│   └── types/             # TypeScript interfaces
├── public/
│   └── index.html         # Web dashboard (React-like)
├── data/
│   └── jobs.db            # SQLite database
└── logs/
    ├── stdout.log         # Application logs
    └── stderr.log         # Error logs
```

### How It Works

1. **Scheduler** runs at configured time (default: 8 AM daily)
2. **Scrapers** fetch jobs from multiple boards — once per configured job
   title for boards driven by a search query or category, once total for
   boards that serve a whole design feed
3. **Deduplication** prevents duplicate listings
4. **Resume Matching** scores each job against your background (if uploaded)
5. **Email Digest** sends new jobs to your inbox (optional)
6. **Dashboard** displays jobs ranked by relevance and recency

## 🔧 Development

### Project Setup

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Development mode (auto-reload)
npm run dev

# Production mode
npm run start
```

### Adding a New Job Board

Create `src/scrapers/newboard.ts`. If the board is server-rendered, prefer
`axios` + `cheerio` (see `src/scrapers/uiuxjobsboard.ts`) — it's faster and
lighter than a browser. Use Playwright when the board needs JavaScript or
sits behind bot protection (see `src/scrapers/aiga.ts`):

```typescript
import { chromium } from "playwright"
import { Job } from "../types"

export async function scrapeNewBoard(
  jobTitle: string,
  locations: string[]
): Promise<Job[]> {
  const browser = await chromium.launch()
  const jobs: Job[] = []

  try {
    // Your scraping logic here
  } finally {
    await browser.close()
  }

  return jobs
}
```

Register in `src/scheduler/index.ts`. Wrap the call in `forEachTitle` if the
board's results depend on the search title (query- or category-driven);
call it directly if the board serves one fixed feed:

```typescript
import { scrapeNewBoard } from "../scrapers/newboard"

const scrapers = [
  { name: "New Board", fn: forEachTitle((t) => scrapeNewBoard(t, locations)) },
  // ... existing scrapers
]
```

Finally, add the new source name to the `source` union in `src/types/index.ts`
and to `JOB_SOURCES` in `src/db/schema.ts` — existing databases migrate
automatically on next start.

See [CONTRIBUTING.md](CONTRIBUTING.md) for detailed guidelines.

## 📊 Job Board Support

| Board | Status | Jobs Found | Notes |
|-------|--------|-----------|-------|
| LinkedIn | ✅ Active | 300+ | Official access |
| UI/UX Jobs Board | ✅ Active | 250+ | Server-rendered, per-title category pages |
| AIGA Design Careers | ✅ Active | 50+ | Playwright captures the board's JSON API |
| Remote Leaf | ✅ Active | 30+ | Public category pages (curated feed is paid) |
| Jobicy | ✅ Active | ~30 | Official public API (design industries) |
| We Work Remotely | ✅ Active | ~25 | Public design-category RSS feed (HTML pages 403) |
| Remotive | ✅ Active | ~15 | Public tiles + official API (most listings paywalled) |
| Working Nomads | ✅ Active | ~5 | Official public API (latest ~40 jobs) |
| Smashing Magazine | ✅ Active | Few | Board rarely updated |
| Dribbble | ⏳ Needs Fix | 0 | Site allows scraping; selectors outdated |
| Authentic Jobs | ⏳ Needs Fix | 0 | Site allows scraping; selectors outdated |
| AngelList/Wellfound | ❌ Removed | — | Blocks scraping (403) |
| Glassdoor | ❌ Removed | — | Blocks scraping (403) |
| Indeed | ❌ Disabled | — | Partnership API required |
| RemoteOK | ❌ Removed | — | Listings moved behind a paywall |

**Want to help fix a board?** See [CONTRIBUTING.md](CONTRIBUTING.md).

## 🚢 Deployment

### macOS (Launchd)

```bash
bash install-service.sh
bash manage-service.sh status
```

### Linux (Systemd)

See [DEPLOYMENT.md](docs/DEPLOYMENT.md).

### Docker

```bash
docker build -t search-party .
docker run -d -p 9090:9090 -v jobdata:/app/data search-party
```

See [Docker Guide](docs/DOCKER.md) for details.

## ⚠️ Important Notes

### Web Scraping & Terms of Service

Search Party scrapes publicly available job listings. Please note:

- **LinkedIn**: Uses Playwright with standard browser identification. LinkedIn's ToS restricts automated access. Use at your own risk.
- **Remotive**: Uses their official public API, which asks that jobs link back to Remotive and not be reposted to third-party job sites.
- **Other Sites**: Check individual site ToS before enabling.

This tool is for **personal use only**. Commercial use or large-scale scraping may violate site ToS.

### Maintenance

Web scrapers are fragile—sites change their HTML structure frequently. If a board stops working:

1. Check console logs: `bash manage-service.sh logs`
2. The selectors may need updating
3. See [CONTRIBUTING.md](CONTRIBUTING.md) for how to fix
4. Submit a PR or issue with the fix

## 🐛 Troubleshooting

**"No jobs found"**
- Check board is enabled in Job Boards modal
- Verify search locations match site's region names
- Check logs: `bash manage-service.sh logs`

**"Scrapers timing out"**
- Sites may be blocking or rate-limiting
- Try again later
- Check internet connection

**"Email not sending"**
- Verify Gmail app password is correct
- Enable "Less secure app access" if needed
- Check spam folder

**"Database locked"**
- Delete and restart: `rm data/jobs.db && npm run dev`

See [Troubleshooting Guide](docs/TROUBLESHOOTING.md) for more.

## 🗺️ Roadmap

- [ ] AI-powered job matching (vs. keyword matching)
- [ ] Slack/Discord notifications
- [ ] Job application tracking dashboard
- [ ] Salary trend analytics
- [ ] Saved search profiles
- [ ] Browser extension for job boards
- [ ] Cloud deployment template

## 🤝 Contributing

Contributions are welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for:
- How to fix broken scrapers
- How to add new job boards
- Code style guide
- Pull request process

## 📝 License

MIT © 2024 — Free for personal and commercial use.

## 💬 Support

- **Issues**: [GitHub Issues](https://github.com/generallymatthew/search-party/issues)
- **Discussions**: [GitHub Discussions](https://github.com/generallymatthew/search-party/discussions)
- **Email**: your-email@example.com

## 🎯 Use Cases

- 🔍 **Software Engineers** — Find dev roles matching your stack and experience level
- 🎨 **Designers** — Discover UX/Product/Graphic design positions
- 📊 **Data Professionals** — Search for data science, analytics, and ML roles
- 💼 **Product Managers** — Find PM and APM opportunities
- 🏢 **Job Seekers of Any Role** — Customize for your career: DevOps, QA, Marketing, Sales, etc.
- 👁️ **Career Researchers** — Track salary trends and hiring patterns across industries
- 🤖 **Developers** — Fork and customize for any role/industry/region combination
- 🏪 **Recruiters** — Adapt for passive candidate sourcing and market research

---

**Made with ❤️ for job seekers everywhere. Happy searching! 🚀**
