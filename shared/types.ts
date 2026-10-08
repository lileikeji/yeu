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
  address?: string | null
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

export type RecruitFieldType = 'text' | 'textarea' | 'select' | 'multiselect'

/** Keys persisted as dedicated submission columns for search and export. */
export type RecruitFieldKey
  = | 'name'
    | 'gender'
    | 'studentNo'
    | 'major'
    | 'className'
    | 'phone'
    | 'qq'
    | 'departments'
    | 'isLeagueMember'

export interface RecruitFormField {
  /** Stable key, reused as the submission data key and export column key. */
  key: string
  label: string
  type: RecruitFieldType
  required: boolean
  /** Options for select / multiselect fields. */
  options?: string[]
  /** Per-option long description (部门介绍), keyed by option value. */
  optionDetails?: Record<string, string>
  placeholder?: string
}

export interface RecruitPaymentConfig {
  enabled: boolean
  wechatImage: string | null
  alipayImage: string | null
  note: string
}

export interface RecruitDocMapping {
  /** Exact cell text inside the uploaded docx template. */
  label: string
  /** Form field key whose value fills the empty cell to the right of the label. */
  fieldKey: string
}

export interface RecruitDocConfig {
  mappings: RecruitDocMapping[]
  /** Multi-select field rendered as marks (e.g. √) next to matching option cells. */
  multiSelect?: { fieldKey: string, mark: string } | null
}

export interface RecruitExportColumn {
  key: string
  label: string
}

export type RecruitFormStatus = 'open' | 'closed'

export interface RecruitFormConfig {
  contentId: string
  clubName: string
  clubSlug: string
  title: string
  slogan: string
  intro: string
  status: RecruitFormStatus
  fields: RecruitFormField[]
  doc: RecruitDocConfig
  exportColumns: RecruitExportColumn[]
  templateName: string | null
  templateLabels: string[]
  views: number
  payment: RecruitPaymentConfig
  updatedAt: number | null
}

export type RecruitSubmissionValue = string | string[]

export interface RecruitReferrer {
  id: string
  name: string
  code: string
  isActive: boolean
  views: number
  createdAt: number
}

export interface RecruitSubmission {
  id: string
  formId: string
  referrerName: string | null
  paymentConfirmed: boolean | null
  createdAt: number
  data: Record<string, RecruitSubmissionValue>
  name: string
  gender: string | null
  studentNo: string | null
  major: string | null
  className: string | null
  phone: string | null
  qq: string | null
  departments: string | null
  isLeagueMember: string | null
}

export interface RecruitSubmissionPage {
  items: RecruitSubmission[]
  total: number
  page: number
  pageSize: number
}
