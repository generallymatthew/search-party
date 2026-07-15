import axios from "axios"
import * as cheerio from "cheerio"
import { Job } from "../types"

// Listings only render on the jobs. subdomain — the www /jobs/ page serves
// an empty shell
const BASE_URL = "https://jobs.smashingmagazine.com"

export async function scrapeSmashingMagazine(
  jobTitle: string,
  locations: string[]
): Promise<Job[]> {
  const jobs: Job[] = []

  try {
    console.log(`Scraping Smashing Magazine Jobs...`)
    const { data: html } = await axios.get(`${BASE_URL}/jobs/`, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
      },
      timeout: 15000,
    })

    const $ = cheerio.load(html)
    const keywords = jobTitle
      .toLowerCase()
      .split(/[\/\s]+/)
      .filter((w) => w.length > 1)

    $("li.job").each((_, el) => {
      try {
        const card = $(el)
        const titleEl = card.find("a.job__title").first()
        const title = titleEl.text().trim()
        const href = titleEl.attr("href") || ""
        if (!title || !href) return

        if (!keywords.some((word) => title.toLowerCase().includes(word))) return

        // Company isn't listed on the card; the logo alt is the best hint
        const company =
          card.find("img").attr("alt")?.trim() || "See listing"
        const location =
          card.find(".job__location").text().trim() ||
          card.attr("data-location") ||
          "Not specified"

        // Post date is embedded in the URL slug: /jobs/YYYY-MM-DD-slug/
        const dateMatch = href.match(/(\d{4}-\d{2}-\d{2})/)
        const postedDate = dateMatch ? new Date(dateMatch[1]) : new Date()

        jobs.push({
          title,
          company,
          location,
          url: href.startsWith("http")
            ? href.split("#")[0]
            : `${BASE_URL}${href.split("#")[0]}`,
          postedDate,
          source: "smashingmagazine",
        })
      } catch (e) {
        // Skip malformed cards
      }
    })
  } catch (error) {
    console.error(`Error scraping Smashing Magazine Jobs:`, error)
  }

  return jobs
}
