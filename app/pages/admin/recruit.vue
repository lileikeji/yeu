<script setup lang="ts">
import type {
  RecruitDocConfig,
  RecruitReferrer,
  RecruitExportColumn,
  RecruitFormField,
  RecruitFormStatus,
  RecruitSubmissionPage,
  RecruitSubmission
} from '~~/shared/types'

definePageMeta({ layout: 'admin' })

interface AdminClubOption {
  id: string
  slug: string
  title: string
  status: string
}

interface AdminSessionPayload {
  authenticated?: boolean
  admin?: {
    role?: 'super' | 'organization'
    organization?: { contentId?: string } | null
  }
}

const toast = useToast()

const loading = ref(true)
const loadError = ref('')
const adminRole = ref<'super' | 'organization'>('super')
const clubs = ref<AdminClubOption[]>([])
const selectedContentId = ref('')
const form = ref<{
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
  payment: {
    enabled: boolean
    wechatImage: string | null
    alipayImage: string | null
    note: string
  }
  updatedAt: number | null
} | null>(null)
const saving = ref(false)
const activeSection = ref<'settings' | 'referrers' | 'template' | 'submissions' | 'export'>('settings')

const uploadingTemplate = ref(false)
const templateFileInput = ref<HTMLInputElement | null>(null)
const submissions = ref<RecruitSubmission[]>([])
const submissionsTotal = ref(0)
const submissionsPage = ref(1)
const submissionsPageSize = 20
const searchQuery = ref('')
const loadingSubmissions = ref(false)

const FIELD_TYPE_OPTIONS = [
  { label: '文本', value: 'text' },
  { label: '多行文本', value: 'textarea' },
  { label: '单选下拉', value: 'select' },
  { label: '多选勾选', value: 'multiselect' }
]

const WELL_KNOWN_COLUMN_SOURCES = [
  { key: 'name', label: '姓名' },
  { key: 'gender', label: '性别' },
  { key: 'studentNo', label: '学号' },
  { key: 'className', label: '专业班级' },
  { key: 'phone', label: '手机号' },
  { key: 'qq', label: 'QQ' },
  { key: 'departments', label: '意向部门' },
  { key: 'isLeagueMember', label: '是否为共青团员' }
]

const sections = [
  { key: 'settings', label: '基础设置', icon: 'i-lucide-sliders-horizontal' },
  { key: 'referrers', label: '纳新人与邀请码', icon: 'i-lucide-user-plus' },
  { key: 'template', label: '申请表模板', icon: 'i-lucide-file-text' },
  { key: 'submissions', label: '提交记录', icon: 'i-lucide-inbox' },
  { key: 'export', label: '总表导出', icon: 'i-lucide-table' }
] as const

const fieldOptions = computed(() => (form.value?.fields ?? [])
  .map(field => ({ label: `${field.label}（${field.key}）`, value: field.key })))
const multiselectFieldOptions = computed(() => (form.value?.fields ?? [])
  .filter(field => field.type === 'multiselect')
  .map(field => ({ label: field.label, value: field.key })))
const columnSourceOptions = computed(() => [
  ...WELL_KNOWN_COLUMN_SOURCES,
  ...(form.value?.fields ?? [])
    .filter(field => !WELL_KNOWN_COLUMN_SOURCES.some(wellKnown => wellKnown.key === field.key))
    .map(field => ({ key: field.key, label: field.label }))
])

function withContentId(path: string): string {
  const contentId = selectedContentId.value || form.value?.contentId
  return contentId ? `${path}?contentId=${encodeURIComponent(contentId)}` : path
}

const templateDownloadUrl = computed(() => withContentId('/api/admin/recruit/template'))
const sampleDocUrl = computed(() => withContentId('/api/admin/recruit/template-sample'))
const exportUrl = computed(() => withContentId('/api/admin/recruit/submissions/export'))
const recruitPublicUrl = computed(() => form.value?.clubSlug
  ? `/recruit/${encodeURIComponent(form.value.clubSlug)}`
  : '')

async function loadSession(): Promise<void> {
  const session = await adminFetch<AdminSessionPayload>('/api/admin/auth/session')
  if (!session.authenticated) {
    await navigateTo('/admin/login', { replace: true })
    throw new Error('unauthenticated')
  }
  adminRole.value = session.admin?.role === 'organization' ? 'organization' : 'super'
  if (adminRole.value === 'organization' && session.admin?.organization?.contentId) {
    selectedContentId.value = session.admin.organization.contentId
  }
}

async function loadClubs(): Promise<void> {
  const result = await adminFetch<{ items: AdminClubOption[] }>('/api/admin/recruit/clubs')
  clubs.value = result.items
  if (!selectedContentId.value && result.items.length > 0) {
    selectedContentId.value = result.items[0]!.id
  }
}

async function loadForm(): Promise<void> {
  if (!selectedContentId.value) {
    form.value = null
    return
  }
  loading.value = true
  loadError.value = ''
  try {
    const result = await adminFetch<{ form: NonNullable<typeof form.value> }>(
      `/api/admin/recruit/form?contentId=${encodeURIComponent(selectedContentId.value)}`
    )
    form.value = result.form
  } catch {
    loadError.value = '纳新表单配置加载失败，请刷新重试。'
  } finally {
    loading.value = false
  }
}

const refreshingForm = ref(false)

/** Pull the latest config from the server (picks up external edits like prefilled introductions). */
async function refreshFormData(): Promise<void> {
  if (refreshingForm.value) return
  refreshingForm.value = true
  await loadForm()
  refreshingForm.value = false
  toast.add({ title: '表单数据已刷新', color: 'success' })
}

async function saveForm(): Promise<void> {
  if (!form.value || saving.value) return
  const invalidField = form.value.fields.find(field => !field.label.trim()
    || ((field.type === 'select' || field.type === 'multiselect') && (field.options ?? []).length === 0))
  if (invalidField) {
    toast.add({
      title: '表单字段配置不完整',
      description: `请检查「${invalidField.label || invalidField.key}」：文本字段需要名称，选择字段需要至少一个选项。`,
      color: 'warning'
    })
    return
  }

  saving.value = true
  try {
    const result = await adminFetch<{ form: NonNullable<typeof form.value> }>(
      `/api/admin/recruit/form?contentId=${encodeURIComponent(selectedContentId.value)}`,
      {
        method: 'PUT',
        body: {
          title: form.value.title,
          slogan: form.value.slogan,
          intro: form.value.intro,
          status: form.value.status,
          fields: form.value.fields,
          doc: form.value.doc,
          exportColumns: form.value.exportColumns,
          payment: form.value.payment,
          baseUpdatedAt: form.value.updatedAt ?? undefined
        }
      }
    )
    form.value = result.form
    toast.add({ title: '纳新配置已保存', color: 'success' })
  } catch (error) {
    const conflict = typeof error === 'object' && error !== null
      && (error as { data?: { data?: { code?: string } } }).data?.data?.code === 'RECRUIT_FORM_CONFLICT'
    if (conflict) {
      await loadForm()
      toast.add({
        title: '配置刚被外部修改（如纳新介绍预填）',
        description: '已为你载入最新数据，确认内容后再点保存。',
        color: 'warning'
      })
    } else {
      toast.add({ title: '保存失败', description: '请检查网络后重试。', color: 'warning' })
    }
  } finally {
    saving.value = false
  }
}

