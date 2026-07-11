import { Job } from "../types"

export interface ResumeProfile {
  yearsExperience: number
  currentRole: string
  skills: string[]
  industries: string[]
  locations: string[]
  companies: string[]
  seniority: "junior" | "mid" | "senior" | "principal"
  expertise: string[]
  rawText: string
}

export function parseResume(resumeText: string): ResumeProfile {
  const text = resumeText.toLowerCase()

  // Extract years of experience
  const yearsMatch = resumeText.match(
    /(\d+)\+?\s*years?.*experience|experience.*?(\d+)\+?\s*years?/i
  )
  const yearsExperience = yearsMatch
    ? parseInt(yearsMatch[1] || yearsMatch[2])
    : 5

  // Detect seniority level
  let seniority: "junior" | "mid" | "senior" | "principal" = "mid"
  if (
    text.includes("principal") ||
    text.includes("director") ||
    text.includes("vp ") ||
    text.includes("head of")
  ) {
    seniority = "principal"
  } else if (
    text.includes("senior") ||
    yearsExperience >= 10
  ) {
    seniority = "senior"
  } else if (yearsExperience < 5) {
    seniority = "junior"
  }

  // Extract skills
  const skillKeywords = [
    "ux",
    "ui",
    "design",
    "research",
    "strategy",
    "product",
    "prototyping",
    "figma",
    "sketch",
    "adobe xd",
    "html",
    "css",
    "javascript",
    "react",
    "vue",
    "typescript",
    "user testing",
    "user research",
    "analytics",
    "data-driven",
    "design systems",
    "accessibility",
    "a11y",
    "wcag",
    "ai",
    "machine learning",
    "agentic",
    "workflow",
    "optimization",
    "onboarding",
    "user journey",
    "wireframing",
    "mobile",
    "responsive",
    "interaction design",
    "visual design",
  ]

  const skills = skillKeywords.filter((skill) => text.includes(skill))

  // Extract industries
  const industriyKeywords = [
    "fintech",
    "finance",
    "banking",
    "investing",
    "insurance",
    "healthcare",
    "saas",
    "b2b",
    "b2c",
    "e-commerce",
    "education",
    "enterprise",
    "startup",
    "social",
    "messaging",
    "communications",
    "marketing",
    "advertising",
    "award",
    "compliance",
  ]

  const industries = industriyKeywords.filter((ind) => text.includes(ind))

  // Extract locations mentioned
  const locationKeywords = [
    "raleigh",
    "durham",
    "chapel hill",
    "nc",
    "north carolina",
    "remote",
    "charleston",
    "san francisco",
    "london",
  ]

  const locations = locationKeywords.filter((loc) => text.includes(loc))

  // Extract company names (mentioned in resume)
  const companies = [
    "blackbaud",
    "fidelity",
    "republic wireless",
    "icontact",
  ].filter((co) => text.includes(co.toLowerCase()))

  // Extract expertise areas
  const expertise = [
    "churn reduction",
    "workflow optimization",
    "user onboarding",
    "product strategy",
    "team leadership",
    "cross-functional collaboration",
    "data-driven design",
    "ai-partnered design",
    "design systems",
    "accessibility",
  ].filter((exp) => text.includes(exp))

  // Detect current role
  const roleMatch = resumeText.match(/([A-Z][a-z]+ (?:UX|UI|Product|Design)[^,]*)/i)
  const currentRole = roleMatch ? roleMatch[1] : "UX Designer"

  return {
    yearsExperience,
    currentRole,
    skills,
    industries,
    locations,
    companies,
    seniority,
    expertise,
    rawText: resumeText,
  }
}

export function scoreJobMatch(
  job: Job,
  profile: ResumeProfile
): { score: number; reasons: string[] } {
  let score = 50 // Base score
  const reasons: string[] = []

  // Skill matching
  const jobTextLower = (
    job.title +
    " " +
    job.company +
    " " +
    (job.description || "")
  ).toLowerCase()

  const matchedSkills = profile.skills.filter((skill) =>
    jobTextLower.includes(skill)
  )

  const skillBonus = Math.min(matchedSkills.length * 3, 20)
  score += skillBonus
  if (matchedSkills.length > 0) {
    reasons.push(
      `Matches ${matchedSkills.length} of your skills: ${matchedSkills.slice(0, 3).join(", ")}`
    )
  }

  // Seniority alignment
  const isSeniorJob =
    jobTextLower.includes("senior") ||
    jobTextLower.includes("lead") ||
    jobTextLower.includes("staff") ||
    jobTextLower.includes("principal")

  if (profile.seniority === "senior" && isSeniorJob) {
    score += 10
    reasons.push("Perfect seniority match (Senior role)")
  } else if (profile.seniority === "senior" && !isSeniorJob) {
    score -= 5
    reasons.push("Role is below your seniority level")
  }

  // Location preference
  const jobLocation = job.location.toLowerCase()
  if (
    jobLocation.includes("remote") ||
    jobLocation.includes("raleigh") ||
    jobLocation.includes("durham") ||
    jobLocation.includes("chapel hill") ||
    jobLocation.includes("nc")
  ) {
    score += 10
    reasons.push(`Location match: ${job.location}`)
  }

  // Industry/domain expertise
  if (
    jobTextLower.includes("strategy") ||
    jobTextLower.includes("product") ||
    jobTextLower.includes("workflow")
  ) {
    score += 8
    reasons.push("Aligns with your product strategy expertise")
  }

  if (jobTextLower.includes("ai") || jobTextLower.includes("automation")) {
    score += 5
    reasons.push("Involves AI—your cutting-edge expertise")
  }

  if (
    jobTextLower.includes("user research") ||
    jobTextLower.includes("analytics") ||
    jobTextLower.includes("data-driven")
  ) {
    score += 5
    reasons.push("Values data-driven approach like you")
  }

  // Design system expertise
  if (
    jobTextLower.includes("design system") ||
    jobTextLower.includes("component")
  ) {
    score += 5
    reasons.push("Design systems—your forte")
  }

  // Penalize if looking for junior/entry level with your experience
  if (jobTextLower.includes("entry") || jobTextLower.includes("junior")) {
    score -= 15
    reasons.push("Entry-level role, you're overqualified")
  }

  // Cap score at 100
  score = Math.min(100, Math.max(0, score))

  return {
    score: Math.round(score),
    reasons: reasons.slice(0, 3), // Top 3 reasons
  }
}
