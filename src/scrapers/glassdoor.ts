import { chromium, Page } from "playwright"
import { Job } from "../types"

export async function scrapeGlassdoor(
  jobTitle: string,
  locations: string[]
): Promise<Job[]> {
  const browser = await chromium.launch()
  const jobs: Job[] = []

  try {
    const context = await browser.newContext()
    const page = await context.newPage()

    // Glassdoor blocks aggressively, so we add delays
    await page.setViewportSize({ width: 1280, height: 720 })

    for (const location of locations) {
      try {
        const query = encodeURIComponent(jobTitle)
        const locationQuery = encodeURIComponent(location)

        const url = `https://www.glassdoor.com/Job/jobs.htm?keyword=${query}&location=${locationQuery}`

        console.log(`Scraping Glassdoor: ${location}...`)
        await page.goto(url, { waitUntil: "networkidle", timeout: 15000 })

        // Wait for job cards to load
        await page.waitForSelector("[data-id]", { timeout: 10000 }).catch(() => {
          console.log("Job cards not found, trying alternative selector")
        })

        // Extract job listings
        const jobCards = await page.$$eval(
          "[data-id]",
          (elements: any[]) =>
            elements.map((el: any) => {
              const titleEl = el.querySelector("[data-test='jobTitle']")
              const companyEl = el.querySelector("[data-test='employerName']")
              const locationEl = el.querySelector("[data-test='job-location']")
              const salaryEl = el.querySelector("[data-test='salaryEstimate']")

              return {
                title: titleEl?.textContent?.trim() || "",
                company: companyEl?.textContent?.trim() || "",
                location: locationEl?.textContent?.trim() || "",
                salary: salaryEl?.textContent?.trim() || "",
                url: el.getAttribute("href") || "",
              }
            })
        )

        for (const card of jobCards) {
          if (!card.title || !card.company) continue

          const job: Job = {
            title: card.title,
            company: card.company,
            location: card.location || location,
            url: card.url.startsWith("http")
              ? card.url
              : `https://www.glassdoor.com${card.url}`,
            postedDate: new Date(),
            source: "glassdoor",
            salary: parseSalary(card.salary),
          }

          jobs.push(job)
        }

        // Delay between location requests
        await new Promise((r) => setTimeout(r, 2000))
      } catch (error) {
        console.error(`Error scraping Glassdoor for ${location}:`, error)
      }
    }

    await context.close()
  } finally {
    await browser.close()
  }

  return jobs
}

function parseSalary(
  salaryStr: string
): { min?: number; max?: number; currency?: string } | undefined {
  if (!salaryStr) return undefined

  const match = salaryStr.match(/\$(\d+)K?\s*-\s*\$(\d+)K?/i)
  if (match) {
    return {
      min: parseInt(match[1]) * 1000,
      max: parseInt(match[2]) * 1000,
      currency: "USD",
    }
  }

  return undefined
}
