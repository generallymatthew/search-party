import { chromium } from "playwright"
import { Job } from "../types"

export async function scrapeDribbble(
  jobTitle: string,
  locations: string[]
): Promise<Job[]> {
  const browser = await chromium.launch()
  const jobs: Job[] = []

  try {
    const context = await browser.newContext()
    const page = await context.newPage()

    // Dribbble Jobs - search for design/UX roles
    const url = `https://dribbble.com/jobs?utf8=%E2%9C%93&location=anywhere&anywhere=true&experience=&commitment=&job_type=&keywords=UX`

    console.log(`Scraping Dribbble Jobs...`)
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
    const jobCards = await page.$$eval(
      ".jobs-list-item",
      (elements: any[]) =>
        elements
          .map((el: any) => {
            try {
              const titleEl = el.querySelector(".jobs-list-item-title")
              const companyEl = el.querySelector(".company-name")
              const locationEl = el.querySelector(".job-location")
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
        location: card.location || "Remote",
        url: card.url.startsWith("http")
          ? card.url
          : `https://dribbble.com${card.url}`,
        postedDate: new Date(),
        source: "dribbble",
      }

      jobs.push(job)
    }

    await context.close()
  } catch (error) {
    console.error(`Error scraping Dribbble:`, error)
  } finally {
    await browser.close()
  }

  return jobs
}
