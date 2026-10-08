import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { createError } from 'h3'
import { zipSync } from 'fflate'
import * as XLSX from '@e965/xlsx'
import { and, count, desc, eq, like, or, sql } from 'drizzle-orm'
import {
  likeContainsPattern
} from '../../../shared/utils/like-search'
import type { DatabaseClient } from '../../database/client'
import { contents, recruitDrafts, recruitForms, recruitReferrers, recruitSubmissions } from '../../database/schema'
import { rethrowDatabaseError, throwNotFound } from '../../utils/errors'
import { fillDocxTemplate, listTemplateLabels, readTemplateXml, type DocxCellFill } from './docx'
import type {
  RecruitDocConfig,
  RecruitPaymentConfig,
  RecruitReferrer,
  RecruitExportColumn,
  RecruitFieldKey,
  RecruitFormField,
  RecruitFormStatus,
  RecruitSubmission,
  RecruitSubmissionValue
} from '../../../shared/types'

export const WELL_KNOWN_FIELD_LABELS: Record<RecruitFieldKey, string> = {
  name: '姓名',
  gender: '性别',
  studentNo: '学号',
  major: '专业',
  className: '班级（全称）',
  phone: '手机号',
  qq: 'QQ',
  departments: '意向部门',
  isLeagueMember: '是否为共青团员'
}

const WELL_KNOWN_KEYS = Object.keys(WELL_KNOWN_FIELD_LABELS) as RecruitFieldKey[]

export function isWellKnownFieldKey(key: string): key is RecruitFieldKey {
  return (WELL_KNOWN_KEYS as string[]).includes(key)
}

export const DEFAULT_FIELDS: RecruitFormField[] = [
  { key: 'name', label: '姓名', type: 'text', required: true },
  { key: 'gender', label: '性别', type: 'select', required: true, options: ['男', '女'] },
  { key: 'studentNo', label: '学号', type: 'text', required: true },
  { key: 'className', label: '专业班级', type: 'text', required: true, placeholder: '如：25电子信息' },
  { key: 'phone', label: '手机号', type: 'text', required: true },
  { key: 'qq', label: 'QQ', type: 'text', required: true },
  { key: 'departments', label: '意向部门', type: 'multiselect', required: true, options: [] },
  { key: 'isLeagueMember', label: '是否为共青团员', type: 'select', required: true, options: ['是', '否'] }
]

/** Default cell mapping for the standard 入会申请表 template layout. */
export const DEFAULT_DOC_CONFIG: RecruitDocConfig = {
  mappings: [
    { label: '姓名', fieldKey: 'name' },
    { label: '性别', fieldKey: 'gender' },
    { label: '班级', fieldKey: 'className' },
    { label: '手机号', fieldKey: 'phone' },
    { label: 'QQ号', fieldKey: 'qq' }
  ],
  multiSelect: { fieldKey: 'departments', mark: '√' }
}

export const DEFAULT_EXPORT_COLUMNS: RecruitExportColumn[] = [
  { key: 'studentNo', label: '学号' },
  { key: 'className', label: '专业班级' },
  { key: 'name', label: '姓名' },
  { key: 'isLeagueMember', label: '是否为共青团员' }
]

export interface RecruitFormRow {
  id: string
  contentId: string
  title: string
  slogan: string
  intro: string
  status: RecruitFormStatus
  fieldsJson: string
  docConfigJson: string
  exportColumnsJson: string
  templateDocx: string | null
  templateName: string | null
  views: number
  paymentEnabled: number | boolean
  paymentWechatImage: string | null
  paymentAlipayImage: string | null
  paymentNote: string | null
  updatedAt: Date | number | null
}

function parseJson<T>(raw: string, fallback: T): T {
  try {
    const parsed = JSON.parse(raw)
    return parsed ?? fallback
  } catch {
    return fallback
  }
}

