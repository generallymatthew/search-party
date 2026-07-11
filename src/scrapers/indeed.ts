import { chromium, Page } from "playwright"
import { Job } from "../types"

export async function scrapeIndeed(
  jobTitle: string,
  locations: string[]
): Promise<Job[]> {
  const browser = await chromium.launch()
  const jobs: Job[] = []

  try {
    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    })
    const page = await context.newPage()

    for (const location of locations) {
      try {
        const query = encodeURIComponent(jobTitle)
        const locationQuery = encodeURIComponent(location)

        const url = `https://www.indeed.com/jobs?q=${query}&l=${locationQuery}&sort=date`

        console.log(`Scraping Indeed: ${location}...`)
        await page.goto(url, { waitUntil: "networkidle", timeout: 15000 })
        await page.waitForTimeout(2000) // Delay to avoid bot detection

        // Extract job listings from Indeed cards
        const jobCards = await page.$$eval(
          "[data-tn-component-context-key]",
          (elements: any[]) =>
            elements
              .map((el: any) => {
                try {
                  const titleEl = el.querySelector("h2 a")
                  const companyEl = el.querySelector("[data-company-name]")
                  const locationEl = el.querySelector(
                    "[data-job-location-name]"
                  )
                  const salaryEl = el.querySelector("[data-salary-snippet]")
                  const linkEl = el.querySelector("h2 a") as any

                  if (!titleEl || !companyEl) return null

                  return {
                    title: titleEl.textContent?.trim() || "",
                    company: companyEl.textContent?.trim() || "",
                    location: locationEl?.textContent?.trim() || "",
                    salary: salaryEl?.textContent?.trim() || "",
                    url: linkEl?.href || "",
                  }
                } catch (e) {
                  return null
                }
              })
              .filter(Boolean)
        )

        for (const card of jobCards) {
          if (!card || !card.title || !card.company) continue

          const job: Job = {
            title: card.title,
            company: card.company,
            location: card.location || location,
            url: card.url.startsWith("http")
              ? card.url
              : `https://www.indeed.com${card.url}`,
            postedDate: new Date(),
            source: "indeed",
            salary: parseSalary(card.salary),
          }

          jobs.push(job)
        }

        // Random delay between requests to avoid rate limiting
        await page.waitForTimeout(Math.random() * 2000 + 1000)
      } catch (error) {
        console.error(`Error scraping Indeed for ${location}:`, error)
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

  // Try to match various Indeed salary formats
  const match = salaryStr.match(/\$(\d+(?:,\d+)*)(?:\s*-\s*\$(\d+(?:,\d+)*))?/i)
  if (match) {
    const min = parseInt(match[1].replace(/,/g, ""))
    const max = match[2] ? parseInt(match[2].replace(/,/g, "")) : min

    // Indeed shows annual salary, so convert from daily/hourly if needed
    if (salaryStr.includes("/hr") || salaryStr.includes("an hour")) {
      return {
        min: Math.round(min * 2000), // 2000 hours per year
        max: Math.round(max * 2000),
        currency: "USD",
      }
    }

    return {
      min,
      max,
      currency: "USD",
    }
  }

  return undefined
}
