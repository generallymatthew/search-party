import cron from "node-cron"
import fs from "fs"
import path from "path"
import Database from "better-sqlite3"
import { scrapeGlassdoor } from "../scrapers/glassdoor"
import { scrapeLinkedIn } from "../scrapers/linkedin"
import { scrapeIndeed } from "../scrapers/indeed"
import { scrapeAngelList } from "../scrapers/angellist"
import { scrapeWeWorkRemotely } from "../scrapers/weworkremotely"
import { scrapeDribbble } from "../scrapers/dribbble"
import { scrapeAuthenticJobs } from "../scrapers/authenticjobs"
import { scrapeUIUXJobsBoard } from "../scrapers/uiuxjobsboard"
import { scrapeRemotive } from "../scrapers/remotive"
import { scrapeSmashingMagazine } from "../scrapers/smashingmagazine"
import { scrapeRemoteLeaf } from "../scrapers/remoteleaf"
import { scrapeAIGA } from "../scrapers/aiga"
import { isDuplicate, addJob, updateLastSearch, updateJobMatchScore } from "../db/schema"
import { sendJobDigest } from "../notifications/email"
import { parseResume, scoreJobMatch } from "../services/resumeparser"
import { Job } from "../types"

export class JobSearchScheduler {
  private db: Database.Database
  private tasks: cron.ScheduledTask[] = []

  constructor(db: Database.Database) {
    this.db = db
  }

  start(frequency: "daily" | "weekly" = "daily") {
    console.log(`Starting job search scheduler (${frequency})`)

    if (frequency === "daily") {
      // Run at 8 AM every day
      this.tasks.push(
        cron.schedule("0 8 * * *", () => this.runSearch(), {
          runOnInit: false,
        })
      )
    } else {
      // Run Monday at 9 AM
      this.tasks.push(
        cron.schedule("0 9 * * 1", () => this.runSearch(), {
          runOnInit: false,
        })
      )
    }

    console.log(`Job search scheduler started. Next run scheduled.`)
  }

  async runSearch() {
    console.log(`\n[${new Date().toISOString()}] Starting job search...`)

    const jobTitle = process.env.JOB_TITLE || "UX Designer"
    const locations = (process.env.SEARCH_LOCATIONS || "remote,Raleigh NC")
      .split(",")
      .map((l) => l.trim())

    try {
      // Run all scrapers in sequence with error handling
      const scrapers = [
        { name: "LinkedIn", fn: () => scrapeLinkedIn(jobTitle, locations) },
        {
          name: "We Work Remotely",
          fn: () => scrapeWeWorkRemotely(jobTitle, locations),
        },
        { name: "Dribbble", fn: () => scrapeDribbble(jobTitle, locations) },
        { name: "AngelList", fn: () => scrapeAngelList(jobTitle, locations) },
        // Note: RemoteOK removed - job links sit behind a paywall
        {
          name: "Authentic Jobs",
          fn: () => scrapeAuthenticJobs(jobTitle, locations),
        },
        {
          name: "UI/UX Jobs Board",
          fn: () => scrapeUIUXJobsBoard(jobTitle, locations),
        },
        { name: "Remotive", fn: () => scrapeRemotive(jobTitle, locations) },
        {
          name: "Smashing Magazine",
          fn: () => scrapeSmashingMagazine(jobTitle, locations),
        },
        {
          name: "Remote Leaf",
          fn: () => scrapeRemoteLeaf(jobTitle, locations),
        },
        { name: "AIGA", fn: () => scrapeAIGA(jobTitle, locations) },
        { name: "Glassdoor", fn: () => scrapeGlassdoor(jobTitle, locations) },
        // Note: Indeed disabled - too aggressive with bot detection
      ]

      let totalJobs = 0
      for (const scraper of scrapers) {
        try {
          console.log(`Scraping ${scraper.name}...`)
          const jobs = await scraper.fn()
          const added = await this.processJobs(jobs)
          totalJobs += added
          console.log(`${scraper.name}: ${jobs.length} found, ${added} added`)
        } catch (error) {
          console.error(`Error scraping ${scraper.name}:`, error)
          // Continue with next scraper if one fails
        }
      }

      updateLastSearch(this.db)

      // Send email digest
      const notifyEmail = process.env.NOTIFY_EMAIL
      if (notifyEmail) {
        await sendJobDigest(this.db, notifyEmail, 24)
      }

      console.log(
        `Job search completed. Total jobs added: ${totalJobs}`
      )
    } catch (error) {
      console.error("Error during job search:", error)
    }
  }

  private async processJobs(jobs: Job[]): Promise<number> {
    // Score new jobs against the uploaded resume as they come in — the
    // /api/resume upload only scores jobs that already exist
    const profile = this.loadResumeProfile()

    let added = 0
    for (const job of jobs) {
      if (isDuplicate(this.db, job.source, job.url)) {
        continue
      }

      try {
        const jobId = addJob(this.db, job)
        added++
        if (profile) {
          const { score, reasons } = scoreJobMatch(job, profile)
          updateJobMatchScore(this.db, jobId, score, reasons)
        }
      } catch (error) {
        console.error(`Failed to add job: ${error}`)
      }
    }
    return added
  }

  private loadResumeProfile() {
    try {
      const dbPath = process.env.DB_PATH || "./data/jobs.db"
      const resumePath = path.join(path.dirname(dbPath), "resume.txt")
      if (fs.existsSync(resumePath)) {
        return parseResume(fs.readFileSync(resumePath, "utf-8"))
      }
    } catch (e) {
      // Resume not yet uploaded
    }
    return null
  }

  stop() {
    this.tasks.forEach((task) => task.stop())
    console.log("Job search scheduler stopped")
  }

  async runNow() {
    console.log("Running job search immediately...")
    await this.runSearch()
  }
}
