import { chromium, Page } from "playwright"
import { Job } from "../types"

// LinkedIn job URLs carry per-scrape tracking params (refId, trackingId,
// position) and regional subdomains (au.linkedin.com), so the same posting
// looks new on every run. Reduce to the stable numeric job id so URL-based
// dedup works across runs.
export function canonicalizeLinkedInUrl(url: string): string {
  const match = url.match(/\/jobs\/view\/(?:[^/?#]*?-)?(\d+)/)
  return match
    ? `https://www.linkedin.com/jobs/view/${match[1]}`
    : url.split("?")[0]
}

export async function scrapeLinkedIn(
  jobTitle: string,
  locations: string[]
): Promise<Job[]> {
  const browser = await chromium.launch()
  const jobs: Job[] = []

  try {
    const context = await browser.newContext()
    const page = await context.newPage()

    await page.setViewportSize({ width: 1280, height: 720 })

    for (const location of locations) {
      try {
        const query = encodeURIComponent(jobTitle)
        const locationQuery = encodeURIComponent(location)

        const url = `https://www.linkedin.com/jobs/search/?keywords=${query}&location=${locationQuery}`

        console.log(`Scraping LinkedIn: ${location}...`)
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 })

        // LinkedIn heavily uses JavaScript, scroll to load more
        await page.waitForTimeout(2000)
        for (let i = 0; i < 3; i++) {
          await page.evaluate(() => {
            const container = document.querySelector(
              ".scaffold-layout__list"
            ) as HTMLElement
            if (container) container.scrollTop += 500
          })
          await page.waitForTimeout(1000)
        }

        // Extract job listings
        const jobCards = await page.$$eval(".base-card", (elements: any[]) =>
          elements.map((el: any) => {
            const titleEl = el.querySelector(".base-search-card__title")
            const companyEl = el.querySelector(".base-search-card__subtitle")
            const locationEl = el.querySelector(".job-search-card__location")
            const linkEl = el.querySelector("a.base-card__full-link")

            return {
              title: titleEl?.textContent?.trim() || "",
              company: companyEl?.textContent?.trim() || "",
              location: locationEl?.textContent?.trim() || "",
              url: linkEl?.href || "",
            }
          })
        )

        for (const card of jobCards) {
          if (!card.title || !card.company || !card.url) continue

          const job: Job = {
            title: card.title,
            company: card.company,
            location: card.location || location,
            url: canonicalizeLinkedInUrl(card.url),
            postedDate: new Date(),
            source: "linkedin",
          }

          jobs.push(job)
        }

        await new Promise((r) => setTimeout(r, 2000))
      } catch (error) {
        console.error(`Error scraping LinkedIn for ${location}:`, error)
      }
    }

    await context.close()
  } finally {
    await browser.close()
  }

  return jobs
}