export function serializeFormConfig(row: RecruitFormRow, club: {
  slug: string
  title: string
}) {
  return {
    contentId: row.contentId,
    clubName: club.title,
    clubSlug: club.slug,
    title: row.title,
    slogan: row.slogan,
    intro: row.intro,
    status: row.status,
    fields: parseJson<RecruitFormField[]>(row.fieldsJson, []),
    doc: parseJson<RecruitDocConfig>(row.docConfigJson, { mappings: [], multiSelect: null }),
    exportColumns: parseJson<RecruitExportColumn[]>(row.exportColumnsJson, []),
    templateName: row.templateName,
    templateLabels: row.templateDocx
      ? listTemplateLabels(readTemplateXml(base64ToBytes(row.templateDocx))).map(item => item.label)
      : [],
    views: row.views ?? 0,
    payment: {
      enabled: Boolean(row.paymentEnabled),
      wechatImage: row.paymentWechatImage,
      alipayImage: row.paymentAlipayImage,
      note: row.paymentNote ?? '付款请备注：班级+姓名+电话'
    },
    updatedAt: row.updatedAt ? Number(row.updatedAt) : null
  }
}

function base64ToBytes(base64: string): Uint8Array {
  return new Uint8Array(Buffer.from(base64, 'base64'))
}

export function getRecruitFormByContentId(client: DatabaseClient, contentId: string): RecruitFormRow | null {
  return client.db.select().from(recruitForms).where(eq(recruitForms.contentId, contentId)).get() ?? null
}

export function getRecruitFormById(client: DatabaseClient, formId: string): RecruitFormRow | null {
  return client.db.select().from(recruitForms).where(eq(recruitForms.id, formId)).get() ?? null
}

export function getClubContent(client: DatabaseClient, contentId: string) {
  return client.db.select({
    id: contents.id,
    slug: contents.slug,
    title: contents.title,
    status: contents.status,
    kind: contents.kind
  }).from(contents).where(eq(contents.id, contentId)).get() ?? null
}

export function listClubContents(client: DatabaseClient) {
  return client.db.select({
    id: contents.id,
    slug: contents.slug,
    title: contents.title,
    status: contents.status
  }).from(contents)
    .where(eq(contents.kind, 'club'))
    .orderBy(contents.title)
    .all()
}

/** Admin surfaces always operate on an existing form row; create defaults on first touch. */
export function ensureRecruitForm(client: DatabaseClient, contentId: string): RecruitFormRow {
  const existing = getRecruitFormByContentId(client, contentId)
  if (existing) return existing

  const now = Date.now()
  client.db.insert(recruitForms).values({
    id: randomUUID(),
    contentId,
    title: '入会申请表',
    slogan: '',
    intro: '',
    status: 'closed',
    fieldsJson: JSON.stringify(DEFAULT_FIELDS),
    docConfigJson: JSON.stringify(DEFAULT_DOC_CONFIG),
    exportColumnsJson: JSON.stringify(DEFAULT_EXPORT_COLUMNS),
    paymentNote: '付款请备注：班级+姓名+电话',
    createdAt: now,
    updatedAt: now
  }).run()
  return getRecruitFormByContentId(client, contentId)!
}

export interface UpdateRecruitFormInput {
  title: string
  slogan: string
  intro: string
  status: RecruitFormStatus
  fields: RecruitFormField[]
  doc: RecruitDocConfig
  exportColumns: RecruitExportColumn[]
  payment: RecruitPaymentConfig
}

export function updateRecruitForm(
  client: DatabaseClient,
  contentId: string,
  input: UpdateRecruitFormInput
): RecruitFormRow {
  ensureRecruitForm(client, contentId)
  client.db.update(recruitForms).set({
    title: input.title,
    slogan: input.slogan,
    intro: input.intro,
    status: input.status,
    fieldsJson: JSON.stringify(input.fields),
    docConfigJson: JSON.stringify(input.doc),
    exportColumnsJson: JSON.stringify(input.exportColumns),
    paymentEnabled: input.payment.enabled,
    paymentWechatImage: input.payment.wechatImage,
    paymentAlipayImage: input.payment.alipayImage,
    paymentNote: input.payment.note,
    updatedAt: Date.now()
  }).where(eq(recruitForms.contentId, contentId)).run()
  return getRecruitFormByContentId(client, contentId)!
}

export function saveRecruitTemplate(
  client: DatabaseClient,
  contentId: string,
  templateName: string,
  docxBytes: Uint8Array
): void {
  ensureRecruitForm(client, contentId)
  client.db.update(recruitForms).set({
    templateDocx: Buffer.from(docxBytes).toString('base64'),
    templateName,
    updatedAt: Date.now()
  }).where(eq(recruitForms.contentId, contentId)).run()
}

