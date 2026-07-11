import Database from "better-sqlite3"
import path from "path"

export function initializeDatabase(dbPath: string): Database.Database {
  const db = new Database(dbPath)

  db.exec(`
    CREATE TABLE IF NOT EXISTS jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      company TEXT NOT NULL,
      location TEXT NOT NULL,
      url TEXT NOT NULL UNIQUE,
      salary_min INTEGER,
      salary_max INTEGER,
      salary_currency TEXT DEFAULT 'USD',
      posted_date INTEGER NOT NULL,
      source TEXT NOT NULL CHECK(source IN ('glassdoor', 'linkedin', 'indeed', 'angellist', 'weworkremotely', 'dribbble', 'remoteok', 'authenticjobs')),
      job_level TEXT,
      description TEXT,
      match_score INTEGER DEFAULT 0,
      match_reasons TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_job_source_url
      ON jobs(source, url);

    CREATE INDEX IF NOT EXISTS idx_job_created_at
      ON jobs(created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_job_company
      ON jobs(company);

    CREATE TABLE IF NOT EXISTS applications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'saved'
        CHECK(status IN ('saved', 'applied', 'rejected', 'offer')),
      applied_date INTEGER NOT NULL,
      notes TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS notification_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL CHECK(type IN ('email', 'dashboard')),
      job_id INTEGER NOT NULL,
      sent_at INTEGER NOT NULL,
      FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS search_config (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      search_frequency TEXT DEFAULT 'daily' CHECK(search_frequency IN ('daily', 'weekly')),
      enabled BOOLEAN DEFAULT 1,
      last_search_at INTEGER,
      updated_at INTEGER NOT NULL
    );

    INSERT OR IGNORE INTO search_config (id, updated_at)
      VALUES (1, strftime('%s', 'now'));
  `)

  return db
}

export function isDuplicate(
  db: Database.Database,
  source: string,
  url: string
): boolean {
  const result = db
    .prepare("SELECT id FROM jobs WHERE source = ? AND url = ?")
    .get(source, url)
  return !!result
}

export function addJob(db: Database.Database, job: any): number {
  const now = Math.floor(Date.now() / 1000)
  const postedDate = Math.floor(job.postedDate.getTime() / 1000)

  const stmt = db.prepare(`
    INSERT INTO jobs (
      title, company, location, url, salary_min, salary_max,
      salary_currency, posted_date, source, job_level, description,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)

  const result = stmt.run(
    job.title,
    job.company,
    job.location,
    job.url,
    job.salary?.min || null,
    job.salary?.max || null,
    job.salary?.currency || "USD",
    postedDate,
    job.source,
    job.jobLevel || null,
    job.description || null,
    now,
    now
  )

  return result.lastInsertRowid as number
}

export function getJobs(
  db: Database.Database,
  limit: number = 50,
  offset: number = 0
) {
  return db
    .prepare(
      `SELECT j.*,
              COALESCE(a.status, 'unsaved') as application_status
       FROM jobs j
       LEFT JOIN applications a ON j.id = a.job_id
       ORDER BY j.posted_date DESC
       LIMIT ? OFFSET ?`
    )
    .all(limit, offset)
}

export function getRecentJobs(db: Database.Database, days: number = 7) {
  const secondsAgo = days * 24 * 60 * 60
  const cutoffTime = Math.floor(Date.now() / 1000) - secondsAgo

  return db
    .prepare(
      `SELECT * FROM jobs
       WHERE posted_date > ?
       ORDER BY posted_date DESC`
    )
    .all(cutoffTime)
}

export function updateLastSearch(db: Database.Database) {
  const now = Math.floor(Date.now() / 1000)
  db.prepare("UPDATE search_config SET last_search_at = ? WHERE id = 1").run(
    now
  )
}

export function updateJobMatchScore(
  db: Database.Database,
  jobId: number,
  score: number,
  reasons: string[]
) {
  const reasonsJson = JSON.stringify(reasons)
  db.prepare(
    "UPDATE jobs SET match_score = ?, match_reasons = ? WHERE id = ?"
  ).run(score, reasonsJson, jobId)
}

export function getJobsWithMatches(
  db: Database.Database,
  limit: number = 50,
  offset: number = 0,
  daysRecent: number = 7
) {
  const secondsAgo = daysRecent * 24 * 60 * 60
  const cutoffTime = Math.floor(Date.now() / 1000) - secondsAgo

  return db
    .prepare(
      `SELECT j.*,
              COALESCE(a.status, 'unsaved') as application_status
       FROM jobs j
       LEFT JOIN applications a ON j.id = a.job_id
       WHERE j.created_at > ?
       ORDER BY j.match_score DESC, j.posted_date DESC
       LIMIT ? OFFSET ?`
    )
    .all(cutoffTime, limit, offset)
}
