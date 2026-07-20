import Database from "better-sqlite3"
import path from "path"

// Every source a scraper can write; "remoteok" is retired from the search
// rotation but must stay listed so existing rows survive table rebuilds
export const JOB_SOURCES = [
  "glassdoor",
  "linkedin",
  "indeed",
  "angellist",
  "weworkremotely",
  "dribbble",
  "remoteok",
  "authenticjobs",
  "uiuxjobsboard",
  "remotive",
  "smashingmagazine",
  "remoteleaf",
  "aiga",
  "workingnomads",
  "jobicy",
] as const

const SOURCE_CHECK = JOB_SOURCES.map((s) => `'${s}'`).join(", ")

// Every status an application row can hold; 'unavailable' marks a listing
// that was taken down before the user applied
export const APPLICATION_STATUSES = [
  "saved",
  "applied",
  "rejected",
  "offer",
  "unavailable",
] as const

const STATUS_CHECK = APPLICATION_STATUSES.map((s) => `'${s}'`).join(", ")

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
      source TEXT NOT NULL CHECK(source IN (${SOURCE_CHECK})),
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
        CHECK(status IN (${STATUS_CHECK})),
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

  migrateSourceCheck(db)
  migrateStatusCheck(db)

  return db
}

// CREATE TABLE IF NOT EXISTS won't update the CHECK constraint on an existing
// database, and SQLite can't alter constraints in place — so when the stored
// schema is missing a newer source, rebuild the jobs table around the data.
function migrateSourceCheck(db: Database.Database) {
  const jobsTable = db
    .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='jobs'")
    .get() as { sql: string } | undefined

  if (!jobsTable || JOB_SOURCES.every((s) => jobsTable.sql.includes(`'${s}'`))) {
    return
  }

  console.log("Migrating jobs table to allow new job board sources...")
  db.exec(`
    PRAGMA foreign_keys=OFF;
    BEGIN TRANSACTION;

    CREATE TABLE jobs_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      company TEXT NOT NULL,
      location TEXT NOT NULL,
      url TEXT NOT NULL UNIQUE,
      salary_min INTEGER,
      salary_max INTEGER,
      salary_currency TEXT DEFAULT 'USD',
      posted_date INTEGER NOT NULL,
      source TEXT NOT NULL CHECK(source IN (${SOURCE_CHECK})),
      job_level TEXT,
      description TEXT,
      match_score INTEGER DEFAULT 0,
      match_reasons TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    INSERT INTO jobs_new SELECT * FROM jobs;
    DROP TABLE jobs;
    ALTER TABLE jobs_new RENAME TO jobs;

    CREATE UNIQUE INDEX IF NOT EXISTS idx_job_source_url
      ON jobs(source, url);
    CREATE INDEX IF NOT EXISTS idx_job_created_at
      ON jobs(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_job_company
      ON jobs(company);

    COMMIT;
    PRAGMA foreign_keys=ON;
  `)
}

// Same in-place-constraint limitation as migrateSourceCheck: when the stored
// applications schema is missing a newer status, rebuild the table around the data.
function migrateStatusCheck(db: Database.Database) {
  const appsTable = db
    .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='applications'")
    .get() as { sql: string } | undefined

  if (!appsTable || APPLICATION_STATUSES.every((s) => appsTable.sql.includes(`'${s}'`))) {
    return
  }

  console.log("Migrating applications table to allow new statuses...")
  db.exec(`
    PRAGMA foreign_keys=OFF;
    BEGIN TRANSACTION;

    CREATE TABLE applications_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'saved'
        CHECK(status IN (${STATUS_CHECK})),
      applied_date INTEGER NOT NULL,
      notes TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
    );

    INSERT INTO applications_new SELECT * FROM applications;
    DROP TABLE applications;
    ALTER TABLE applications_new RENAME TO applications;

    COMMIT;
    PRAGMA foreign_keys=ON;
  `)
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
              COALESCE(
                (SELECT status FROM applications
                 WHERE job_id = j.id
                 ORDER BY updated_at DESC LIMIT 1),
                'unsaved'
              ) as application_status
       FROM jobs j
       WHERE j.created_at > ?
       ORDER BY j.match_score DESC, j.posted_date DESC
       LIMIT ? OFFSET ?`
    )
    .all(cutoffTime, limit, offset)
}