export function getRecruitTemplateBytes(row: RecruitFormRow): Uint8Array | null {
  return row.templateDocx ? base64ToBytes(row.templateDocx) : null
}

export function getRecruitFormBySlug(client: DatabaseClient, slug: string) {
  return client.db.select({
    form: recruitForms,
    clubSlug: contents.slug,
    clubTitle: contents.title,
    clubStatus: contents.status
  }).from(recruitForms)
    .innerJoin(contents, eq(contents.id, recruitForms.contentId))
    .where(and(eq(contents.slug, slug), eq(contents.kind, 'club')))
    .get() ?? null
}

export interface NormalizedSubmission {
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

export function validateSubmissionInput(
  fields: RecruitFormField[],
  input: Record<string, unknown>,
  validationOptions: { skipRequired?: boolean } = {}
): NormalizedSubmission {
  const data: Record<string, RecruitSubmissionValue> = {}

  for (const field of fields) {
    const raw = input[field.key]
    const missing = raw === undefined || raw === null || raw === ''

    if (field.required && missing && !validationOptions.skipRequired) {
      throw createError({
        statusCode: 422,
        statusMessage: 'Validation failed',
        data: { code: 'VALIDATION_ERROR', field: field.key, message: `请填写${field.label}` }
      })
    }
    if (missing) continue

    if (field.type === 'multiselect') {
      if (!Array.isArray(raw)) {
        throw createError({
          statusCode: 422,
          statusMessage: 'Validation failed',
          data: { code: 'VALIDATION_ERROR', field: field.key, message: `${field.label}格式不正确` }
        })
      }
      const options = field.options ?? []
      const values = [...new Set(raw.map(item => String(item).trim()).filter(Boolean))]
      const invalid = values.find(value => !options.includes(value))
      if (invalid) {
        throw createError({
          statusCode: 422,
          statusMessage: 'Validation failed',
          data: { code: 'VALIDATION_ERROR', field: field.key, message: `${field.label}包含无效选项` }
        })
      }
      if (field.required && values.length === 0 && !validationOptions.skipRequired) {
        throw createError({
          statusCode: 422,
          statusMessage: 'Validation failed',
          data: { code: 'VALIDATION_ERROR', field: field.key, message: `请至少选择一个${field.label}` }
        })
      }
      data[field.key] = values
      continue
    }

    if (field.type === 'select') {
      const value = String(raw).trim()
      const options = field.options ?? []
      if (!options.includes(value)) {
        throw createError({
          statusCode: 422,
          statusMessage: 'Validation failed',
          data: { code: 'VALIDATION_ERROR', field: field.key, message: `${field.label}选项无效` }
        })
      }
      data[field.key] = value
      continue
    }

    if (typeof raw !== 'string') {
      throw createError({
        statusCode: 422,
        statusMessage: 'Validation failed',
        data: { code: 'VALIDATION_ERROR', field: field.key, message: `${field.label}格式不正确` }
      })
    }
    const text = raw.replace(/\s+/g, ' ').trim()
    if (!text) continue
    if (field.key === 'phone' && !/^1\d{10}$/.test(text)) {
      throw createError({
        statusCode: 422,
        statusMessage: 'Validation failed',
        data: { code: 'VALIDATION_ERROR', field: 'phone', message: '手机号格式不正确' }
      })
    }
    if (field.key === 'qq' && !/^[1-9]\d{4,11}$/.test(text)) {
      throw createError({
        statusCode: 422,
        statusMessage: 'Validation failed',
        data: { code: 'VALIDATION_ERROR', field: 'qq', message: 'QQ号格式不正确' }
      })
    }
    if (field.key === 'studentNo' && !/^[0-9A-Za-z-]{4,20}$/.test(text)) {
      throw createError({
        statusCode: 422,
        statusMessage: 'Validation failed',
        data: { code: 'VALIDATION_ERROR', field: 'studentNo', message: '学号格式不正确' }
      })
    }
    data[field.key] = text
  }

  const text = (key: RecruitFieldKey) => typeof data[key] === 'string' ? data[key] as string : null
  const name = text('name') ?? ''

  return {
    data,
    name,
    gender: text('gender'),
    studentNo: text('studentNo'),
    major: text('major'),
    className: text('className'),
    phone: text('phone'),
    qq: text('qq'),
    departments: Array.isArray(data.departments)
      ? (data.departments as string[]).join('、')
      : text('departments'),
    isLeagueMember: text('isLeagueMember')
  }
}

export function createSubmission(
  client: DatabaseClient,
  form: RecruitFormRow,
  normalized: NormalizedSubmission,
  ipHash: string | null,
  referrerName: string | null = null,
  paymentConfirmed: boolean | null = null
): RecruitSubmission {
  const id = randomUUID()
  const now = Date.now()
  client.db.insert(recruitSubmissions).values({
    id,
    formId: form.id,
    dataJson: JSON.stringify(normalized.data),
    name: normalized.name,
    gender: normalized.gender,
    studentNo: normalized.studentNo,
    major: normalized.major,
    className: normalized.className,
    phone: normalized.phone,
    qq: normalized.qq,
    departments: normalized.departments,
    isLeagueMember: normalized.isLeagueMember,
    referrerName,
    paymentConfirmed,
    submitIpHash: ipHash,
    createdAt: now
  }).run()
  return {
    id,
    formId: form.id,
    referrerName,
    paymentConfirmed,
    createdAt: now,
    data: normalized.data,
    name: normalized.name,
    gender: normalized.gender,
    studentNo: normalized.studentNo,
    major: normalized.major,
    className: normalized.className,
    phone: normalized.phone,
    qq: normalized.qq,
    departments: normalized.departments,
    isLeagueMember: normalized.isLeagueMember
  }
}

type SubmissionDbRow = typeof recruitSubmissions.$inferSelect

export function serializeSubmission(row: SubmissionDbRow): RecruitSubmission {
  return {
    id: row.id,
    formId: row.formId,
    createdAt: Number(row.createdAt),
    data: parseJson<Record<string, RecruitSubmissionValue>>(row.dataJson, {}),
    name: row.name,
    gender: row.gender,
    studentNo: row.studentNo,
    major: row.major,
    className: row.className,
    phone: row.phone,
    qq: row.qq,
    departments: row.departments,
    isLeagueMember: row.isLeagueMember,
    referrerName: row.referrerName,
    paymentConfirmed: row.paymentConfirmed
  }
}

export function listSubmissions(
  client: DatabaseClient,
  formId: string,
  options: { query?: string, page?: number, pageSize?: number } = {}
) {
  const pageSize = Math.min(100, Math.max(5, options.pageSize ?? 20))
  const page = Math.max(1, options.page ?? 1)
  const pattern = likeContainsPattern(options.query ?? '')

  const conditions = pattern
    ? and(
        eq(recruitSubmissions.formId, formId),
        or(
          like(recruitSubmissions.name, pattern),
          like(recruitSubmissions.className, pattern),
          like(recruitSubmissions.major, pattern),
          like(recruitSubmissions.studentNo, pattern),
          like(recruitSubmissions.phone, pattern)
        )
      )
    : eq(recruitSubmissions.formId, formId)

  const total = client.db.select({ value: count() }).from(recruitSubmissions).where(conditions).get()?.value ?? 0
  const rows = client.db.select().from(recruitSubmissions)
    .where(conditions)
    .orderBy(desc(recruitSubmissions.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize)
    .all()

  return {
    items: rows.map(serializeSubmission),
    total,
    page,
    pageSize
  }
}

export function getSubmission(client: DatabaseClient, submissionId: string): RecruitSubmission | null {
  const row = client.db.select().from(recruitSubmissions).where(eq(recruitSubmissions.id, submissionId)).get()
  return row ? serializeSubmission(row) : null
}

/**
 * Admin online edit: re-validate the whole payload against the form fields and
 * refresh both the JSON document source and the denormalized search columns.
 */
export function updateSubmission(
  client: DatabaseClient,
  form: RecruitFormRow,
  submissionId: string,
  input: Record<string, unknown>
): RecruitSubmission {
  const existing = getSubmission(client, submissionId)
  if (!existing || existing.formId !== form.id) throwNotFound('Recruit submission')

  const fields = parseJson<RecruitFormField[]>(form.fieldsJson, [])
  // Admin edits tolerate missing values (paper-form imports often lack fields
  // the online form marks required) but never invalid values.
  const normalized = validateSubmissionInput(fields, input, { skipRequired: true })

  client.db.update(recruitSubmissions).set({
    dataJson: JSON.stringify(normalized.data),
    name: normalized.name,
    gender: normalized.gender,
    studentNo: normalized.studentNo,
    major: normalized.major,
    className: normalized.className,
    phone: normalized.phone,
    qq: normalized.qq,
    departments: normalized.departments,
    isLeagueMember: normalized.isLeagueMember
  }).where(eq(recruitSubmissions.id, submissionId)).run()

  return getSubmission(client, submissionId)!
}

export function deleteSubmission(client: DatabaseClient, submissionId: string): void {
  client.db.delete(recruitSubmissions).where(eq(recruitSubmissions.id, submissionId)).run()
}

/** Generated document filename: "专业班级+姓名.docx" (e.g. 25电子信息张三.docx). */
export function buildSubmissionFilename(submission: {
  major?: string | null
  className?: string | null
  name?: string | null
}): string {
  const base = [submission.className, submission.name]
    .map(part => (part ?? '').replace(/[/\\:*?"<>|\r\n\t]+/g, '').replace(/\s+/g, '').trim())
    .filter(Boolean)
    .join('')
    .trim()
  return `${base || '入会申请表'}.docx`
}

function submissionValueText(value: RecruitSubmissionValue | string | null | undefined): string {
  if (value === undefined || value === null) return ''
  return Array.isArray(value) ? value.join('、') : String(value)
}

function buildDocxFills(form: RecruitFormRow, submission: RecruitSubmission): DocxCellFill[] {
  const doc = parseJson<RecruitDocConfig>(form.docConfigJson, { mappings: [], multiSelect: null })
  const fills: DocxCellFill[] = []

  for (const mapping of doc.mappings) {
    const value = submissionValueText(submission.data[mapping.fieldKey])
    if (value) fills.push({ anchor: mapping.label, text: value })
  }

  if (doc.multiSelect) {
    const selected = submission.data[doc.multiSelect.fieldKey]
    const mark = doc.multiSelect.mark || '√'
    if (Array.isArray(selected)) {
      for (const option of selected) {
        fills.push({ anchor: option, text: mark })
      }
    }
  }

  return fills
}

/** Sample data used by the admin "test render" download to verify the template mapping. */
export function buildSampleSubmissionData(fields: RecruitFormField[]): Record<string, RecruitSubmissionValue> {
  const sampleText: Partial<Record<RecruitFieldKey, string>> = {
    name: '张三',
    gender: '男',
    studentNo: '20250001',
    major: '音乐学',
    className: '2025级音乐学1班',
    phone: '13800000000',
    qq: '123456789',
    isLeagueMember: '是'
  }
  const data: Record<string, RecruitSubmissionValue> = {}
  for (const field of fields) {
    if (field.type === 'multiselect') {
      data[field.key] = (field.options ?? []).slice(0, 1)
    } else if (field.type === 'select') {
      data[field.key] = field.options?.[0] ?? ''
    } else {
      data[field.key] = sampleText[field.key as RecruitFieldKey] ?? `${field.label}示例`
    }
  }
  return data
}

export interface GeneratedDocx {
  bytes: Uint8Array
  filename: string
  skipped: string[]
}

export function buildSubmissionDocx(
  form: RecruitFormRow,
  submission: RecruitSubmission
): GeneratedDocx {
  const templateBytes = getRecruitTemplateBytes(form)
  if (!templateBytes) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Recruit template has not been uploaded yet',
      data: { code: 'RECRUIT_TEMPLATE_MISSING' }
    })
  }
  const result = fillDocxTemplate(templateBytes, buildDocxFills(form, submission))
  return {
    bytes: result.bytes,
    filename: buildSubmissionFilename(submission),
    skipped: result.skipped
  }
}

/** Bundle generated docx files into one zip for "download selected". */
export function buildSubmissionsZip(
  form: RecruitFormRow,
  submissions: RecruitSubmission[]
): { bytes: Uint8Array, count: number } {
  const files: Record<string, Uint8Array> = {}
  const used = new Set<string>()
  for (const submission of submissions) {
    const generated = buildSubmissionDocx(form, submission)
    let filename = generated.filename
    let serial = 2
    while (used.has(filename)) {
      filename = generated.filename.replace(/\.docx$/, `(${serial++}).docx`)
    }
    used.add(filename)
    files[filename] = generated.bytes
  }
  return { bytes: zipSync(files), count: submissions.length }
}

export function resolveExportValue(column: RecruitExportColumn, submission: RecruitSubmission): string {
  if (isWellKnownFieldKey(column.key)) {
    return submissionValueText(submission[column.key]) || submissionValueText(submission.data[column.key])
  }
  return submissionValueText(submission.data[column.key])
}

export function buildSubmissionsWorkbook(
  form: RecruitFormRow,
  submissions: RecruitSubmission[]
): Buffer {
  const columns = parseJson<RecruitExportColumn[]>(form.exportColumnsJson, [])
    .filter(column => column.key && column.label)
  const header = [...columns.map(column => column.label), '邀请人']
  const rows = submissions.map(submission => [
    ...columns.map(column => resolveExportValue(column, submission)),
    submission.referrerName ?? ''
  ])
  const sheet = XLSX.utils.aoa_to_sheet([header, ...rows])
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, sheet, '纳新总表')
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer
}

// -- referrers (纳新人/邀请码) --------------------------------------------------

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

function generateReferralCode(): string {
  const bytes = randomBytes(6)
  let code = ''
  for (const byte of bytes) code += CODE_ALPHABET[byte % CODE_ALPHABET.length]!
  return code
}

export interface ReferrerRow {
  id: string
  formId: string
  name: string
  code: string
  isActive: boolean
  createdAt: Date | number | null
}

export function listReferrers(client: DatabaseClient, formId: string): RecruitReferrer[] {
  return client.db.select().from(recruitReferrers)
    .where(eq(recruitReferrers.formId, formId))
    .orderBy(desc(recruitReferrers.createdAt))
    .all()
    .map(row => ({
      id: row.id,
      name: row.name,
      code: row.code,
      isActive: row.isActive,
      views: row.views ?? 0,
      createdAt: Number(row.createdAt)
    }))
}

export function createReferrer(
  client: DatabaseClient,
  form: RecruitFormRow,
  name: string,
  requestedCode?: string
): RecruitReferrer {
  const cleanName = name.trim()
  if (!cleanName || cleanName.length > 30) {
    throw createError({
      statusCode: 422,
      statusMessage: 'Validation failed',
      data: { code: 'VALIDATION_ERROR', field: 'name', message: '纳新人姓名必填且不超过 30 字' }
    })
  }

  let code: string
  if (requestedCode !== undefined && requestedCode !== '') {
    code = requestedCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
    if (code.length < 4 || code.length > 16) {
      throw createError({
        statusCode: 422,
        statusMessage: 'Validation failed',
        data: { code: 'VALIDATION_ERROR', field: 'code', message: '邀请码需 4-16 位字母数字' }
      })
    }
  } else {
    for (;;) {
      code = generateReferralCode()
      const existing = client.db.select({ id: recruitReferrers.id }).from(recruitReferrers)
        .where(eq(recruitReferrers.code, code)).get()
      if (!existing) break
    }
  }

  const duplicate = client.db.select({ id: recruitReferrers.id }).from(recruitReferrers)
    .where(and(eq(recruitReferrers.formId, form.id), eq(recruitReferrers.name, cleanName))).get()
  if (duplicate) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Referrer name already exists',
      data: { code: 'REFERRER_NAME_EXISTS' }
    })
  }

  const id = randomUUID()
  const now = Date.now()
  try {
    client.db.insert(recruitReferrers).values({
      id,
      formId: form.id,
      name: cleanName,
      code,
      createdAt: now
    }).run()
  } catch (error) {
    rethrowDatabaseError(error)
  }
  return { id, name: cleanName, code, isActive: true, views: 0, createdAt: now }
}

