import { z } from 'zod'

export const yeucaDepartmentSchema = z.object({
  id: z.string().trim().min(1).max(64),
  code: z.string().trim().min(1).max(32),
  name: z.string().trim().min(1).max(40),
  lead: z.string().trim().max(40).default(''),
  isFeatured: z.boolean().default(false),
  acceptingRecruit: z.boolean().default(true),
  summary: z.string().trim().min(1).max(400),
  focusList: z.array(z.string().trim().min(1).max(120)).max(8).default([]),
  tools: z.array(z.string().trim().min(1).max(40)).max(12).default([]),
  recentTopic: z.string().trim().max(120).default(''),
  recruitDesc: z.string().trim().max(260).default('')
})

export const yeucaGalleryItemSchema = z.object({
  id: z.string().trim().min(1).max(64),
  title: z.string().trim().min(1).max(80),
  caption: z.string().trim().max(240).default(''),
  imageUrl: z.string().trim().min(1).max(300)
})

export const yeucaCompetitionItemSchema = z.object({
  name: z.string().trim().min(1).max(120),
  track: z.string().trim().min(1).max(40),
  dept: z.string().trim().min(1).max(80),
  site: z.string().trim().max(80).default(''),
  href: z.string().trim().max(300).default('')
})

export const yeucaFaqItemSchema = z.object({
  q: z.string().trim().min(1).max(200),
  a: z.string().trim().min(1).max(1200)
})

export const yeucaSiteExtrasSchema = z.object({
  heroImageUrl: z.string().trim().max(300).optional(),
  gallery: z.array(yeucaGalleryItemSchema).max(24).optional(),
  competitions: z.array(yeucaCompetitionItemSchema).max(24).optional(),
  faqs: z.array(yeucaFaqItemSchema).max(24).optional(),
  flagshipNote: z.string().trim().max(400).optional()
})

export const updateYeucaSettingsSchema = z.object({
  campus: z.string().trim().min(1).max(80),
  tagline: z.string().trim().min(1).max(160),
  intro: z.string().trim().min(1).max(800),
  recruitNote: z.string().trim().max(400).default(''),
  contactNote: z.string().trim().max(400).default(''),
  groupQrUrl: z.string().trim().max(300).default(''),
  departments: z.array(yeucaDepartmentSchema).min(1).max(24),
  extras: yeucaSiteExtrasSchema.optional()
})

export const createYeucaPostSchema = z.object({
  kind: z.enum(['news', 'resource']).default('news'),
  deptName: z.string().trim().min(1).max(40),
  category: z.string().trim().max(40).default(''),
  title: z.string().trim().min(1).max(140),
  summary: z.string().trim().min(1).max(400),
  body: z.string().trim().min(1).max(20000),
  tags: z.array(z.string().trim().min(1).max(30)).max(8).default([]),
  pinned: z.boolean().default(false),
  status: z.enum(['draft', 'published', 'archived']).default('draft')
})

export const updateYeucaPostSchema = createYeucaPostSchema.partial().refine(
  value => Object.keys(value).length > 0,
  { message: '至少需要提供一个更新字段' }
)

export const createYeucaProjectSchema = z.object({
  title: z.string().trim().min(1).max(120),
  deptName: z.string().trim().min(1).max(40),
  track: z.string().trim().min(1).max(40),
  status: z.enum(['active', 'maintaining', 'planning']).default('active'),
  summary: z.string().trim().min(1).max(400),
  highlights: z.array(z.string().trim().min(1).max(160)).max(8).default([]),
  stack: z.array(z.string().trim().min(1).max(40)).max(12).default([]),
  previewImage: z.string().trim().max(300).default(''),
  repoUrl: z.string().trim().max(300).default(''),
  demoUrl: z.string().trim().max(300).default(''),
  sortOrder: z.number().int().min(0).max(9999).default(0),
  isPublished: z.boolean().default(true)
})

export const updateYeucaProjectSchema = createYeucaProjectSchema.partial().refine(
  value => Object.keys(value).length > 0,
  { message: '至少需要提供一个更新字段' }
)
