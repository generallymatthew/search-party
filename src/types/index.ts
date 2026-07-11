export interface Job {
  title: string
  company: string
  location: string
  url: string
  salary?: {
    min?: number
    max?: number
    currency?: string
  }
  postedDate: Date
  source: "glassdoor" | "linkedin" | "indeed" | "angellist" | "weworkremotely" | "dribbble" | "remoteok" | "authenticjobs"
  jobLevel?: string
  description?: string
}

export interface JobRecord extends Job {
  id?: number
  createdAt: Date
  updatedAt: Date
}

export interface SearchFilters {
  locations: string[]
  jobTitle: string
  recencyDays?: number
}

export interface NotificationLog {
  id?: number
  type: "email" | "dashboard"
  jobId: number
  sentAt: Date
}

export interface ApplicationRecord {
  id?: number
  jobId: number
  status: "saved" | "applied" | "rejected" | "offer"
  appliedDate: Date
  notes?: string
}
