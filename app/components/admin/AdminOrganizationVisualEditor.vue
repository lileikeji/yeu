<script setup lang="ts">
import {
  clubSectionLabels,
  clubSignupQuestionChecklist,
  defaultClubFindingIt,
  defaultClubSuitableFor
} from '~/utils/club-detail-presentation'
import { getRequestMessage } from '~/utils/request-error'

interface EditorBox {
  id: string
  title: string
  body: string
  itemsText: string
  icon: string
  tone: 'plain' | 'green' | 'blue' | 'amber'
  placement: 'default' | 'after-overview' | 'after-signup' | 'after-intro' | 'after-recruitment' | 'after-contact' | 'before-community'
  imageUrls: string[]
  imageTitles: string[]
}

interface EditorSignupQa {
  question: string
  answer: string
}

interface EditorModel {
  id: string
  kind: 'club' | 'department'
  slug: string
  title: string
  summary: string
  body: string
  category: string
  isFeatured: boolean
  status: string
  lastVerifiedAt: string
  sourceIdsText: string
  metadata: Record<string, unknown>
  verificationState: string
  featuredSummary: string
  sortOrderText: string
  group: string
  direction: string
  overviewTitle: string
  suitableFor: string
  findingIt: string
  iconUrl: string
  recruitmentPeriod: string
  activitySchedule: string
  contactMethod: string
  website: string
  profileUrl: string
  contactUrl: string
  phone: string
  email: string
  address: string
  officeHours: string
  contactName: string
  contactPhonesText: string
  signupQa: EditorSignupQa[]
  groupQrUrls: string[]
  groupQrTitles: string[]
  contactQrUrls: string[]
  contactQrTitles: string[]
  boxes: EditorBox[]
}

interface AdminSourceSummary {
  id: string
  title: string
  sourceLevel: 'A' | 'B' | 'C' | 'D' | 'E'
  isOfficial: boolean
  status: 'active' | 'unavailable' | 'disputed'
}

const props = defineProps<{
  contentId?: string
  createKind?: 'club' | 'department'
  readonly?: boolean
  allowDetailedEdit?: boolean
  organizationMode?: boolean
}>()

const toast = useToast()
const loading = ref(Boolean(props.contentId))
const saving = ref(false)
const loadError = ref('')
const saveError = ref('')
const uploadTarget = ref<string | null>(null)
const model = reactive<EditorModel>({
  id: '',
  kind: props.createKind === 'department' ? 'department' : 'club',
  slug: '',
  title: '',
  summary: '',
  body: '',
  category: '',
  isFeatured: false,
  status: 'draft',
  lastVerifiedAt: '',
  sourceIdsText: '',
  metadata: {},
  verificationState: '',
  featuredSummary: '',
  sortOrderText: '100',
  group: '',
  direction: '',
  overviewTitle: clubSectionLabels.overview,
  suitableFor: defaultClubSuitableFor,
  findingIt: defaultClubFindingIt,
  iconUrl: '',
  recruitmentPeriod: '',
  activitySchedule: '',
  contactMethod: '',
  website: '',
  profileUrl: '',
  contactUrl: '',
  phone: '',
  email: '',
  address: '',
  officeHours: '',
  contactName: '',
  contactPhonesText: '',
  signupQa: clubSignupQuestionChecklist.map(question => ({ question, answer: '' })),
  groupQrUrls: [],
  groupQrTitles: [],
  contactQrUrls: [],
  contactQrTitles: [],
  boxes: []
})
const availableSources = ref<AdminSourceSummary[]>([])
const sourcesLoading = ref(false)
const sourcesError = ref('')
const sourceSearch = ref('')
let sourceSearchTimer: ReturnType<typeof setTimeout> | null = null
let sourceRequestVersion = 0

const isCreating = computed(() => !model.id)
const publicPath = computed(() => `/${model.kind === 'club' ? 'clubs' : 'departments'}/${encodeURIComponent(model.slug)}`)
const kindLabel = computed(() => model.kind === 'club' ? '社团' : '部门')
const kindOptions = [
  { label: '学生社团', value: 'club' },
  { label: '学校部门', value: 'department' }
]
const verificationOptions = [
  { label: '未设置', value: '' },
  { label: '已确认', value: 'verified' },
  { label: '部分确认', value: 'partial' },
  { label: '等待通知', value: 'awaiting-notice' }
]
const boxPlacementOptions = computed(() => [
  { label: '默认位置（介绍与联系区域之间）', value: 'default' },
  { label: model.kind === 'club' ? '“先了解这个社团”后' : '“先了解这个部门”后', value: 'after-overview' },
  ...(model.kind === 'club'
    ? [
        { label: '“报名时可以先问”后', value: 'after-signup' },
        { label: '“招新与活动”后', value: 'after-recruitment' }
      ]
    : [{ label: '公开联系方式后', value: 'after-contact' }]),
  { label: model.kind === 'club' ? '社团介绍后' : '部门介绍后', value: 'after-intro' },
  { label: '“加入群聊与联系负责人”前', value: 'before-community' }
])
const selectedSourceIds = computed(() => new Set(
  model.sourceIdsText
    .split(/[\s,]+/)
    .map(item => item.trim())
    .filter(Boolean)
))
const publishableSources = computed(() => availableSources.value.filter(source => (
  source.status === 'active'
  && (source.sourceLevel === 'C'
    || ((source.sourceLevel === 'A' || source.sourceLevel === 'B') && source.isOfficial))
)))

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function mergeAvailableSources(values: unknown): void {
  if (!Array.isArray(values)) return
  const merged = new Map(availableSources.value.map(source => [source.id, source]))
  for (const value of values) {
    const source = record(value)
    const id = text(source.id)
    const title = text(source.title)
    const sourceLevel = text(source.sourceLevel)
    const status = text(source.status)
    if (!id || !title || !['A', 'B', 'C', 'D', 'E'].includes(sourceLevel)) continue
    if (!['active', 'unavailable', 'disputed'].includes(status)) continue
    merged.set(id, {
      id,
      title,
      sourceLevel: sourceLevel as AdminSourceSummary['sourceLevel'],
      isOfficial: source.isOfficial === true,
      status: status as AdminSourceSummary['status']
    })
  }
  availableSources.value = [...merged.values()].sort((left, right) => (
    left.sourceLevel.localeCompare(right.sourceLevel, 'zh-CN')
    || left.title.localeCompare(right.title, 'zh-CN')
  ))
}

async function loadAvailableSources(): Promise<void> {
  if (!props.allowDetailedEdit) return
  const version = ++sourceRequestVersion
  sourcesLoading.value = true
  sourcesError.value = ''
  try {
    const query = new URLSearchParams({
      page: '1',
      pageSize: '100',
      status: 'active'
    })
    if (sourceSearch.value.trim()) query.set('q', sourceSearch.value.trim())
    const result = await adminFetch<{ items?: unknown[] }>(`/api/admin/sources?${query}`)
    if (version !== sourceRequestVersion) return
    mergeAvailableSources(result.items)
  } catch {
    if (version !== sourceRequestVersion) return
    sourcesError.value = '来源列表加载失败，请稍后重试。'
  } finally {
    if (version === sourceRequestVersion) sourcesLoading.value = false
  }
}

