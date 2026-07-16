import express, { Express, Request, Response } from "express"
import cors from "cors"
import path from "path"
import Database from "better-sqlite3"
import dotenv from "dotenv"
import { initializeDatabase, getJobs, getRecentJobs, updateJobMatchScore, getJobsWithMatches } from "./db/schema"
import { JobSearchScheduler } from "./scheduler"
import { initEmailer } from "./notifications/email"
import { parseResume, scoreJobMatch } from "./services/resumeparser"

dotenv.config()

const app: Express = express()
const port = process.env.PORT || 3000
const dbPath = process.env.DB_PATH || "./data/jobs.db"

// Middleware
app.use(cors())
app.use(express.json())
app.use(express.static("public"))

// Initialize database
const db = initializeDatabase(dbPath)
initEmailer()

// Load resume profile if exists
let resumeProfile: any = null
try {
  const resumePath = path.join(path.dirname(dbPath), "resume.txt")
  const fs = require("fs")
  if (fs.existsSync(resumePath)) {
    const resumeText = fs.readFileSync(resumePath, "utf-8")
    resumeProfile = parseResume(resumeText)
  }
} catch (e) {
  // Resume not yet uploaded
}

// Initialize scheduler
const scheduler = new JobSearchScheduler(db)
scheduler.start(
  (process.env.NOTIFY_FREQUENCY as "daily" | "weekly") || "daily"
)

// API Routes