export function deleteReferrer(client: DatabaseClient, formId: string, referrerId: string): void {
  client.db.delete(recruitReferrers)
    .where(and(eq(recruitReferrers.formId, formId), eq(recruitReferrers.id, referrerId)))
    .run()
}

/**
 * Count one signup-page view: the form total always increments, and a valid
 * invite code additionally credits that referrer. `probe` requests (e.g. the
 * club page checking availability) count nothing.
 */
export function recordRecruitView(client: DatabaseClient, form: RecruitFormRow, ref: string | undefined, probe: boolean): void {
  if (probe) return
  // SQL-side increment: reading the row first would lose concurrent views.
  client.db.update(recruitForms).set({ views: sql`${recruitForms.views} + 1` })
    .where(eq(recruitForms.id, form.id))
    .run()

  const code = (ref ?? '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (!code) return
  const referrer = client.db.select({ id: recruitReferrers.id, views: recruitReferrers.views })
    .from(recruitReferrers)
    .where(and(eq(recruitReferrers.formId, form.id), eq(recruitReferrers.code, code), eq(recruitReferrers.isActive, true)))
    .get()
  if (!referrer) return
  client.db.update(recruitReferrers).set({ views: sql`${recruitReferrers.views} + 1` })
    .where(eq(recruitReferrers.id, referrer.id))
    .run()
}

/** Resolve an invite code to the referrer name for this form; null when absent/invalid. */
export function resolveReferrerByCode(client: DatabaseClient, formId: string, ref: string | undefined): string | null {
  const code = (ref ?? '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (!code) return null
  const row = client.db.select().from(recruitReferrers)
    .where(and(eq(recruitReferrers.formId, formId), eq(recruitReferrers.code, code), eq(recruitReferrers.isActive, true)))
    .get()
  return row?.name ?? null
}

// -- signup drafts (草稿:按 IP+浏览器特征自动保存/恢复) --------------------------

export function recruitDraftKey(client: DatabaseClient, secret: string, ipAddress: string, userAgent: string): string {
  const uaHash = createHash('sha256').update(userAgent).digest('hex').slice(0, 32)
  return hashOpaqueToken(secret, 'recruit-draft', `${ipAddress}\u0000${uaHash}`)
}

export interface RecruitDraftState {
  data: Record<string, RecruitSubmissionValue>
  submitted: boolean
  submissionId: string | null
}

export function getRecruitDraft(client: DatabaseClient, formId: string, draftKey: string): RecruitDraftState | null {
  const row = client.db.select().from(recruitDrafts)
    .where(and(eq(recruitDrafts.formId, formId), eq(recruitDrafts.draftKey, draftKey)))
    .get()
  if (!row) return null
  const data = parseJson<Record<string, RecruitSubmissionValue>>(row.dataJson, {})
  if (row.submitted && !row.submissionId) return null
  return {
    data,
    submitted: row.submitted,
    submissionId: row.submissionId
  }
}

/** After a successful signup: keep the payload linked so the visitor can edit or restart. */
export function markDraftSubmitted(
  client: DatabaseClient,
  formId: string,
  draftKey: string,
  submissionId: string,
  data: Record<string, RecruitSubmissionValue>
): void {
  client.db.update(recruitDrafts).set({
    dataJson: JSON.stringify(data),
    submitted: true,
    submissionId,
    updatedAt: Date.now()
  }).where(and(eq(recruitDrafts.formId, formId), eq(recruitDrafts.draftKey, draftKey)))
    .run()
}

/** mode 'edit' reopens the submitted data; 'fresh' wipes the draft entirely. */
export function resetRecruitDraft(client: DatabaseClient, formId: string, draftKey: string, mode: 'edit' | 'fresh'): void {
  if (mode === 'fresh') {
    deleteRecruitDraft(client, formId, draftKey)
    return
  }
  client.db.update(recruitDrafts).set({
    submitted: false,
    updatedAt: Date.now()
  }).where(and(eq(recruitDrafts.formId, formId), eq(recruitDrafts.draftKey, draftKey)))
    .run()
}

export function saveRecruitDraft(
  client: DatabaseClient,
  formId: string,
  draftKey: string,
  data: Record<string, RecruitSubmissionValue>
): void {
  const dataJson = JSON.stringify(data)
  const existing = client.db.select({ id: recruitDrafts.id }).from(recruitDrafts)
    .where(and(eq(recruitDrafts.formId, formId), eq(recruitDrafts.draftKey, draftKey)))
    .get()
  if (existing) {
    client.db.update(recruitDrafts).set({ dataJson, updatedAt: Date.now() })
      .where(eq(recruitDrafts.id, existing.id))
      .run()
    return
  }
  client.db.insert(recruitDrafts).values({
    id: randomUUID(),
    formId,
    draftKey,
    dataJson,
    updatedAt: Date.now()
  }).run()
}

export function deleteRecruitDraft(client: DatabaseClient, formId: string, draftKey: string): void {
  client.db.delete(recruitDrafts)
    .where(and(eq(recruitDrafts.formId, formId), eq(recruitDrafts.draftKey, draftKey)))
    .run()
}