function toggleSource(sourceId: string, selected: boolean): void {
  const ids = new Set(selectedSourceIds.value)
  if (selected) ids.add(sourceId)
  else ids.delete(sourceId)
  model.sourceIdsText = [...ids].join('\n')
}

function setVerifiedNow(): void {
  const date = new Date()
  const offset = date.getTimezoneOffset() * 60_000
  model.lastVerifiedAt = new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

function dateTimeInput(value: unknown): string {
  if (typeof value !== 'string' && typeof value !== 'number') return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

function isoDateOrNull(value: string): string | null {
  if (!value.trim()) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function stringList(value: unknown, legacyValue?: unknown): string[] {
  const items = Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim()))
    : typeof legacyValue === 'string' && legacyValue.trim()
      ? [legacyValue.trim()]
      : []
  return [...new Set(items)]
}

function alignedQrTitles(value: unknown, length: number): string[] {
  const values = Array.isArray(value) ? value : []
  return Array.from({ length }, (_, index) => (
    typeof values[index] === 'string' ? values[index].trim().slice(0, 100) : ''
  ))
}

function syncQrTitleLengths(): void {
  model.groupQrTitles = alignedQrTitles(model.groupQrTitles, model.groupQrUrls.length)
  model.contactQrTitles = alignedQrTitles(model.contactQrTitles, model.contactQrUrls.length)
}

function editorBoxes(value: unknown): EditorBox[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    const source = record(item)
    const id = text(source.id)
    const title = text(source.title)
    if (!id || !title) return []
    const tone = ['plain', 'green', 'blue', 'amber'].includes(text(source.tone))
      ? text(source.tone) as EditorBox['tone']
      : 'plain'
    const placement = [
      'default',
      'after-overview',
      'after-signup',
      'after-intro',
      'after-recruitment',
      'after-contact',
      'before-community'
    ].includes(text(source.placement))
      ? text(source.placement) as EditorBox['placement']
      : 'default'
    const imageUrls = stringList(source.imageUrls)
    return [{
      id,
      title,
      body: text(source.body),
      itemsText: Array.isArray(source.items)
        ? source.items.filter((entry): entry is string => typeof entry === 'string').join('\n')
        : '',
      icon: text(source.icon) || 'i-lucide-layout-panel-top',
      tone,
      placement,
      imageUrls,
      imageTitles: alignedQrTitles(source.imageTitles, imageUrls.length)
    }]
  })
}

function editorSignupQa(metadata: Record<string, unknown>): EditorSignupQa[] {
  if (Array.isArray(metadata.signupQa)) {
    const items = metadata.signupQa.flatMap((value): EditorSignupQa[] => {
      const item = record(value)
      const question = text(item.question).trim()
      if (!question) return []
      return [{ question, answer: text(item.answer).trim() }]
    })
    if (items.length) return items
  }

  const questions = Array.isArray(metadata.signupQuestions)
    ? stringList(metadata.signupQuestions)
    : [...clubSignupQuestionChecklist]
  return questions.map(question => ({ question, answer: '' }))
}

function hydrate(payload: unknown): void {
  const content = record(payload)
  const metadata = record(content.metadata)
  model.id = text(content.id)
  model.kind = content.kind === 'department' ? 'department' : 'club'
  model.slug = text(content.slug)
  model.title = text(content.title)
  model.summary = text(content.summary)
  model.body = text(content.body)
  model.category = text(content.category)
  model.isFeatured = content.isFeatured === true
  model.status = text(content.status) || 'draft'
  model.lastVerifiedAt = dateTimeInput(content.lastVerifiedAt)
  model.sourceIdsText = Array.isArray(content.sources)
    ? content.sources.flatMap((source) => {
        const id = text(record(source).id)
        return id ? [id] : []
      }).join('\n')
    : ''
  model.metadata = { ...metadata }
  model.verificationState = text(metadata.verificationState)
  model.featuredSummary = text(metadata.featuredSummary)
  model.sortOrderText = typeof metadata.sortOrder === 'number'
    ? String(metadata.sortOrder)
    : '100'
  model.group = text(metadata.group)
  model.direction = text(metadata.direction)
  model.overviewTitle = text(metadata.overviewTitle) || clubSectionLabels.overview
  model.suitableFor = text(metadata.suitableFor) || defaultClubSuitableFor
  model.findingIt = text(metadata.findingIt) || defaultClubFindingIt
  model.iconUrl = text(metadata.iconUrl)
  model.recruitmentPeriod = text(metadata.recruitmentPeriod)
  model.activitySchedule = text(metadata.activitySchedule)
  model.contactMethod = text(metadata.contactMethod)
  model.website = text(metadata.website)
  model.profileUrl = text(metadata.profileUrl)
  model.contactUrl = text(metadata.contactUrl)
  model.phone = text(metadata.phone)
  model.email = text(metadata.email)
  model.address = text(metadata.address)
  model.officeHours = text(metadata.officeHours)
  model.contactName = text(metadata.contactName)
  model.contactPhonesText = stringList(metadata.contactPhones, metadata.contactPhone).join('\n')
  model.signupQa = editorSignupQa(metadata)
  model.groupQrUrls = stringList(metadata.groupQrUrls, metadata.groupQrUrl)
  model.groupQrTitles = alignedQrTitles(metadata.groupQrTitles, model.groupQrUrls.length)
  model.contactQrUrls = stringList(metadata.contactQrUrls, metadata.contactQrUrl)
  model.contactQrTitles = alignedQrTitles(metadata.contactQrTitles, model.contactQrUrls.length)
  model.boxes = editorBoxes(metadata.boxes)
  mergeAvailableSources(content.sources)
}

async function loadContent(): Promise<void> {
  if (!props.contentId) {
    loading.value = false
    return
  }
  loading.value = true
  loadError.value = ''
  try {
    hydrate(await adminFetch(`/api/admin/content/${encodeURIComponent(props.contentId)}`))
  } catch {
    loadError.value = '页面内容加载失败，请刷新后重试。'
  } finally {
    loading.value = false
  }
}

function boxPayload(box: EditorBox) {
  return {
    id: box.id,
    title: box.title.trim(),
    body: box.body.trim(),
    items: box.itemsText.split('\n').map(item => item.trim()).filter(Boolean),
    icon: box.icon.trim() || 'i-lucide-layout-panel-top',
    tone: box.tone,
    placement: box.placement,
    imageUrls: box.imageUrls,
    imageTitles: Array.from({ length: box.imageUrls.length }, (_, index) => box.imageTitles[index]?.trim() ?? '')
  }
}

