import axios from "axios"
import { Job } from "../types"

// Working Nomads exposes its latest listings (~40 jobs across all
// categories) as public JSON. We keep Design plus anything matching the
// configured job title.
const API_URL = "https://www.workingnomads.com/api/exposed_jobs/"

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  Accept: "application/json",
}

export async function scrapeWorkingNomads(
  jobTitle: string,
  locations: string[]
): Promise<Job[]> {
  console.log(`Scraping Working Nomads...`)
  const jobs: Job[] = []

  try {
    const { data } = await axios.get(API_URL, {
      headers: HEADERS,
      timeout: 15000,
    })

    const keywords = jobTitle
      .toLowerCase()
      .split(/[\/\s]+/)
      .filter((w) => w.length > 1)

    for (const item of data || []) {
      const isDesign = item.category_name === "Design"
      const titleMatches = keywords.some((word) =>
        (item.title || "").toLowerCase().includes(word)
      )
      if (!isDesign && !titleMatches) continue
      if (!item.title || !item.company_name || !item.url) continue

      // Every listing is remote; the location field narrows the region
      // (e.g. "USA", "Anywhere"). Keep "Remote" in the string so the
      // dashboard's location filter recognizes them.
      const region = (item.location || "").trim()
      const location =
        !region || /anywhere/i.test(region) ? "Remote" : `Remote, ${region}`

      const postedDate = new Date(item.pub_date)

      jobs.push({
        title: item.title,
        company: item.company_name,
        location,
        url: item.url,
        postedDate: isNaN(postedDate.getTime()) ? new Date() : postedDate,
        source: "workingnomads",
      })
    }
  } catch (error) {
    console.error(`Error scraping Working Nomads:`, error)
  }

  return jobs
}
