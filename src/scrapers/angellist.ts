import { chromium } from "playwright"
import { Job } from "../types"

export async function scrapeAngelList(
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

    // AngelList API approach (no bot detection issues)
    const locationMap: { [key: string]: string } = {
      remote: "remote",
      "raleigh nc": "raleigh",
      "durham nc": "durham",
      "chapel hill nc": "chapel-hill",
    }

    for (const location of locations) {
      try {
        const locationKey = location.toLowerCase()
        const locationParam = locationMap[locationKey] || location

        const url = `https://wellfound.com/jobs?query=${encodeURIComponent(jobTitle)}&locations=${encodeURIComponent(locationParam)}`

        console.log(`Scraping AngelList/Wellfound: ${location}...`)
        await page.goto(url, { waitUntil: "networkidle", timeout: 15000 })
        await page.waitForTimeout(2000)

        // Scroll to load more jobs
        for (let i = 0; i < 3; i++) {
          await page.evaluate(() => {
            window.scrollBy(0, window.innerHeight)
          })
          await page.waitForTimeout(1000)
        }

        // Extract job cards - Wellfound uses React, look for job containers
        const jobCards = await page.$$eval(
          "a[href*='/jobs/']",
          (elements: any[]) => {
            const seen = new Set<string>()
            return elements
              .map((el: any) => {
                const href = el.getAttribute("href")
                if (!href || seen.has(href)) return null
                seen.add(href)

                // Navigate up to find the job card
                let card = el
                for (let i = 0; i < 5; i++) {
                  card = card.parentElement
                  if (!card) break
                }

                const titleEl = el.querySelector("h")
                const title = el.textContent?.split("\n")[0] || ""

                return {
                  title: title.trim(),
                  url: href.startsWith("http")
                    ? href
                    : `https://wellfound.com${href}`,
                }
              })
              .filter(Boolean)
              .slice(0, 50)
          }
        )

        // Fetch details from each job page to get company/location
        for (const card of jobCards.slice(0, 20)) {
          if (!card || !card.url) continue

          try {
            const jobPage = await context.newPage()
            await jobPage.goto(card.url, {
              waitUntil: "domcontentloaded",
              timeout: 10000,
            })

            const details = await jobPage.evaluate(() => {
              const text = document.body.innerText
              const titleMatch = text.split("\n")[0]
              const companyMatch = text.match(/Company:\s*([^\n]+)/i)
              const locationMatch = text.match(
                /Location:\s*([^\n]+)/i
              )
              const salaryMatch = text.match(
                /\$(\d+(?:,\d+)*)?\s*-\s*\$(\d+(?:,\d+)*)?/
              )

              return {
                title: titleMatch || "",
                company: companyMatch?.[1] || "",
                location: locationMatch?.[1] || "",
                salary: salaryMatch?.[0] || "",
              }
            })

            if (details.title && details.company) {
              const job: Job = {
                title: details.title,
                company: details.company,
                location: details.location || location,
                url: card.url,
                postedDate: new Date(),
                source: "angellist",
                salary: parseSalary(details.salary),
              }

              jobs.push(job)
            }

            await jobPage.close()
          } catch (e) {
            // Skip if job page fails
          }
        }

        await page.waitForTimeout(1500)
      } catch (error) {
        console.error(`Error scraping AngelList for ${location}:`, error)
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

  const match = salaryStr.match(/\$(\d+(?:,\d+)*)(?:\s*-\s*\$(\d+(?:,\d+)*))?/i)
  if (match) {
    return {
      min: parseInt(match[1].replace(/,/g, "")),
      max: match[2] ? parseInt(match[2].replace(/,/g, "")) : undefined,
      currency: "USD",
    }
  }

  return undefined
}
