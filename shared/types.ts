export type PublicationStatus = 'draft' | 'published' | 'archived'
export type CoordinateReferenceSystem = 'WGS84' | 'GCJ-02' | 'BD-09'

export interface Category {
  id: string
  slug: string
  name: string
  icon: string
  scope: string
}

export interface SourceRef {
  id: string
  title: string
  url: string
  platform: string
  isOfficial: boolean
  accessedAt: string
}

export interface Place {
  id: string
  slug: string
  name: string
  summary: string
  body?: string
  scope: 'campus' | 'nearby'
  type: string
  category?: Category | null
  address?: string | null
  campusArea?: string | null
  floor?: string | null
  room?: string | null
  longitude: number
  latitude: number
  coordinateSystem: CoordinateReferenceSystem
  openingHours?: string | null
  phone?: string | null
  website?: string | null
  externalMapUrl?: string | null
  imageUrl?: string | null
  isOfficial: boolean
  isFeatured: boolean
  status: PublicationStatus
  lastVerifiedAt?: string | null
  sources?: SourceRef[]
}

export interface Guide {
  id: string
  slug: string
  title: string
  summary: string
  body?: string
  category?: Category | null
  audience?: string | null
  readMinutes?: number
  isFeatured: boolean
  status: PublicationStatus
  lastVerifiedAt?: string | null
  sources?: SourceRef[]
}

export interface ProcedureStep {
  id: string
  order: number
  title: string
  description: string
  audience: Array<'undergraduate' | 'transfer'>
  informationState: 'confirmed' | 'partial' | 'awaiting-notice'
  timeText?: string | null
  place?: Place | null
  department?: Department | null
  actionUrl?: string | null
}

export interface ProcedureMaterial {
  id: string
  order: number
  name: string
  description: string
  audience: Array<'undergraduate' | 'transfer'>
  isRequired: boolean | null
  informationState: 'confirmed' | 'partial' | 'awaiting-notice'
  place?: Place | null
  department?: Department | null
}

export interface ProcedureItem {
  id: string
  slug: string
  title: string
  summary: string
  body?: string
  category?: Category | null
  audience: Array<'undergraduate' | 'transfer'>
  method: 'online' | 'offline' | 'mixed'
  informationState: 'confirmed' | 'partial' | 'awaiting-notice'
  statusText: string
  processingTime?: string | null
  deadlineText?: string | null
  startsAt?: string | null
  endsAt?: string | null
  validFrom?: string | null
  validUntil?: string | null
  department?: Department | null
  places?: Place[]
  steps?: ProcedureStep[]
  materials?: ProcedureMaterial[]
  status: PublicationStatus
  lastVerifiedAt?: string | null
  sources?: SourceRef[]
}

export interface Department {
  id: string
  slug: string
  name: string
  shortName?: string | null
  summary: string
  body?: string
  phone?: string | null
  email?: string | null
  website?: string | null
  officeHours?: string | null
  places?: Place[]
  status: PublicationStatus
  lastVerifiedAt?: string | null
}

export interface Club {
  id: string
  slug: string
  name: string
  summary: string
  body?: string
  category?: Category | null
  recruitmentPeriod?: string | null
  activitySchedule?: string | null
  contactMethod?: string | null
  logoUrl?: string | null
  status: PublicationStatus
  lastVerifiedAt?: string | null
}

export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page?: number
  pageSize?: number
}

export interface HomePayload {
  featuredPlaces: Place[]
  featuredGuides: Guide[]
  featuredProcedures: ProcedureItem[]
  stats: {
    places: number
    guides: number
    organizations: number
    verifiedAt: string | null
  }
}