function onTemplateFileChange(event: Event): void {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  if (!file.name.toLowerCase().endsWith('.docx')) {
    toast.add({ title: '请选择 .docx 文件', color: 'warning' })
    return
  }
  if (file.size > 3 * 1024 * 1024) {
    toast.add({ title: '模板文件不能超过 3MB', color: 'warning' })
    return
  }

  uploadingTemplate.value = true
  const reader = new FileReader()
  reader.onload = async () => {
    try {
      const dataUrl = String(reader.result || '')
      const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
      const result = await adminFetch<{ templateName: string, labels: string[] }>(
        `/api/admin/recruit/template?contentId=${encodeURIComponent(selectedContentId.value)}`,
        { method: 'POST', body: { filename: file.name, dataBase64: base64 } }
      )
      if (form.value) {
        form.value.templateName = result.templateName
        form.value.templateLabels = result.labels
      }
      toast.add({
        title: '模板已上传',
        description: `识别到 ${result.labels.length} 个可映射标签，请在下方完成文档标签映射。`,
        color: 'success'
      })
    } catch {
      toast.add({ title: '模板上传失败', description: '请确认文件是有效的 .docx 后重试。', color: 'warning' })
    } finally {
      uploadingTemplate.value = false
    }
  }
  reader.onerror = () => {
    uploadingTemplate.value = false
    toast.add({ title: '读取文件失败', color: 'warning' })
  }
  reader.readAsDataURL(file)
}

// -- form field editor -------------------------------------------------------

function addField(): void {
  if (!form.value) return
  form.value.fields = [...form.value.fields, {
    key: `f${Date.now().toString(36)}`,
    label: '',
    type: 'text',
    required: false
  }]
}

function removeField(index: number): void {
  if (!form.value) return
  const field = form.value.fields[index]
  if (!field) return
  form.value.fields = form.value.fields.filter((_, i) => i !== index)
  form.value.doc.mappings = form.value.doc.mappings.filter(m => m.fieldKey !== field.key)
  if (form.value.doc.multiSelect?.fieldKey === field.key) form.value.doc.multiSelect = null
  form.value.exportColumns = form.value.exportColumns.filter(c => c.key !== field.key)
}

function moveField(index: number, delta: number): void {
  if (!form.value) return
  const target = index + delta
  if (target < 0 || target >= form.value.fields.length) return
  const next = [...form.value.fields]
  ;[next[index], next[target]] = [next[target]!, next[index]!]
  form.value.fields = next
}

function setFieldOptions(field: RecruitFormField, text: string): void {
  field.options = text.split(/[、,，\n]/).map(item => item.trim()).filter(Boolean)
}

function fieldOptionsText(field: RecruitFormField): string {
  return (field.options ?? []).join('、')
}

function defaultLabelForKey(key: string): string {
  return WELL_KNOWN_COLUMN_SOURCES.find(source => source.key === key)?.label ?? key
}

async function copyTemplateLabel(label: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(label)
    toast.add({ title: `已复制「${label}」`, color: 'success' })
  } catch {
    toast.add({ title: '复制失败，请手动输入', color: 'warning' })
  }
}

// -- doc mapping editor ------------------------------------------------------

function addMapping(): void {
  if (!form.value) return
  form.value.doc.mappings = [...form.value.doc.mappings, { label: '', fieldKey: fieldOptions.value[0]?.value ?? 'name' }]
}

function removeMapping(index: number): void {
  if (!form.value) return
  form.value.doc.mappings = form.value.doc.mappings.filter((_, i) => i !== index)
}

function moveMapping(index: number, delta: number): void {
  if (!form.value) return
  const mappings = [...form.value.doc.mappings]
  const target = index + delta
  if (target < 0 || target >= mappings.length) return
  ;[mappings[index], mappings[target]] = [mappings[target]!, mappings[index]!]
  form.value.doc.mappings = mappings
}

// -- export column editor ----------------------------------------------------

function addExportColumn(): void {
  if (!form.value) return
  const used = new Set(form.value.exportColumns.map(column => column.key))
  const source = columnSourceOptions.value.find(option => !used.has(option.key))
    ?? columnSourceOptions.value[0]
  if (!source) return
  form.value.exportColumns = [...form.value.exportColumns, { key: source.key, label: source.label }]
}

function removeExportColumn(index: number): void {
  if (!form.value) return
  form.value.exportColumns = form.value.exportColumns.filter((_, i) => i !== index)
}

function moveExportColumn(index: number, delta: number): void {
  if (!form.value) return
  const columns = [...form.value.exportColumns]
  const target = index + delta
  if (target < 0 || target >= columns.length) return
  ;[columns[index], columns[target]] = [columns[target]!, columns[index]!]
  form.value.exportColumns = columns
}

function onExportColumnKeyChange(column: RecruitExportColumn, key: string): void {
  column.key = key
  column.label = defaultLabelForKey(key)
}

// -- submissions -------------------------------------------------------------

async function loadSubmissions(): Promise<void> {
  if (!selectedContentId.value) return
  loadingSubmissions.value = true
  try {
    const result = await adminFetch<RecruitSubmissionPage>(
      `/api/admin/recruit/submissions?contentId=${encodeURIComponent(selectedContentId.value)}`
      + `&page=${submissionsPage.value}&pageSize=${submissionsPageSize}`
      + `&query=${encodeURIComponent(searchQuery.value.trim())}`
    )
    submissions.value = result.items
    submissionsTotal.value = result.total
  } catch {
    toast.add({ title: '提交记录加载失败', color: 'warning' })
  } finally {
    loadingSubmissions.value = false
  }
}

function searchSubmissions(): void {
  submissionsPage.value = 1
  void loadSubmissions()
}

function changeSubmissionsPage(delta: number): void {
  const nextPage = submissionsPage.value + delta
  if (nextPage < 1 || (delta > 0 && submissionsPage.value * submissionsPageSize >= submissionsTotal.value)) return
  submissionsPage.value = nextPage
  void loadSubmissions()
}

async function deleteSubmission(submission: RecruitSubmission): Promise<void> {
  if (!window.confirm(`确定删除「${submission.name || '未署名'}」的报名记录？删除后不可恢复。`)) return
  try {
    await adminFetch(
      `/api/admin/recruit/submissions/${submission.id}?contentId=${encodeURIComponent(selectedContentId.value)}`,
      { method: 'DELETE' }
    )
    selectedIds.value = new Set([...selectedIds.value].filter(id => id !== submission.id))
    toast.add({ title: '已删除', color: 'success' })
    void loadSubmissions()
    void loadSheet()
  } catch {
    toast.add({ title: '删除失败', color: 'warning' })
  }
}

function submissionDocUrl(submission: RecruitSubmission): string {
  return `/api/admin/recruit/submissions/${submission.id}/doc?contentId=${encodeURIComponent(selectedContentId.value)}`
}

