import axios from "axios"
import * as cheerio from "cheerio"
import { Job } from "../types"

// WWR's HTML pages 403 scrapers, but the category RSS feeds are public.
// The design feed carries the latest ~25 postings.
const FEED_URL = "https://weworkremotely.com/categories/remote-design-jobs.rss"

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
}

export async function scrapeWeWorkRemotely(
  jobTitle: string,
  locations: string[]
): Promise<Job[]> {
  console.log(`Scraping We Work Remotely...`)
  const jobs: Job[] = []

  try {
    const { data: xml } = await axios.get(FEED_URL, {
      headers: HEADERS,
      timeout: 15000,
    })
    const $ = cheerio.load(xml, { xmlMode: true })

    $("item").each((_, el) => {
      try {
        const item = $(el)
        // Title is "Company: Job Title"
        const rawTitle = item.find("title").first().text().trim()
        const url = item.find("link").first().text().trim()
        if (!rawTitle || !url) return

        const sep = rawTitle.indexOf(": ")
        const company = sep > 0 ? rawTitle.slice(0, sep) : "See listing"
        const title = sep > 0 ? rawTitle.slice(sep + 2) : rawTitle

        // All WWR jobs are remote; keep "Remote" in the string so the
        // dashboard's location filter recognizes them
        const region = item.find("region").first().text().trim()
        const location =
          !region || region === "Anywhere in the World"
            ? "Remote"
            : `Remote, ${region}`

        const pubDate = new Date(item.find("pubDate").first().text().trim())

        jobs.push({
          title,
          company,
          location,
          url,
          postedDate: isNaN(pubDate.getTime()) ? new Date() : pubDate,
          source: "weworkremotely",
        })
      } catch (e) {
        // Skip malformed items
      }
    })
  } catch (error) {
    console.error(`Error scraping We Work Remotely:`, error)
  }

  return jobs
}
