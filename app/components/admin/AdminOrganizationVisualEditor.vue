<script setup lang="ts">
interface EditorBox {
  id: string
  title: string
  body: string
  itemsText: string
  icon: string
  tone: 'plain' | 'green' | 'blue' | 'amber'
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
  metadata: Record<string, unknown>
  group: string
  direction: string
  recruitmentPeriod: string
  activitySchedule: string
  contactMethod: string
  website: string
  phone: string
  email: string
  address: string
  officeHours: string
  contactName: string
  contactPhonesText: string
  groupQrUrls: string[]
  contactQrUrls: string[]
  boxes: EditorBox[]
}

const props = defineProps<{
  contentId: string
  readonly?: boolean
}>()

const toast = useToast()
const loading = ref(true)
const saving = ref(false)
const loadError = ref('')
const saveError = ref('')
const uploadTarget = ref<'group' | 'contact' | null>(null)
const model = reactive<EditorModel>({
  id: '',
  kind: 'club',
  slug: '',
  title: '',
  summary: '',
  body: '',
  category: '',
  isFeatured: false,
  metadata: {},
  group: '',
  direction: '',
  recruitmentPeriod: '',
  activitySchedule: '',
  contactMethod: '',
  website: '',
  phone: '',
  email: '',
  address: '',
  officeHours: '',
  contactName: '',
  contactPhonesText: '',
  groupQrUrls: [],
  contactQrUrls: [],
  boxes: []
})

const publicPath = computed(() => `/${model.kind === 'club' ? 'clubs' : 'departments'}/${encodeURIComponent(model.slug)}`)
const kindLabel = computed(() => model.kind === 'club' ? '社团' : '部门')

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function stringList(value: unknown, legacyValue?: unknown): string[] {
  const items = Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim()))
    : typeof legacyValue === 'string' && legacyValue.trim()
      ? [legacyValue.trim()]
      : []
  return [...new Set(items)]
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
    return [{
      id,
      title,
      body: text(source.body),
      itemsText: Array.isArray(source.items)
        ? source.items.filter((entry): entry is string => typeof entry === 'string').join('\n')
        : '',
      icon: text(source.icon) || 'i-lucide-layout-panel-top',
      tone
    }]
  })
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
  model.metadata = { ...metadata }
  model.group = text(metadata.group)
  model.direction = text(metadata.direction)
  model.recruitmentPeriod = text(metadata.recruitmentPeriod)
  model.activitySchedule = text(metadata.activitySchedule)
  model.contactMethod = text(metadata.contactMethod)
  model.website = text(metadata.website)
  model.phone = text(metadata.phone)
  model.email = text(metadata.email)
  model.address = text(metadata.address)
  model.officeHours = text(metadata.officeHours)
  model.contactName = text(metadata.contactName)
  model.contactPhonesText = stringList(metadata.contactPhones, metadata.contactPhone).join('\n')
  model.groupQrUrls = stringList(metadata.groupQrUrls, metadata.groupQrUrl)
  model.contactQrUrls = stringList(metadata.contactQrUrls, metadata.contactQrUrl)
  model.boxes = editorBoxes(metadata.boxes)
}

async function loadContent(): Promise<void> {
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
    tone: box.tone
  }
}

async function save(): Promise<void> {
  if (props.readonly) return
  saveError.value = ''
  if (!model.title.trim() || !model.summary.trim()) {
    saveError.value = '页面标题和简介不能为空。'
    return
  }
  if (model.boxes.some(box => !box.title.trim())) {
    saveError.value = '每个 Box 都需要填写标题。'
    return
  }

  saving.value = true
  try {
    const metadata = {
      ...model.metadata,
      group: model.group.trim(),
      direction: model.direction.trim(),
      recruitmentPeriod: model.recruitmentPeriod.trim(),
      activitySchedule: model.activitySchedule.trim(),
      contactMethod: model.contactMethod.trim(),
      website: model.website.trim(),
      phone: model.phone.trim(),
      email: model.email.trim(),
      address: model.address.trim(),
      officeHours: model.officeHours.trim(),
      contactName: model.contactName.trim(),
      contactPhones: model.contactPhonesText.split('\n').map(item => item.trim()).filter(Boolean),
      groupQrUrls: model.groupQrUrls,
      contactQrUrls: model.contactQrUrls,
      boxes: model.boxes.map(boxPayload)
    }
    const result = await adminFetch(`/api/admin/content/${encodeURIComponent(model.id)}`, {
      method: 'PATCH',
      body: {
        title: model.title.trim(),
        summary: model.summary.trim(),
        body: model.body,
        category: model.category.trim() || null,
        isFeatured: model.isFeatured,
        metadata
      }
    })
    hydrate(result)
    toast.add({ title: '页面已保存', color: 'success' })
  } catch {
    saveError.value = '保存失败。请检查内容长度、二维码数量和网络状态。'
  } finally {
    saving.value = false
  }
}

