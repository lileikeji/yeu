<script setup lang="ts">
import type {
  YeucaAdminOverviewPayload,
  YeucaDepartment,
  YeucaGalleryItem,
  YeucaPostItem,
  YeucaPostKind,
  YeucaPostStatus,
  YeucaProjectItem,
  YeucaProjectStatus,
  YeucaSiteExtras
} from '~~/shared/types/yeuca'
import { adminFetch } from '~~/app/utils/admin-request'
import {
  createEditableExtrasState,
  type EditableYeucaExtrasState
} from '~~/shared/utils/yeuca-defaults'
import YeucaMembersPanel from '~~/app/components/admin/yeuca/YeucaMembersPanel.vue'
import YeucaRecruitPanel from '~~/app/components/admin/yeuca/YeucaRecruitPanel.vue'
import YeucaActivitiesPanel from '~~/app/components/admin/yeuca/YeucaActivitiesPanel.vue'
import YeucaSiteContentPanel from '~~/app/components/admin/yeuca/YeucaSiteContentPanel.vue'
import YeucaVisitsPanel from '~~/app/components/admin/yeuca/YeucaVisitsPanel.vue'
import YeucaMinistersPanel from '~~/app/components/admin/yeuca/YeucaMinistersPanel.vue'
import YeucaAuditPanel from '~~/app/components/admin/yeuca/YeucaAuditPanel.vue'

definePageMeta({ layout: 'admin' })

useSeoMeta({
  title: '仰恩大学计算机协会 · 主站、成员与 Git 控制台',
  robots: 'noindex, nofollow'
})

interface SessionPayload {
  authenticated?: boolean
  admin?: {
    mustChangePassword?: boolean
  }
}

type StudioTab
  = | 'members'
    | 'recruit'
    | 'activities'
    | 'departments'
    | 'posts'
    | 'projects'
    | 'ministers'
    | 'audits'
    | 'sitecontent'
    | 'visits'
    | 'studio'

const toast = useToast()
const loading = ref(true)
const errorMessage = ref('')
const mustChangePassword = ref(false)
const activeTab = ref<StudioTab>('members')

const overview = ref<YeucaAdminOverviewPayload | null>(null)

/* ---------- 官网基础文案、部门（全增删改查）与扩展画面上传 ---------- */
const savingSettings = ref(false)
const lastSavedAt = ref('')
const settingsForm = reactive({
  campus: '',
  tagline: '',
  intro: '',
  recruitNote: '',
  contactNote: '',
  groupQrUrl: ''
})

const extrasForm = reactive({
  heroImageUrl: '',
  flagshipNote: '',
  gallery: [] as YeucaGalleryItem[]
})

const siteContentState = ref<EditableYeucaExtrasState>(createEditableExtrasState(undefined))

const departmentsDraft = ref<YeucaDepartment[]>([])
const editingDeptIdx = ref<number | null>(null)
const deptModalOpen = ref(false)
const deptEditor = reactive({
  id: '',
  code: '',
  name: '',
  lead: '',
  isFeatured: false,
  acceptingRecruit: true,
  summary: '',
  focusText: '',
  toolsText: '',
  recentTopic: '',
  recruitDesc: ''
})

/* ---------- 上传控件 refs 与状态 ---------- */
const uploadingKey = ref<string | null>(null)
const heroImageInput = ref<HTMLInputElement | null>(null)
const qrImageInput = ref<HTMLInputElement | null>(null)
const galleryImageInput = ref<HTMLInputElement | null>(null)
const postInlineImageInput = ref<HTMLInputElement | null>(null)
const projectImageInput = ref<HTMLInputElement | null>(null)

/* ---------- 动态与技术资料 ---------- */
const postKindFilter = ref<'all' | YeucaPostKind>('all')
const postSearchKeyword = ref('')
const postModalOpen = ref(false)
const editingPostId = ref<string | null>(null)
const savingPost = ref(false)
const postPreviewMode = ref(false)
const postForm = reactive({
  kind: 'news' as YeucaPostKind,
  deptName: 'AI 部',
  category: '',
  title: '',
  summary: '',
  body: '',
  tagsText: '',
  pinned: false,
  status: 'published' as YeucaPostStatus
})

/* ---------- 项目实验室 ---------- */
const projectModalOpen = ref(false)
const editingProjectId = ref<string | null>(null)
const savingProject = ref(false)
const projectForm = reactive({
  title: '',
  deptName: 'AI 部',
  track: 'AI / Agent',
  status: 'active' as YeucaProjectStatus,
  summary: '',
  highlightsText: '',
  stackText: '',
  previewImage: '',
  repoUrl: '',
  demoUrl: '',
  sortOrder: 0,
  isPublished: true
})

const deptOptions = computed(() =>
  isChief.value
    ? departmentsDraft.value.map(dept => ({ label: dept.name, value: dept.name }))
    : (scopedDepartment.value ? [{ label: scopedDepartment.value, value: scopedDepartment.value }] : [])
)

const adminScope = computed(() => overview.value?.adminScope ?? {
  role: 'chief' as const,
  departmentName: null,
  title: '计协总管'
})
const isChief = computed(() => adminScope.value.role === 'chief')
const scopedDepartment = computed(() => adminScope.value.departmentName || '')

const ownDeptForm = reactive({
  lead: '',
  summary: '',
  focusText: '',
  toolsText: '',
  recentTopic: '',
  acceptingRecruit: true,
  recruitDesc: ''
})
const savingOwnDept = ref(false)

function syncOwnDeptForm(): void {
  if (isChief.value || !scopedDepartment.value) return
  const target = departmentsDraft.value.find(d => d.name === scopedDepartment.value)
  if (!target) return
  ownDeptForm.lead = target.lead
  ownDeptForm.summary = target.summary
  ownDeptForm.focusText = target.focusList.join('\n')
  ownDeptForm.toolsText = target.tools.join(', ')
  ownDeptForm.recentTopic = target.recentTopic
  ownDeptForm.acceptingRecruit = target.acceptingRecruit
  ownDeptForm.recruitDesc = target.recruitDesc
}

async function saveOwnDepartment(): Promise<void> {
  if (!ownDeptForm.summary.trim()) {
    toast.add({ title: '请填写部门简介', color: 'warning' })
    return
  }
  savingOwnDept.value = true
  try {
    await adminFetch('/api/admin/yeuca/department', {
      method: 'PUT',
      body: {
        lead: ownDeptForm.lead.trim(),
        summary: ownDeptForm.summary.trim(),
        focusList: ownDeptForm.focusText.split('\n').map(s => s.trim()).filter(Boolean),
        tools: ownDeptForm.toolsText.split(/[,，/]/).map(s => s.trim()).filter(Boolean),
        recentTopic: ownDeptForm.recentTopic.trim(),
        acceptingRecruit: ownDeptForm.acceptingRecruit,
        recruitDesc: ownDeptForm.recruitDesc.trim()
      }
    })
    toast.add({ title: `已更新「${scopedDepartment.value}」对外展示介绍`, color: 'success' })
    await loadOverview()
  } catch (error) {
    showApiError(error, '保存部门介绍失败')
  } finally {
    savingOwnDept.value = false
  }
}

const featuredDeptName = computed(() =>
  departmentsDraft.value.find(d => d.isFeatured)?.name
  || departmentsDraft.value[0]?.name
  || '未设置'
)

const filteredPosts = computed(() => {
  const list = overview.value?.posts ?? []
  const q = postSearchKeyword.value.trim().toLowerCase()
  return list.filter((item) => {
    const kindMatch = postKindFilter.value === 'all' || item.kind === postKindFilter.value
    const queryMatch = !q
      || item.title.toLowerCase().includes(q)
      || item.summary.toLowerCase().includes(q)
      || item.deptName.toLowerCase().includes(q)
    return kindMatch && queryMatch
  })
})

const postKindItems = [
  { label: '动态与公告', value: 'news' },
  { label: '技术笔记与资料', value: 'resource' }
]

const postStatusItems = [
  { label: '已发布（主站公开）', value: 'published' },
  { label: '草稿（仅后台可见）', value: 'draft' },
  { label: '已归档', value: 'archived' }
]

const projectStatusItems = [
  { label: '进行中', value: 'active' },
  { label: '维护中', value: 'maintaining' },
  { label: '规划中', value: 'planning' }
]

function showApiError(error: unknown, fallback: string): void {
  const err = error as { data?: { message?: string }, statusMessage?: string }
  toast.add({
    title: fallback,
    description: err?.data?.message || err?.statusMessage || '请稍后重试',
    color: 'error'
  })
}

async function uploadImageFile(event: Event, key: string): Promise<string | null> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return null
  if (file.size > 5 * 1024 * 1024) {
    toast.add({ title: '图片不能超过 5MB（仅支持 PNG / JPG / WebP）', color: 'warning' })
    return null
  }
  uploadingKey.value = key
  try {
    const body = new FormData()
    body.append('image', file)
    const result = await adminFetch<{ url: string }>('/api/admin/media/images', {
      method: 'POST',
      body
    })
    return result.url
  } catch (error) {
    showApiError(error, '图片上传失败')
    return null
  } finally {
    uploadingKey.value = null
  }
}