async function save(): Promise<void> {
  if (props.readonly) return
  saveError.value = ''
  if (!model.title.trim() || !model.summary.trim()) {
    saveError.value = '页面标题和简介不能为空。'
    return
  }
  if (!props.organizationMode && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(model.slug.trim())) {
    saveError.value = '网页地址名称只能使用小写字母、数字和短横线。'
    return
  }
  const sortOrder = Number(model.sortOrderText)
  if (!props.organizationMode && (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 9999)) {
    saveError.value = '前台排序必须是 0 到 9999 之间的整数。'
    return
  }
  if (model.boxes.some(box => !box.title.trim())) {
    saveError.value = '每个 Box 都需要填写标题。'
    return
  }
  const signupQa = model.signupQa.map(item => ({
    question: item.question.trim(),
    answer: item.answer.trim()
  }))
  const signupQuestions = signupQa.map(item => item.question)
  if (model.kind === 'club' && signupQuestions.some(item => !item)) {
    saveError.value = '报名问题不能为空。'
    return
  }
  if (model.kind === 'club' && new Set(signupQuestions).size !== signupQuestions.length) {
    saveError.value = '报名问题不能重复。'
    return
  }
  if (model.kind === 'club' && signupQa.some(item => item.answer.length > 2000)) {
    saveError.value = '每条回答最多 2000 个字符。'
    return
  }

  saving.value = true
  try {
    syncQrTitleLengths()
    const creating = isCreating.value
    const metadata: Record<string, unknown> = {
      ...model.metadata,
      group: model.group.trim(),
      direction: model.direction.trim(),
      overviewTitle: model.overviewTitle.trim(),
      suitableFor: model.suitableFor.trim(),
      findingIt: model.findingIt.trim(),
      iconUrl: model.iconUrl.trim(),
      recruitmentPeriod: model.recruitmentPeriod.trim(),
      activitySchedule: model.activitySchedule.trim(),
      contactMethod: model.contactMethod.trim(),
      website: model.website.trim(),
      profileUrl: model.profileUrl.trim(),
      contactUrl: model.contactUrl.trim(),
      phone: model.phone.trim(),
      email: model.email.trim(),
      address: model.address.trim(),
      officeHours: model.officeHours.trim(),
      contactName: model.contactName.trim(),
      contactPhones: model.contactPhonesText.split('\n').map(item => item.trim()).filter(Boolean),
      verificationState: model.verificationState || '',
      featuredSummary: model.featuredSummary.trim(),
      sortOrder,
      ...(model.kind === 'club' ? { signupQuestions, signupQa } : {}),
      groupQrUrls: model.groupQrUrls,
      groupQrTitles: model.groupQrTitles,
      contactQrUrls: model.contactQrUrls,
      contactQrTitles: model.contactQrTitles,
      boxes: model.boxes.map(boxPayload)
    }
    if (props.organizationMode) {
      delete metadata.verificationState
      delete metadata.featuredSummary
      delete metadata.sortOrder
    }
    const sourceIds = [...new Set(model.sourceIdsText
      .split(/[\s,]+/)
      .map(item => item.trim())
      .filter(Boolean))]
    const commonBody: Record<string, unknown> = {
      title: model.title.trim(),
      summary: model.summary.trim(),
      body: model.body,
      category: model.category.trim() || null,
      metadata
    }
    if (!props.organizationMode) {
      commonBody.slug = model.slug.trim()
      commonBody.isFeatured = model.isFeatured
      commonBody.lastVerifiedAt = isoDateOrNull(model.lastVerifiedAt)
      commonBody.sourceIds = sourceIds
    }
    const result = creating
      ? await adminFetch('/api/admin/content', {
          method: 'POST',
          body: {
            kind: model.kind,
            ...commonBody
          }
        })
      : await adminFetch(`/api/admin/content/${encodeURIComponent(model.id)}`, {
          method: 'PATCH',
          body: commonBody
        })
    hydrate(result)
    toast.add({ title: creating ? '页面已创建' : '页面已保存', color: 'success' })
    if (creating && text(record(result).id)) {
      await navigateTo(`/admin/content/${encodeURIComponent(text(record(result).id))}/visual`, {
        replace: true
      })
    }
  } catch (error) {
    saveError.value = getRequestMessage(
      error,
      '保存失败。请检查内容长度、来源编号、二维码数量和网络状态。'
    )
  } finally {
    saving.value = false
  }
}

function addBox(afterIndex?: number): void {
  if (model.boxes.length >= 24) return
  const box: EditorBox = {
    id: `box-${Date.now().toString(36)}`,
    title: '新的内容',
    body: '',
    itemsText: '',
    icon: 'i-lucide-layout-panel-top',
    tone: 'plain',
    placement: 'default',
    imageUrls: [],
    imageTitles: []
  }
  if (afterIndex === undefined) model.boxes.push(box)
  else model.boxes.splice(afterIndex + 1, 0, box)
}

function moveBox(index: number, offset: -1 | 1): void {
  const target = index + offset
  if (target < 0 || target >= model.boxes.length) return
  const [box] = model.boxes.splice(index, 1)
  if (box) model.boxes.splice(target, 0, box)
}

function removeBox(index: number): void {
  model.boxes.splice(index, 1)
}

function boxUploadTarget(box: EditorBox): string {
  return `box:${box.id}`
}

async function persistBoxes(): Promise<void> {
  if (isCreating.value) return
  const result = await adminFetch(`/api/admin/content/${encodeURIComponent(model.id)}`, {
    method: 'PATCH',
    body: {
      metadata: {
        boxes: model.boxes.map(boxPayload)
      }
    }
  })
  model.metadata = { ...record(record(result).metadata) }
}

async function uploadBoxImages(box: EditorBox, event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const files = [...(input.files ?? [])]
  if (!files.length) return
  if (box.imageUrls.length + files.length > 8) {
    toast.add({ title: '每个 Box 最多 8 张图片', color: 'warning' })
    input.value = ''
    return
  }

  uploadTarget.value = boxUploadTarget(box)
  try {
    const results = await Promise.allSettled(files.map(async (file) => {
      const body = new FormData()
      body.set('image', file)
      return await adminFetch<{ url: string }>('/api/admin/media/images', {
        method: 'POST',
        body
      })
    }))
    const uploaded = results.flatMap(result => result.status === 'fulfilled' ? [result.value.url] : [])
    const newUrls = uploaded.filter(url => !box.imageUrls.includes(url))
    box.imageUrls.push(...newUrls)
    box.imageTitles.push(...newUrls.map((_, index) => `${box.title || 'Box'}图片 ${box.imageUrls.length - newUrls.length + index + 1}`))
    if (!newUrls.length) {
      toast.add({ title: '图片上传失败', description: '请使用 PNG、JPEG 或 WebP，单张不超过 5MB。', color: 'error' })
      return
    }
    if (!isCreating.value) await persistBoxes()
    toast.add({
      title: isCreating.value ? '图片已上传' : '图片已上传并保存',
      description: isCreating.value ? '创建页面时会保存到这个 Box。' : undefined,
      color: results.some(result => result.status === 'rejected') ? 'warning' : 'success'
    })
  } catch {
    toast.add({
      title: '图片上传或保存失败',
      description: '请保留当前页面并点击顶部“保存页面”重试。',
      color: 'error'
    })
  } finally {
    uploadTarget.value = null
    input.value = ''
  }
}