function addBox(): void {
  if (model.boxes.length >= 24) return
  model.boxes.push({
    id: `box-${Date.now().toString(36)}`,
    title: '新的内容',
    body: '',
    itemsText: '',
    icon: 'i-lucide-layout-panel-top',
    tone: 'plain'
  })
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

function removeQr(target: 'group' | 'contact', index: number): void {
  const values = target === 'group' ? model.groupQrUrls : model.contactQrUrls
  values.splice(index, 1)
}

async function uploadQrList(target: 'group' | 'contact', event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const files = [...(input.files ?? [])]
  const values = target === 'group' ? model.groupQrUrls : model.contactQrUrls
  if (!files.length) return
  if (values.length + files.length > 8) {
    toast.add({ title: '每组最多上传 8 张二维码', color: 'warning' })
    input.value = ''
    return
  }

  uploadTarget.value = target
  try {
    const uploaded = await Promise.all(files.map(async (file) => {
      const body = new FormData()
      body.set('image', file)
      return await adminFetch<{ url: string }>('/api/admin/media/images', {
        method: 'POST',
        body
      })
    }))
    values.push(...uploaded.map(item => item.url).filter(url => !values.includes(url)))
  } catch {
    toast.add({ title: '二维码上传失败', description: '请使用 PNG、JPEG 或 WebP，单张不超过 5MB。', color: 'error' })
  } finally {
    uploadTarget.value = null
    input.value = ''
  }
}

onMounted(() => {
  void loadContent()
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
        class="size-7 animate-spin text-green-700"
      />
    </div>

    <div
      v-else-if="loadError"
      class="rounded-lg border border-red-200 bg-red-50 p-5 text-sm text-red-800"
      role="alert"
    >
      {{ loadError }}
    </div>

    <div v-else>
      <div class="sticky top-16 z-20 -mx-4 mb-5 flex flex-wrap items-center gap-3 border-y border-zinc-200 bg-white/95 px-4 py-3 backdrop-blur sm:-mx-5 sm:px-5 lg:-mx-6 lg:px-6">
        <div class="min-w-0 flex-1">
          <p class="text-xs font-semibold text-green-700">
            可视化编辑
          </p>
          <p class="truncate text-sm font-bold text-zinc-950">
            {{ model.title }}
          </p>
        </div>
        <UButton
          :to="publicPath"
          target="_blank"
          rel="noopener noreferrer"
          icon="i-lucide-external-link"
          label="查看前台"
          color="neutral"
          variant="outline"
        />
        <UButton
          icon="i-lucide-save"
          label="保存页面"
          :loading="saving"
          :disabled="readonly"
          @click="save"
        />
      </div>

      <p
        v-if="saveError"
        class="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        role="alert"
      >
        {{ saveError }}
      </p>

      <div class="overflow-hidden rounded-lg border border-zinc-200 bg-[#fafafa]">
        <header class="border-b border-zinc-200 bg-white">
          <div class="mx-auto max-w-4xl px-5 py-8 md:px-8 md:py-11">
            <div class="flex flex-wrap items-center gap-2">
              <span class="grid size-11 place-items-center rounded-md bg-emerald-50 text-emerald-700">
                <UIcon
                  :name="model.kind === 'club' ? 'i-lucide-users-round' : 'i-lucide-landmark'"
                  class="size-5"
                />
              </span>
              <UBadge
                :label="kindLabel"
                color="neutral"
                variant="soft"
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
          <section class="border-b border-zinc-200 pb-8">
            <h2 class="text-lg font-bold text-zinc-950">
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

          <section class="border-b border-zinc-200 py-8">
            <h2 class="text-lg font-bold text-zinc-950">
              {{ model.kind === 'club' ? '招新与活动' : '部门公开信息' }}
            </h2>
            <div class="mt-4 grid gap-4 md:grid-cols-2">
              <template v-if="model.kind === 'club'">
                <UFormField label="社团类别">
                  <UInput
                    v-model="model.group"
                    class="w-full"
                  />
                </UFormField>
                <UFormField label="社团方向">
                  <UInput
                    v-model="model.direction"
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

          <section class="border-b border-zinc-200 py-8">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 class="text-lg font-bold text-zinc-950">
                  自定义 Box
                </h2>
                <p class="mt-1 text-sm text-zinc-500">
                  可添加最多 24 个内容块，前台会按这里的顺序展示。
                </p>
              </div>
              <UButton
                icon="i-lucide-square-plus"
                label="添加 Box"
                color="neutral"
                variant="outline"
                :disabled="model.boxes.length >= 24"
                @click="addBox"
              />
            </div>
            <div class="mt-5 grid gap-4 md:grid-cols-2">
              <article
                v-for="(box, index) in model.boxes"
                :key="box.id"
                class="rounded-lg border border-zinc-200 bg-white p-4"
              >
                <div class="flex items-center gap-1">
                  <span class="mr-auto text-xs font-semibold text-zinc-500">
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
              </article>
            </div>
          </section>

          <section class="py-8">
            <h2 class="text-lg font-bold text-zinc-950">
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
                  <p class="text-sm font-semibold text-zinc-900">
                    招新与群聊二维码
                  </p>
                  <label class="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-md border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-800">
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
                <div class="mt-3 grid grid-cols-3 gap-2">
                  <figure
                    v-for="(url, index) in model.groupQrUrls"
                    :key="url"
                    class="relative rounded-lg border border-zinc-200 bg-white p-2"
                  >
                    <img
                      :src="url"
                      alt=""
                      class="aspect-square w-full object-contain"
                    >
                    <UButton
                      icon="i-lucide-x"
                      color="error"
                      size="xs"
                      class="absolute right-1 top-1"
                      aria-label="删除二维码"
                      @click="removeQr('group', index)"
                    />
                  </figure>
                </div>
              </div>
              <div>
                <div class="flex items-center justify-between gap-3">
                  <p class="text-sm font-semibold text-zinc-900">
                    负责人二维码
                  </p>
                  <label class="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-md border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-800">
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
                <div class="mt-3 grid grid-cols-3 gap-2">
                  <figure
                    v-for="(url, index) in model.contactQrUrls"
                    :key="url"
                    class="relative rounded-lg border border-zinc-200 bg-white p-2"
                  >
                    <img
                      :src="url"
                      alt=""
                      class="aspect-square w-full object-contain"
                    >
                    <UButton
                      icon="i-lucide-x"
                      color="error"
                      size="xs"
                      class="absolute right-1 top-1"
                      aria-label="删除负责人二维码"
                      @click="removeQr('contact', index)"
                    />
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