async function loadOverview(): Promise<void> {
  loading.value = true
  errorMessage.value = ''
  try {
    const [session, data] = await Promise.all([
      adminFetch<SessionPayload>('/api/admin/auth/session'),
      adminFetch<YeucaAdminOverviewPayload>('/api/admin/yeuca/overview')
    ])
    mustChangePassword.value = session.admin?.mustChangePassword === true
    overview.value = data
    settingsForm.campus = data.settings.campus
    settingsForm.tagline = data.settings.tagline
    settingsForm.intro = data.settings.intro
    settingsForm.recruitNote = data.settings.recruitNote
    settingsForm.contactNote = data.settings.contactNote
    settingsForm.groupQrUrl = data.settings.groupQrUrl
    departmentsDraft.value = data.settings.departments.map(dept => ({
      ...dept,
      focusList: [...dept.focusList],
      tools: [...dept.tools]
    }))

    const extras = data.settings.extras ?? {}
    extrasForm.heroImageUrl = extras.heroImageUrl ?? ''
    extrasForm.flagshipNote = extras.flagshipNote ?? ''
    extrasForm.gallery = Array.isArray(extras.gallery)
      ? extras.gallery.map(item => ({ ...item }))
      : []
    siteContentState.value = createEditableExtrasState(extras)
    syncOwnDeptForm()
  } catch (error) {
    errorMessage.value = '管理数据加载失败，先看账号权限。'
    showApiError(error, '加载失败')
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  void loadOverview()
})

/* ---------- 持久化主站设置 / 部门 / 扩展上传配置 ---------- */
function buildExtrasPayload(): YeucaSiteExtras {
  const cleanGallery = extrasForm.gallery
    .filter(item => item.imageUrl.trim() && item.title.trim())
    .map(item => ({
      id: item.id || `gal-${Date.now().toString(36)}`,
      title: item.title.trim(),
      caption: item.caption.trim(),
      imageUrl: item.imageUrl.trim()
    }))

  const sc = siteContentState.value
  const cleanComps = sc.competitions
    .filter(item => item.name.trim() && item.track.trim() && item.dept.trim())
    .map(item => ({
      name: item.name.trim(),
      track: item.track.trim(),
      dept: item.dept.trim(),
      site: (item.site || '').trim(),
      href: (item.href || '').trim()
    }))
  const cleanFaqs = sc.faqs
    .filter(item => item.q.trim() && item.a.trim())
    .map(item => ({ q: item.q.trim(), a: item.a.trim() }))

  return {
    ...(extrasForm.heroImageUrl.trim() ? { heroImageUrl: extrasForm.heroImageUrl.trim() } : {}),
    ...(extrasForm.flagshipNote.trim() ? { flagshipNote: extrasForm.flagshipNote.trim() } : {}),
    ...(cleanGallery.length ? { gallery: cleanGallery } : {}),
    ...(cleanComps.length ? { competitions: cleanComps } : {}),
    ...(cleanFaqs.length ? { faqs: cleanFaqs } : {}),
    homeAnnouncement: sc.homeAnnouncement,
    homeHero: sc.homeHero,
    homeEntries: sc.homeEntries.filter(e => e.title.trim()),
    featureFlags: sc.featureFlags,
    aiWorkflowSteps: sc.aiWorkflowSteps.filter(s => s.title.trim()),
    seasonalRhythm: sc.seasonalRhythm.filter(r => r.title.trim()),
    archiveTimeline: sc.archiveTimeline.filter(t => t.title.trim()),
    volatileChecklist: sc.volatileChecklist.filter(c => c.item.trim() && c.source.trim()),
    practiceTopics: sc.practiceTopics.filter(p => p.title.trim()),
    starterLinks: sc.starterLinks.filter(l => l.title.trim() && l.url.trim()),
    mirrors: sc.mirrors.filter(m => m.name.trim() && m.cmd.trim()),
    scriptOptions: sc.scriptOptions.filter(o => o.label.trim() && o.ps1.length && o.sh.length),
    ...(sc.footerNote.trim() ? { footerNote: sc.footerNote.trim() } : {}),
    friendLinks: sc.friendLinks.filter(f => f.label.trim() && f.href.trim())
  }
}

