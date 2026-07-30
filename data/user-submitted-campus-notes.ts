import type { AssistantKnowledgeSeed } from './assistant-knowledge'

/**
 * User-provided screenshots are useful for time-sensitive onboarding details,
 * but they are not school-wide policy documents. Keep the confidence and
 * wording explicit so retrieval can use them without presenting them as
 * official notices.
 */
export const userSubmittedCampusNotes: AssistantKnowledgeSeed[] = [
  {
    id: 'experience-2026-welcome-comfort-dorm-window',
    kind: 'student_experience',
    category: '迎新与宿舍',
    title: '迎新系统舒适型宿舍提交时间与付款顺序',
    question: '2026级舒适型宿舍什么时候提交？在哪个系统申请？普通型要不要操作？舒适型宿舍怎么抢？',
    answer: '按用户提供的2026级仰恩大学迎新系统截图，选择舒适型宿舍的同学需要在迎新系统页面显示的“2026-08-24 00:09:00至2026-08-31 00:00:00”期间提交并支付对应住宿费；最终是否选中以支付时间为准，数量有限，先到先得。选择普通型宿舍的同学不需要进行这一步。截图中的起始时间显示格式可能存在录入或页面展示差异，实际操作应以迎新系统当前页面、倒计时和学校当届通知为准。',
    keywords: [
      '2026级舒适型宿舍提交时间',
      '舒适型宿舍什么时候提交',
      '舒适型宿舍什么时候开放',
      '迎新系统申请舒适型宿舍',
      '抢舒适型宿舍',
      '支付时间',
      '普通型宿舍不用操作',
      '2026-08-24',
      '2026-08-31'
    ],
    publicUrl: '/guides/find-campus',
    confidence: 86,
    sourceNote: '用户提供的2026级迎新系统截图（优先参考）；时间和名额以迎新系统实时页面及学校当届通知为准。'
  },
  {
    id: 'experience-2026-welcome-dorm-fees-facilities',
    kind: 'student_experience',
    category: '迎新与宿舍',
    title: '迎新系统展示的舒适型与普通型宿舍费用配置',
    question: '舒适型宿舍多少钱？舒适型女生和男生几人间？普通型宿舍多少钱，有什么设施？',
    answer: '用户提供的迎新系统截图显示：舒适型女生为4人间，2780元/人·年；舒适型男生为5人间，2580元/人·年。截图列出的舒适型配置包括独立阳台、卫生间（两间）、淋浴间、两个洗漱池、洗衣槽和空调。普通型标准为1300元/人·年，截图列有楼层公共卫生间、洗漱间、热水器和空调。房型、设施和收费仍应以迎新系统最终页面、缴费页面及学校当届通知为准。',
    keywords: [
      '舒适型女生4人间',
      '舒适型男生5人间',
      '女生宿舍2780',
      '男生宿舍2580',
      '普通型宿舍1300',
      '独立阳台',
      '独立卫生间',
      '淋浴间',
      '洗衣槽',
      '宿舍空调'
    ],
    publicUrl: '/guides/find-campus',
    confidence: 88,
    sourceNote: '用户提供的2026级迎新系统截图；招生章程、迎新系统和实际缴费页面如有差异，以当届正式页面为准。'
  },
  {
    id: 'experience-2025-dorm-comfort-comparison',
    kind: 'student_experience',
    category: '宿舍体验',
    title: '舒适型与普通型宿舍的学生体验对比',
    question: '舒适型宿舍有什么优缺点？普通型宿舍怎么样？舒适型和普通型宿舍怎么选？',
    answer: '二、三张学生经验截图提到：舒适型宿舍通常是4人间、上床下桌，体验上有独立卫生间和阳台，部分房间有洗衣机，夏天有空调，空间相对宽松；代价是住宿费更高。截图还给出楼栋参考：女生舒适型在旧区衡山楼，男生舒适型在新区辽宁楼或陕西楼。普通型宿舍费用较低，常见为4至5人间，公共卫生间和公共洗浴设施更常见，热水开放时段、断电和断网安排可能按楼栋执行。楼栋与房型属于学生经验，不是固定分配名单，最终以迎新系统和学校通知为准。',
    keywords: [
      '舒适型宿舍优缺点',
      '普通型宿舍优缺点',
      '舒适型和普通型怎么选',
      '4人间上床下桌',
      '宿舍独立卫生间',
      '宿舍独立阳台',
      '普通宿舍公共浴室',
      '女生舒适型旧区',
      '男生舒适型新区',
      '女生舒适型衡山楼',
      '男生舒适型辽宁楼',
      '男生舒适型陕西楼',
      '宿舍断电断网'
    ],
    publicUrl: '/guides/find-campus',
    confidence: 68,
    sourceNote: '用户提供的学长经验截图，仅作生活参考；房型配置、楼栋、热水和门禁安排以当届实际分配和现场通知为准。'
  },
  {
    id: 'experience-2026-computer-science-new-campus-correction',
    kind: 'student_experience',
    category: '专业与校区',
    title: '计算机科学与技术专业宿舍校区更正',
    question: '计算机科学与技术专业住新区还是旧区？计算机专业宿舍在哪个校区？',
    answer: '按用户对现有资料的更正，2026级计算机科学与技术专业应先按新区记录。此前把计算机科学与技术列为旧区的旧截图或摘要不再作为当前答案。这个信息目前仍属于用户提供的当届经验，尚未找到学校公开的完整分配名单；最终以迎新系统个人结果、录取材料和学校当届通知为准，也不要据此推断其他计算机相关专业。',
    keywords: [
      '计算机科学与技术新区',
      '计算机专业新区',
      '计算机科学与技术住哪里',
      '计算机科学与技术宿舍在哪',
      '计算机专业校区',
      '计算机旧区更正'
    ],
    publicUrl: '/major-lookup',
    confidence: 82,
    sourceNote: '用户根据2026级实际信息提出的校正；未替代学校正式分配名单，迎新系统结果优先。'
  }
]
