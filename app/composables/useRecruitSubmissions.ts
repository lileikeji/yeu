import type { Ref } from 'vue'
import type {
  RecruitFormConfig,
  RecruitSubmission,
  RecruitSubmissionPage,
  RecruitSubmissionStats
} from '~~/shared/types'

/** 提交时间展示（页面表格与查看/编辑弹窗共用同一格式）。 */
export function formatRecruitDateTime(value: number): string {
  return new Date(value).toLocaleString('zh-CN', { hour12: false })
}

/** 总表单元格展示文本（多选值以「、」连接）。 */
export function recruitSheetCellText(row: RecruitSubmission, key: string): string {
  const value = row.data[key]
  if (value === undefined || value === null) return ''
  return Array.isArray(value) ? value.join('、') : String(value)
}

interface UseRecruitSubmissionsOptions {
  contentId: Readonly<Ref<string>>
  form: Readonly<Ref<RecruitFormConfig | null>>
  /** 总表导出地址由表单作用域决定（contentId 可能来自 form），由调用方传入。 */
  exportUrl: Readonly<Ref<string>>
}

/**
 * 提交记录簇：列表 / 搜索 / 分页 / 删除 / 单份与批量下载 / 统计 / 总表在线预览 / 单条查看编辑。
 */
export function useRecruitSubmissions(options: UseRecruitSubmissionsOptions) {
  const { contentId, form, exportUrl } = options
  const toast = useToast()
  const { downloadFile } = useRecruitFiles()

  const submissions = ref<RecruitSubmission[]>([])
  const submissionsTotal = ref(0)
  const submissionsPage = ref(1)
  const submissionsPageSize = 20
  const searchQuery = ref('')
  const loadingSubmissions = ref(false)
  const submissionStats = ref<RecruitSubmissionStats | null>(null)

  async function loadSubmissions(): Promise<void> {
    if (!contentId.value) return
    loadingSubmissions.value = true
    try {
      const result = await adminFetch<RecruitSubmissionPage>(
        `/api/admin/recruit/submissions?contentId=${encodeURIComponent(contentId.value)}`
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

  async function loadSubmissionStats(): Promise<void> {
    if (!contentId.value) return
    try {
      submissionStats.value = await adminFetch<RecruitSubmissionStats>(
        `/api/admin/recruit/submissions/stats?contentId=${encodeURIComponent(contentId.value)}`
      )
    } catch {
      submissionStats.value = null
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
        `/api/admin/recruit/submissions/${submission.id}?contentId=${encodeURIComponent(contentId.value)}`,
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
    return `/api/admin/recruit/submissions/${submission.id}/doc?contentId=${encodeURIComponent(contentId.value)}`
  }

  function downloadSubmissionDoc(submission: RecruitSubmission): void {
    const base = `${submission.className || ''}${submission.name || ''}`.trim()
    void downloadFile(submissionDocUrl(submission), `${base || '入会申请表'}.docx`)
  }

  function downloadExportWorkbook(): void {
    void downloadFile(exportUrl.value, `纳新总表-${form.value?.clubName || '社团'}.xlsx`)
  }

  // -- selection & bulk download -----------------------------------------------

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
    const url = `/api/admin/recruit/submissions/download-selected?contentId=${encodeURIComponent(contentId.value)}&ids=${encodeURIComponent(ids)}`
    void downloadFile(url, `纳新申请表-选中${selectedCount.value}份.zip`)
  }

  const selectingAll = ref(false)

  /** 跨页真全选：把当前搜索条件下所有提交都加进勾选。 */
  async function selectAllFiltered(): Promise<void> {
    if (!contentId.value) return
    selectingAll.value = true
    try {
      const all = new Set<string>()
      for (let page = 1; ; page += 1) {
        const result = await adminFetch<RecruitSubmissionPage>(
          `/api/admin/recruit/submissions?contentId=${encodeURIComponent(contentId.value)}`
          + `&page=${page}&pageSize=100&query=${encodeURIComponent(searchQuery.value.trim())}`
        )
        for (const item of result.items) all.add(item.id)
        if (all.size >= result.total || result.items.length === 0) break
      }
      selectedIds.value = all
      toast.add({ title: `已全选 ${all.size} 份提交（含未展示页）`, color: 'success' })
    } catch {
      toast.add({ title: '全选失败，请重试', color: 'warning' })
    } finally {
      selectingAll.value = false
    }
  }

  const departmentSelectItems = computed(() => {
    const field = (form.value?.fields ?? []).find(item => item.key === 'departments')
    return (field?.options ?? []).map(option => ({ label: option, value: option }))
  })
  const downloadDepartment = ref('')

  function downloadByDepartment(): void {
    if (!downloadDepartment.value) {
      toast.add({ title: '请先选择部门', color: 'warning' })
      return
    }
    const url = `/api/admin/recruit/submissions/download-selected?contentId=${encodeURIComponent(contentId.value)}`
      + `&all=1&department=${encodeURIComponent(downloadDepartment.value)}`
    void downloadFile(url, `纳新申请表-${downloadDepartment.value}.zip`)
  }

  function downloadGroupedZip(): void {
    const url = `/api/admin/recruit/submissions/download-selected?contentId=${encodeURIComponent(contentId.value)}`
      + '&all=1&grouped=1'
    void downloadFile(url, '纳新申请表-分部门合集.zip')
  }

  // -- online sheet preview (总表在线预览编辑) ----------------------------------

  const sheetRows = ref<RecruitSubmission[]>([])
  const sheetSavingKey = ref('')

  async function loadSheet(): Promise<void> {
    if (!contentId.value) return
    try {
      const result = await adminFetch<RecruitSubmissionPage>(
        `/api/admin/recruit/submissions?contentId=${encodeURIComponent(contentId.value)}&page=1&pageSize=100&query=`
      )
      sheetRows.value = result.items
    } catch {
      toast.add({ title: '总表预览加载失败', color: 'warning' })
    }
  }

  async function saveSheetCell(row: RecruitSubmission, key: string, value: string): Promise<void> {
    const cellKey = `${row.id}:${key}`
    if (sheetSavingKey.value || recruitSheetCellText(row, key) === value.trim()) return
    sheetSavingKey.value = cellKey
    try {
      const result = await adminFetch<{ submission: RecruitSubmission }>(
        `/api/admin/recruit/submissions/${row.id}?contentId=${encodeURIComponent(contentId.value)}`,
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

  // -- online viewing/editing of one submission ---------------------------------

  const editOpen = ref(false)
  const editSaving = ref(false)
  const editingSubmission = ref<RecruitSubmission | null>(null)
  const formatDateTime = formatRecruitDateTime

  function openEdit(submission: RecruitSubmission): void {
    editingSubmission.value = submission
    editOpen.value = true
  }

  async function saveEdit(data: Record<string, string | string[]>): Promise<void> {
    const submission = editingSubmission.value
    if (!submission || editSaving.value) return
    // Missing fields are tolerated (paper-form imports) — the server only
    // rejects invalid values such as malformed phone/QQ/student numbers.
    editSaving.value = true
    try {
      await adminFetch(
        `/api/admin/recruit/submissions/${submission.id}?contentId=${encodeURIComponent(contentId.value)}`,
        { method: 'PUT', body: { data } }
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

  return {
    submissions,
    submissionsTotal,
    submissionsPage,
    submissionsPageSize,
    searchQuery,
    loadingSubmissions,
    submissionStats,
    loadSubmissions,
    loadSubmissionStats,
    searchSubmissions,
    changeSubmissionsPage,
    deleteSubmission,
    submissionDocUrl,
    downloadSubmissionDoc,
    downloadExportWorkbook,
    selectedIds,
    selectedCount,
    allOnPageSelected,
    toggleSelectAll,
    toggleSelectOne,
    downloadSelected,
    selectingAll,
    selectAllFiltered,
    departmentSelectItems,
    downloadDepartment,
    downloadByDepartment,
    downloadGroupedZip,
    sheetRows,
    sheetSavingKey,
    loadSheet,
    saveSheetCell,
    editOpen,
    editSaving,
    editingSubmission,
    openEdit,
    saveEdit,
    formatDateTime
  }
}
