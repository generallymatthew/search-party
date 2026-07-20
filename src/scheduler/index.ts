import cron from "node-cron"
import fs from "fs"
import path from "path"
import Database from "better-sqlite3"
import { scrapeLinkedIn } from "../scrapers/linkedin"
import { scrapeDribbble } from "../scrapers/dribbble"
import { scrapeAuthenticJobs } from "../scrapers/authenticjobs"
import { scrapeUIUXJobsBoard } from "../scrapers/uiuxjobsboard"
import { scrapeRemotive } from "../scrapers/remotive"
import { scrapeSmashingMagazine } from "../scrapers/smashingmagazine"
import { scrapeRemoteLeaf } from "../scrapers/remoteleaf"
import { scrapeAIGA } from "../scrapers/aiga"
import { scrapeWeWorkRemotely } from "../scrapers/weworkremotely"
import { scrapeWorkingNomads } from "../scrapers/workingnomads"
import { scrapeJobicy } from "../scrapers/jobicy"
import { isDuplicate, addJob, updateLastSearch, updateJobMatchScore } from "../db/schema"
import { sendJobDigest } from "../notifications/email"
import { parseResume, scoreJobMatch } from "../services/resumeparser"
import { Job } from "../types"

export class JobSearchScheduler {
  private db: Database.Database
  private tasks: cron.ScheduledTask[] = []
  private searchInProgress = false

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

  get isRunning(): boolean {
    return this.searchInProgress
  }

  async runSearch(): Promise<boolean> {
    if (this.searchInProgress) {
      console.log(
        `[${new Date().toISOString()}] Job search already in progress, skipping`
      )
      return false
    }
    this.searchInProgress = true
    try {
      await this.doSearch()
    } finally {
      this.searchInProgress = false
    }
    return true
  }

  private async doSearch() {
    console.log(`\n[${new Date().toISOString()}] Starting job search...`)

    // JOB_TITLE accepts a comma-separated list, e.g.
    // "UX Designer,Product Designer,UI Designer"
    const jobTitles = (process.env.JOB_TITLE || "UX Designer")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean)
    const locations = (process.env.SEARCH_LOCATIONS || "remote,Raleigh NC")
      .split(",")
      .map((l) => l.trim())

    // Run a title-driven scraper once per configured title; boards that
    // ignore the title (category feeds) are called directly instead
    const forEachTitle =
      (fn: (title: string) => Promise<Job[]>) => async () => {
        const all: Job[] = []
        const seen = new Set<string>()
        for (const title of jobTitles) {
          for (const job of await fn(title)) {
            if (seen.has(job.url)) continue
            seen.add(job.url)
            all.push(job)
          }
        }
        return all
      }

    try {
      // Run all scrapers in sequence with error handling
      // Removed boards:
      // - RemoteOK: job links sit behind a paywall
      // - Indeed: too aggressive with bot detection
      // - Glassdoor, AngelList/Wellfound: block scraping (403)
      // (We Work Remotely also 403s HTML pages, but its RSS feed is public)
      const scrapers = [
        {
          name: "LinkedIn",
          fn: forEachTitle((t) => scrapeLinkedIn(t, locations)),
        },
        // Dribbble and Authentic Jobs search a fixed design/UX query
        {
          name: "Dribbble",
          fn: () => scrapeDribbble(jobTitles[0], locations),
        },
        {
          name: "Authentic Jobs",
          fn: () => scrapeAuthenticJobs(jobTitles[0], locations),
        },
        {
          name: "UI/UX Jobs Board",
          fn: forEachTitle((t) => scrapeUIUXJobsBoard(t, locations)),
        },
        {
          name: "Remotive",
          fn: forEachTitle((t) => scrapeRemotive(t, locations)),
        },
        {
          name: "Smashing Magazine",
          fn: forEachTitle((t) => scrapeSmashingMagazine(t, locations)),
        },
        {
          name: "Remote Leaf",
          fn: forEachTitle((t) => scrapeRemoteLeaf(t, locations)),
        },
        { name: "AIGA", fn: forEachTitle((t) => scrapeAIGA(t, locations)) },
        // WWR and Jobicy pull whole design category feeds; the title is unused
        {
          name: "We Work Remotely",
          fn: () => scrapeWeWorkRemotely(jobTitles[0], locations),
        },
        {
          name: "Working Nomads",
          fn: forEachTitle((t) => scrapeWorkingNomads(t, locations)),
        },
        { name: "Jobicy", fn: () => scrapeJobicy(jobTitles[0], locations) },
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

  async runNow(): Promise<boolean> {
    console.log("Running job search immediately...")
    return this.runSearch()
  }
}