const isWeChatBrowser = /MicroMessenger/i.test(navigator.userAgent)

/**
 * Nuxt UI buttons render `href` through NuxtLink, which treats an /api path as
 * an internal route and SPA-navigates to the 404 page instead of downloading.
 * Fetch the bytes with session cookies and hand the blob to a temp anchor;
 * WeChat's in-app browser cannot save blobs, so it opens a new window instead.
 */
async function downloadFile(url: string, filename: string): Promise<void> {
  if (isWeChatBrowser) {
    window.open(url, '_blank', 'noopener')
    return
  }
  try {
    const blob = await $fetch<Blob>(url, { responseType: 'blob' })
    const blobUrl = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = blobUrl
    anchor.download = filename
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000)
  } catch {
    window.open(url, '_blank', 'noopener')
  }
}

function downloadTemplate(): void {
  void downloadFile(templateDownloadUrl.value, form.value?.templateName || '入会申请表模板.docx')
}

function downloadSampleDoc(): void {
  void downloadFile(sampleDocUrl.value, '示例-入会申请表.docx')
}

function downloadSubmissionDoc(submission: RecruitSubmission): void {
  const base = `${submission.className || ''}${submission.name || ''}`.trim()
  void downloadFile(submissionDocUrl(submission), `${base || '入会申请表'}.docx`)
}

function downloadExportWorkbook(): void {
  void downloadFile(exportUrl.value, `纳新总表-${form.value?.clubName || '社团'}.xlsx`)
}

// -- payment QR setup (缴费设置) -----------------------------------------------

const paymentUploadTarget = ref<'wechat' | 'alipay' | ''>('')
const paymentFileInput = ref<HTMLInputElement | null>(null)
const paymentUploading = ref(false)

function triggerPaymentUpload(target: 'wechat' | 'alipay'): void {
  paymentUploadTarget.value = target
  paymentFileInput?.value?.click()
}

function onPaymentFileChange(event: Event): void {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  const target = paymentUploadTarget.value
  if (!file || !target || !form.value) return
  if (!file.type.startsWith('image/')) {
    toast.add({ title: '请选择图片文件', color: 'warning' })
    return
  }
  if (file.size > 5 * 1024 * 1024) {
    toast.add({ title: '图片不能超过 5MB', color: 'warning' })
    return
  }

  paymentUploading.value = true
  const body = new FormData()
  body.append('image', file)
  const csrfHeaders = withAdminRequestOptions({ headers: new Headers() }).headers
  $fetch<{ url: string }>('/api/admin/media/images', {
    method: 'POST',
    body,
    credentials: 'include',
    headers: csrfHeaders
  }).then((result) => {
    if (!form.value) return
    if (target === 'wechat') form.value.payment.wechatImage = result.url
    else form.value.payment.alipayImage = result.url
    toast.add({ title: '图片已上传，记得点右上角「保存配置」', color: 'success' })
  }).catch(() => {
    toast.add({ title: '图片上传失败', color: 'warning' })
  }).finally(() => {
    paymentUploading.value = false
  })
}

function clearPaymentImage(target: 'wechat' | 'alipay'): void {
  if (!form.value) return
  if (target === 'wechat') form.value.payment.wechatImage = null
  else form.value.payment.alipayImage = null
}

// -- field option details (部门介绍) --------------------------------------------

function fieldOptionDetailText(field: RecruitFormField, option: string): string {
  return field.optionDetails?.[option] ?? ''
}

function setFieldOptionDetail(field: RecruitFormField, option: string, text: string): void {
  const next: Record<string, string> = {}
  for (const [key, value] of Object.entries(field.optionDetails ?? {})) {
    if (key !== option && value.trim()) next[key] = value.trim()
  }
  if (text.trim()) next[option] = text.trim()
  field.optionDetails = Object.keys(next).length ? next : undefined
}

// -- selection & bulk download -------------------------------------------------

const selectedIds = ref<Set<string>>(new Set())
const selectedCount = computed(() => selectedIds.value.size)
const allOnPageSelected = computed(() => submissions.value.length > 0
  && submissions.value.every(submission => selectedIds.value.has(submission.id)))

function toggleSelectAll(value: boolean | 'indeterminate'): void {
  const next = new Set(selectedIds.value)
  if (value === true) {
    for (const submission of submissions.value) next.add(submission.id)
  } else {
    for (const submission of submissions.value) next.delete(submission.id)
  }
  selectedIds.value = next
}

function toggleSelectOne(id: string, value: boolean | 'indeterminate'): void {
  const next = new Set(selectedIds.value)
  if (value === true) next.add(id)
  else next.delete(id)
  selectedIds.value = next
}

function downloadSelected(): void {
  if (selectedCount.value === 0) {
    toast.add({ title: '请先勾选要下载的提交', color: 'warning' })
    return
  }
  const ids = [...selectedIds.value].join(',')
  const url = `/api/admin/recruit/submissions/download-selected?contentId=${encodeURIComponent(selectedContentId.value)}&ids=${encodeURIComponent(ids)}`
  void downloadFile(url, `纳新申请表-选中${selectedCount.value}份.zip`)
}

// -- referrers (纳新人与邀请码) --------------------------------------------------

const referrers = ref<RecruitReferrer[]>([])
const referrerNameInput = ref('')
const referrerCodeInput = ref('')
const referrerBusy = ref(false)

const recruitOrigin = import.meta.client ? window.location.origin : ''

function referrerLink(code: string): string {
  return `${recruitOrigin}/recruit/${form.value?.clubSlug ?? ''}?ref=${encodeURIComponent(code)}`
}

async function loadReferrers(): Promise<void> {
  if (!selectedContentId.value) return
  try {
    const result = await adminFetch<{ items: RecruitReferrer[] }>(
      `/api/admin/recruit/referrers?contentId=${encodeURIComponent(selectedContentId.value)}`
    )
    referrers.value = result.items
  } catch {
    toast.add({ title: '纳新人列表加载失败', color: 'warning' })
  }
}

async function addReferrer(): Promise<void> {
  const name = referrerNameInput.value.trim()
  if (!name) {
    toast.add({ title: '请填写纳新人姓名', color: 'warning' })
    return
  }
  referrerBusy.value = true
  try {
    const result = await adminFetch<{ items: RecruitReferrer[] }>(
      `/api/admin/recruit/referrers?contentId=${encodeURIComponent(selectedContentId.value)}`,
      { method: 'POST', body: { name, code: referrerCodeInput.value.trim() || undefined } }
    )
    referrers.value = result.items
    referrerNameInput.value = ''
    referrerCodeInput.value = ''
    toast.add({ title: `已添加「${name}」`, description: '复制对应的报名链接发给 TA 即可开始推广。', color: 'success' })
  } catch {
    toast.add({ title: '添加失败', description: '姓名可能已存在，或自定义邀请码格式不合法（4-16 位字母数字）。', color: 'warning' })
  } finally {
    referrerBusy.value = false
  }
}