async function persistSiteSettings(successMessage = '已保存'): Promise<boolean> {
  savingSettings.value = true
  try {
    await adminFetch('/api/admin/yeuca/settings', {
      method: 'PUT',
      body: {
        campus: settingsForm.campus.trim() || '福建泉州 · 仰恩大学洛江校区',
        tagline: settingsForm.tagline.trim() || '仰恩大学计算机协会',
        intro: settingsForm.intro.trim() || '仰恩大学计算机协会',
        recruitNote: settingsForm.recruitNote.trim(),
        contactNote: settingsForm.contactNote.trim(),
        groupQrUrl: settingsForm.groupQrUrl.trim(),
        departments: departmentsDraft.value,
        extras: buildExtrasPayload()
      }
    })
    const now = new Date()
    lastSavedAt.value = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`
    toast.add({ title: successMessage, color: 'success' })
    await loadOverview()
    return true
  } catch (error) {
    showApiError(error, '保存失败')
    return false
  } finally {
    savingSettings.value = false
  }
}

async function saveSiteContentState(nextState: EditableYeucaExtrasState): Promise<void> {
  siteContentState.value = nextState
  await persistSiteSettings('已保存')
}

/* ---------- 部门 CRUD（所有操作即时写库） ---------- */
function openEditDepartment(index: number): void {
  const target = departmentsDraft.value[index]
  if (!target) return
  editingDeptIdx.value = index
  deptEditor.id = target.id
  deptEditor.code = target.code
  deptEditor.name = target.name
  deptEditor.lead = target.lead
  deptEditor.isFeatured = target.isFeatured
  deptEditor.acceptingRecruit = target.acceptingRecruit
  deptEditor.summary = target.summary
  deptEditor.focusText = target.focusList.join('\n')
  deptEditor.toolsText = target.tools.join(', ')
  deptEditor.recentTopic = target.recentTopic
  deptEditor.recruitDesc = target.recruitDesc
  deptModalOpen.value = true
}

function openNewDepartment(): void {
  editingDeptIdx.value = null
  const nextIndex = departmentsDraft.value.length + 1
  deptEditor.id = `dept-${Date.now().toString(36)}`
  deptEditor.code = `${String(nextIndex).padStart(2, '0')} / GROUP`
  deptEditor.name = ''
  deptEditor.lead = ''
  deptEditor.isFeatured = false
  deptEditor.acceptingRecruit = true
  deptEditor.summary = ''
  deptEditor.focusText = ''
  deptEditor.toolsText = ''
  deptEditor.recentTopic = ''
  deptEditor.recruitDesc = ''
  deptModalOpen.value = true
}

async function confirmDepartmentEdit(): Promise<void> {
  if (!deptEditor.name.trim() || !deptEditor.summary.trim()) {
    toast.add({ title: '请填写部门名称和部门介绍', color: 'warning' })
    return
  }
  const previous = departmentsDraft.value.map(d => ({ ...d, focusList: [...d.focusList], tools: [...d.tools] }))
  const item: YeucaDepartment = {
    id: deptEditor.id,
    code: deptEditor.code.trim() || 'DEPT',
    name: deptEditor.name.trim(),
    lead: deptEditor.lead.trim(),
    isFeatured: deptEditor.isFeatured,
    acceptingRecruit: deptEditor.acceptingRecruit,
    summary: deptEditor.summary.trim(),
    focusList: deptEditor.focusText.split('\n').map(s => s.trim()).filter(Boolean),
    tools: deptEditor.toolsText.split(/[,，/]/).map(s => s.trim()).filter(Boolean),
    recentTopic: deptEditor.recentTopic.trim(),
    recruitDesc: deptEditor.recruitDesc.trim()
  }

  // 若当前勾选设为主展部门，则将其余部门取消主展，保证首页首屏焦点清晰唯一
  if (item.isFeatured) {
    departmentsDraft.value = departmentsDraft.value.map(d => ({ ...d, isFeatured: false }))
  }

  if (editingDeptIdx.value !== null) {
    departmentsDraft.value.splice(editingDeptIdx.value, 1, item)
  } else {
    departmentsDraft.value.push(item)
  }

  const ok = await persistSiteSettings(editingDeptIdx.value !== null ? `已更新并同步部门「${item.name}」` : `已新增并上线部门「${item.name}」`)
  if (ok) {
    deptModalOpen.value = false
  } else {
    departmentsDraft.value = previous
  }
}

async function moveDepartment(index: number, delta: -1 | 1): Promise<void> {
  const targetIdx = index + delta
  if (targetIdx < 0 || targetIdx >= departmentsDraft.value.length) return
  const previous = [...departmentsDraft.value]
  const copy = [...departmentsDraft.value]
  const [moved] = copy.splice(index, 1)
  if (!moved) return
  copy.splice(targetIdx, 0, moved)
  departmentsDraft.value = copy
  const ok = await persistSiteSettings(`已调整「${moved.name}」展示顺序`)
  if (!ok) departmentsDraft.value = previous
}

async function setFeaturedDepartment(index: number): Promise<void> {
  const target = departmentsDraft.value[index]
  if (!target) return
  const previous = departmentsDraft.value.map(d => ({ ...d }))
  departmentsDraft.value = departmentsDraft.value.map((d, idx) => ({
    ...d,
    isFeatured: idx === index
  }))
  const ok = await persistSiteSettings(`已将「${target.name}」设为首页默认首展部门`)
  if (!ok) departmentsDraft.value = previous
}

async function toggleDepartmentRecruit(index: number): Promise<void> {
  const target = departmentsDraft.value[index]
  if (!target) return
  const previous = departmentsDraft.value.map(d => ({ ...d }))
  target.acceptingRecruit = !target.acceptingRecruit
  const ok = await persistSiteSettings(`「${target.name}」已设为${target.acceptingRecruit ? '开放报名' : '暂不招新'}`)
  if (!ok) departmentsDraft.value = previous
}

async function deleteDepartment(index: number): Promise<void> {
  if (departmentsDraft.value.length <= 1) {
    toast.add({ title: '至少需保留一个部门', color: 'warning' })
    return
  }
  const target = departmentsDraft.value[index]
  if (!target || !window.confirm(`确认删除部门「${target.name}」？主站首页和部门详表将同步移除该卡片。`)) return
  const previous = [...departmentsDraft.value]
  departmentsDraft.value.splice(index, 1)
  const ok = await persistSiteSettings(`已删除部门「${target.name}」`)
  if (!ok) departmentsDraft.value = previous
}

/* ---------- 动态 / 技术资料操作 ---------- */
function openNewPost(kind: YeucaPostKind = 'news'): void {
  editingPostId.value = null
  postPreviewMode.value = false
  postForm.kind = kind
  postForm.deptName = !isChief.value && scopedDepartment.value
    ? scopedDepartment.value
    : (departmentsDraft.value[0]?.name || 'AI 部')
  postForm.category = kind === 'resource' ? '实践笔记' : ''
  postForm.title = ''
  postForm.summary = ''
  postForm.body = ''
  postForm.tagsText = ''
  postForm.pinned = false
  postForm.status = 'published'
  postModalOpen.value = true
}

function openEditPost(post: YeucaPostItem): void {
  editingPostId.value = post.id
  postPreviewMode.value = false
  postForm.kind = post.kind
  postForm.deptName = post.deptName
  postForm.category = post.category
  postForm.title = post.title
  postForm.summary = post.summary
  postForm.body = post.body
  postForm.tagsText = post.tags.join(', ')
  postForm.pinned = post.pinned
  postForm.status = post.status
  postModalOpen.value = true
}

async function handlePostInlineImageUpload(event: Event): Promise<void> {
  const url = await uploadImageFile(event, 'post-inline')
  if (!url) return
  const snippet = `\n![配图说明](${url})\n`
  postForm.body = postForm.body ? `${postForm.body.trimEnd()}${snippet}` : `![配图说明](${url})\n`
  toast.add({ title: '配图已上传并插入正文末尾（可自由剪切移动位置）', color: 'success' })
}

async function submitPost(): Promise<void> {
  if (!postForm.title.trim() || !postForm.summary.trim() || !postForm.body.trim()) {
    toast.add({ title: '请填写标题、摘要和正文', color: 'warning' })
    return
  }
  savingPost.value = true
  try {
    const payload = {
      kind: postForm.kind,
      deptName: postForm.deptName,
      category: postForm.kind === 'resource' ? postForm.category.trim() : '',
      title: postForm.title.trim(),
      summary: postForm.summary.trim(),
      body: postForm.body.trim(),
      tags: postForm.tagsText.split(/[,，]/).map(s => s.trim()).filter(Boolean),
      pinned: postForm.pinned,
      status: postForm.status
    }
    if (editingPostId.value) {
      await adminFetch(`/api/admin/yeuca/posts/${editingPostId.value}`, { method: 'PUT', body: payload })
      toast.add({ title: '内容已更新', color: 'success' })
    } else {
      await adminFetch('/api/admin/yeuca/posts', { method: 'POST', body: payload })
      toast.add({ title: '内容已创建并同步', color: 'success' })
    }
    postModalOpen.value = false
    await loadOverview()
  } catch (error) {
    showApiError(error, '保存失败')
  } finally {
    savingPost.value = false
  }
}

async function togglePostPublish(post: YeucaPostItem): Promise<void> {
  const nextStatus: YeucaPostStatus = post.status === 'published' ? 'draft' : 'published'
  try {
    await adminFetch(`/api/admin/yeuca/posts/${post.id}`, {
      method: 'PUT',
      body: { status: nextStatus }
    })
    toast.add({ title: nextStatus === 'published' ? '已发布到主站' : '已转为草稿', color: 'success' })
    await loadOverview()
  } catch (error) {
    showApiError(error, '状态切换失败')
  }
}

async function removePost(post: YeucaPostItem): Promise<void> {
  if (!window.confirm(`确认删除「${post.title}」？删除后不可恢复。`)) return
  try {
    await adminFetch(`/api/admin/yeuca/posts/${post.id}`, { method: 'DELETE' })
    toast.add({ title: '已删除', color: 'success' })
    await loadOverview()
  } catch (error) {
    showApiError(error, '删除失败')
  }
}

/* ---------- 项目展示操作 ---------- */
function openNewProject(seedFlagship = false): void {
  editingProjectId.value = null
  projectForm.title = seedFlagship ? 'YeU 仰恩大学迎新指南与校园服务平台' : ''
  projectForm.deptName = !isChief.value && scopedDepartment.value
    ? scopedDepartment.value
    : (departmentsDraft.value[0]?.name || 'AI 部')
  projectForm.track = seedFlagship ? 'Web 全栈 / RAG 检索' : 'AI / Agent'
  projectForm.status = 'active'
  projectForm.summary = seedFlagship
    ? '面向仰恩大学本科与专升本新生的实用查询网站，提供报到指南、交互校园地图、公交时刻、社团名片与计协后端管理引擎。'
    : ''
  projectForm.highlightsText = seedFlagship
    ? 'Nuxt 4 + SQLite + 混合检索与本地工具箱联动\n双域名支持 yeuca 主站与 yx 迎新应用共享认证与内容发布'
    : ''
  projectForm.stackText = seedFlagship ? 'Nuxt 4, Vue 3, Nitro, Drizzle ORM, SQLite, Tailwind' : ''
  projectForm.previewImage = ''
  projectForm.repoUrl = seedFlagship ? 'https://github.com/lileikeji/yeu' : ''
  projectForm.demoUrl = seedFlagship ? 'https://yx.huiliyill.cn/' : ''
  projectForm.sortOrder = 0
  projectForm.isPublished = true
  projectModalOpen.value = true
}

function openEditProject(project: YeucaProjectItem): void {
  editingProjectId.value = project.id
  projectForm.title = project.title
  projectForm.deptName = project.deptName
  projectForm.track = project.track
  projectForm.status = project.status
  projectForm.summary = project.summary
  projectForm.highlightsText = project.highlights.join('\n')
  projectForm.stackText = project.stack.join(', ')
  projectForm.previewImage = project.previewImage
  projectForm.repoUrl = project.repoUrl
  projectForm.demoUrl = project.demoUrl
  projectForm.sortOrder = project.sortOrder
  projectForm.isPublished = project.isPublished
  projectModalOpen.value = true
}

async function handleProjectImageUpload(event: Event): Promise<void> {
  const url = await uploadImageFile(event, 'project-cover')
  if (!url) return
  projectForm.previewImage = url
  toast.add({ title: '项目封面图已上传', color: 'success' })
}

async function submitProject(): Promise<void> {
  if (!projectForm.title.trim() || !projectForm.summary.trim()) {
    toast.add({ title: '请填写项目名称和说明', color: 'warning' })
    return
  }
  savingProject.value = true
  try {
    const payload = {
      title: projectForm.title.trim(),
      deptName: projectForm.deptName,
      track: projectForm.track.trim() || '实践项目',
      status: projectForm.status,
      summary: projectForm.summary.trim(),
      highlights: projectForm.highlightsText.split('\n').map(s => s.trim()).filter(Boolean),
      stack: projectForm.stackText.split(/[,，/]/).map(s => s.trim()).filter(Boolean),
      previewImage: projectForm.previewImage.trim(),
      repoUrl: projectForm.repoUrl.trim(),
      demoUrl: projectForm.demoUrl.trim(),
      sortOrder: Number(projectForm.sortOrder) || 0,
      isPublished: projectForm.isPublished
    }
    if (editingProjectId.value) {
      await adminFetch(`/api/admin/yeuca/projects/${editingProjectId.value}`, { method: 'PUT', body: payload })
      toast.add({ title: '项目已更新', color: 'success' })
    } else {
      await adminFetch('/api/admin/yeuca/projects', { method: 'POST', body: payload })
      toast.add({ title: '项目已添加', color: 'success' })
    }
    projectModalOpen.value = false
    await loadOverview()
  } catch (error) {
    showApiError(error, '保存失败')
  } finally {
    savingProject.value = false
  }
}

async function removeProject(project: YeucaProjectItem): Promise<void> {
  if (!window.confirm(`确认删除项目「${project.title}」？`)) return
  try {
    await adminFetch(`/api/admin/yeuca/projects/${project.id}`, { method: 'DELETE' })
    toast.add({ title: '项目已删除', color: 'success' })
    await loadOverview()
  } catch (error) {
    showApiError(error, '删除失败')
  }
}

/* ---------- 画面、二维码与实景图库上传及扩展条目操作 ---------- */
async function handleHeroImageUpload(event: Event): Promise<void> {
  const url = await uploadImageFile(event, 'hero-image')
  if (!url) return
  extrasForm.heroImageUrl = url
  toast.add({ title: '主站首屏图片已上传，记得点击右上或底部保存以生效', color: 'success' })
}

async function handleQrImageUpload(event: Event): Promise<void> {
  const url = await uploadImageFile(event, 'qr-image')
  if (!url) return
  settingsForm.groupQrUrl = url
  toast.add({ title: '迎新群二维码已上传，记得点击保存以生效', color: 'success' })
}

async function handleGalleryPhotoUpload(event: Event): Promise<void> {
  const url = await uploadImageFile(event, 'gallery-photo')
  if (!url) return
  extrasForm.gallery.push({
    id: `gal-${Date.now().toString(36)}`,
    title: '协会日常实景',
    caption: '请补充拍摄场合或器材说明',
    imageUrl: url
  })
  toast.add({ title: '实景图片已上传并添加至相册草稿，完善文字后保存即可上首页', color: 'success' })
}

function removeGalleryItem(index: number): void {
  extrasForm.gallery.splice(index, 1)
}

const postStatusMeta: Record<YeucaPostStatus, { label: string, color: 'success' | 'warning' | 'neutral' }> = {
  published: { label: '已发布', color: 'success' },
  draft: { label: '草稿', color: 'warning' },
  archived: { label: '已归档', color: 'neutral' }
}

const projectStatusLabel: Record<YeucaProjectStatus, string> = {
  active: '进行中',
  maintaining: '维护中',
  planning: '规划中'
}
</script>

<template>
  <div class="mx-auto max-w-[1440px] space-y-6">
    <AdminPasswordChangePanel
      v-if="mustChangePassword"
      :required="true"
    />

    <div
      v-if="loading"
      class="grid min-h-80 place-items-center"
      role="status"
    >
      <UIcon
        name="i-lucide-loader-circle"
        class="size-7 animate-spin text-sky-600 dark:text-sky-400"
      />
    </div>

    <div
      v-else-if="errorMessage"
      class="rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950 p-5 text-sm text-red-800 dark:text-red-300"
      role="alert"
    >
      {{ errorMessage }}
    </div>

    <template v-else-if="!mustChangePassword && overview">
      <!-- 主站级精密工作室顶卡 -->
      <section class="relative overflow-hidden rounded-xl border border-zinc-800 bg-[#121211] p-5 text-zinc-100 shadow-sm sm:p-6">
        <div
          class="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#a8121e] via-[#c81e2b] to-[#1d4ed8]"
          aria-hidden="true"
        />
        <div
          class="pointer-events-none absolute inset-0 opacity-20"
          style="background-image: radial-gradient(rgba(255,255,255,0.22) 1px, transparent 1px); background-size: 20px 20px;"
          aria-hidden="true"
        />
        <div
          class="pointer-events-none absolute -right-16 -top-16 size-56 rounded-full bg-[#a8121e]/20 blur-3xl"
          aria-hidden="true"
        />
        <div class="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div class="space-y-2.5">
            <div class="flex flex-wrap items-center gap-2 text-xs">
              <span class="inline-flex items-center gap-1.5 rounded-full border border-rose-500/40 bg-[#a8121e]/25 px-2.5 py-0.5 font-mono font-semibold text-rose-200">
                <span class="size-1.5 rounded-full bg-emerald-400" />
                {{ isChief ? 'YEUCA STUDIO · 总管控制台' : `${scopedDepartment} · ${adminScope.title}` }}
              </span>
              <span class="rounded-full border border-zinc-700 bg-zinc-800/80 px-2.5 py-0.5 font-mono text-zinc-300">
                {{ isChief ? '主站：yeuca.huiliyill.cn' : '分部数据隔离视角' }}
              </span>
              <span
                v-if="lastSavedAt"
                class="font-mono text-emerald-300"
              >
                上次保存 {{ lastSavedAt }}
              </span>
            </div>

            <div class="flex items-center gap-3.5">
              <img
                src="/images/yeuca-logo.jpg"
                alt="仰恩大学计算机协会徽标"
                class="hidden size-12 shrink-0 rounded-full border border-white/20 object-cover shadow-md sm:block"
              >
              <div>
                <h1 class="text-xl font-bold tracking-tight text-white sm:text-2xl">
                  仰恩大学计算机协会 · 主站、成员与 Git 控制台
                </h1>
                <p class="mt-0.5 max-w-3xl text-sm leading-6 text-zinc-300">
                  成员名录、招新审批、活动签到、各页文案，还有会员的 Git 代码站账号。
                </p>
              </div>
            </div>
          </div>

          <div class="flex flex-wrap gap-2">
            <UButton
              to="https://yeuca.huiliyill.cn/"
              target="_blank"
              rel="noopener noreferrer"
              icon="i-lucide-external-link"
              label="访问计协主站"
              class="!bg-[#a8121e] hover:!bg-[#7f0d16] !text-white"
            />
            <UButton
              to="https://yeuca.huiliyill.cn/member/"
              target="_blank"
              rel="noopener noreferrer"
              icon="i-lucide-user-round"
              label="主站会员入口"
              color="neutral"
              variant="subtle"
            />
            <UButton
              to="https://yeuca.huiliyill.cn/git/"
              target="_blank"
              rel="noopener noreferrer"
              icon="i-lucide-git-branch"
              label="Git 代码站"
              color="neutral"
              variant="subtle"
            />
          </div>
        </div>
      </section>

      <!-- 实时数据统计卡片（真实数据库数据） -->
      <div class="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        <div class="relative overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800 bg-[var(--surface)] dark:bg-zinc-900 p-4 shadow-2xs transition-all hover:-translate-y-0.5 hover:shadow-sm">
          <div class="absolute inset-x-0 top-0 h-0.5 bg-[#a8121e]" />
          <div class="flex items-center justify-between">
            <p class="text-xs font-medium text-zinc-500 dark:text-zinc-400">
              成员
            </p>
            <UIcon
              name="i-lucide-users-round"
              class="size-4 text-[#a8121e] dark:text-rose-400"
            />
          </div>
          <p class="mt-1.5 text-2xl font-bold text-zinc-950 dark:text-zinc-100">
            {{ overview.stats.totalMembers }}
            <span class="text-xs font-normal text-zinc-500">已激活 {{ overview.stats.activeMembers }} · Git {{ overview.stats.gitSyncedMembers }}</span>
          </p>
        </div>

        <div class="relative overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800 bg-[var(--surface)] dark:bg-zinc-900 p-4 shadow-2xs transition-all hover:-translate-y-0.5 hover:shadow-sm">
          <div class="absolute inset-x-0 top-0 h-0.5 bg-sky-600/80" />
          <div class="flex items-center justify-between">
            <p class="text-xs font-medium text-zinc-500 dark:text-zinc-400">
              招新 / 活动
            </p>
            <UIcon
              name="i-lucide-calendar-days"
              class="size-4 text-sky-600"
            />
          </div>
          <div class="mt-1.5 flex items-center justify-between gap-2">
            <span class="text-2xl font-bold text-zinc-950 dark:text-zinc-100">
              {{ overview.stats.publishedActivities }}
              <span class="text-xs font-normal text-zinc-500">场活动</span>
            </span>
            <UBadge
              :label="overview.stats.recruitOpen ? `招新中 (${overview.stats.recruitSubmissions})` : `暂未开 (${overview.stats.recruitSubmissions})`"
              :color="overview.stats.recruitOpen ? 'success' : 'neutral'"
              variant="soft"
              size="xs"
            />
          </div>
        </div>

        <div class="relative overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800 bg-[var(--surface)] dark:bg-zinc-900 p-4 shadow-2xs transition-all hover:-translate-y-0.5 hover:shadow-sm">
          <div class="absolute inset-x-0 top-0 h-0.5 bg-emerald-600/80" />
          <div class="flex items-center justify-between">
            <p class="text-xs font-medium text-zinc-500 dark:text-zinc-400">
              动态 / 资料
            </p>
            <UIcon
              name="i-lucide-newspaper"
              class="size-4 text-emerald-600"
            />
          </div>
          <p class="mt-1.5 text-2xl font-bold text-zinc-950 dark:text-zinc-100">
            {{ overview.stats.publishedNews }}
            <span class="text-xs font-normal text-zinc-500">/ {{ overview.stats.publishedResources }} 篇资料</span>
          </p>
        </div>

        <div class="relative overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800 bg-[var(--surface)] dark:bg-zinc-900 p-4 shadow-2xs transition-all hover:-translate-y-0.5 hover:shadow-sm">
          <div class="absolute inset-x-0 top-0 h-0.5 bg-amber-600/80" />
          <div class="flex items-center justify-between">
            <p class="text-xs font-medium text-zinc-500 dark:text-zinc-400">
              部门 {{ departmentsDraft.length }} · 项目
            </p>
            <UIcon
              name="i-lucide-layers"
              class="size-4 text-amber-600"
            />
          </div>
          <p class="mt-1.5 text-2xl font-bold text-zinc-950 dark:text-zinc-100">
            {{ overview.stats.publishedProjects }}
            <span class="text-xs font-normal text-zinc-500">项目 · 主展{{ featuredDeptName }}</span>
          </p>
        </div>
      </div>

      <!-- 主功能导航标签（8 个全景工作台 Tab） -->
      <div class="flex flex-wrap items-center gap-1.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-[var(--surface)] dark:bg-zinc-900 p-1.5 shadow-2xs">
        <UButton
          :label="`成员与 Git (${overview.members.length})`"
          icon="i-lucide-users-round"
          color="neutral"
          :variant="activeTab === 'members' ? 'solid' : 'ghost'"
          :class="activeTab === 'members' ? '!bg-[#a8121e] !text-white' : ''"
          @click="activeTab = 'members'"
        />
        <UButton
          :label="`招新审批 (${overview.recruit.totalSubmissions})`"
          icon="i-lucide-clipboard-list"
          color="neutral"
          :variant="activeTab === 'recruit' ? 'solid' : 'ghost'"
          :class="activeTab === 'recruit' ? '!bg-[var(--ink)] !text-[var(--surface)]' : ''"
          @click="activeTab = 'recruit'"
        />
        <UButton
          :label="`活动与签到 (${overview.activities.length})`"
          icon="i-lucide-calendar-days"
          color="neutral"
          :variant="activeTab === 'activities' ? 'solid' : 'ghost'"
          :class="activeTab === 'activities' ? '!bg-[var(--ink)] !text-[var(--surface)]' : ''"
          @click="activeTab = 'activities'"
        />
        <UButton
          v-if="isChief"
          label="页面与镜像"
          icon="i-lucide-layout-grid"
          color="neutral"
          :variant="activeTab === 'sitecontent' ? 'solid' : 'ghost'"
          :class="activeTab === 'sitecontent' ? '!bg-[var(--ink)] !text-[var(--surface)]' : ''"
          @click="activeTab = 'sitecontent'"
        />
        <UButton
          :label="isChief ? `部门 (${departmentsDraft.length})` : `我的部门 · ${scopedDepartment}`"
          icon="i-lucide-layers"
          color="neutral"
          :variant="activeTab === 'departments' ? 'solid' : 'ghost'"
          :class="activeTab === 'departments' ? '!bg-[var(--ink)] !text-[var(--surface)]' : ''"
          @click="activeTab = 'departments'"
        />
        <UButton
          :label="`动态与笔记 (${overview.posts.length})`"
          icon="i-lucide-newspaper"
          color="neutral"
          :variant="activeTab === 'posts' ? 'solid' : 'ghost'"
          :class="activeTab === 'posts' ? '!bg-[var(--ink)] !text-[var(--surface)]' : ''"
          @click="activeTab = 'posts'"
        />
        <UButton
          :label="`项目 (${overview.projects.length})`"
          icon="i-lucide-folder-git-2"
          color="neutral"
          :variant="activeTab === 'projects' ? 'solid' : 'ghost'"
          :class="activeTab === 'projects' ? '!bg-[var(--ink)] !text-[var(--surface)]' : ''"
          @click="activeTab = 'projects'"
        />
        <UButton
          v-if="isChief"
          label="部长账号"
          icon="i-lucide-user-plus"
          color="neutral"
          :variant="activeTab === 'ministers' ? 'solid' : 'ghost'"
          :class="activeTab === 'ministers' ? '!bg-[var(--ink)] !text-[var(--surface)]' : ''"
          @click="activeTab = 'ministers'"
        />
        <UButton
          label="操作与开户审计"
          icon="i-lucide-scroll-text"
          color="neutral"
          :variant="activeTab === 'audits' ? 'solid' : 'ghost'"
          :class="activeTab === 'audits' ? '!bg-[var(--ink)] !text-[var(--surface)]' : ''"
          @click="activeTab = 'audits'"
        />
        <UButton
          v-if="isChief"
          label="文案与图片"
          icon="i-lucide-sliders-horizontal"
          color="neutral"
          :variant="activeTab === 'studio' ? 'solid' : 'ghost'"
          :class="activeTab === 'studio' ? '!bg-[var(--ink)] !text-[var(--surface)]' : ''"
          @click="activeTab = 'studio'"
        />
        <UButton
          v-if="isChief"
          size="sm"
          label="访问记录"
          icon="i-lucide-shield-alert"
          color="neutral"
          :variant="activeTab === 'visits' ? 'solid' : 'ghost'"
          :class="activeTab === 'visits' ? '!bg-[var(--ink)] !text-[var(--surface)]' : ''"
          @click="activeTab = 'visits'"
        />
      </div>

      <!-- Tab A：成员台账、批量导入与 Git 权限 -->
      <YeucaMembersPanel
        v-if="activeTab === 'members'"
        :members="overview.members"
        :departments="departmentsDraft"
        :gitea="overview.gitea"
        :admin-scope="adminScope"
        @changed="loadOverview"
      />

      <!-- Tab B：招新开关与审批入档 -->
      <YeucaRecruitPanel
        v-if="activeTab === 'recruit'"
        :recruit="overview.recruit"
        :departments="departmentsDraft"
        :admin-scope="adminScope"
        @changed="loadOverview"
      />

      <!-- Tab C：活动排期直管与签到 -->
      <YeucaActivitiesPanel
        v-if="activeTab === 'activities'"
        :activities="overview.activities"
        :departments="departmentsDraft"
        :admin-scope="adminScope"
        @changed="loadOverview"
      />

      <!-- Tab D：全站各页文案 / 镜像 / 沿革 / 外链接管（仅总管） -->
      <YeucaSiteContentPanel
        v-if="isChief && activeTab === 'sitecontent'"
        :initial-extras="overview.settings.extras"
        :saving="savingSettings"
        @save="saveSiteContentState"
      />

      <!-- Tab E：部门部长账号管理（总管创建） -->
      <YeucaMinistersPanel
        v-if="isChief && activeTab === 'ministers'"
        :departments="departmentsDraft"
      />

      <!-- Tab F：计协操作审计与 Gitea 开户诊断 -->
      <YeucaAuditPanel
        v-if="activeTab === 'audits'"
        :admin-scope="adminScope"
      />

      <!-- Tab 1：部门分工（总管增删改全部；部长编辑本部门简介、要点与近期方向） -->
      <div
        v-if="activeTab === 'departments'"
        class="space-y-4"
      >
        <div
          v-if="!isChief"
          class="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-[var(--surface)] dark:bg-zinc-900 p-5 space-y-4"
        >
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 class="text-base font-semibold text-zinc-950 dark:text-zinc-100">
                维护「{{ scopedDepartment }}」官网展示页
              </h2>
              <p class="text-xs text-zinc-500">
                保存后直接同步官网「部门」介绍与招新选项。部门名称与首页展示位由总管统一维护。
              </p>
            </div>
            <label class="inline-flex items-center gap-2 rounded-lg border border-zinc-200 dark:border-zinc-700 px-3 py-1.5 text-xs font-medium cursor-pointer">
              <input
                v-model="ownDeptForm.acceptingRecruit"
                type="checkbox"
                class="rounded border-zinc-300"
              >
              <span :class="ownDeptForm.acceptingRecruit ? 'text-emerald-600 font-semibold' : 'text-zinc-500'">
                {{ ownDeptForm.acceptingRecruit ? '本部门开放招新报名' : '暂不招新' }}
              </span>
            </label>
          </div>

          <div class="grid gap-3 sm:grid-cols-2">
            <UFormField label="负责人 / 部长展示名">
              <UInput
                v-model="ownDeptForm.lead"
                placeholder="如：张三（留空前台不展示）"
                class="w-full"
              />
            </UFormField>
            <UFormField label="近期重点方向">
              <UInput
                v-model="ownDeptForm.recentTopic"
                placeholder="如：Agent 工作流搭建 / 每周算法集训"
                class="w-full"
              />
            </UFormField>
          </div>

          <UFormField
            label="部门介绍"
            required
          >
            <UTextarea
              v-model="ownDeptForm.summary"
              :rows="3"
              class="w-full"
            />
          </UFormField>

          <UFormField label="实践要点（每行一条）">
            <UTextarea
              v-model="ownDeptForm.focusText"
              :rows="4"
              class="w-full"
            />
          </UFormField>

          <UFormField label="常用工具 / 技术栈（逗号分隔）">
            <UInput
              v-model="ownDeptForm.toolsText"
              placeholder="Python, Vue, Linux"
              class="w-full"
            />
          </UFormField>

          <UFormField label="入门条件与招新说明">
            <UTextarea
              v-model="ownDeptForm.recruitDesc"
              :rows="2"
              class="w-full"
            />
          </UFormField>

          <div class="flex justify-end">
            <UButton
              icon="i-lucide-save"
              label="保存本部门设置"
              class="!bg-[#a8121e] hover:!bg-[#7f0d16] !text-white"
              :loading="savingOwnDept"
              @click="saveOwnDepartment"
            />
          </div>
        </div>

        <template v-else>
          <div class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-sky-200/80 dark:border-sky-900/70 bg-sky-50/70 dark:bg-sky-950/40 px-4 py-3">
            <div class="text-sm text-zinc-700 dark:text-zinc-200">
              <strong class="font-semibold">改完即时入库。</strong>
              前台部门页、首页入口和报名选项一起更新。
            </div>
            <UButton
              icon="i-lucide-plus"
              label="新增部门"
              color="primary"
              :loading="savingSettings"
              @click="openNewDepartment"
            />
          </div>

          <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <article
              v-for="(dept, index) in departmentsDraft"
              :key="dept.id"
              class="flex flex-col justify-between rounded-xl border bg-[var(--surface)] dark:bg-zinc-900 p-4 space-y-3 transition-shadow hover:shadow-sm"
              :class="dept.isFeatured ? 'border-sky-400 dark:border-sky-700 ring-1 ring-sky-200 dark:ring-sky-900' : 'border-zinc-200 dark:border-zinc-800'"
            >
              <div class="space-y-2.5">
                <div class="flex items-center justify-between gap-2">
                  <span class="rounded bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 font-mono text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                    #{{ index + 1 }} · {{ dept.code }}
                  </span>
                  <div class="flex flex-wrap gap-1">
                    <UBadge
                      v-if="dept.isFeatured"
                      label="默认首展"
                      color="info"
                      variant="soft"
                      size="xs"
                    />
                    <UBadge
                      :label="dept.acceptingRecruit ? '开放报名' : '暂不招新'"
                      :color="dept.acceptingRecruit ? 'success' : 'neutral'"
                      variant="subtle"
                      size="xs"
                    />
                  </div>
                </div>

                <div>
                  <h2 class="text-base font-bold text-zinc-950 dark:text-zinc-100">
                    {{ dept.name }}
                  </h2>
                  <p class="mt-0.5 text-xs font-medium text-sky-700 dark:text-sky-400">
                    近期方向：{{ dept.recentTopic || '常规实践' }}
                  </p>
                </div>

                <p class="line-clamp-3 text-xs leading-5 text-zinc-600 dark:text-zinc-300">
                  {{ dept.summary }}
                </p>

                <div class="flex flex-wrap gap-1">
                  <UBadge
                    v-for="tool in dept.tools.slice(0, 5)"
                    :key="tool"
                    :label="tool"
                    color="neutral"
                    variant="outline"
                    size="xs"
                  />
                </div>

                <div class="rounded-md bg-zinc-50 dark:bg-zinc-800/50 px-2.5 py-2 text-xs text-zinc-500 dark:text-zinc-400">
                  实践重点 {{ dept.focusList.length }} 条 · {{ dept.lead ? `负责人：${dept.lead}` : '未填负责人' }}
                </div>
              </div>

              <div class="flex flex-wrap items-center justify-between gap-1.5 border-t border-zinc-100 dark:border-zinc-800 pt-2.5">
                <div class="flex items-center gap-1">
                  <UButton
                    size="xs"
                    variant="outline"
                    color="neutral"
                    icon="i-lucide-arrow-left"
                    :disabled="index === 0 || savingSettings"
                    aria-label="前移排序"
                    @click="moveDepartment(index, -1)"
                  />
                  <UButton
                    size="xs"
                    variant="outline"
                    color="neutral"
                    icon="i-lucide-arrow-right"
                    :disabled="index === departmentsDraft.length - 1 || savingSettings"
                    aria-label="后移排序"
                    @click="moveDepartment(index, 1)"
                  />
                  <UButton
                    v-if="!dept.isFeatured"
                    size="xs"
                    variant="ghost"
                    color="info"
                    label="设首展"
                    :disabled="savingSettings"
                    @click="setFeaturedDepartment(index)"
                  />
                  <UButton
                    size="xs"
                    variant="ghost"
                    color="neutral"
                    :label="dept.acceptingRecruit ? '停招' : '开招'"
                    :disabled="savingSettings"
                    @click="toggleDepartmentRecruit(index)"
                  />
                </div>

                <div class="flex items-center gap-1">
                  <UButton
                    size="xs"
                    variant="soft"
                    color="neutral"
                    label="编辑"
                    @click="openEditDepartment(index)"
                  />
                  <UButton
                    size="xs"
                    variant="ghost"
                    color="error"
                    label="删除"
                    :disabled="savingSettings"
                    @click="deleteDepartment(index)"
                  />
                </div>
              </div>
            </article>
          </div>
        </template>
      </div>

      <!-- Tab 2：动态与学习资料（含正文上传配图插入） -->
      <div
        v-if="activeTab === 'posts'"
        class="space-y-4"
      >
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="flex flex-wrap items-center gap-2">
            <UButton
              label="全部"
              size="sm"
              color="neutral"
              :variant="postKindFilter === 'all' ? 'solid' : 'outline'"
              @click="postKindFilter = 'all'"
            />
            <UButton
              label="动态公告"
              size="sm"
              color="neutral"
              :variant="postKindFilter === 'news' ? 'solid' : 'outline'"
              @click="postKindFilter = 'news'"
            />
            <UButton
              label="技术笔记 / 资料"
              size="sm"
              color="neutral"
              :variant="postKindFilter === 'resource' ? 'solid' : 'outline'"
              @click="postKindFilter = 'resource'"
            />
            <UInput
              v-model="postSearchKeyword"
              icon="i-lucide-search"
              placeholder="搜标题或部门..."
              size="sm"
              class="w-48"
            />
          </div>

          <div class="flex gap-2">
            <UButton
              icon="i-lucide-plus"
              label="发布动态"
              color="primary"
              @click="openNewPost('news')"
            />
            <UButton
              icon="i-lucide-book-open"
              label="新增资料"
              color="neutral"
              variant="outline"
              @click="openNewPost('resource')"
            />
          </div>
        </div>

        <div
          v-if="filteredPosts.length === 0"
          class="rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700 p-10 text-center text-sm text-zinc-500"
        >
          还没有内容。右上角可以发动态或笔记。
        </div>

        <div
          v-else
          class="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800 bg-[var(--surface)] dark:bg-zinc-900"
        >
          <table class="w-full text-left text-sm">
            <thead class="border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/60 text-xs text-zinc-500">
              <tr>
                <th class="px-4 py-3">
                  类型 / 部门
                </th>
                <th class="px-4 py-3">
                  标题与摘要
                </th>
                <th class="px-4 py-3">
                  状态
                </th>
                <th class="px-4 py-3">
                  更新日期
                </th>
                <th class="px-4 py-3 text-right">
                  操作
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-zinc-200 dark:divide-zinc-800">
              <tr
                v-for="post in filteredPosts"
                :key="post.id"
              >
                <td class="px-4 py-3 align-top whitespace-nowrap">
                  <div class="flex flex-col gap-1">
                    <UBadge
                      :label="post.kind === 'news' ? '动态' : (post.category || '资料')"
                      color="neutral"
                      variant="subtle"
                      size="xs"
                    />
                    <span class="text-xs text-zinc-500">{{ post.deptName }}</span>
                  </div>
                </td>
                <td class="px-4 py-3 align-top">
                  <div class="flex items-center gap-2">
                    <UBadge
                      v-if="post.pinned"
                      label="置顶"
                      color="error"
                      variant="soft"
                      size="xs"
                    />
                    <span class="font-semibold text-zinc-950 dark:text-zinc-100">{{ post.title }}</span>
                  </div>
                  <p class="mt-1 line-clamp-2 text-xs text-zinc-500">
                    {{ post.summary }}
                  </p>
                </td>
                <td class="px-4 py-3 align-top whitespace-nowrap">
                  <UBadge
                    :label="postStatusMeta[post.status].label"
                    :color="postStatusMeta[post.status].color"
                    variant="soft"
                  />
                </td>
                <td class="px-4 py-3 align-top text-xs text-zinc-500 whitespace-nowrap">
                  {{ post.publishedAt || post.updatedAt }}
                </td>
                <td class="px-4 py-3 align-top text-right whitespace-nowrap">
                  <div class="inline-flex gap-1.5">
                    <UButton
                      size="xs"
                      variant="ghost"
                      color="neutral"
                      label="编辑"
                      @click="openEditPost(post)"
                    />
                    <UButton
                      size="xs"
                      variant="ghost"
                      color="neutral"
                      :label="post.status === 'published' ? '下架' : '发布'"
                      @click="togglePostPublish(post)"
                    />
                    <UButton
                      size="xs"
                      variant="ghost"
                      color="error"
                      label="删除"
                      @click="removePost(post)"
                    />
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Tab 3：项目实验室 -->
      <div
        v-if="activeTab === 'projects'"
        class="space-y-4"
      >
        <div class="flex flex-wrap items-center justify-between gap-3">
          <p class="text-sm text-zinc-500">
            首页项目区和项目档案墙展示的内容。
          </p>
          <div class="flex flex-wrap gap-2">
            <UButton
              icon="i-lucide-sparkles"
              label="快速填入 YeU 联动模板"
              color="neutral"
              variant="outline"
              @click="openNewProject(true)"
            />
            <UButton
              icon="i-lucide-plus"
              label="新增项目"
              color="primary"
              @click="openNewProject(false)"
            />
          </div>
        </div>

        <div
          v-if="overview.projects.length === 0"
          class="rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700 p-10 text-center text-sm text-zinc-500"
        >
          还没有项目。前台先显示 Git 仓库和 YeU 迎新平台。
        </div>

        <div
          v-else
          class="grid gap-4 md:grid-cols-2"
        >
          <div
            v-for="project in overview.projects"
            :key="project.id"
            class="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-[var(--surface)] dark:bg-zinc-900 p-4 space-y-3"
          >
            <div class="flex items-start justify-between gap-2">
              <div class="flex flex-wrap items-center gap-1.5">
                <UBadge
                  :label="projectStatusLabel[project.status]"
                  color="neutral"
                  variant="soft"
                  size="xs"
                />
                <UBadge
                  :label="project.deptName"
                  color="info"
                  variant="subtle"
                  size="xs"
                />
                <UBadge
                  v-if="!project.isPublished"
                  label="未公开"
                  color="warning"
                  variant="soft"
                  size="xs"
                />
              </div>
              <div class="flex gap-1">
                <UButton
                  size="xs"
                  variant="ghost"
                  color="neutral"
                  label="编辑"
                  @click="openEditProject(project)"
                />
                <UButton
                  size="xs"
                  variant="ghost"
                  color="error"
                  label="删除"
                  @click="removeProject(project)"
                />
              </div>
            </div>
            <img
              v-if="project.previewImage"
              :src="project.previewImage"
              :alt="project.title"
              class="h-44 w-full rounded-lg border border-zinc-200 dark:border-zinc-800 object-cover object-top"
            >
            <div>
              <h3 class="font-semibold text-zinc-950 dark:text-zinc-100">
                {{ project.title }}
              </h3>
              <p class="mt-1 text-xs text-zinc-500">
                {{ project.summary }}
              </p>
            </div>
            <div
              v-if="project.stack.length"
              class="flex flex-wrap gap-1.5"
            >
              <UBadge
                v-for="tech in project.stack"
                :key="tech"
                :label="tech"
                color="neutral"
                variant="outline"
                size="xs"
              />
            </div>
          </div>
        </div>
      </div>

      <!-- Tab 4：访客统计与全站图片上传设置（仅总管） -->
      <YeucaVisitsPanel v-if="isChief && activeTab === 'visits'" />

      <div
        v-if="isChief && activeTab === 'studio'"
        class="space-y-6"
      >
        <div class="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-[var(--surface)] dark:bg-zinc-900 px-4 py-3">
          <span class="text-sm text-zinc-600 dark:text-zinc-300">
            改完点右侧保存，官网即时生效。
          </span>
          <UButton
            label="保存"
            icon="i-lucide-save"
            color="primary"
            :loading="savingSettings"
            @click="persistSiteSettings('已保存')"
          />
        </div>

        <!-- 4.1 官网文案与联动工程注解 -->
        <div class="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div class="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-[var(--surface)] dark:bg-zinc-900 p-5 space-y-4">
            <h2 class="text-base font-semibold text-zinc-950 dark:text-zinc-100">
              站名、标语与招新
            </h2>

            <div class="grid gap-4 sm:grid-cols-2">
              <UFormField label="校区标识">
                <UInput
                  v-model="settingsForm.campus"
                  class="w-full"
                />
              </UFormField>
              <UFormField label="迎新群位置">
                <UInput
                  v-model="settingsForm.contactNote"
                  placeholder="如：图信中心机房 / 迎新群安排"
                  class="w-full"
                />
              </UFormField>
            </div>

            <UFormField label="首页首屏主标语">
              <UInput
                v-model="settingsForm.tagline"
                class="w-full"
              />
            </UFormField>

            <UFormField label="协会简介">
              <UTextarea
                v-model="settingsForm.intro"
                :rows="3"
                class="w-full"
              />
            </UFormField>

            <UFormField label="招新说明">
              <UTextarea
                v-model="settingsForm.recruitNote"
                :rows="2"
                placeholder="如：本学期第一次集中宣讲时间待通知"
                class="w-full"
              />
            </UFormField>

            <UFormField label="YeU 项目副注">
              <UTextarea
                v-model="extrasForm.flagshipNote"
                :rows="2"
                placeholder="留空用默认说明"
                class="w-full"
              />
            </UFormField>
          </div>

          <!-- 4.2 图片直传：主站首屏图片 + 迎新群二维码 -->
          <div class="space-y-6">
            <div class="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-[var(--surface)] dark:bg-zinc-900 p-5 space-y-3.5">
              <div class="flex items-center justify-between gap-2">
                <div>
                  <h2 class="text-base font-semibold text-zinc-950 dark:text-zinc-100">
                    首页右图
                  </h2>
                  <p class="text-xs text-zinc-500">
                    16:10 横屏，5MB 以内，留空用默认图。
                  </p>
                </div>
                <input
                  ref="heroImageInput"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  class="hidden"
                  @change="handleHeroImageUpload"
                >
                <div class="flex gap-1.5">
                  <UButton
                    label="上传替换"
                    icon="i-lucide-upload"
                    size="xs"
                    color="primary"
                    variant="soft"
                    :loading="uploadingKey === 'hero-image'"
                    @click="heroImageInput?.click()"
                  />
                  <UButton
                    v-if="extrasForm.heroImageUrl"
                    label="恢复默认"
                    size="xs"
                    color="neutral"
                    variant="ghost"
                    @click="extrasForm.heroImageUrl = ''"
                  />
                </div>
              </div>
              <div class="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-950">
                <img
                  :src="extrasForm.heroImageUrl || 'https://yeuca.huiliyill.cn/images/campus-hero.webp'"
                  alt="主站首屏图预览"
                  class="h-44 w-full object-cover"
                >
              </div>
              <UInput
                v-model="extrasForm.heroImageUrl"
                placeholder="留空用默认图"
                size="sm"
                class="w-full font-mono text-xs"
              />
            </div>

            <div class="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-[var(--surface)] dark:bg-zinc-900 p-5 space-y-3.5">
              <div class="flex items-center justify-between gap-2">
                <div>
                  <h2 class="text-base font-semibold text-zinc-950 dark:text-zinc-100">
                    迎新群二维码
                  </h2>
                  <p class="text-xs text-zinc-500">
                    会出现在「加入我们」的联络卡。
                  </p>
                </div>
                <input
                  ref="qrImageInput"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  class="hidden"
                  @change="handleQrImageUpload"
                >
                <div class="flex gap-1.5">
                  <UButton
                    label="上传二维码"
                    icon="i-lucide-qr-code"
                    size="xs"
                    color="primary"
                    variant="soft"
                    :loading="uploadingKey === 'qr-image'"
                    @click="qrImageInput?.click()"
                  />
                  <UButton
                    v-if="settingsForm.groupQrUrl"
                    label="清空"
                    size="xs"
                    color="neutral"
                    variant="ghost"
                    @click="settingsForm.groupQrUrl = ''"
                  />
                </div>
              </div>

              <div class="flex items-start gap-4">
                <img
                  v-if="settingsForm.groupQrUrl"
                  :src="settingsForm.groupQrUrl"
                  alt="迎新群二维码预览"
                  class="size-28 shrink-0 rounded-md border border-zinc-200 object-contain bg-[var(--surface)]"
                >
                <div
                  v-else
                  class="grid size-28 shrink-0 place-items-center rounded-md border border-dashed border-zinc-300 dark:border-zinc-700 text-xs text-zinc-400 text-center p-2"
                >
                  未上传二维码
                </div>
                <div class="flex-1 space-y-2">
                  <UInput
                    v-model="settingsForm.groupQrUrl"
                    placeholder="留空隐藏"
                    size="sm"
                    class="w-full font-mono text-xs"
                  />
                  <p class="text-xs text-zinc-500">
                    换群后重新上传。
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 4.3 协会实景风采图库上传 -->
        <div class="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-[var(--surface)] dark:bg-zinc-900 p-5 space-y-4">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 class="text-base font-semibold text-zinc-950 dark:text-zinc-100">
                实景相册
              </h2>
              <p class="text-xs text-zinc-500">
                机房、比赛、分享会的照片，传完出现在首页。
              </p>
            </div>
            <input
              ref="galleryImageInput"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              class="hidden"
              @change="handleGalleryPhotoUpload"
            >
            <UButton
              icon="i-lucide-image-plus"
              label="上传图片到实景相册"
              color="primary"
              variant="outline"
              :loading="uploadingKey === 'gallery-photo'"
              @click="galleryImageInput?.click()"
            />
          </div>

          <div
            v-if="extrasForm.gallery.length === 0"
            class="rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 p-6 text-center text-xs text-zinc-500"
          >
            还没上传照片。
          </div>

          <div
            v-else
            class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
          >
            <div
              v-for="(item, idx) in extrasForm.gallery"
              :key="item.id"
              class="rounded-lg border border-zinc-200 dark:border-zinc-800 p-3 space-y-2.5"
            >
              <img
                :src="item.imageUrl"
                :alt="item.title"
                class="h-36 w-full rounded-md border border-zinc-100 dark:border-zinc-800 object-cover"
              >
              <UInput
                v-model="item.title"
                placeholder="照片标题"
                size="sm"
                class="w-full"
              />
              <UInput
                v-model="item.caption"
                placeholder="简要说明（时间或器材/分享内容）"
                size="sm"
                class="w-full"
              />
              <div class="flex justify-end">
                <UButton
                  label="移除照片"
                  size="xs"
                  color="error"
                  variant="ghost"
                  @click="removeGalleryItem(idx)"
                />
              </div>
            </div>
          </div>
        </div>

        <div class="flex justify-end">
          <UButton
            label="保存"
            icon="i-lucide-save"
            size="lg"
            color="primary"
            :loading="savingSettings"
            @click="persistSiteSettings('已保存')"
          />
        </div>
      </div>

      <!-- 弹窗 1：部门增删改详情编辑（直接保存入库） -->
      <UModal
        v-model:open="deptModalOpen"
        :title="editingDeptIdx !== null ? '编辑部门详情' : '新增部门'"
        :ui="{ content: 'max-w-2xl' }"
      >
        <template #body>
          <div class="space-y-4">
            <div class="grid gap-4 sm:grid-cols-3">
              <UFormField label="编号">
                <UInput
                  v-model="deptEditor.code"
                  placeholder="如：01 / AI"
                  class="w-full"
                />
              </UFormField>
              <UFormField
                label="部门名称"
                required
              >
                <UInput
                  v-model="deptEditor.name"
                  placeholder="如：AI 部"
                  class="w-full"
                />
              </UFormField>
              <UFormField label="负责人">
                <UInput
                  v-model="deptEditor.lead"
                  placeholder="留空不显示"
                  class="w-full"
                />
              </UFormField>
            </div>
            <UFormField
              label="部门介绍"
              required
            >
              <UTextarea
                v-model="deptEditor.summary"
                :rows="3"
                class="w-full"
              />
            </UFormField>
            <UFormField label="实践要点（每行一条）">
              <UTextarea
                v-model="deptEditor.focusText"
                :rows="4"
                placeholder="例如：&#10;Agent 工作流搭建与工具调用&#10;文档切块与混合检索评测"
                class="w-full"
              />
            </UFormField>
            <div class="grid gap-4 sm:grid-cols-2">
              <UFormField label="常用工具（逗号分隔）">
                <UInput
                  v-model="deptEditor.toolsText"
                  placeholder="Python, TypeScript, LLM API"
                  class="w-full"
                />
              </UFormField>
              <UFormField label="近期方向 / 关键字">
                <UInput
                  v-model="deptEditor.recentTopic"
                  placeholder="如：Agent 工作流搭建"
                  class="w-full"
                />
              </UFormField>
            </div>
            <UFormField label="入门与要求">
              <UTextarea
                v-model="deptEditor.recruitDesc"
                :rows="2"
                class="w-full"
              />
            </UFormField>
            <div class="flex flex-wrap items-center gap-6">
              <UCheckbox
                v-model="deptEditor.isFeatured"
                label="首页默认首展"
              />
              <UCheckbox
                v-model="deptEditor.acceptingRecruit"
                label="报名页开放招新"
              />
            </div>
            <div class="flex justify-end gap-2 pt-2">
              <UButton
                label="取消"
                color="neutral"
                variant="ghost"
                @click="deptModalOpen = false"
              />
              <UButton
                label="保存"
                color="primary"
                :loading="savingSettings"
                @click="confirmDepartmentEdit"
              />
            </div>
          </div>
        </template>
      </UModal>

      <!-- 弹窗 2：动态 / 笔记资料编辑（支持传图插图） -->
      <UModal
        v-model:open="postModalOpen"
        :title="editingPostId ? '编辑动态或学习资料' : '新建动态或学习资料'"
        :ui="{ content: 'max-w-3xl' }"
      >
        <template #body>
          <div class="space-y-4">
            <div class="grid gap-4 sm:grid-cols-3">
              <UFormField label="内容分类">
                <USelect
                  v-model="postForm.kind"
                  :items="postKindItems"
                  class="w-full"
                />
              </UFormField>
              <UFormField label="归属部门">
                <USelect
                  v-model="postForm.deptName"
                  :items="deptOptions"
                  :disabled="!isChief"
                  class="w-full"
                />
              </UFormField>
              <UFormField label="发布状态">
                <USelect
                  v-model="postForm.status"
                  :items="postStatusItems"
                  class="w-full"
                />
              </UFormField>
            </div>
            <div
              v-if="postForm.kind === 'resource'"
              class="grid gap-4 sm:grid-cols-2"
            >
              <UFormField label="资料子类别">
                <UInput
                  v-model="postForm.category"
                  placeholder="如：实践笔记 / 题单 / 装机参考"
                  class="w-full"
                />
              </UFormField>
            </div>
            <UFormField
              label="标题"
              required
            >
              <UInput
                v-model="postForm.title"
                maxlength="140"
                class="w-full"
              />
            </UFormField>
            <UFormField
              label="摘要"
              required
            >
              <UTextarea
                v-model="postForm.summary"
                :rows="2"
                maxlength="400"
                class="w-full"
              />
            </UFormField>
            <div class="space-y-2">
              <div class="flex flex-wrap items-center justify-between gap-2">
                <label class="text-sm font-medium text-zinc-700 dark:text-zinc-200">正文（Markdown，支持传图） *</label>
                <div class="flex items-center gap-2">
                  <input
                    ref="postInlineImageInput"
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    class="hidden"
                    @change="handlePostInlineImageUpload"
                  >
                  <UButton
                    icon="i-lucide-image-plus"
                    label="正文插图"
                    size="xs"
                    variant="outline"
                    color="neutral"
                    :loading="uploadingKey === 'post-inline'"
                    @click="postInlineImageInput?.click()"
                  />
                  <UButton
                    :label="postPreviewMode ? '切回编辑' : '预览'"
                    size="xs"
                    variant="ghost"
                    color="neutral"
                    @click="postPreviewMode = !postPreviewMode"
                  />
                </div>
              </div>
              <UTextarea
                v-if="!postPreviewMode"
                v-model="postForm.body"
                :rows="9"
                class="w-full font-mono text-xs"
              />
              <div
                v-else
                class="max-h-64 overflow-y-auto rounded-md border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 p-3 text-xs font-mono whitespace-pre-wrap text-zinc-700 dark:text-zinc-300"
              >
                {{ postForm.body || '（暂无正文内容）' }}
              </div>
            </div>
            <div class="grid gap-4 sm:grid-cols-2">
              <UFormField label="标签（逗号分隔）">
                <UInput
                  v-model="postForm.tagsText"
                  placeholder="如：AI部, 工作流"
                  class="w-full"
                />
              </UFormField>
              <div class="flex items-end pb-1.5">
                <UCheckbox
                  v-model="postForm.pinned"
                  label="置顶"
                />
              </div>
            </div>
            <div class="flex justify-end gap-2 pt-2">
              <UButton
                label="取消"
                color="neutral"
                variant="ghost"
                @click="postModalOpen = false"
              />
              <UButton
                label="保存并同步"
                color="primary"
                :loading="savingPost"
                @click="submitPost"
              />
            </div>
          </div>
        </template>
      </UModal>

      <!-- 弹窗 3：项目实验室卡片编辑（支持封面截图上传） -->
      <UModal
        v-model:open="projectModalOpen"
        :title="editingProjectId ? '编辑项目档案' : '新增项目档案'"
        :ui="{ content: 'max-w-3xl' }"
      >
        <template #body>
          <div class="space-y-4">
            <div class="grid gap-4 sm:grid-cols-3">
              <UFormField label="负责部门">
                <USelect
                  v-model="projectForm.deptName"
                  :items="deptOptions"
                  :disabled="!isChief"
                  class="w-full"
                />
              </UFormField>
              <UFormField label="技术方向">
                <UInput
                  v-model="projectForm.track"
                  placeholder="如：AI / Agent、Web、安全"
                  class="w-full"
                />
              </UFormField>
              <UFormField label="项目状态">
                <USelect
                  v-model="projectForm.status"
                  :items="projectStatusItems"
                  class="w-full"
                />
              </UFormField>
            </div>
            <UFormField
              label="项目名称"
              required
            >
              <UInput
                v-model="projectForm.title"
                maxlength="120"
                class="w-full"
              />
            </UFormField>
            <UFormField
              label="简介"
              required
            >
              <UTextarea
                v-model="projectForm.summary"
                :rows="2"
                maxlength="400"
                class="w-full"
              />
            </UFormField>
            <UFormField label="技术要点（每行一条）">
              <UTextarea
                v-model="projectForm.highlightsText"
                :rows="3"
                class="w-full"
              />
            </UFormField>
            <div class="grid gap-4 sm:grid-cols-2">
              <UFormField label="技术栈（逗号分隔）">
                <UInput
                  v-model="projectForm.stackText"
                  placeholder="Python, Vue 3"
                  class="w-full"
                />
              </UFormField>
              <UFormField label="排序（小在前）">
                <UInput
                  v-model.number="projectForm.sortOrder"
                  type="number"
                  class="w-full"
                />
              </UFormField>
            </div>
            <div class="grid gap-4 sm:grid-cols-2">
              <UFormField label="仓库地址">
                <UInput
                  v-model="projectForm.repoUrl"
                  placeholder="https://yeuca.huiliyill.cn/git/..."
                  class="w-full"
                />
              </UFormField>
              <UFormField label="在线演示 / 访问地址">
                <UInput
                  v-model="projectForm.demoUrl"
                  placeholder="https://..."
                  class="w-full"
                />
              </UFormField>
            </div>
            <UFormField label="封面图">
              <div class="space-y-2.5">
                <div class="flex flex-wrap items-center gap-2.5">
                  <UInput
                    v-model="projectForm.previewImage"
                    placeholder="/uploads/... 或留空"
                    class="min-w-0 flex-1"
                  />
                  <input
                    ref="projectImageInput"
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    class="hidden"
                    @change="handleProjectImageUpload"
                  >
                  <UButton
                    label="上传截图"
                    icon="i-lucide-upload"
                    color="neutral"
                    variant="outline"
                    :loading="uploadingKey === 'project-cover'"
                    @click="projectImageInput?.click()"
                  />
                  <UButton
                    v-if="projectForm.previewImage"
                    label="清除"
                    size="xs"
                    color="neutral"
                    variant="ghost"
                    @click="projectForm.previewImage = ''"
                  />
                </div>
                <img
                  v-if="projectForm.previewImage"
                  :src="projectForm.previewImage"
                  alt="项目封面预览"
                  class="h-32 w-full rounded-md border border-zinc-200 dark:border-zinc-800 object-cover object-top"
                >
              </div>
            </UFormField>
            <div class="flex items-center justify-between pt-1">
              <UCheckbox
                v-model="projectForm.isPublished"
                label="主站公开"
              />
              <div class="flex gap-2">
                <UButton
                  label="取消"
                  color="neutral"
                  variant="ghost"
                  @click="projectModalOpen = false"
                />
                <UButton
                  label="保存"
                  color="primary"
                  :loading="savingProject"
                  @click="submitProject"
                />
              </div>
            </div>
          </div>
        </template>
      </UModal>
    </template>
  </div>
</template>
