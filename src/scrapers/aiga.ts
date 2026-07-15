import { chromium } from "playwright"
import { Job } from "../types"

// AIGA Design Careers sits behind Cloudflare, so plain HTTP requests are
// challenged — load the search page in a browser and capture the JSON the
// page fetches from its own /api/v1/jobs endpoint.
const BASE_URL = "https://designcareers.aiga.org"

// e.g. "$80,000 Per Year" or "$70,000 - $90,000"
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

export async function scrapeAIGA(
  jobTitle: string,
  locations: string[]
): Promise<Job[]> {
  const browser = await chromium.launch()
  const jobs: Job[] = []

  try {
    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    })
    const page = await context.newPage()

    console.log(`Scraping AIGA Design Careers...`)

    const responsePromise = page.waitForResponse(
      (r) => r.url().includes("/api/v1/jobs?") && r.status() === 200,
      { timeout: 25000 }
    )
    await page.goto(
      `${BASE_URL}/jobs?keywords=${encodeURIComponent(jobTitle)}&sort=date`,
      { waitUntil: "domcontentloaded", timeout: 30000 }
    )
    const response = await responsePromise
    const json = await response.json()

    for (const item of json.data || []) {
      if (!item.title || !item.url) continue

      const salaryBlock = (item.customBlockList || []).find(
        (b: any) => b.path === "approx_salary_text" && b.value
      )
      const postedDate = new Date(item.posted_date)

      jobs.push({
        title: item.title,
        company: item.company?.name || "See listing",
        location: item.location || "Not specified",
        url: item.url,
        salary: salaryBlock ? parseSalary(salaryBlock.value) : undefined,
        postedDate: isNaN(postedDate.getTime()) ? new Date() : postedDate,
        source: "aiga",
      })
    }

    await context.close()
  } catch (error) {
    console.error(`Error scraping AIGA Design Careers:`, error)
  } finally {
    await browser.close()
  }

  return jobs
}
