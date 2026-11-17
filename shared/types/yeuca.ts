export type YeucaPostKind = 'news' | 'resource'
export type YeucaPostStatus = 'draft' | 'published' | 'archived'
export type YeucaProjectStatus = 'active' | 'maintaining' | 'planning'

export interface YeucaDepartment {
  id: string
  code: string
  name: string
  lead: string
  isFeatured: boolean
  acceptingRecruit: boolean
  summary: string
  focusList: string[]
  tools: string[]
  recentTopic: string
  recruitDesc: string
}

export interface YeucaGalleryItem {
  id: string
  title: string
  caption: string
  imageUrl: string
}

export interface YeucaCompetitionItem {
  name: string
  track: string
  dept: string
  site?: string
  href?: string
}

export interface YeucaFaqItem {
  q: string
  a: string
}

export interface YeucaSiteExtras {
  heroImageUrl?: string
  gallery?: YeucaGalleryItem[]
  competitions?: YeucaCompetitionItem[]
  faqs?: YeucaFaqItem[]
  flagshipNote?: string
}

export interface YeucaSiteSettings {
  id: string
  contentId: string | null
  campus: string
  tagline: string
  intro: string
  recruitNote: string
  contactNote: string
  groupQrUrl: string
  departments: YeucaDepartment[]
  extras: YeucaSiteExtras
  updatedAt: number
}

export interface YeucaPostItem {
  id: string
  slug: string
  kind: YeucaPostKind
  deptName: string
  category: string
  title: string
  summary: string
  body: string
  tags: string[]
  pinned: boolean
  status: YeucaPostStatus
  publishedAt: string | null
  updatedAt: string
}

export interface YeucaProjectItem {
  id: string
  title: string
  deptName: string
  track: string
  status: YeucaProjectStatus
  summary: string
  highlights: string[]
  stack: string[]
  previewImage: string
  repoUrl: string
  demoUrl: string
  sortOrder: number
  isPublished: boolean
  updatedAt: string
}

export interface YeucaPublicActivityItem {
  id: string
  slug: string
  title: string
  summary: string
  body: string
  startsAt: string
  endsAt: string | null
  placeName: string
  room: string | null
  photos: string[]
}

export interface YeucaRecruitPublicStatus {
  open: boolean
  title: string
  slogan: string
  intro: string
  fields: Array<{
    key: string
    label: string
    type: string
    required: boolean
    options?: string[]
    optionDetails?: Record<string, string>
    placeholder?: string
  }>
}

export interface YeucaPublicSnapshot {
  settings: {
    campus: string
    tagline: string
    intro: string
    recruitNote: string
    contactNote: string
    groupQrUrl: string
    departments: YeucaDepartment[]
    extras: YeucaSiteExtras
  }
  news: YeucaPostItem[]
  resources: YeucaPostItem[]
  projects: YeucaProjectItem[]
  activities: YeucaPublicActivityItem[]
  recruit: YeucaRecruitPublicStatus
}

export interface YeucaAdminOverviewPayload {
  settings: YeucaSiteSettings
  posts: YeucaPostItem[]
  projects: YeucaProjectItem[]
  stats: {
    publishedNews: number
    publishedResources: number
    publishedProjects: number
    publishedActivities: number
    recruitOpen: boolean
    recruitSubmissions: number
  }
}
