import { chromium } from "playwright"
import { Job } from "../types"

export async function scrapeRemoteOK(
  jobTitle: string,
  locations: string[]
): Promise<Job[]> {
  const browser = await chromium.launch()
  const jobs: Job[] = []

  try {
    const context = await browser.newContext()
    const page = await context.newPage()

    // RemoteOK focuses on remote jobs
    const url = `https://remoteok.com/?q=ux`

    console.log(`Scraping RemoteOK...`)
    await page.goto(url, { waitUntil: "networkidle", timeout: 15000 })
    await page.waitForTimeout(2000)

    // RemoteOK uses a table layout, extract from table rows
    const jobCards = await page.$$eval("table tbody tr", (elements: any[]) =>
      elements
        .map((el: any) => {
          try {
            const titleEl = el.querySelector("td:nth-child(2) a")
            const companyEl = el.querySelector("td:nth-child(1) img")
            const linkEl = el.querySelector("td:nth-child(2) a")

            const title = titleEl?.textContent?.trim() || ""
            const company = companyEl?.getAttribute("alt") || "Unknown"
            const url = linkEl?.href || ""

            if (!title || !url) return null

            return { title, company, url }
          } catch (e) {
            return null
          }
        })
        .filter(Boolean)
    )

    for (const card of jobCards) {
      if (!card) continue

      const job: Job = {
        title: card.title,
        company: card.company,
        location: "Remote",
        url: card.url.startsWith("http")
          ? card.url
          : `https://remoteok.com${card.url}`,
        postedDate: new Date(),
        source: "remoteok",
      }

      jobs.push(job)
    }

    await context.close()
  } catch (error) {
    console.error(`Error scraping RemoteOK:`, error)
  } finally {
    await browser.close()
  }

  return jobs
}
