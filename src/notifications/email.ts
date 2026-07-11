import nodemailer from "nodemailer"
import Database from "better-sqlite3"
import { JobRecord } from "../types"

let transporter: nodemailer.Transporter | null = null

export function initEmailer() {
  const user = process.env.GMAIL_USER
  const password = process.env.GMAIL_APP_PASSWORD

  if (!user || !password) {
    console.warn(
      "Email configuration missing. Set GMAIL_USER and GMAIL_APP_PASSWORD in .env"
    )
    return
  }

  transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user,
      pass: password,
    },
  })
}

export async function sendJobDigest(
  db: Database.Database,
  recipientEmail: string,
  jobsSinceHours: number = 24
) {
  if (!transporter) {
    console.log("Email not configured, skipping notifications")
    return
  }

  const cutoffTime = Math.floor(Date.now() / 1000) - jobsSinceHours * 60 * 60

  const jobs = db
    .prepare(
      `SELECT * FROM jobs
       WHERE created_at > ?
       AND id NOT IN (SELECT job_id FROM notification_logs WHERE type = 'email')
       ORDER BY posted_date DESC`
    )
    .all(cutoffTime) as any[]

  if (jobs.length === 0) {
    console.log("No new jobs to send")
    return
  }

  const html = generateEmailHTML(jobs)

  const mailOptions = {
    from: process.env.GMAIL_USER,
    to: recipientEmail,
    subject: `${jobs.length} New UX Design Jobs Found`,
    html,
  }

  try {
    await transporter.sendMail(mailOptions)
    console.log(`Email sent to ${recipientEmail} with ${jobs.length} jobs`)

    // Log that we sent these jobs
    const insertLog = db.prepare(
      `INSERT INTO notification_logs (type, job_id, sent_at)
       VALUES (?, ?, ?)`
    )

    const now = Math.floor(Date.now() / 1000)
    for (const job of jobs) {
      insertLog.run("email", job.id, now)
    }
  } catch (error) {
    console.error("Failed to send email:", error)
  }
}

function generateEmailHTML(jobs: any[]): string {
  const jobsBySource = {
    glassdoor: jobs.filter((j) => j.source === "glassdoor"),
    linkedin: jobs.filter((j) => j.source === "linkedin"),
  }

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #0a66c2; color: white; padding: 20px; border-radius: 5px; margin-bottom: 20px; }
          .section { margin-bottom: 30px; }
          .section-title { font-size: 18px; font-weight: bold; margin-bottom: 15px; color: #0a66c2; }
          .job-card { border: 1px solid #ddd; padding: 15px; margin-bottom: 15px; border-radius: 5px; }
          .job-title { font-size: 16px; font-weight: bold; margin-bottom: 5px; }
          .job-company { font-size: 14px; color: #666; margin-bottom: 5px; }
          .job-meta { font-size: 12px; color: #999; margin-bottom: 10px; }
          .job-link { display: inline-block; background: #0a66c2; color: white; padding: 8px 15px; text-decoration: none; border-radius: 3px; margin-top: 10px; }
          .footer { font-size: 12px; color: #999; margin-top: 30px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>UX Design Jobs Digest</h1>
            <p>${jobs.length} new jobs found for you today</p>
          </div>

          ${
            jobsBySource.glassdoor.length > 0
              ? `
            <div class="section">
              <div class="section-title">Glassdoor (${jobsBySource.glassdoor.length})</div>
              ${jobsBySource.glassdoor.map((job) => generateJobCard(job)).join("")}
            </div>
          `
              : ""
          }

          ${
            jobsBySource.linkedin.length > 0
              ? `
            <div class="section">
              <div class="section-title">LinkedIn (${jobsBySource.linkedin.length})</div>
              ${jobsBySource.linkedin.map((job) => generateJobCard(job)).join("")}
            </div>
          `
              : ""
          }

          <div class="footer">
            <p>Job Search Agent • Find more jobs at your dashboard</p>
          </div>
        </div>
      </body>
    </html>
  `
}

function generateJobCard(job: any): string {
  return `
    <div class="job-card">
      <div class="job-title">${job.title}</div>
      <div class="job-company">${job.company}</div>
      <div class="job-meta">${job.location}${job.salary_min ? ` • $${(job.salary_min / 1000).toFixed(0)}k - $${(job.salary_max / 1000).toFixed(0)}k` : ""}</div>
      <a href="${job.url}" class="job-link">View Job</a>
    </div>
  `
}