// Get all jobs (sorted by match score and recency)
app.get("/api/jobs", (req: Request, res: Response) => {
  const limit = parseInt(req.query.limit as string) || 100
  const offset = parseInt(req.query.offset as string) || 0

  let jobs: any[]
  if (resumeProfile) {
    // Return all jobs sorted by match score and date
    jobs = db
      .prepare(
        `SELECT j.*,
                COALESCE(
                  (SELECT status FROM applications
                   WHERE job_id = j.id
                   ORDER BY updated_at DESC LIMIT 1),
                  'unsaved'
                ) as application_status
         FROM jobs j
         ORDER BY j.match_score DESC, j.posted_date DESC
         LIMIT ? OFFSET ?`
      )
      .all(limit, offset)
  } else {
    // No resume: return all jobs sorted by date
    jobs = db
      .prepare(
        `SELECT j.*,
                COALESCE(
                  (SELECT status FROM applications
                   WHERE job_id = j.id
                   ORDER BY updated_at DESC LIMIT 1),
                  'unsaved'
                ) as application_status
         FROM jobs j
         ORDER BY j.posted_date DESC
         LIMIT ? OFFSET ?`
      )
      .all(limit, offset)
  }

  // Deduplicate by title and company, but ALWAYS keep jobs with applications
  const seen = new Set<string>()
  const dedupedJobs = jobs.filter(job => {
    const key = `${job.title.toLowerCase().trim()}|${job.company.toLowerCase().trim()}`

    // ALWAYS keep jobs that have application records (applied, saved, etc.)
    if (job.application_status && job.application_status !== 'unsaved') {
      if (!seen.has(key)) {
        seen.add(key)
      }
      return true
    }

    // For unapplied jobs, only keep the first occurrence
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  res.json(dedupedJobs)
})

// Get recent jobs
app.get("/api/jobs/recent", (req: Request, res: Response) => {
  const days = parseInt(req.query.days as string) || 7
  const jobs = getRecentJobs(db, days)
  res.json(jobs)
})

// Get job by ID
app.get("/api/jobs/:id", (req: Request, res: Response) => {
  const job = db
    .prepare(
      `SELECT j.*, COALESCE(a.status, 'unsaved') as application_status
       FROM jobs j
       LEFT JOIN applications a ON j.id = a.job_id
       WHERE j.id = ?`
    )
    .get(req.params.id)

  if (!job) {
    return res.status(404).json({ error: "Job not found" })
  }

  res.json(job)
})

// Mark job as applied
app.post("/api/jobs/:id/apply", (req: Request, res: Response) => {
  const jobId = req.params.id
  const { status = "applied", notes = "" } = req.body

  try {
    const now = Math.floor(Date.now() / 1000)

    // Check if application already exists
    const existing = db
      .prepare("SELECT id FROM applications WHERE job_id = ?")
      .get(jobId)

    if (existing) {
      db.prepare(
        "UPDATE applications SET status = ?, notes = ?, updated_at = ? WHERE job_id = ?"
      ).run(status, notes, now, jobId)
    } else {
      db.prepare(
        `INSERT INTO applications (job_id, status, notes, applied_date, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(jobId, status, notes, now, now, now)
    }

    res.json({ success: true })
  } catch (error) {
    res.status(500).json({ error: String(error) })
  }
})

// Get stats
app.get("/api/stats", (req: Request, res: Response) => {
  // Get all jobs and deduplicate by title and company
  const allJobs = db
    .prepare(
      `SELECT j.*, COALESCE(
        (SELECT status FROM applications
         WHERE job_id = j.id
         ORDER BY updated_at DESC LIMIT 1),
        'unsaved'
      ) as application_status
       FROM jobs j
       ORDER BY j.match_score DESC, j.posted_date DESC`
    )
    .all() as any[]

  // Deduplicate by title and company, but ALWAYS keep jobs with applications
  const seen = new Set<string>()
  const dedupedJobs = allJobs.filter(job => {
    const key = `${job.title.toLowerCase().trim()}|${job.company.toLowerCase().trim()}`

    // ALWAYS keep jobs that have application records
    if (job.application_status && job.application_status !== 'unsaved') {
      if (!seen.has(key)) {
        seen.add(key)
      }
      return true
    }

    // For unapplied jobs, only keep the first occurrence
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  // Count unique jobs by source
  const bySource: any = {}
  dedupedJobs.forEach(job => {
    bySource[job.source] = (bySource[job.source] || 0) + 1
  })

  // Count unique jobs by location
  const byLocation: any = {}
  dedupedJobs.forEach(job => {
    byLocation[job.location] = (byLocation[job.location] || 0) + 1
  })

  // Sort location by count and take top 10
  const byLocationArray = Object.entries(byLocation)
    .map(([location, count]) => ({ location, count }))
    .sort((a: any, b: any) => b.count - a.count)
    .slice(0, 10)

  // Count applied jobs (from deduplicated jobs)
  const appliedCount = dedupedJobs.filter(j => j.application_status === 'applied').length

  // Application counts by status (one application row per job)
  const applicationsByStatus = db
    .prepare("SELECT status, COUNT(*) as count FROM applications GROUP BY status")
    .all()

  // Convert bySource object to array
  const bySourceArray = Object.entries(bySource)
    .map(([source, count]) => ({ source, count }))

  res.json({
    totalJobs: dedupedJobs.length,
    applied: appliedCount,
    applicationsByStatus,
    bySource: bySourceArray,
    byLocation: byLocationArray,
  })
})

// Upload resume
app.post("/api/resume", express.text(), async (req: Request, res: Response) => {
  try {
    const resumeText = req.body
    if (!resumeText || resumeText.length < 100) {
      return res.status(400).json({ error: "Resume text too short" })
    }

    // Parse resume
    resumeProfile = parseResume(resumeText)

    // Save resume to file
    const fs = require("fs")
    const resumePath = path.join(path.dirname(dbPath), "resume.txt")
    fs.writeFileSync(resumePath, resumeText)

    // Recalculate match scores for all jobs
    const allJobs = db.prepare("SELECT * FROM jobs").all() as any[]
    for (const job of allJobs) {
      const { score, reasons } = scoreJobMatch(job, resumeProfile)
      updateJobMatchScore(db, job.id, score, reasons)
    }

    res.json({
      success: true,
      message: `Resume uploaded and matched against ${allJobs.length} jobs`,
      profile: {
        yearsExperience: resumeProfile.yearsExperience,
        seniority: resumeProfile.seniority,
        skillsFound: resumeProfile.skills.length,
        topSkills: resumeProfile.skills.slice(0, 5),
      },
    })
  } catch (error) {
    res.status(500).json({ error: String(error) })
  }
})

// Get resume profile
app.get("/api/resume", (req: Request, res: Response) => {
  if (!resumeProfile) {
    return res.json({ hasResume: false })
  }

  res.json({
    hasResume: true,
    yearsExperience: resumeProfile.yearsExperience,
    seniority: resumeProfile.seniority,
    skills: resumeProfile.skills,
    expertise: resumeProfile.expertise,
    locations: resumeProfile.locations,
  })
})

// Trigger search manually
app.post("/api/search/now", async (req: Request, res: Response) => {
  try {
    const started = await scheduler.runNow()
    if (!started) {
      res
        .status(409)
        .json({ success: false, message: "Search already in progress" })
      return
    }
    res.json({ success: true, message: "Search started" })
  } catch (error) {
    res.status(500).json({ error: String(error) })
  }
})

// Get config
app.get("/api/config", (req: Request, res: Response) => {
  const config = db
    .prepare("SELECT * FROM search_config WHERE id = 1")
    .get() as any

  res.json({
    jobTitle: process.env.JOB_TITLE || "UX Designer",
    locations: (process.env.SEARCH_LOCATIONS || "remote,Raleigh NC").split(","),
    frequency: config?.search_frequency || "daily",
    lastSearch: config?.last_search_at ? new Date(config.last_search_at * 1000) : null,
  })
})

// Serve index.html for unknown routes
app.get("*", (req: Request, res: Response) => {
  res.sendFile(path.join(__dirname, "../public/index.html"))
})

// Error handling
app.use(
  (
    err: any,
    req: Request,
    res: Response,
    next: (error?: any) => void
  ) => {
    console.error(err)
    res.status(500).json({ error: "Internal server error" })
  }
)

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("Shutting down...")
  scheduler.stop()
  db.close()
  process.exit(0)
})

app.listen(port, () => {
  console.log(`Job Search Agent running on http://localhost:${port}`)
  console.log("Press Ctrl+C to stop")
})
