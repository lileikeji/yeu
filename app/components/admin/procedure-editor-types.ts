import type {
  ProcedureAudience,
  ProcedureInformationState,
  ProcedureMethod
} from '~~/shared/constants/server'

export interface ProcedureSelectOption {
  label: string
  value: string
  description?: string
}

export interface ProcedureAudienceOption {
  label: string
  value: ProcedureAudience
}

export interface ProcedureInformationStateOption {
  label: string
  value: ProcedureInformationState
}

export interface ProcedureMethodOption {
  label: string
  value: ProcedureMethod
}

export interface ProcedureStepForm {
  key: number
  title: string
  description: string
  audience: ProcedureAudience[]
  informationState: ProcedureInformationState
  timeText: string
  placeId: string
  departmentId: string
  actionUrl: string
}

export interface ProcedureMaterialForm {
  key: number
  name: string
  description: string
  audience: ProcedureAudience[]
  isRequired: boolean | null
  informationState: ProcedureInformationState
  placeId: string
  departmentId: string
}

export interface ProcedureForm {
  slug: string
  title: string
  summary: string
  body: string
  category: string
  audience: ProcedureAudience[]
  method: ProcedureMethod
  informationState: ProcedureInformationState
  statusText: string
  processingTime: string
  deadlineText: string
  startsAt: string
  endsAt: string
  validFrom: string
  validUntil: string
  departmentId: string
  guideId: string
  lastVerifiedAt: string
  sourceIds: string[]
  placeIds: string[]
  steps: ProcedureStepForm[]
  materials: ProcedureMaterialForm[]
}
