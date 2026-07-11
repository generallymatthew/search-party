import { chromium } from "playwright"
import { Job } from "../types"

export async function scrapeWeWorkRemotely(
  jobTitle: string,
  locations: string[]
): Promise<Job[]> {
  const browser = await chromium.launch()
  const jobs: Job[] = []

  try {
    const context = await browser.newContext()
    const page = await context.newPage()

    // We Work Remotely focuses on remote, so we mainly search by job title
    const query = encodeURIComponent(jobTitle)
    const url = `https://weworkremotely.com/remote-jobs/search?term=${query}`

    console.log(`Scraping We Work Remotely...`)
    await page.goto(url, { waitUntil: "networkidle", timeout: 15000 })
    await page.waitForTimeout(2000)

    // Scroll to load more jobs
    for (let i = 0; i < 2; i++) {
      await page.evaluate(() => {
        window.scrollBy(0, window.innerHeight)
      })
      await page.waitForTimeout(1000)
    }

    // Extract job listings
    const jobCards = await page.$$eval(".job-listing", (elements: any[]) =>
      elements.map((el: any) => {
        try {
          const titleEl = el.querySelector("h2")
          const companyEl = el.querySelector(".company-name")
          const locationEl = el.querySelector(".region")
          const linkEl = el.querySelector("a")

          return {
            title: titleEl?.textContent?.trim() || "",
            company: companyEl?.textContent?.trim() || "",
            location: locationEl?.textContent?.trim() || "",
            url: linkEl?.href || "",
          }
        } catch (e) {
          return null
        }
      })
    )

    for (const card of jobCards) {
      if (!card || !card.title || !card.company || !card.url) continue

      const job: Job = {
        title: card.title,
        company: card.company,
        location: card.location || "Remote",
        url: card.url.startsWith("http")
          ? card.url
          : `https://weworkremotely.com${card.url}`,
        postedDate: new Date(),
        source: "weworkremotely",
      }

      jobs.push(job)
    }

    await context.close()
  } catch (error) {
    console.error(`Error scraping We Work Remotely:`, error)
  } finally {
    await browser.close()
  }

  return jobs
}