async function removeReferrer(referrer: RecruitReferrer): Promise<void> {
  if (!window.confirm(`确定删除纳新人「${referrer.name}」？其邀请码立即失效，已记录的邀请关系不受影响。`)) return
  try {
    await adminFetch(
      `/api/admin/recruit/referrers/${referrer.id}?contentId=${encodeURIComponent(selectedContentId.value)}`,
      { method: 'DELETE' }
    )
    referrers.value = referrers.value.filter(item => item.id !== referrer.id)
  } catch {
    toast.add({ title: '删除失败', color: 'warning' })
  }
}

async function copyReferrerLink(referrer: RecruitReferrer): Promise<void> {
  try {
    await navigator.clipboard.writeText(referrerLink(referrer.code))
    toast.add({ title: `已复制「${referrer.name}」的报名链接`, color: 'success' })
  } catch {
    toast.add({ title: '复制失败，请手动复制', description: referrerLink(referrer.code), color: 'warning' })
  }
}

// -- online sheet preview (总表在线预览编辑) ------------------------------------

const sheetRows = ref<RecruitSubmission[]>([])
const sheetSavingKey = ref('')

async function loadSheet(): Promise<void> {
  if (!selectedContentId.value) return
  try {
    const result = await adminFetch<RecruitSubmissionPage>(
      `/api/admin/recruit/submissions?contentId=${encodeURIComponent(selectedContentId.value)}&page=1&pageSize=100&query=`
    )
    sheetRows.value = result.items
  } catch {
    toast.add({ title: '总表预览加载失败', color: 'warning' })
  }
}

function sheetFieldType(key: string): string | undefined {
  return form.value?.fields.find(field => field.key === key)?.type
}

function sheetCellText(row: RecruitSubmission, key: string): string {
  const value = row.data[key]
  if (value === undefined || value === null) return ''
  return Array.isArray(value) ? value.join('、') : String(value)
}

async function saveSheetCell(row: RecruitSubmission, key: string, value: string): Promise<void> {
  const cellKey = `${row.id}:${key}`
  if (sheetSavingKey.value || sheetCellText(row, key) === value.trim()) return
  sheetSavingKey.value = cellKey
  try {
    const result = await adminFetch<{ submission: RecruitSubmission }>(
      `/api/admin/recruit/submissions/${row.id}?contentId=${encodeURIComponent(selectedContentId.value)}`,
      { method: 'PUT', body: { data: { ...row.data, [key]: value.trim() } } }
    )
    const index = sheetRows.value.findIndex(item => item.id === row.id)
    if (index !== -1) sheetRows.value[index] = result.submission
    void loadSubmissions()
  } catch {
    toast.add({ title: '保存失败', description: '该值格式不正确（请检查手机号/QQ/学号/选项）。', color: 'warning' })
  } finally {
    sheetSavingKey.value = ''
  }
}

function formatDateTime(value: number): string {
  return new Date(value).toLocaleString('zh-CN', { hour12: false })
}

// -- online viewing/editing of one submission ---------------------------------

const editOpen = ref(false)
const editSaving = ref(false)
const editingSubmission = ref<RecruitSubmission | null>(null)
const editTextValues = ref<Record<string, string>>({})
const editMultiValues = ref<Record<string, string[]>>({})

function openEdit(submission: RecruitSubmission): void {
  const fields = form.value?.fields ?? []
  editingSubmission.value = submission
  editTextValues.value = Object.fromEntries(fields
    .filter(field => field.type !== 'multiselect')
    .map(field => [field.key, typeof submission.data[field.key] === 'string'
      ? submission.data[field.key] as string
      : '']))
  editMultiValues.value = Object.fromEntries(fields
    .filter(field => field.type === 'multiselect')
    .map(field => [field.key, Array.isArray(submission.data[field.key])
      ? submission.data[field.key] as string[]
      : []]))
  editOpen.value = true
}

function editMultiselectSelected(fieldKey: string, option: string): boolean {
  return (editMultiValues.value[fieldKey] ?? []).includes(option)
}

function editToggleMultiselect(fieldKey: string, option: string, checked: boolean): void {
  const current = editMultiValues.value[fieldKey] ?? []
  editMultiValues.value = {
    ...editMultiValues.value,
    [fieldKey]: checked
      ? [...new Set([...current, option])]
      : current.filter(item => item !== option)
  }
}

async function saveEdit(): Promise<void> {
  const submission = editingSubmission.value
  if (!submission || editSaving.value) return
  // Missing fields are tolerated (paper-form imports) — the server only
  // rejects invalid values such as malformed phone/QQ/student numbers.
  editSaving.value = true
  try {
    await adminFetch(
      `/api/admin/recruit/submissions/${submission.id}?contentId=${encodeURIComponent(selectedContentId.value)}`,
      { method: 'PUT', body: { data: { ...editTextValues.value, ...editMultiValues.value } } }
    )
    editOpen.value = false
    toast.add({ title: '已保存', description: '修改会同步到之后生成的申请表文档与总表。', color: 'success' })
    void loadSubmissions()
  } catch {
    toast.add({ title: '保存失败', description: '请检查填写内容（手机号/QQ/学号格式）后重试。', color: 'warning' })
  } finally {
    editSaving.value = false
  }
}

watch(selectedContentId, () => {
  void loadForm()
  submissionsPage.value = 1
  selectedIds.value = new Set()
  void loadSubmissions()
  void loadSheet()
  void loadReferrers()
})