async function removeBoxImage(box: EditorBox, index: number): Promise<void> {
  const [removedUrl] = box.imageUrls.splice(index, 1)
  const [removedTitle] = box.imageTitles.splice(index, 1)
  if (isCreating.value) return
  try {
    await persistBoxes()
    toast.add({ title: '图片已删除并保存', color: 'success' })
  } catch {
    if (removedUrl) box.imageUrls.splice(index, 0, removedUrl)
    box.imageTitles.splice(index, 0, removedTitle ?? '')
    toast.add({ title: '删除未保存，图片已恢复', color: 'error' })
  }
}

async function persistBoxImageTitles(): Promise<void> {
  if (isCreating.value) return
  try {
    await persistBoxes()
  } catch {
    toast.add({ title: '图片标题暂未保存', description: '请点击顶部“保存页面”。', color: 'warning' })
  }
}

function addSignupQuestion(): void {
  if (model.signupQa.length >= 12) return
  model.signupQa.push({ question: '', answer: '' })
}

function moveSignupQuestion(index: number, offset: -1 | 1): void {
  const target = index + offset
  if (target < 0 || target >= model.signupQa.length) return
  const [item] = model.signupQa.splice(index, 1)
  if (item !== undefined) model.signupQa.splice(target, 0, item)
}

function removeSignupQuestion(index: number): void {
  if (model.signupQa.length <= 1) return
  model.signupQa.splice(index, 1)
}

async function persistQrAssociations(): Promise<void> {
  if (!model.id) return
  syncQrTitleLengths()
  const result = await adminFetch(`/api/admin/content/${encodeURIComponent(model.id)}`, {
    method: 'PATCH',
    body: {
      metadata: {
        groupQrUrls: model.groupQrUrls,
        groupQrTitles: model.groupQrTitles,
        contactQrUrls: model.contactQrUrls,
        contactQrTitles: model.contactQrTitles,
        iconUrl: model.iconUrl
      }
    }
  })
  model.metadata = { ...record(record(result).metadata) }
}

async function removeQr(target: 'group' | 'contact', index: number): Promise<void> {
  const values = target === 'group' ? model.groupQrUrls : model.contactQrUrls
  const titles = target === 'group' ? model.groupQrTitles : model.contactQrTitles
  const [removed] = values.splice(index, 1)
  const [removedTitle] = titles.splice(index, 1)
  if (isCreating.value) return
  try {
    await persistQrAssociations()
    toast.add({ title: '二维码已删除并保存', color: 'success' })
  } catch {
    if (removed) values.splice(index, 0, removed)
    titles.splice(index, 0, removedTitle ?? '')
    toast.add({ title: '删除未保存', description: '网络异常，二维码已恢复。', color: 'error' })
  }
}

async function persistQrTitles(): Promise<void> {
  syncQrTitleLengths()
  if (isCreating.value) return
  try {
    await persistQrAssociations()
  } catch {
    toast.add({
      title: '二维码标题暂未保存',
      description: '请点击顶部“保存页面”后再离开。',
      color: 'error'
    })
  }
}

async function removeClubIcon(): Promise<void> {
  const removed = model.iconUrl
  model.iconUrl = ''
  if (isCreating.value) return
  try {
    await persistQrAssociations()
    toast.add({ title: '社团图标已删除并保存', color: 'success' })
  } catch {
    model.iconUrl = removed
    toast.add({ title: '删除未保存', description: '网络异常，社团图标已恢复。', color: 'error' })
  }
}

async function uploadClubIcon(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  uploadTarget.value = 'icon'
  try {
    const body = new FormData()
    body.set('image', file)
    const uploaded = await adminFetch<{ url: string }>('/api/admin/media/images', {
      method: 'POST',
      body
    })
    model.iconUrl = uploaded.url
    if (isCreating.value) {
      toast.add({
        title: '社团图标已上传',
        description: '创建页面时会自动保存图片关联。',
        color: 'success'
      })
      return
    }
    try {
      await persistQrAssociations()
      toast.add({ title: '社团图标已上传并保存', color: 'success' })
    } catch {
      toast.add({
        title: '图片已上传，但页面关联未保存',
        description: '请不要离开页面，点击顶部“保存页面”后再刷新确认。',
        color: 'error'
      })
    }
  } catch {
    toast.add({
      title: '社团图标上传失败',
      description: '请使用 PNG、JPEG 或 WebP，单张不超过 5MB。',
      color: 'error'
    })
  } finally {
    uploadTarget.value = null
    input.value = ''
  }
}

async function uploadQrList(target: 'group' | 'contact', event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const files = [...(input.files ?? [])]
  const values = target === 'group' ? model.groupQrUrls : model.contactQrUrls
  const titles = target === 'group' ? model.groupQrTitles : model.contactQrTitles
  if (!files.length) return
  if (values.length + files.length > 8) {
    toast.add({ title: '每组最多上传 8 张二维码', color: 'warning' })
    input.value = ''
    return
  }

  uploadTarget.value = target
  try {
    const results = await Promise.allSettled(files.map(async (file) => {
      const body = new FormData()
      body.set('image', file)
      return await adminFetch<{ url: string }>('/api/admin/media/images', {
        method: 'POST',
        body
      })
    }))
    const uploaded = results.flatMap(result => result.status === 'fulfilled' ? [result.value] : [])
    const failedCount = results.length - uploaded.length
    const newUrls = uploaded.map(item => item.url).filter(url => !values.includes(url))
    values.push(...newUrls)
    titles.push(...newUrls.map(() => ''))

    if (uploaded.length) {
      if (isCreating.value) {
        toast.add({
          title: failedCount ? `${uploaded.length} 张已上传` : '二维码已上传',
          description: failedCount
            ? `${failedCount} 张失败；成功图片会在创建页面时一并保存。`
            : '创建页面时会自动保存二维码关联。',
          color: failedCount ? 'warning' : 'success'
        })
        return
      }
      try {
        await persistQrAssociations()
        toast.add({
          title: failedCount ? `${uploaded.length} 张已上传并保存` : '二维码已上传并保存',
          description: failedCount ? `${failedCount} 张上传失败，请检查格式和大小后重试。` : undefined,
          color: failedCount ? 'warning' : 'success'
        })
      } catch {
        toast.add({
          title: '图片已上传，但页面关联未保存',
          description: '请不要离开页面，点击顶部“保存页面”后再刷新确认。',
          color: 'error'
        })
      }
    } else {
      toast.add({
        title: '二维码上传失败',
        description: '请使用 PNG、JPEG 或 WebP，单张不超过 5MB。',
        color: 'error'
      })
    }
  } finally {
    uploadTarget.value = null
    input.value = ''
  }
}

