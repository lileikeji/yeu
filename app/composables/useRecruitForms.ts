import type {
  RecruitExportColumn,
  RecruitFormConfig,
  RecruitFormField
} from '~~/shared/types'

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

/**
 * 报名表单定义本身：管理员会话 / 社团作用域、表单加载与保存、字段与导出列编辑、
 * 文档标签映射、.docx 模板上传、缴费收款码上传。
 */
export function useRecruitForms() {
  const toast = useToast()
  const { downloadFile } = useRecruitFiles()

  const loading = ref(true)
  const loadError = ref('')
  const adminRole = ref<'super' | 'organization'>('super')
  const clubs = ref<AdminClubOption[]>([])
  const selectedContentId = ref('')
  const form = ref<RecruitFormConfig | null>(null)
  const saving = ref(false)

  const templateFileInput = ref<HTMLInputElement | null>(null)
  const uploadingTemplate = ref(false)

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
      const result = await adminFetch<{ form: RecruitFormConfig }>(
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
      const result = await adminFetch<{ form: RecruitFormConfig }>(
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
          description: '已重新载入最新数据，确认内容后再保存。',
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

  // -- form field editor -----------------------------------------------------

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
    field.options = text.split(/[、,，\\n]/).map(item => item.trim()).filter(Boolean)
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

  // -- doc mapping editor ----------------------------------------------------

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

  // -- export column editor --------------------------------------------------

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

  function renameExportColumn(column: RecruitExportColumn, label: string): void {
    column.label = label
  }

  function downloadTemplate(): void {
    void downloadFile(templateDownloadUrl.value, form.value?.templateName || '入会申请表模板.docx')
  }

  function downloadSampleDoc(): void {
    void downloadFile(sampleDocUrl.value, '示例-入会申请表.docx')
  }

  // -- payment QR setup (缴费设置) ---------------------------------------------

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

  // -- field option details (部门介绍) ------------------------------------------

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

  return {
    loading,
    loadError,
    adminRole,
    clubs,
    selectedContentId,
    form,
    saving,
    refreshingForm,
    FIELD_TYPE_OPTIONS,
    fieldOptions,
    multiselectFieldOptions,
    columnSourceOptions,
    templateDownloadUrl,
    sampleDocUrl,
    exportUrl,
    recruitPublicUrl,
    templateFileInput,
    uploadingTemplate,
    paymentFileInput,
    paymentUploadTarget,
    paymentUploading,
    loadSession,
    loadClubs,
    loadForm,
    refreshFormData,
    saveForm,
    onTemplateFileChange,
    copyTemplateLabel,
    addField,
    removeField,
    moveField,
    setFieldOptions,
    fieldOptionsText,
    addMapping,
    removeMapping,
    moveMapping,
    addExportColumn,
    removeExportColumn,
    moveExportColumn,
    onExportColumnKeyChange,
    renameExportColumn,
    downloadTemplate,
    downloadSampleDoc,
    triggerPaymentUpload,
    onPaymentFileChange,
    clearPaymentImage,
    fieldOptionDetailText,
    setFieldOptionDetail
  }
}
