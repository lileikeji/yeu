import type { Ref } from 'vue'
import type { RecruitFormConfig, RecruitReferrer } from '~~/shared/types'

interface UseRecruitReferrersOptions {
  contentId: Readonly<Ref<string>>
  form: Readonly<Ref<RecruitFormConfig | null>>
}

/** 纳新人与邀请码簇：列表、添加、删除、专属报名链接与复制。 */
export function useRecruitReferrers(options: UseRecruitReferrersOptions) {
  const { contentId, form } = options
  const toast = useToast()

  const referrers = ref<RecruitReferrer[]>([])
  const referrerNameInput = ref('')
  const referrerCodeInput = ref('')
  const referrerBusy = ref(false)

  const recruitOrigin = import.meta.client ? window.location.origin : ''

  function referrerLink(code: string): string {
    return `${recruitOrigin}/recruit/${form.value?.clubSlug ?? ''}?ref=${encodeURIComponent(code)}`
  }

  async function loadReferrers(): Promise<void> {
    if (!contentId.value) return
    try {
      const result = await adminFetch<{ items: RecruitReferrer[] }>(
        `/api/admin/recruit/referrers?contentId=${encodeURIComponent(contentId.value)}`
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
        `/api/admin/recruit/referrers?contentId=${encodeURIComponent(contentId.value)}`,
        { method: 'POST', body: { name, code: referrerCodeInput.value.trim() || undefined } }
      )
      referrers.value = result.items
      referrerNameInput.value = ''
      referrerCodeInput.value = ''
      toast.add({ title: `已添加「${name}」`, description: '复制对应的报名链接发给对方，对方从这条链接报名就算你的推荐。', color: 'success' })
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
        `/api/admin/recruit/referrers/${referrer.id}?contentId=${encodeURIComponent(contentId.value)}`,
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

  return {
    referrers,
    referrerNameInput,
    referrerCodeInput,
    referrerBusy,
    referrerLink,
    loadReferrers,
    addReferrer,
    removeReferrer,
    copyReferrerLink
  }
}