onMounted(async () => {
  try {
    await loadSession()
    if (adminRole.value === 'super') await loadClubs()
    await loadForm()
    await loadSubmissions()
    await loadSheet()
    await loadReferrers()
  } catch (error) {
    if (error instanceof Error && error.message === 'unauthenticated') return
    loadError.value = '纳新管理加载失败，请刷新重试。'
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-lg font-bold text-zinc-900 dark:text-zinc-100">
          纳新管理
        </h1>
        <p class="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          {{ form
            ? `${form.clubName} · 表单${form.status === 'open' ? '已开放，新生可填写提交' : '未开放，开放后报名入口生效'}`
            : '配置社团正式纳新表单、申请表模板与总表导出' }}
        </p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <USelect
          v-if="adminRole === 'super' && clubs.length > 0"
          v-model="selectedContentId"
          :items="clubs.map(club => ({ label: club.title, value: club.id }))"
          class="w-56"
        />
        <UButton
          icon="i-lucide-refresh-cw"
          label="刷新表单数据"
          color="neutral"
          variant="soft"
          :loading="refreshingForm"
          @click="refreshFormData"
        />
        <UButton
          v-if="recruitPublicUrl"
          :to="recruitPublicUrl"
          target="_blank"
          rel="noopener noreferrer"
          icon="i-lucide-external-link"
          label="查看报名页"
          color="neutral"
          variant="soft"
        />
        <UButton
          icon="i-lucide-save"
          label="保存配置"
          :loading="saving"
          :disabled="!form"
          @click="saveForm"
        />
      </div>
    </div>

    <div
      v-if="loading"
      class="grid min-h-80 place-items-center"
      role="status"
    >
      <UIcon
        name="i-lucide-loader-circle"
        class="size-7 animate-spin text-green-700 dark:text-green-400"
      />
    </div>
    <div
      v-else-if="loadError"
      class="rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950 p-5 text-sm text-red-800 dark:text-red-300"
      role="alert"
    >
      {{ loadError }}
    </div>
    <div
      v-else-if="!form"
      class="rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950 p-5 text-sm text-amber-900 dark:text-amber-300"
    >
      还没有可选的社团内容，请先在内容管理中创建社团。
    </div>

    <template v-else>
      <div class="flex flex-wrap items-center gap-1 rounded-lg border border-zinc-200 dark:border-zinc-800 p-1">
        <button
          v-for="section in sections"
          :key="section.key"
          type="button"
          class="rounded-md px-3 py-1 text-xs font-medium transition-colors"
          :class="activeSection === section.key
            ? 'bg-zinc-900 dark:bg-zinc-700 text-white'
            : 'text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'"
          @click="activeSection = section.key"
        >
          {{ section.label }}
        </button>
      </div>

      <section
        v-show="activeSection === 'settings'"
        class="space-y-4"
      >
        <div class="rounded-lg border border-zinc-200 dark:border-zinc-800 p-4 space-y-4">
          <div class="grid gap-4 md:grid-cols-2">
            <UFormField label="表单标题">
              <UInput
                v-model="form.title"
                class="w-full"
                placeholder="入会申请表"
              />
            </UFormField>
            <UFormField label="纳新状态">
              <div class="flex items-center gap-3 pt-1">
                <USwitch
                  :model-value="form.status === 'open'"
                  @update:model-value="value => form && (form.status = value ? 'open' : 'closed')"
                />
                <span class="text-sm text-zinc-600 dark:text-zinc-300">
                  {{ form.status === 'open' ? '开放报名中' : '已关闭' }}
                </span>
              </div>
            </UFormField>
          </div>
          <UFormField label="纳新语（展示在报名页标题下方）">
            <UInput
              v-model="form.slogan"
              class="w-full"
              placeholder="例如：用音符遇见同频的你！"
            />
          </UFormField>
          <UFormField label="社团介绍（展示在报名页）">
            <UTextarea
              v-model="form.intro"
              :rows="4"
              class="w-full"
              placeholder="介绍社团活动、部门构成、纳新安排等"
            />
          </UFormField>
        </div>

        <div class="rounded-lg border border-zinc-200 dark:border-zinc-800 p-4 space-y-3">
          <div class="flex items-center justify-between">
            <h2 class="text-sm font-bold text-zinc-900 dark:text-zinc-100">
              表单字段
            </h2>
            <UButton
              size="xs"
              icon="i-lucide-plus"
              label="添加字段"
              variant="soft"
              @click="addField"
            />
          </div>
          <p class="text-xs text-zinc-500 dark:text-zinc-400">
            字段顺序即报名页展示顺序；单选/多选字段用「、」分隔选项；手机号、QQ、学号会做格式校验。
          </p>
          <div class="space-y-3">
            <div
              v-for="(field, index) in form.fields"
              :key="field.key"
              class="rounded-md border border-zinc-200 dark:border-zinc-800 p-3"
            >
              <div class="flex flex-wrap items-end gap-3">
                <UFormField
                  label="字段名称"
                  class="w-40"
                >
                  <UInput
                    v-model="field.label"
                    class="w-full"
                  />
                </UFormField>
                <UFormField
                  label="类型"
                  class="w-32"
                >
                  <USelect
                    v-model="field.type"
                    :items="FIELD_TYPE_OPTIONS"
                    class="w-full"
                  />
                </UFormField>
                <UFormField
                  v-if="field.type === 'select' || field.type === 'multiselect'"
                  label="选项（用、分隔）"
                  class="min-w-56 flex-1"
                >
                  <UInput
                    :model-value="fieldOptionsText(field)"
                    class="w-full"
                    @update:model-value="value => setFieldOptions(field, value)"
                  />
                </UFormField>
                <UFormField
                  v-else
                  label="填写提示"
                  class="min-w-56 flex-1"
                >
                  <UInput
                    v-model="field.placeholder"
                    class="w-full"
                  />
                </UFormField>
                <UCheckbox
                  :model-value="field.required"
                  label="必填"
                  @update:model-value="value => (field.required = value === true)"
                />
                <div class="flex items-center gap-1 pb-0.5">
                  <UButton
                    size="xs"
                    color="neutral"
                    variant="soft"
                    icon="i-lucide-arrow-up"
                    :disabled="index === 0"
                    aria-label="上移"
                    @click="moveField(index, -1)"
                  />
                  <UButton
                    size="xs"
                    color="neutral"
                    variant="soft"
                    icon="i-lucide-arrow-down"
                    :disabled="index === form.fields.length - 1"
                    aria-label="下移"
                    @click="moveField(index, 1)"
                  />
                  <UButton
                    size="xs"
                    color="error"
                    variant="soft"
                    icon="i-lucide-trash-2"
                    aria-label="删除字段"
                    @click="removeField(index)"
                  />
                </div>
              </div>
              <div
                v-if="field.type === 'multiselect' && (field.options?.length ?? 0) > 0"
                class="mt-3 space-y-2 border-t border-zinc-100 dark:border-zinc-800 pt-3"
              >
                <p class="text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                  部门介绍（新生在表单中点「?」展开查看，可留空）
                </p>
                <div
                  v-for="option in field.options ?? []"
                  :key="option"
                  class="flex flex-wrap items-start gap-2"
                >
                  <span class="w-24 shrink-0 pt-1.5 text-xs text-zinc-500 dark:text-zinc-400">{{ option }}</span>
                  <UTextarea
                    :model-value="fieldOptionDetailText(field, option)"
                    :rows="2"
                    class="min-w-64 flex-1"
                    placeholder="该部门的介绍，如活动内容、招新要求等"
                    @update:model-value="value => setFieldOptionDetail(field, option, value)"
                  />
                </div>
              </div>
            </div>
          </div>

          <div class="rounded-lg border border-zinc-200 dark:border-zinc-800 p-4 space-y-3">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <h2 class="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                缴费设置（可选）
              </h2>
              <div class="flex items-center gap-2">
                <USwitch
                  :model-value="form.payment.enabled"
                  @update:model-value="value => form && (form.payment.enabled = value === true)"
                />
                <span class="text-xs text-zinc-600 dark:text-zinc-300">
                  {{ form.payment.enabled ? '报名页展示收款码并要求确认缴费' : '未启用' }}
                </span>
              </div>
            </div>
            <p class="text-xs leading-5 text-zinc-500 dark:text-zinc-400">
              启用后报名页会展示收款码（点击可放大，微信可长按识别）并要求新生确认已缴费才能提交；会提示备注「{{ form.payment.note }}」。
            </p>
            <div class="grid gap-3 md:grid-cols-2">
              <div
                v-for="slot in [
                  { key: 'wechat' as const, label: '微信收款码', image: form.payment.wechatImage },
                  { key: 'alipay' as const, label: '支付宝收款码', image: form.payment.alipayImage }
                ]"
                :key="slot.key"
                class="rounded-md border border-zinc-200 dark:border-zinc-800 p-3"
              >
                <div class="flex items-center justify-between">
                  <span class="text-xs font-semibold text-zinc-700 dark:text-zinc-200">{{ slot.label }}</span>
                  <UButton
                    size="xs"
                    variant="soft"
                    icon="i-lucide-upload"
                    :label="slot.image ? '更换' : '上传'"
                    :loading="paymentUploading && paymentUploadTarget === slot.key"
                    @click="triggerPaymentUpload(slot.key)"
                  />
                </div>
                <img
                  v-if="slot.image"
                  :src="slot.image"
                  :alt="slot.label"
                  class="mt-2 max-h-40 rounded border border-zinc-200 dark:border-zinc-700"
                >
                <p
                  v-else
                  class="mt-2 text-xs text-zinc-400"
                >
                  未上传
                </p>
                <UButton
                  v-if="slot.image"
                  size="xs"
                  color="error"
                  variant="ghost"
                  label="清除"
                  class="mt-1"
                  @click="clearPaymentImage(slot.key)"
                />
              </div>
            </div>
            <UFormField label="付款提示文案">
              <UInput
                v-model="form.payment.note"
                class="w-full"
                placeholder="付款请备注：班级+姓名+电话"
              />
            </UFormField>
          </div>
        </div>
      </section>

      <section
        v-show="activeSection === 'referrers'"
        class="space-y-4"
      >
        <div class="rounded-lg border border-zinc-200 dark:border-zinc-800 p-4 space-y-4">
          <div>
            <div class="flex flex-wrap items-baseline justify-between gap-2">
              <h2 class="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                添加纳新人
              </h2>
              <span class="text-xs font-medium text-emerald-700 dark:text-emerald-300">
                报名页累计浏览 {{ form.views }} 次（含各邀请链接浏览）
              </span>
            </div>
            <p class="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              为每个纳新人生成专属邀请码；通过 TA 的链接报名的记录会在数据库与总表最后一列自动标注邀请人。不带邀请码的报名不记录邀请人。
            </p>
          </div>
          <div class="flex flex-wrap items-end gap-3">
            <UFormField
              label="纳新人姓名"
              class="w-44"
            >
              <UInput
                v-model="referrerNameInput"
                placeholder="如：张三"
                class="w-full"
                @keydown.enter="addReferrer"
              />
            </UFormField>
            <UFormField
              label="自定义邀请码（留空自动生成）"
              class="w-56"
            >
              <UInput
                v-model="referrerCodeInput"
                placeholder="如：ZHANGSAN"
                class="w-full"
                @keydown.enter="addReferrer"
              />
            </UFormField>
            <UButton
              icon="i-lucide-user-plus"
              label="添加纳新人"
              :loading="referrerBusy"
              @click="addReferrer"
            />
          </div>
        </div>

        <div
          v-if="referrers.length === 0"
          class="rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 p-8 text-center text-sm text-zinc-500 dark:text-zinc-400"
        >
          还没有纳新人，添加后即可分发带邀请码的报名链接。
        </div>
        <div
          v-else
          class="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800"
        >
          <table class="w-full min-w-[860px] text-sm">
            <thead class="bg-zinc-50 dark:bg-zinc-800/60 text-left text-xs text-zinc-500 dark:text-zinc-400">
              <tr>
                <th class="px-3 py-2 font-medium">
                  纳新人
                </th>
                <th class="px-3 py-2 font-medium">
                  邀请码
                </th>
                <th class="px-3 py-2 font-medium">
                  浏览
                </th>
                <th class="px-3 py-2 font-medium">
                  专属报名链接
                </th>
                <th class="px-3 py-2 font-medium">
                  操作
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-zinc-200 dark:divide-zinc-800">
              <tr
                v-for="referrer in referrers"
                :key="referrer.id"
                class="text-zinc-800 dark:text-zinc-200"
              >
                <td class="px-3 py-2 font-medium">
                  {{ referrer.name }}
                </td>
                <td class="px-3 py-2">
                  <code class="rounded bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 text-xs font-mono">{{ referrer.code }}</code>
                </td>
                <td class="px-3 py-2 tabular-nums">
                  {{ referrer.views }}
                </td>
                <td class="px-3 py-2 max-w-0">
                  <span class="block truncate text-xs text-zinc-500 dark:text-zinc-400">{{ referrerLink(referrer.code) }}</span>
                </td>
                <td class="px-3 py-2">
                  <div class="flex items-center gap-1">
                    <UButton
                      size="xs"
                      variant="soft"
                      icon="i-lucide-copy"
                      label="复制链接"
                      @click="copyReferrerLink(referrer)"
                    />
                    <UButton
                      size="xs"
                      color="error"
                      variant="soft"
                      icon="i-lucide-trash-2"
                      aria-label="删除"
                      @click="removeReferrer(referrer)"
                    />
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section
        v-show="activeSection === 'template'"
        class="space-y-4"
      >
        <div class="rounded-lg border border-zinc-200 dark:border-zinc-800 p-4 space-y-4">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 class="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                申请表模板
              </h2>
              <p class="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                {{ form.templateName
                  ? `当前模板：${form.templateName}`
                  : '尚未上传模板，新生提交后将无法生成文档' }}
              </p>
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <input
                ref="templateFileInput"
                type="file"
                accept=".docx"
                class="hidden"
                @change="onTemplateFileChange"
              >
              <input
                ref="paymentFileInput"
                type="file"
                accept="image/*"
                class="hidden"
                @change="onPaymentFileChange"
              >
              <UButton
                icon="i-lucide-upload"
                :label="form.templateName ? '重新上传模板' : '上传模板'"
                :loading="uploadingTemplate"
                variant="soft"
                @click="templateFileInput?.click()"
              />
              <UButton
                v-if="form.templateName"
                icon="i-lucide-download"
                label="下载模板"
                color="neutral"
                variant="soft"
                @click="downloadTemplate"
              />
              <UButton
                v-if="form.templateName"
                icon="i-lucide-file-check-2"
                label="下载示例文档"
                color="neutral"
                variant="soft"
                @click="downloadSampleDoc"
              />
            </div>
          </div>
          <p class="text-xs leading-5 text-zinc-500 dark:text-zinc-400">
            模板为 .docx 文件（3MB 以内）。生成规则：文档中与「标签」文字完全一致的单元格，其右侧第一个空单元格会被填入对应表单数据；多选字段（如意向部门）按选项文字匹配，在选项右侧空单元格打勾。
          </p>
          <div v-if="form.templateLabels.length > 0">
            <p class="text-xs font-semibold text-zinc-700 dark:text-zinc-200">
              模板中识别到的标签（可点击填入映射）
            </p>
            <div class="mt-2 flex flex-wrap gap-1.5">
              <UButton
                v-for="label in form.templateLabels"
                :key="label"
                size="xs"
                color="neutral"
                variant="soft"
                :label="label"
                @click="copyTemplateLabel(label)"
              />
            </div>
          </div>
        </div>

        <div class="rounded-lg border border-zinc-200 dark:border-zinc-800 p-4 space-y-3">
          <div class="flex items-center justify-between">
            <h2 class="text-sm font-bold text-zinc-900 dark:text-zinc-100">
              文档标签映射
            </h2>
            <UButton
              size="xs"
              icon="i-lucide-plus"
              label="添加映射"
              variant="soft"
              @click="addMapping"
            />
          </div>
          <p class="text-xs text-zinc-500 dark:text-zinc-400">
            左侧填写模板单元格里的原文（如「姓名」），右侧选择要把哪个字段填到它旁边的空格里。
          </p>
          <div class="space-y-2">
            <div
              v-for="(mapping, index) in form.doc.mappings"
              :key="`${mapping.label}-${index}`"
              class="flex flex-wrap items-center gap-2"
            >
              <UInput
                v-model="mapping.label"
                placeholder="文档标签，如：姓名"
                class="w-56"
                list="recruit-template-labels"
              />
              <span class="text-xs text-zinc-400">→</span>
              <USelect
                v-model="mapping.fieldKey"
                :items="fieldOptions"
                class="w-52"
              />
              <div class="flex items-center gap-1">
                <UButton
                  size="xs"
                  color="neutral"
                  variant="soft"
                  icon="i-lucide-arrow-up"
                  aria-label="上移"
                  @click="moveMapping(index, -1)"
                />
                <UButton
                  size="xs"
                  color="neutral"
                  variant="soft"
                  icon="i-lucide-arrow-down"
                  aria-label="下移"
                  @click="moveMapping(index, 1)"
                />
                <UButton
                  size="xs"
                  color="error"
                  variant="soft"
                  icon="i-lucide-trash-2"
                  aria-label="删除映射"
                  @click="removeMapping(index)"
                />
              </div>
            </div>
          </div>
          <datalist id="recruit-template-labels">
            <option
              v-for="label in form.templateLabels"
              :key="label"
              :value="label"
            />
          </datalist>

          <div class="flex flex-wrap items-center gap-3 border-t border-zinc-200 dark:border-zinc-800 pt-3">
            <UFormField label="多选勾选字段（如意向部门）">
              <USelect
                :model-value="form.doc.multiSelect?.fieldKey ?? null"
                :items="[{ label: '不使用', value: null }, ...multiselectFieldOptions]"
                class="w-52"
                @update:model-value="value => form && (form.doc.multiSelect = value
                  ? { fieldKey: value, mark: form.doc.multiSelect?.mark || '√' }
                  : null)"
              />
            </UFormField>
            <UFormField
              v-if="form.doc.multiSelect"
              label="勾选符号"
            >
              <UInput
                v-model="form.doc.multiSelect.mark"
                class="w-20"
              />
            </UFormField>
          </div>
        </div>
      </section>

      <section
        v-show="activeSection === 'submissions'"
        class="space-y-4"
      >
        <div class="flex flex-wrap items-center gap-2">
          <UInput
            v-model="searchQuery"
            icon="i-lucide-search"
            placeholder="搜索姓名 / 专业班级 / 学号 / 手机号"
            class="w-72"
            @keydown.enter="searchSubmissions"
          />
          <UButton
            label="搜索"
            color="neutral"
            variant="soft"
            @click="searchSubmissions"
          />
          <UButton
            icon="i-lucide-package-open"
            :label="`下载选中（${selectedCount}）`"
            :disabled="selectedCount === 0"
            @click="downloadSelected"
          />
          <span class="text-xs text-zinc-500 dark:text-zinc-400">
            共 {{ submissionsTotal }} 条
          </span>
        </div>

        <div
          v-if="loadingSubmissions"
          class="grid min-h-40 place-items-center"
          role="status"
        >
          <UIcon
            name="i-lucide-loader-circle"
            class="size-6 animate-spin text-zinc-400"
          />
        </div>
        <div
          v-else-if="submissions.length === 0"
          class="rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 p-8 text-center text-sm text-zinc-500 dark:text-zinc-400"
        >
          还没有收到报名，开放表单后把报名页链接发给新生即可。
        </div>
        <div
          v-else
          class="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800"
        >
          <table class="w-full min-w-[1040px] text-sm">
            <thead class="bg-zinc-50 dark:bg-zinc-800/60 text-left text-xs text-zinc-500 dark:text-zinc-400">
              <tr>
                <th class="w-10 px-3 py-2">
                  <UCheckbox
                    :model-value="allOnPageSelected"
                    aria-label="全选本页"
                    @update:model-value="value => toggleSelectAll(value)"
                  />
                </th>
                <th class="px-3 py-2 font-medium">
                  提交时间
                </th>
                <th class="px-3 py-2 font-medium">
                  姓名
                </th>
                <th class="px-3 py-2 font-medium">
                  性别
                </th>
                <th class="px-3 py-2 font-medium">
                  学号
                </th>
                <th class="px-3 py-2 font-medium">
                  专业班级
                </th>
                <th class="px-3 py-2 font-medium">
                  手机号
                </th>
                <th class="px-3 py-2 font-medium">
                  意向部门
                </th>
                <th class="px-3 py-2 font-medium">
                  操作
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-zinc-200 dark:divide-zinc-800">
              <tr
                v-for="submission in submissions"
                :key="submission.id"
                class="text-zinc-800 dark:text-zinc-200"
              >
                <td class="px-3 py-2">
                  <UCheckbox
                    :model-value="selectedIds.has(submission.id)"
                    :aria-label="`选中 ${submission.name || '该提交'}`"
                    @update:model-value="value => toggleSelectOne(submission.id, value)"
                  />
                </td>
                <td class="px-3 py-2 whitespace-nowrap text-xs text-zinc-500 dark:text-zinc-400">
                  {{ formatDateTime(submission.createdAt) }}
                </td>
                <td class="px-3 py-2 font-medium">
                  {{ submission.name || '—' }}
                </td>
                <td class="px-3 py-2">
                  {{ submission.gender || '—' }}
                </td>
                <td class="px-3 py-2">
                  {{ submission.studentNo || '—' }}
                </td>
                <td class="px-3 py-2">
                  {{ submission.className || '—' }}
                </td>
                <td class="px-3 py-2">
                  {{ submission.phone || '—' }}
                </td>
                <td class="px-3 py-2">
                  {{ submission.departments || '—' }}
                </td>
                <td class="px-3 py-2">
                  <div class="flex items-center gap-1">
                    <UButton
                      size="xs"
                      variant="soft"
                      icon="i-lucide-pencil"
                      label="查看编辑"
                      @click="openEdit(submission)"
                    />
                    <UButton
                      size="xs"
                      variant="soft"
                      icon="i-lucide-file-down"
                      label="下载文档"
                      @click="downloadSubmissionDoc(submission)"
                    />
                    <UButton
                      size="xs"
                      color="error"
                      variant="soft"
                      icon="i-lucide-trash-2"
                      aria-label="删除"
                      @click="deleteSubmission(submission)"
                    />
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="flex items-center justify-between">
          <span class="text-xs text-zinc-500 dark:text-zinc-400">
            第 {{ submissionsPage }} 页
          </span>
          <div class="flex items-center gap-2">
            <UButton
              size="xs"
              color="neutral"
              variant="soft"
              icon="i-lucide-arrow-left"
              label="上一页"
              :disabled="submissionsPage <= 1 || loadingSubmissions"
              @click="changeSubmissionsPage(-1)"
            />
            <UButton
              size="xs"
              color="neutral"
              variant="soft"
              label="下一页"
              trailing-icon="i-lucide-arrow-right"
              :disabled="submissionsPage * submissionsPageSize >= submissionsTotal || loadingSubmissions"
              @click="changeSubmissionsPage(1)"
            />
          </div>
        </div>
      </section>

      <section
        v-show="activeSection === 'export'"
        class="space-y-4"
      >
        <div class="rounded-lg border border-zinc-200 dark:border-zinc-800 p-4 space-y-3">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 class="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                总表导出列
              </h2>
              <p class="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                调整导出 Excel 的列与顺序，保存配置后生效。
              </p>
            </div>
            <UButton
              icon="i-lucide-file-spreadsheet"
              label="下载总表（xlsx）"
              @click="downloadExportWorkbook"
            />
          </div>
          <div class="space-y-2">
            <div
              v-for="(column, index) in form.exportColumns"
              :key="`${column.key}-${index}`"
              class="flex flex-wrap items-center gap-2"
            >
              <USelect
                :model-value="column.key"
                :items="columnSourceOptions.map(source => ({ label: source.label, value: source.key }))"
                class="w-52"
                @update:model-value="value => onExportColumnKeyChange(column, String(value))"
              />
              <UInput
                v-model="column.label"
                placeholder="表头显示名"
                class="w-44"
              />
              <div class="flex items-center gap-1">
                <UButton
                  size="xs"
                  color="neutral"
                  variant="soft"
                  icon="i-lucide-arrow-up"
                  aria-label="上移"
                  @click="moveExportColumn(index, -1)"
                />
                <UButton
                  size="xs"
                  color="neutral"
                  variant="soft"
                  icon="i-lucide-arrow-down"
                  aria-label="下移"
                  @click="moveExportColumn(index, 1)"
                />
                <UButton
                  size="xs"
                  color="error"
                  variant="soft"
                  icon="i-lucide-trash-2"
                  aria-label="删除列"
                  @click="removeExportColumn(index)"
                />
              </div>
            </div>
          </div>
          <UButton
            size="xs"
            icon="i-lucide-plus"
            label="添加导出列"
            variant="soft"
            @click="addExportColumn"
          />
        </div>

        <div class="rounded-lg border border-zinc-200 dark:border-zinc-800 p-4 space-y-3">
          <div>
            <h2 class="text-sm font-bold text-zinc-900 dark:text-zinc-100">
              总表在线预览
            </h2>
            <p class="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              按上方导出列实时预览全部提交，单元格可直接修改，失焦后自动保存并同步到文档与 Excel。
            </p>
          </div>
          <div
            v-if="sheetRows.length === 0"
            class="border border-dashed border-zinc-300 dark:border-zinc-700 rounded-md p-6 text-center text-sm text-zinc-500 dark:text-zinc-400"
          >
            还没有提交数据
          </div>
          <div
            v-else
            class="overflow-x-auto rounded-md border border-zinc-200 dark:border-zinc-800"
          >
            <table class="w-full text-sm">
              <thead class="bg-zinc-50 dark:bg-zinc-800/60 text-left text-xs text-zinc-500 dark:text-zinc-400">
                <tr>
                  <th
                    v-for="column in form.exportColumns"
                    :key="`head-${column.key}`"
                    class="px-3 py-2 font-medium whitespace-nowrap"
                  >
                    {{ column.label }}
                  </th>
                </tr>
              </thead>
              <tbody class="divide-y divide-zinc-200 dark:divide-zinc-800">
                <tr
                  v-for="row in sheetRows"
                  :key="row.id"
                  class="text-zinc-800 dark:text-zinc-200"
                >
                  <td
                    v-for="column in form.exportColumns"
                    :key="`${row.id}:${column.key}`"
                    class="px-2 py-1.5 min-w-[9rem]"
                  >
                    <span
                      v-if="sheetFieldType(column.key) === 'multiselect'"
                      class="text-xs leading-6"
                    >{{ sheetCellText(row, column.key) || '—' }}</span>
                    <UInput
                      v-else
                      size="xs"
                      class="w-full"
                      :model-value="sheetCellText(row, column.key)"
                      :loading="sheetSavingKey === `${row.id}:${column.key}`"
                      @change="event => saveSheetCell(row, column.key, (event.target as HTMLInputElement)?.value ?? '')"
                    />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </template>

    <UModal
      v-model:open="editOpen"
      :title="editingSubmission ? `查看 / 编辑 - ${editingSubmission.name || '未署名'}` : '查看 / 编辑'"
      :ui="{ content: 'w-[calc(100vw-1rem)] sm:max-w-xl' }"
    >
      <template #body>
        <div
          v-if="editingSubmission"
          class="space-y-4"
        >
          <p class="text-xs text-zinc-500 dark:text-zinc-400">
            提交于 {{ formatDateTime(editingSubmission.createdAt) }} · 保存后重新校验并同步到申请表文档与总表
          </p>
          <div
            v-for="field in form?.fields ?? []"
            :key="field.key"
          >
            <label
              class="flex items-baseline gap-1 text-sm font-semibold text-zinc-900 dark:text-zinc-100"
              :for="`edit-field-${field.key}`"
            >
              <span>{{ field.label }}</span>
              <span
                v-if="field.required"
                class="text-red-600 dark:text-red-400"
                aria-hidden="true"
              >*</span>
            </label>
            <div class="mt-2">
              <UTextarea
                v-if="field.type === 'textarea'"
                :id="`edit-field-${field.key}`"
                v-model="editTextValues[field.key]"
                :rows="3"
                class="w-full"
              />
              <USelect
                v-else-if="field.type === 'select'"
                :id="`edit-field-${field.key}`"
                v-model="editTextValues[field.key]"
                :items="field.options ?? []"
                class="w-full"
              />
              <div
                v-else-if="field.type === 'multiselect'"
                class="flex min-h-10 flex-wrap items-center gap-x-5 gap-y-2"
              >
                <UCheckbox
                  v-for="option in field.options ?? []"
                  :key="option"
                  :model-value="editMultiselectSelected(field.key, option)"
                  :label="option"
                  @update:model-value="value => editToggleMultiselect(field.key, option, value === true)"
                />
              </div>
              <UInput
                v-else
                :id="`edit-field-${field.key}`"
                v-model="editTextValues[field.key]"
                :placeholder="field.placeholder"
                class="w-full"
              />
            </div>
          </div>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full items-center justify-end gap-2">
          <UButton
            label="取消"
            color="neutral"
            variant="soft"
            @click="() => { editOpen = false }"
          />
          <UButton
            label="保存修改"
            icon="i-lucide-save"
            :loading="editSaving"
            @click="saveEdit"
          />
        </div>
      </template>
    </UModal>
  </div>
</template>
