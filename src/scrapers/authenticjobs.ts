import { chromium } from "playwright"
import { Job } from "../types"

export async function scrapeAuthenticJobs(
  jobTitle: string,
  locations: string[]
): Promise<Job[]> {
  const browser = await chromium.launch()
  const jobs: Job[] = []

  try {
    const context = await browser.newContext()
    const page = await context.newPage()

    // Authentic Jobs - design/tech focused
    const url = `https://www.authenticjobs.com/?category=design-ux&search=UX`

    console.log(`Scraping Authentic Jobs...`)
    await page.goto(url, { waitUntil: "networkidle", timeout: 15000 })
    await page.waitForTimeout(2000)

    // Scroll to load more
    for (let i = 0; i < 2; i++) {
      await page.evaluate(() => {
        window.scrollBy(0, window.innerHeight)
      })
      await page.waitForTimeout(1000)
    }

    // Extract job listings
    const jobCards = await page.$$eval(
      ".job",
      (elements: any[]) =>
        elements
          .map((el: any) => {
            try {
              const titleEl = el.querySelector(".job-title")
              const companyEl = el.querySelector(".company")
              const locationEl = el.querySelector(".location")
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
          .filter(
            (job: any) => job && job.title && job.company && job.url
          )
    )

    for (const card of jobCards) {
      if (!card) continue

      const job: Job = {
        title: card.title,
        company: card.company,
        location: card.location || "Check listing",
        url: card.url.startsWith("http")
          ? card.url
          : `https://www.authenticjobs.com${card.url}`,
        postedDate: new Date(),
        source: "authenticjobs",
      }

      jobs.push(job)
    }

    await context.close()
  } catch (error) {
    console.error(`Error scraping Authentic Jobs:`, error)
  } finally {
    await browser.close()
  }

  return jobs
}
