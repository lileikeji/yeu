export type AdminFormValue = string | number | boolean | null

export interface AdminOption {
  label: string
  value: string
}

export interface AdminFieldCondition {
  key: string
  values: AdminFormValue[]
}

export interface AdminFieldDefinition {
  key: string
  label: string
  type?: 'text' | 'textarea' | 'text-list' | 'json' | 'link-list' | 'url' | 'email' | 'tel' | 'tel-list' | 'number' | 'date' | 'datetime-local' | 'select' | 'checkbox' | 'image' | 'image-list'
  placeholder?: string
  description?: string
  required?: boolean
  options?: AdminOption[]
  defaultValue?: AdminFormValue
  group?: string
  span?: 'full' | 'half' | 'third'
  rows?: number
  min?: number
  max?: number
  step?: number
  condition?: AdminFieldCondition
}

export interface AdminColumnDefinition {
  key: string
  label: string
  kind?: 'text' | 'status' | 'date' | 'boolean' | 'number'
  fallbackKeys?: string[]
  valueLabels?: Record<string, string>
  class?: string
}

export interface AdminFilterDefinition {
  key: string
  label: string
  allLabel: string
  options: AdminOption[]
}

export interface AdminStatDefinition {
  key: string
  label: string
  icon: string
}

export interface AdminStatsDefinition {
  responseKey: string
  items: AdminStatDefinition[]
}

export interface AdminResourceConfig {
  key: string
  title: string
  description?: string
  icon: string
  endpoint: string
  createLabel: string
  searchPlaceholder: string
  rowTitleKey: string
  columns: AdminColumnDefinition[]
  fields: AdminFieldDefinition[]
  filters?: AdminFilterDefinition[]
  stats?: AdminStatsDefinition
  statusKey?: string
  canCreate?: boolean
  canEdit?: boolean
  canDelete?: boolean
  searchable?: boolean
  publicationActions?: boolean
  readOnlyNote?: string
}

export type AdminRecord = Record<string, unknown>
