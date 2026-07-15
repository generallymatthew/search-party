import axios from "axios"
import * as cheerio from "cheerio"
import { Job } from "../types"

// Remotive paywalls most listings, but two surfaces are public: the tiles
// server-rendered on the design category page, and the official API
// (https://remotive.com/api/remote-jobs), which exposes the latest ~40 jobs
// across all categories. We scrape both and dedupe.
const BASE_URL = "https://remotive.com"

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
}

// Salary is free text, e.g. "$30k - $100k", "$104,000 - $166,400"
function parseSalary(text: string): Job["salary"] | undefined {
  if (!text) return undefined
  const numbers = [...text.matchAll(/(\d[\d,]*(?:\.\d+)?)\s*(k)?/gi)]
    .map((m) => {
      let n = parseFloat(m[1].replace(/,/g, ""))
      if (m[2]) n *= 1000
      return n
    })
    .filter((n) => n >= 10000)
  if (numbers.length === 0) return undefined
  return {
    min: Math.min(...numbers),
    max: Math.max(...numbers),
    currency: "USD",
  }
}

// e.g. "3wks ago", "2d ago", "5hr ago", "1mo ago"
function parseRelativeDate(text: string): Date {
  const match = text.trim().match(/(\d+)\s*(h|hr|d|day|w|wk|mo)/i)
  if (!match) return new Date()
  const value = parseInt(match[1], 10)
  const unit = match[2].toLowerCase()
  const hours = unit.startsWith("h")
    ? 1
    : unit.startsWith("d")
      ? 24
      : unit.startsWith("w")
        ? 24 * 7
        : 24 * 30
  return new Date(Date.now() - value * hours * 60 * 60 * 1000)
}

async function scrapeDesignPage(): Promise<Job[]> {
  const jobs: Job[] = []
  const { data: html } = await axios.get(`${BASE_URL}/remote-jobs/design`, {
    headers: HEADERS,
    timeout: 15000,
  })
  const $ = cheerio.load(html)

  $("li[data-joburl]").each((_, el) => {
    try {
      const tile = $(el)
      const url = tile.attr("data-joburl") || ""
      const title = tile.find(".job-tile-title span.remotive-bold").first().text().trim()
      if (!url || !title) return

      // Company is the last span in the title block (the mobile variant)
      const company = tile.find(".job-tile-title span").last().text().trim()

      let salary: Job["salary"] | undefined
      tile.find(".tag-small").each((_i, tag) => {
        const text = $(tag).text()
        if (text.includes("$")) salary = parseSalary(text)
      })

      const location =
        tile.find('a[href*="location="]').first().text().trim() || "Remote"
      const postedDate = parseRelativeDate(
        tile.find(".job-tile-apply-hide").first().text()
      )

      jobs.push({
        title,
        company: company || "See listing",
        location,
        url,
        salary,
        postedDate,
        source: "remotive",
      })
    } catch (e) {
      // Skip malformed tiles
    }
  })

  return jobs
}

async function scrapeApi(jobTitle: string): Promise<Job[]> {
  const jobs: Job[] = []
  const { data } = await axios.get(`${BASE_URL}/api/remote-jobs`, {
    headers: { ...HEADERS, Accept: "application/json" },
    timeout: 15000,
  })

  const keywords = jobTitle
    .toLowerCase()
    .split(/[\/\s]+/)
    .filter((w) => w.length > 1)

  for (const item of data.jobs || []) {
    const isDesign = item.category === "Design"
    const titleMatches = keywords.some((word) =>
      (item.title || "").toLowerCase().includes(word)
    )
    if (!isDesign && !titleMatches) continue
    if (!item.title || !item.company_name || !item.url) continue

    const postedDate = new Date(item.publication_date)
    jobs.push({
      title: item.title,
      company: item.company_name,
      location: item.candidate_required_location || "Remote",
      url: item.url,
      salary: parseSalary(item.salary),
      postedDate: isNaN(postedDate.getTime()) ? new Date() : postedDate,
      source: "remotive",
    })
  }

  return jobs
}

export async function scrapeRemotive(
  jobTitle: string,
  locations: string[]
): Promise<Job[]> {
  console.log(`Scraping Remotive...`)
  const jobs: Job[] = []

  for (const [name, fn] of [
    ["design page", () => scrapeDesignPage()],
    ["API", () => scrapeApi(jobTitle)],
  ] as const) {
    try {
      jobs.push(...(await fn()))
    } catch (error) {
      console.error(`Error scraping Remotive (${name}):`, error)
    }
  }

  const seen = new Set<string>()
  return jobs.filter((job) => {
    if (seen.has(job.url)) return false
    seen.add(job.url)
    return true
  })
}
