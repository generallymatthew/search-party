import axios from "axios"
import * as cheerio from "cheerio"
import { Job } from "../types"

const BASE_URL = "https://remoteleaf.com"

// Remote Leaf's curated feed is paid, but its category pages are public
function categoriesForTitle(jobTitle: string): string[] {
  const title = jobTitle.toLowerCase()
  if (title.includes("research")) return ["ux-researcher"]
  if (title.includes("graphic")) return ["graphic-designer"]
  if (title.includes("web design")) return ["web-designer"]
  if (title.includes("lead") || title.includes("head"))
    return ["design-lead", "product-designer-uiux"]
  return ["product-designer-uiux", "ux-researcher"]
}

export async function scrapeRemoteLeaf(
  jobTitle: string,
  locations: string[]
): Promise<Job[]> {
  const jobs: Job[] = []

  try {
    console.log(`Scraping Remote Leaf...`)

    for (const category of categoriesForTitle(jobTitle)) {
      const { data: html } = await axios.get(`${BASE_URL}/jobs/${category}/`, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        },
        timeout: 15000,
      })

      const $ = cheerio.load(html)

      // Job links look like /company/<company>/<job-slug>/; the company's own
      // page is /company/<company>/
      $('h3 a[href^="/company/"]').each((_, el) => {
        try {
          const anchor = $(el)
          const href = anchor.attr("href") || ""
          if (!/^\/company\/[^/]+\/.+/.test(href)) return

          const title = anchor.text().trim()
          if (!title) return

          // Climb to the card container: the ancestor that also holds the
          // company link and location tags
          let card = anchor.closest("h3").parent()
          for (let i = 0; i < 6 && card.length; i++) {
            if (card.find('a[href^="/jobs/in-"], a[href^="/company/"]').length > 1) break
            card = card.parent()
          }

          const company =
            card
              .find("a")
              .filter((_i, a) => /^\/company\/[^/]+\/$/.test($(a).attr("href") || ""))
              .first()
              .text()
              .trim() || "See listing"

          const location =
            card
              .find('a[href^="/jobs/in-"]')
              .map((_i, a) => $(a).text().trim())
              .get()
              .join(", ") || "Remote"

          jobs.push({
            title,
            company,
            location,
            url: `${BASE_URL}${href}`,
            postedDate: new Date(),
            source: "remoteleaf",
          })
        } catch (e) {
          // Skip malformed cards
        }
      })
    }

    // Categories can overlap; dedupe by URL
    const seen = new Set<string>()
    return jobs.filter((job) => {
      if (seen.has(job.url)) return false
      seen.add(job.url)
      return true
    })
  } catch (error) {
    console.error(`Error scraping Remote Leaf:`, error)
  }

  return jobs
}
