import axios from "axios"
import { Job } from "../types"

// Jobicy's public API (https://jobicy.com/jobs-rss-feed) serves remote
// listings filtered by industry slug. Both design-related industries are
// queried and deduped.
const API_URL = "https://jobicy.com/api/v2/remote-jobs"
const INDUSTRIES = ["design-multimedia", "web-app-design"]

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  Accept: "application/json",
}

export async function scrapeJobicy(
  jobTitle: string,
  locations: string[]
): Promise<Job[]> {
  console.log(`Scraping Jobicy...`)
  const jobs: Job[] = []

  for (const industry of INDUSTRIES) {
    try {
      const { data } = await axios.get(API_URL, {
        headers: HEADERS,
        timeout: 15000,
        params: { industry, count: 50 },
      })

      for (const item of data.jobs || []) {
        if (!item.jobTitle || !item.companyName || !item.url) continue

        // Every listing is remote; jobGeo narrows the region (e.g. "USA",
        // "Anywhere", "APAC"). Keep "Remote" in the string so the
        // dashboard's location filter recognizes them.
        const geo = (item.jobGeo || "").trim()
        const location =
          !geo || /anywhere/i.test(geo) ? "Remote" : `Remote, ${geo}`

        const postedDate = new Date(item.pubDate)

        jobs.push({
          title: item.jobTitle,
          company: item.companyName,
          location,
          url: item.url,
          postedDate: isNaN(postedDate.getTime()) ? new Date() : postedDate,
          source: "jobicy",
          jobLevel: item.jobLevel || undefined,
        })
      }
    } catch (error) {
      console.error(`Error scraping Jobicy (${industry}):`, error)
    }
  }

  const seen = new Set<string>()
  return jobs.filter((job) => {
    if (seen.has(job.url)) return false
    seen.add(job.url)
    return true
  })
}