onMounted(() => {
  void loadContent()
  void loadAvailableSources()
})

watch(() => props.allowDetailedEdit, (allowed) => {
  if (allowed) void loadAvailableSources()
})

watch(sourceSearch, () => {
  if (!props.allowDetailedEdit) return
  if (sourceSearchTimer) clearTimeout(sourceSearchTimer)
  sourceSearchTimer = setTimeout(() => void loadAvailableSources(), 250)
})

onBeforeUnmount(() => {
  if (sourceSearchTimer) clearTimeout(sourceSearchTimer)
  sourceRequestVersion += 1
})
</script>

<template>
  <div>
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

    <div v-else>
      <div class="sticky top-16 z-20 -mx-4 mb-5 flex flex-wrap items-center gap-3 border-y border-zinc-200 dark:border-zinc-800 bg-white/95 dark:bg-zinc-900/95 px-4 py-3 backdrop-blur sm:-mx-5 sm:px-5 lg:-mx-6 lg:px-6">
        <div class="min-w-0 flex-1">
          <p class="text-xs font-semibold text-green-700 dark:text-green-400">
            {{ isCreating ? '可视化新增' : '可视化编辑' }}
          </p>
          <p class="truncate text-sm font-bold text-zinc-950 dark:text-zinc-100">
            {{ model.title }}
          </p>
        </div>
        <UButton
          v-if="!isCreating"
          :to="publicPath"
          target="_blank"
          rel="noopener noreferrer"
          icon="i-lucide-external-link"
          label="查看前台"
          color="neutral"
          variant="outline"
        />
        <UButton
          v-if="!isCreating && allowDetailedEdit"
          :to="{ path: '/admin/content', query: { edit: model.id } }"
          icon="i-lucide-list-tree"
          label="切换到详细编辑"
          color="neutral"
          variant="outline"
        />
        <UButton
          icon="i-lucide-save"
          :label="isCreating ? '创建并继续编辑' : '保存页面'"
          :loading="saving"
          :disabled="readonly"
          @click="save"
        />
      </div>

      <p
        v-if="saveError"
        class="mb-4 rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950 px-4 py-3 text-sm text-red-800 dark:text-red-300"
        role="alert"
      >
        {{ saveError }}
      </p>

      <div class="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800 bg-[#fafafa] dark:bg-zinc-900">
        <header class="border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
          <div class="mx-auto max-w-4xl px-5 py-8 md:px-8 md:py-11">
            <div class="flex flex-wrap items-center gap-2">
              <span class="grid size-11 shrink-0 place-items-center overflow-hidden rounded-md bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300">
                <img
                  v-if="model.kind === 'club' && model.iconUrl"
                  :src="model.iconUrl"
                  alt="社团图标预览"
                  class="size-full object-cover"
                >
                <UIcon
                  v-else
                  :name="model.kind === 'club' ? 'i-lucide-users-round' : 'i-lucide-landmark'"
                  class="size-5"
                />
              </span>
              <UBadge
                :label="kindLabel"
                color="neutral"
                variant="soft"
              />
              <USelect
                v-if="isCreating"
                v-model="model.kind"
                :items="kindOptions"
                value-key="value"
                label-key="label"
                aria-label="内容类型"
                class="w-40"
              />
              <UInput
                v-model="model.category"
                placeholder="分类"
                class="w-44"
              />
            </div>
            <UInput
              v-model="model.title"
              aria-label="页面标题"
              size="xl"
              class="mt-4 w-full"
              :ui="{ base: 'text-2xl font-bold md:text-3xl' }"
            />
            <UFormField
              v-if="!organizationMode"
              label="网页地址名称"
              description="仅使用小写字母、数字和短横线，修改后会改变公开页面地址。"
              class="mt-4 max-w-xl"
              required
            >
              <UInput
                v-model="model.slug"
                placeholder="例如 computer-association"
                autocomplete="off"
                class="w-full"
              />
            </UFormField>
            <UTextarea
              v-model="model.summary"
              aria-label="页面简介"
              :rows="3"
              autoresize
              class="mt-3 w-full"
              placeholder="用几句话告诉新生这个组织是做什么的"
            />
          </div>
        </header>

        <main class="mx-auto max-w-4xl px-5 py-7 md:px-8 md:py-10">
          <section class="border-b border-zinc-200 dark:border-zinc-800 pb-8">
            <h2 class="text-lg font-bold text-zinc-950 dark:text-zinc-100">
              页面正文
            </h2>
            <UTextarea
              v-model="model.body"
              :rows="8"
              autoresize
              class="mt-4 w-full"
              placeholder="详细介绍组织、服务范围、活动和新生需要知道的内容"
            />
          </section>

          <section
            v-if="model.kind === 'club'"
            class="border-b border-zinc-200 dark:border-zinc-800 py-8"
          >
            <div class="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 class="text-lg font-bold text-zinc-950 dark:text-zinc-100">
                  报名之前问清楚
                </h2>
                <p class="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                  前台会按这里的顺序展示，最多 12 项。
                </p>
              </div>
              <UButton
                icon="i-lucide-circle-plus"
                label="添加问题"
                color="neutral"
                variant="outline"
                :disabled="model.signupQa.length >= 12"
                @click="addSignupQuestion"
              />
            </div>
            <div class="mt-5 space-y-3">
              <div
                v-for="(item, index) in model.signupQa"
                :key="index"
                class="grid gap-3 border-b border-zinc-200 dark:border-zinc-800 pb-4 last:border-b-0 md:grid-cols-[1.5rem_minmax(0,1fr)_auto]"
              >
                <span class="pt-3 text-center text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                  {{ index + 1 }}
                </span>
                <div class="min-w-0 space-y-3">
                  <UFormField label="问题">
                    <UInput
                      v-model="item.question"
                      :aria-label="`报名问题 ${index + 1}`"
                      maxlength="300"
                      class="w-full"
                      placeholder="填写新生报名前需要确认的问题"
                    />
                  </UFormField>
                  <UFormField
                    label="回答"
                    description="前台点击问题后展开显示；暂时不确定时可留空。"
                  >
                    <UTextarea
                      v-model="item.answer"
                      :aria-label="`报名问题回答 ${index + 1}`"
                      :rows="3"
                      maxlength="2000"
                      autoresize
                      class="w-full"
                      placeholder="填写该社团针对这个问题的明确回答"
                    />
                  </UFormField>
                </div>
                <div class="flex items-start justify-end gap-1">
                  <UButton
                    icon="i-lucide-arrow-up"
                    color="neutral"
                    variant="ghost"
                    :disabled="index === 0"
                    aria-label="上移问题"
                    @click="moveSignupQuestion(index, -1)"
                  />
                  <UButton
                    icon="i-lucide-arrow-down"
                    color="neutral"
                    variant="ghost"
                    :disabled="index === model.signupQa.length - 1"
                    aria-label="下移问题"
                    @click="moveSignupQuestion(index, 1)"
                  />
                  <UButton
                    icon="i-lucide-trash-2"
                    color="error"
                    variant="ghost"
                    :disabled="model.signupQa.length <= 1"
                    aria-label="删除问题"
                    @click="removeSignupQuestion(index)"
                  />
                </div>
              </div>
            </div>
          </section>

          <section class="border-b border-zinc-200 dark:border-zinc-800 py-8">
            <h2 class="text-lg font-bold text-zinc-950 dark:text-zinc-100">
              {{ model.kind === 'club' ? '招新与活动' : '部门公开信息' }}
            </h2>
            <div class="mt-4 grid gap-4 md:grid-cols-2">
              <template v-if="model.kind === 'club'">
                <UFormField
                  label="社团图标"
                  description="显示在社团列表和社团详情页；不上传时继续使用默认社团图标。"
                  class="md:col-span-2"
                >
                  <div class="flex flex-wrap items-center gap-4 rounded-md border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/60 p-4">
                    <span class="grid size-16 shrink-0 place-items-center overflow-hidden rounded-md bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300">
                      <img
                        v-if="model.iconUrl"
                        :src="model.iconUrl"
                        alt="当前社团图标"
                        class="size-full object-cover"
                      >
                      <UIcon
                        v-else
                        name="i-lucide-users-round"
                        class="size-7"
                      />
                    </span>
                    <div class="flex flex-wrap gap-2">
                      <label class="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 text-sm font-semibold text-zinc-800 dark:text-zinc-100">
                        <UIcon
                          :name="uploadTarget === 'icon' ? 'i-lucide-loader-circle' : 'i-lucide-image-up'"
                          class="size-4"
                          :class="uploadTarget === 'icon' ? 'animate-spin' : ''"
                        />
                        {{ uploadTarget === 'icon' ? '上传中' : (model.iconUrl ? '替换图标' : '上传图标') }}
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          class="sr-only"
                          :disabled="uploadTarget !== null"
                          @change="uploadClubIcon"
                        >
                      </label>
                      <UButton
                        v-if="model.iconUrl"
                        icon="i-lucide-trash-2"
                        label="删除图标"
                        color="neutral"
                        variant="outline"
                        :disabled="uploadTarget !== null"
                        @click="removeClubIcon"
                      />
                    </div>
                  </div>
                </UFormField>
                <UFormField
                  label="介绍区标题"
                  description="默认显示“先了解这个社团”。"
                  class="md:col-span-2"
                >
                  <UInput
                    v-model="model.overviewTitle"
                    maxlength="120"
                    class="w-full"
                  />
                </UFormField>
                <UFormField label="社团类别">
                  <UInput
                    v-model="model.group"
                    class="w-full"
                  />
                </UFormField>
                <UFormField
                  label="主要活动"
                  class="md:col-span-2"
                >
                  <UTextarea
                    v-model="model.direction"
                    :rows="3"
                    maxlength="2000"
                    autoresize
                    class="w-full"
                  />
                </UFormField>
                <UFormField
                  label="适合谁"
                  class="md:col-span-2"
                >
                  <UTextarea
                    v-model="model.suitableFor"
                    :rows="3"
                    maxlength="2000"
                    autoresize
                    class="w-full"
                  />
                </UFormField>
                <UFormField
                  label="开学后怎么找"
                  class="md:col-span-2"
                >
                  <UTextarea
                    v-model="model.findingIt"
                    :rows="3"
                    maxlength="2000"
                    autoresize
                    class="w-full"
                  />
                </UFormField>
                <UFormField label="招新时间">
                  <UInput
                    v-model="model.recruitmentPeriod"
                    class="w-full"
                  />
                </UFormField>
                <UFormField label="活动时间">
                  <UInput
                    v-model="model.activitySchedule"
                    class="w-full"
                  />
                </UFormField>
                <UFormField
                  label="公开联系方式"
                  class="md:col-span-2"
                >
                  <UTextarea
                    v-model="model.contactMethod"
                    :rows="2"
                    class="w-full"
                  />
                </UFormField>
              </template>
              <template v-else>
                <UFormField label="部门官网">
                  <UInput
                    v-model="model.website"
                    type="url"
                    class="w-full"
                  />
                </UFormField>
                <UFormField label="部门简介页">
                  <UInput
                    v-model="model.profileUrl"
                    type="url"
                    class="w-full"
                  />
                </UFormField>
                <UFormField label="部门联系页">
                  <UInput
                    v-model="model.contactUrl"
                    type="url"
                    class="w-full"
                  />
                </UFormField>
                <UFormField label="公开电话">
                  <UInput
                    v-model="model.phone"
                    type="tel"
                    class="w-full"
                  />
                </UFormField>
                <UFormField label="公开邮箱">
                  <UInput
                    v-model="model.email"
                    type="email"
                    class="w-full"
                  />
                </UFormField>
                <UFormField label="办公地址">
                  <UInput
                    v-model="model.address"
                    class="w-full"
                  />
                </UFormField>
                <UFormField
                  label="办公时间"
                  class="md:col-span-2"
                >
                  <UInput
                    v-model="model.officeHours"
                    class="w-full"
                  />
                </UFormField>
              </template>
            </div>
          </section>

          <section class="border-b border-zinc-200 dark:border-zinc-800 py-8">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 class="text-lg font-bold text-zinc-950 dark:text-zinc-100">
                  自定义 Box
                </h2>
                <p class="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                  可添加最多 24 个内容块，前台会按这里的顺序展示。
                </p>
              </div>
              <UButton
                icon="i-lucide-square-plus"
                label="添加 Box"
                color="neutral"
                variant="outline"
                :disabled="model.boxes.length >= 24"
                @click="addBox()"
              />
            </div>
            <div class="mt-5 grid gap-4 md:grid-cols-2">
              <article
                v-for="(box, index) in model.boxes"
                :key="box.id"
                class="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4"
              >
                <div class="flex items-center gap-1">
                  <span class="mr-auto text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                    Box {{ index + 1 }}
                  </span>
                  <UButton
                    icon="i-lucide-arrow-up"
                    color="neutral"
                    variant="ghost"
                    size="xs"
                    :disabled="index === 0"
                    aria-label="上移"
                    @click="moveBox(index, -1)"
                  />
                  <UButton
                    icon="i-lucide-arrow-down"
                    color="neutral"
                    variant="ghost"
                    size="xs"
                    :disabled="index === model.boxes.length - 1"
                    aria-label="下移"
                    @click="moveBox(index, 1)"
                  />
                  <UButton
                    icon="i-lucide-trash-2"
                    color="error"
                    variant="ghost"
                    size="xs"
                    aria-label="删除 Box"
                    @click="removeBox(index)"
                  />
                  <UButton
                    icon="i-lucide-between-horizontal-start"
                    color="neutral"
                    variant="ghost"
                    size="xs"
                    :disabled="model.boxes.length >= 24"
                    aria-label="在下方插入 Box"
                    @click="addBox(index)"
                  />
                </div>
                <UInput
                  v-model="box.title"
                  placeholder="Box 标题"
                  class="mt-3 w-full"
                />
                <UTextarea
                  v-model="box.body"
                  placeholder="主要内容"
                  :rows="3"
                  autoresize
                  class="mt-3 w-full"
                />
                <UTextarea
                  v-model="box.itemsText"
                  placeholder="要点列表，每行一条"
                  :rows="3"
                  autoresize
                  class="mt-3 w-full"
                />
                <div class="mt-3 grid grid-cols-2 gap-3">
                  <UInput
                    v-model="box.icon"
                    placeholder="图标"
                    class="w-full"
                  />
                  <USelect
                    v-model="box.tone"
                    :items="[
                      { label: '白色', value: 'plain' },
                      { label: '绿色', value: 'green' },
                      { label: '蓝色', value: 'blue' },
                      { label: '提醒色', value: 'amber' }
                    ]"
                    value-key="value"
                    label-key="label"
                    class="w-full"
                  />
                </div>
                <UFormField
                  label="插入页面位置"
                  description="选择这个 Box 出现在前台哪个模块之后。"
                  class="mt-3"
                >
                  <USelect
                    v-model="box.placement"
                    :items="boxPlacementOptions"
                    value-key="value"
                    label-key="label"
                    class="w-full"
                  />
                </UFormField>

                <div class="mt-4 rounded-md border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/60 p-3">
                  <div class="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p class="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                        Box 图片
                      </p>
                      <p class="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                        最多 8 张，可填写图片标题；前台支持点击放大。
                      </p>
                    </div>
                    <label class="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 text-sm font-semibold text-zinc-800 dark:text-zinc-100 hover:bg-zinc-50 dark:hover:bg-zinc-800/60">
                      <UIcon
                        :name="uploadTarget === boxUploadTarget(box) ? 'i-lucide-loader-circle' : 'i-lucide-images'"
                        class="size-4"
                        :class="uploadTarget === boxUploadTarget(box) ? 'animate-spin' : ''"
                      />
                      {{ uploadTarget === boxUploadTarget(box) ? '上传中' : '添加图片' }}
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        multiple
                        class="sr-only"
                        :disabled="uploadTarget !== null || box.imageUrls.length >= 8"
                        @change="uploadBoxImages(box, $event)"
                      >
                    </label>
                  </div>
                  <div
                    v-if="box.imageUrls.length"
                    class="mt-3 grid gap-3"
                  >
                    <div
                      v-for="(imageUrl, imageIndex) in box.imageUrls"
                      :key="imageUrl"
                      class="grid grid-cols-[72px_minmax(0,1fr)_auto] items-center gap-3 rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-2"
                    >
                      <img
                        :src="imageUrl"
                        :alt="box.imageTitles[imageIndex] || `${box.title}图片`"
                        class="size-[72px] rounded object-cover"
                      >
                      <UInput
                        v-model="box.imageTitles[imageIndex]"
                        placeholder="图片标题"
                        class="min-w-0 w-full"
                        @blur="persistBoxImageTitles"
                      />
                      <UButton
                        icon="i-lucide-trash-2"
                        color="error"
                        variant="ghost"
                        size="xs"
                        aria-label="删除图片"
                        @click="removeBoxImage(box, imageIndex)"
                      />
                    </div>
                  </div>
                </div>
              </article>
            </div>
          </section>

          <section
            v-if="!organizationMode"
            class="border-b border-zinc-200 dark:border-zinc-800 py-8"
          >
            <div>
              <h2 class="text-lg font-bold text-zinc-950 dark:text-zinc-100">
                发布、确认与排序
              </h2>
              <p class="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                与内容管理新增表单使用相同字段；正式发布仍由总管理员在内容列表操作。
              </p>
            </div>
            <div class="mt-5 grid gap-4 md:grid-cols-2">
              <UFormField label="信息确认状态">
                <USelect
                  v-model="model.verificationState"
                  :items="verificationOptions"
                  value-key="value"
                  label-key="label"
                  class="w-full"
                />
              </UFormField>
              <UFormField
                label="前台排序"
                description="0 到 9999，数字越小越靠前。"
              >
                <UInput
                  v-model="model.sortOrderText"
                  type="number"
                  min="0"
                  max="9999"
                  step="1"
                  class="w-full"
                />
              </UFormField>
              <UFormField
                label="精选内容摘要"
                class="md:col-span-2"
              >
                <UTextarea
                  v-model="model.featuredSummary"
                  :rows="3"
                  autoresize
                  class="w-full"
                  placeholder="用于校园页精选卡片，留空时使用普通摘要"
                />
              </UFormField>
              <UFormField
                label="最后确认时间"
                description="发布时必填，表示这些信息最近一次完成核验的时间。"
              >
                <div class="flex gap-2">
                  <UInput
                    v-model="model.lastVerifiedAt"
                    type="datetime-local"
                    class="min-w-0 flex-1"
                  />
                  <UButton
                    label="设为现在"
                    color="neutral"
                    variant="outline"
                    @click="setVerifiedNow"
                  />
                </div>
              </UFormField>
              <UFormField label="首页精选">
                <UCheckbox
                  v-model="model.isFeatured"
                  label="加入校园页精选区域"
                />
              </UFormField>
              <UFormField
                label="发布依据"
                description="发布前至少勾选一条可用的 A/B/C 级来源，并先保存页面。"
                class="md:col-span-2"
              >
                <div
                  v-if="allowDetailedEdit"
                  class="space-y-3"
                >
                  <div class="flex flex-wrap gap-2">
                    <UInput
                      v-model="sourceSearch"
                      icon="i-lucide-search"
                      placeholder="搜索来源标题"
                      class="min-w-56 flex-1"
                    />
                    <UButton
                      to="/admin/sources?action=create"
                      icon="i-lucide-plus"
                      label="新建来源"
                      color="neutral"
                      variant="outline"
                    />
                  </div>
                  <div
                    v-if="sourcesLoading && !publishableSources.length"
                    class="grid min-h-24 place-items-center rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900"
                    role="status"
                  >
                    <UIcon
                      name="i-lucide-loader-circle"
                      class="size-5 animate-spin text-green-700 dark:text-green-400"
                    />
                  </div>
                  <div
                    v-else-if="publishableSources.length"
                    class="max-h-64 space-y-2 overflow-y-auto rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-2"
                  >
                    <label
                      v-for="source in publishableSources"
                      :key="source.id"
                      class="flex cursor-pointer items-start gap-3 rounded-md px-3 py-2.5 hover:bg-zinc-50 dark:hover:bg-zinc-800/60"
                    >
                      <UCheckbox
                        :model-value="selectedSourceIds.has(source.id)"
                        :aria-label="`选择来源：${source.title}`"
                        class="mt-0.5"
                        @update:model-value="toggleSource(source.id, $event === true)"
                      />
                      <span class="min-w-0 flex-1">
                        <span class="block text-sm font-semibold text-zinc-900 dark:text-zinc-100">{{ source.title }}</span>
                        <span class="mt-0.5 block text-xs text-zinc-500 dark:text-zinc-400">
                          {{ source.sourceLevel }} 级 · {{ source.isOfficial ? '官方来源' : '非官方来源' }}
                        </span>
                      </span>
                    </label>
                  </div>
                  <div
                    v-else
                    class="rounded-md border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950 px-4 py-3 text-sm text-amber-900 dark:text-amber-300"
                  >
                    没有找到可用于发布的来源，请先在来源管理中登记有效来源。
                  </div>
                  <p
                    v-if="sourcesError"
                    class="text-sm text-red-700 dark:text-red-300"
                    role="alert"
                  >
                    {{ sourcesError }}
                  </p>
                  <p class="text-xs text-zinc-500 dark:text-zinc-400">
                    已关联 {{ selectedSourceIds.size }} 条来源。A/B 级来源必须标记为官方，C 级有效来源可直接作为发布依据。
                  </p>
                  <details class="text-xs text-zinc-500 dark:text-zinc-400">
                    <summary class="cursor-pointer font-medium">
                      高级：手动编辑来源编号
                    </summary>
                    <UTextarea
                      v-model="model.sourceIdsText"
                      :rows="4"
                      class="mt-2 w-full font-mono"
                      placeholder="每行一个来源编号"
                    />
                  </details>
                </div>
                <UTextarea
                  v-else
                  v-model="model.sourceIdsText"
                  :rows="4"
                  class="w-full"
                  placeholder="每行一个来源编号"
                />
              </UFormField>
            </div>
            <div
              v-if="!isCreating"
              class="mt-5 flex items-center gap-2 border-t border-zinc-200 dark:border-zinc-800 pt-4 text-sm text-zinc-600 dark:text-zinc-300"
            >
              <span>当前发布状态</span>
              <UBadge
                :label="model.status === 'published' ? '已发布' : model.status === 'archived' ? '已下架' : '草稿'"
                :color="model.status === 'published' ? 'success' : 'neutral'"
                variant="soft"
              />
            </div>
          </section>

          <section class="py-8">
            <h2 class="text-lg font-bold text-zinc-950 dark:text-zinc-100">
              联系负责人
            </h2>
            <div class="mt-4 grid gap-4 md:grid-cols-2">
              <UFormField label="负责人或联系人">
                <UInput
                  v-model="model.contactName"
                  class="w-full"
                />
              </UFormField>
              <UFormField label="负责人电话，每行一个">
                <UTextarea
                  v-model="model.contactPhonesText"
                  :rows="3"
                  class="w-full"
                />
              </UFormField>
            </div>
            <div class="mt-5 grid gap-5 md:grid-cols-2">
              <div>
                <div class="flex items-center justify-between gap-3">
                  <p class="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                    招新与群聊二维码
                  </p>
                  <label class="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 text-sm font-semibold text-zinc-800 dark:text-zinc-100">
                    <UIcon
                      name="i-lucide-image-plus"
                      class="size-4"
                    />
                    {{ uploadTarget === 'group' ? '上传中' : '上传' }}
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      multiple
                      class="sr-only"
                      :disabled="uploadTarget !== null"
                      @change="uploadQrList('group', $event)"
                    >
                  </label>
                </div>
                <div class="mt-3 grid grid-cols-2 gap-3">
                  <figure
                    v-for="(url, index) in model.groupQrUrls"
                    :key="url"
                    class="relative rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3"
                  >
                    <ImagePreviewButton
                      :src="url"
                      :alt="model.groupQrTitles[index] || `招新与群聊二维码 ${index + 1}`"
                      button-class="aspect-square w-full rounded-md border border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-900"
                      image-class="size-full object-contain"
                    />
                    <UButton
                      icon="i-lucide-x"
                      color="error"
                      size="xs"
                      class="absolute right-1 top-1"
                      aria-label="删除二维码"
                      @click="removeQr('group', index)"
                    />
                    <UFormField
                      :label="`第 ${index + 1} 张标题`"
                      class="mt-3"
                    >
                      <UInput
                        v-model="model.groupQrTitles[index]"
                        :placeholder="`招新与群聊二维码 ${index + 1}`"
                        :maxlength="100"
                        class="w-full"
                        @change="persistQrTitles"
                      />
                    </UFormField>
                  </figure>
                </div>
              </div>
              <div>
                <div class="flex items-center justify-between gap-3">
                  <p class="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                    负责人二维码
                  </p>
                  <label class="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 text-sm font-semibold text-zinc-800 dark:text-zinc-100">
                    <UIcon
                      name="i-lucide-image-plus"
                      class="size-4"
                    />
                    {{ uploadTarget === 'contact' ? '上传中' : '上传' }}
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      multiple
                      class="sr-only"
                      :disabled="uploadTarget !== null"
                      @change="uploadQrList('contact', $event)"
                    >
                  </label>
                </div>
                <div class="mt-3 grid grid-cols-2 gap-3">
                  <figure
                    v-for="(url, index) in model.contactQrUrls"
                    :key="url"
                    class="relative rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3"
                  >
                    <ImagePreviewButton
                      :src="url"
                      :alt="model.contactQrTitles[index] || `${model.contactName || '负责人'}二维码 ${index + 1}`"
                      button-class="aspect-square w-full rounded-md border border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-900"
                      image-class="size-full object-contain"
                    />
                    <UButton
                      icon="i-lucide-x"
                      color="error"
                      size="xs"
                      class="absolute right-1 top-1"
                      aria-label="删除负责人二维码"
                      @click="removeQr('contact', index)"
                    />
                    <UFormField
                      :label="`第 ${index + 1} 张标题`"
                      class="mt-3"
                    >
                      <UInput
                        v-model="model.contactQrTitles[index]"
                        :placeholder="`${model.contactName || '负责人'}二维码 ${index + 1}`"
                        :maxlength="100"
                        class="w-full"
                        @change="persistQrTitles"
                      />
                    </UFormField>
                  </figure>
                </div>
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  </div>
</template>
