# Contributing to Search Party

Thanks for your interest in contributing! Here's how you can help.

## 🐛 Reporting Issues

Found a bug or broken scraper? 

**Before submitting:**
1. Check if it's already reported in [Issues](https://github.com/generallymatthew/search-party/issues)
2. Run `bash manage-service.sh logs` to check error logs
3. Note which job board is affected (if applicable)

**When reporting:**
- Title: Clear, specific (e.g., "LinkedIn scraper returns 0 results")
- Description: Exact error message, steps to reproduce
- Environment: OS, Node version, when it started failing
- Logs: Paste relevant error logs from `logs/stderr.log`

## 🔧 Fixing Broken Scrapers

Job boards change their HTML structure frequently. If a scraper breaks:

### 1. Identify the Problem

```bash
# Check logs
tail -f data/logs/stdout.log

# Run a manual search to see error
curl -X POST http://localhost:9090/api/search/now
```

### 2. Update the Scraper

Scraper files: `src/scrapers/*.ts`

Example: Fixing LinkedIn scraper (`src/scrapers/linkedin.ts`)

```typescript
// Find the outdated selector
const titleEl = el.querySelector('.base-search-card__title')  // ❌ Old

// Inspect the site to find new selector
// Right-click → Inspect → find the new class name
const titleEl = el.querySelector('.jobs-search-results__list-item-title')  // ✅ New
```

### 3. Test Your Fix

```bash
# Rebuild and restart
npm run build
bash manage-service.sh restart

# Trigger a search
curl -X POST http://localhost:9090/api/search/now

# Check if jobs appear
curl http://localhost:9090/api/stats
```

### 4. Submit a PR

```bash
git checkout -b fix/linkedin-scraper
git commit -m "Fix: Update LinkedIn selectors to match current HTML structure"
git push origin fix/linkedin-scraper
```

## ✨ Adding a New Job Board

Want to add support for a new job board?

### 1. Create the Scraper

Create `src/scrapers/newboard.ts`:

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
    const context = await browser.newContext({
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
    })
    const page = await context.newPage()

    for (const location of locations) {
      try {
        const url = `https://newboard.com/search?q=${encodeURIComponent(jobTitle)}&l=${encodeURIComponent(location)}`
        
        console.log(`Scraping NewBoard: ${location}...`)
        await page.goto(url, { waitUntil: "networkidle", timeout: 15000 })
        await page.waitForTimeout(2000) // Be respectful of server

        // Extract job cards
        const jobCards = await page.$$eval(".job-card", (elements: any[]) =>
          elements.map((el: any) => {
            const titleEl = el.querySelector(".job-title")
            const companyEl = el.querySelector(".company")
            const locationEl = el.querySelector(".location")
            const linkEl = el.querySelector("a.job-link")

            return {
              title: titleEl?.textContent?.trim() || "",
              company: companyEl?.textContent?.trim() || "",
              location: locationEl?.textContent?.trim() || "",
              url: linkEl?.href || ""
            }
          })
        )

        // Convert to Job objects
        for (const card of jobCards) {
          if (!card.title || !card.company || !card.url) continue

          const job: Job = {
            title: card.title,
            company: card.company,
            location: card.location || location,
            url: card.url.startsWith("http") ? card.url : `https://newboard.com${card.url}`,
            postedDate: new Date(),
            source: "newboard"
          }

          jobs.push(job)
        }

        // Respectful delay between requests
        await page.waitForTimeout(Math.random() * 2000 + 1000)
      } catch (error) {
        console.error(`Error scraping NewBoard for ${location}:`, error)
      }
    }

    await context.close()
  } finally {
    await browser.close()
  }

  return jobs
}
```

### 2. Register in Scheduler

Edit `src/scheduler/index.ts`:

```typescript
import { scrapeNewBoard } from "../scrapers/newboard"

const scrapers = [
  { name: "NewBoard", fn: () => scrapeNewBoard(jobTitle, locations) },
  // ... existing scrapers
]
```

### 3. Update Types

Edit `src/types/index.ts`:

```typescript
export interface Job {
  // ... existing fields
  source: "glassdoor" | "linkedin" | "newboard"  // Add "newboard"
}
```

### 4. Update Database Schema

Edit `src/db/schema.ts`:

```typescript
CREATE TABLE IF NOT EXISTS jobs (
  source TEXT NOT NULL CHECK(
    source IN ('glassdoor', 'linkedin', 'newboard')  // Add 'newboard'
  ),
  // ... rest of schema
)
```

### 5. Test & Submit PR

```bash
npm run build
npm run dev

# Trigger search
curl -X POST http://localhost:9090/api/search/now

# Check stats
curl http://localhost:9090/api/stats
```

Submit a PR with:
- Title: "feat: Add NewBoard scraper"
- Description: Include URL, number of jobs found, any caveats

## 📋 Code Style

- **TypeScript**: Strict mode enabled
- **Indentation**: 2 spaces
- **Naming**: camelCase for functions/variables, PascalCase for types
- **Comments**: Only for non-obvious logic
- **Error Handling**: Log errors, don't crash silently

Example:

```typescript
// ✅ Good
export async function scrapeBoard(jobTitle: string): Promise<Job[]> {
  try {
    const jobs = await fetchJobs(jobTitle)
    return jobs.filter(j => j.title && j.company)
  } catch (error) {
    console.error(`Failed to scrape: ${error}`)
    return []
  }
}

// ❌ Avoid
async function scrapeboard(jobtitle) {
  // This function scrapes a board
  const result = await fetch_jobs(jobtitle)
  return result
}
```

## 🔄 Pull Request Process

1. **Fork** the repository
2. **Create a branch**: `git checkout -b fix/your-fix` or `feat/new-feature`
3. **Make changes** following code style above
4. **Test thoroughly**: `npm run build && npm run dev`
5. **Commit** with clear message: `git commit -m "fix: descriptive message"`
6. **Push**: `git push origin your-branch`
7. **Open PR** with description of changes

### PR Requirements

- ✅ Build passes: `npm run build`
- ✅ No TypeScript errors
- ✅ Descriptive commit message(s)
- ✅ Related issue linked (if applicable)
- ✅ For scrapers: confirm jobs were found

### PR Template

```markdown
## Description
What problem does this solve?

## Changes
- Bullet point 1
- Bullet point 2

## Testing
How to verify this works?

## Screenshots (if UI changes)
[Paste here]

## Checklist
- [ ] Code builds without errors
- [ ] Tested locally
- [ ] Updated relevant documentation
```

## 🏃 Maintenance

### Known Issues

- **Scrapers breaking**: Report in Issues with board name + error
- **Database growing large**: Run `npm run cleanup` (deletes jobs >90 days old)
- **Performance slow**: Check database size, may need cleanup

### Regular Tasks

- Check GitHub Issues weekly for broken scrapers
- Update selectors as sites change (usually monthly)
- Review pull requests within 7 days
- Release patch updates for scraper fixes

## ❓ Questions?

- **How do I...?** Check [README.md](README.md) first
- **Found a bug?** Open an [Issue](https://github.com/generallymatthew/search-party/issues)
- **Have an idea?** Open a [Discussion](https://github.com/generallymatthew/search-party/discussions)

---

**Thank you for contributing! 🙏**
