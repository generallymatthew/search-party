import axios from "axios"
import * as cheerio from "cheerio"
import { Job } from "../types"

const BASE_URL = "https://uiuxjobsboard.com"

// Category pages the board exposes; used when the search title maps cleanly
const CATEGORIES = [
  "product-designer",
  "ux-designer",
  "ui-designer",
  "ui-ux-designer",
  "ux-researcher",
  "ux-writer",
]

function categoryForTitle(jobTitle: string): string | null {
  const slug = jobTitle
    .trim()
    .toLowerCase()
    .replace(/[\/\s]+/g, "-")
  return CATEGORIES.includes(slug) ? slug : null
}

// Timestamps are relative, e.g. "7h", "1d", "2w"
function parsePostedDate(text: string): Date {
  const match = text.trim().match(/^(\d+)\s*(h|d|w)/i)
  if (!match) return new Date()

  const value = parseInt(match[1], 10)
  const hours = { h: 1, d: 24, w: 24 * 7 }[match[2].toLowerCase() as "h" | "d" | "w"]
  return new Date(Date.now() - value * hours * 60 * 60 * 1000)
}

// e.g. "$104,000 - $166,400" or "$95,000"
function parseSalary(text: string): Job["salary"] | undefined {
  const numbers = (text.match(/\$[\d,]+/g) || []).map((n) =>
    parseInt(n.replace(/[$,]/g, ""), 10)
  )
  if (numbers.length === 0) return undefined
  return {
    min: numbers[0],
    max: numbers[1] ?? numbers[0],
    currency: "USD",
  }
}

export async function scrapeUIUXJobsBoard(
  jobTitle: string,
  locations: string[]
): Promise<Job[]> {
  const jobs: Job[] = []

  try {
    // Prefer the matching category page; fall back to the homepage feed
    const category = categoryForTitle(jobTitle)
    const url = category ? `${BASE_URL}/design-jobs/${category}` : BASE_URL

    console.log(`Scraping UI/UX Jobs Board...`)
    const { data: html } = await axios.get(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
      },
      timeout: 15000,
    })

    const $ = cheerio.load(html)

    $('h3 a[href^="/job/"]').each((_, el) => {
      try {
        const anchor = $(el)
        const title = anchor.find("span.text-primaryColor").text().trim()
        const company = anchor
          .children("span")
          .first()
          .text()
          .replace(/is hiring\s*$/i, "")
          .trim()

        if (!title || !company) return

        // Card layout: <card><div><h3/><type span><salary span></div><locations div><time div></card>
        const card = anchor.closest("h3").parent().parent()

        let salary: Job["salary"] | undefined
        anchor
          .closest("h3")
          .siblings("span")
          .each((_i, span) => {
            const text = $(span).text()
            if (text.includes("$")) salary = parseSalary(text)
          })

        const location =
          card
            .find('a[href^="/design-jobs/"]')
            .map((_i, a) => $(a).text().trim())
            .get()
            .join(", ") || "Not specified"

        const postedDate = parsePostedDate(card.children("div").last().text())

        const href = anchor.attr("href") || ""
        jobs.push({
          title,
          company,
          location,
          url: href.startsWith("http") ? href : `${BASE_URL}${href}`,
          salary,
          postedDate,
          source: "uiuxjobsboard",
        })
      } catch (e) {
        // Skip malformed cards
      }
    })

    // Homepage feed is unfiltered, so match against the search title
    if (!category) {
      const keywords = jobTitle
        .toLowerCase()
        .split(/[\/\s]+/)
        .filter((w) => w.length > 1)
      return jobs.filter((job) =>
        keywords.some((word) => job.title.toLowerCase().includes(word))
      )
    }
  } catch (error) {
    console.error(`Error scraping UI/UX Jobs Board:`, error)
  }

  return jobs
}
