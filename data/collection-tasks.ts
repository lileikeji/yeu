/**
 * 待采数据清单（F8 / F9 / F10 / F12）。
 *
 * 为什么要有这个文件：这四项功能卡在数据而不是代码上。没有入口坐标就不能做
 * 「最后 50 米」，没有楼栋清单就不能做「按楼栋看宿舍」，没有实时座位数据就
 * 不能做「自习拥挤度」，没有官方对照表就不能做「专升本专业对照」。先写页面
 * 等于编内容，比不做更坏——所以把「缺什么、谁能给、怎么算合格」写成可校验的
 * 清单，采集完成后按 `data/collection-tasks.ts` 的字段规格落库。
 *
 * 数据纪律：
 * - 每项都必须写明来源要求（sourceRule）与验收判据（acceptance），
 *   采集结果不满足就退回，不做「先上线后补来源」。
 * - `sampleRow` 是字段规格的自证样例，必须能通过自己的校验规则
 *   （`scripts/data-collection.test.ts` 会跑一遍）。
 * - 采集完成的标志不是「文件存在」，是「校验脚本通过 + 每行都有可点开的来源」。
 */

export type CollectionTaskStatus = 'blocked' | 'collecting' | 'verified'

export interface CollectionField {
  /** 落库列名（与 drizzle schema 一致）。 */
  name: string
  /** 数据类型，用于选校验规则。 */
  type: 'text' | 'number' | 'coordinate' | 'url' | 'photo' | 'enum'
  required: boolean
  /** 校验规则；enum 时必须给 `values`。 */
  pattern?: string
  values?: readonly string[]
  /** 一句话说明这一列要填什么，避免采集人自己发挥。 */
  note: string
}

export interface CollectionTask {
  id: 'F8' | 'F9' | 'F10' | 'F12'
  feature: string
  status: CollectionTaskStatus
  /** 卡住的原因。status 为 blocked 时必须写。 */
  blockedBy?: string
  /** 谁能提供这份数据（角色，不是人名）。 */
  owner: string
  /** 需要向对方提出的具体问题，可直接复制发给对方。 */
  ask: string
  /** 计划落库的位置；采集完成后新建或扩展这个文件/表。 */
  target: string
  fields: readonly CollectionField[]
  /** 验收判据：满足全部条件才算采集完成。 */
  acceptance: readonly string[]
  /** 字段规格自证样例（不是真实数据，只用于校验规格是否可执行）。 */
  sampleRow: Record<string, string | number>
  /** 采集完成后能解锁的用户价值。 */
  unlocks: string
}

export const collectionTasks: readonly CollectionTask[] = [
  {
    id: 'F8',
    feature: '最后 50 米：从校门/停车点走到具体入口',
    status: 'blocked',
    blockedBy: '现有 87 个地点只有中心点坐标，没有入口坐标与入口照片；地图数据里也没有「哪个门开着」的信息。',
    owner: '总务处 + 保卫处（门禁与开放时间），或实地采集志愿者（拍照 + 记录）',
    ask: '每栋楼/每个场馆能不能给一份「入口清单」：入口在哪个方向、几点开、有没有台阶或坡道、能不能进电动车？附带一张从路口看过去的照片即可。',
    target: 'data/place-entrances.ts（新文件）→ 后续同步到 place_entrances 表',
    fields: [
      { name: 'placeSlug', type: 'text', required: true, pattern: '^[a-z0-9-]{2,60}$', note: '对应 places.slug，必须是已有地点' },
      { name: 'label', type: 'text', required: true, pattern: '^.{2,20}$', note: '人话入口名，如「东侧正门」「南门台阶」' },
      { name: 'lat', type: 'coordinate', required: true, pattern: '^2[0-9]\\.\\d{4,7}$', note: 'GPS 纬度，六位以上小数' },
      { name: 'lng', type: 'coordinate', required: true, pattern: '^1[0-9]{2}\\.\\d{4,7}$', note: 'GPS 经度，六位以上小数' },
      { name: 'photoUrl', type: 'photo', required: true, pattern: '^/uploads/[A-Za-z0-9-]+\\.(jpg|png|webp)$', note: '从路口看过去的照片，站内路径' },
      { name: 'accessNote', type: 'text', required: true, pattern: '^.{4,60}$', note: '台阶/坡道/电动车能否进/雨天是否积水，只写影响走法的事' },
      { name: 'openHours', type: 'text', required: false, pattern: '^.{2,40}$', note: '门禁时间；不确定就留空，不要写「全天开放」' },
      { name: 'sourceUrl', type: 'url', required: true, pattern: '^https://', note: '学校通知、后勤公告或现场采集记录页' },
      { name: 'collectedAt', type: 'text', required: true, pattern: '^\\d{4}-\\d{2}-\\d{2}$', note: '采集日期；照片与坐标同一天' }
    ],
    acceptance: [
      '至少覆盖宿舍区、食堂、图书馆、教学楼四类地点的首个入口',
      '每个入口都有当天拍摄的照片与六位小数坐标',
      '坐标与照片互相能对上（照片里能看到入口标识，坐标落在地点轮廓内）',
      '没有一条入口的 accessNote 是空话（「方便进出」这类不算）'
    ],
    sampleRow: {
      placeSlug: 'library',
      label: '东侧正门',
      lat: 25.1101234,
      lng: 118.6012345,
      photoUrl: '/uploads/8f3c1a2b-1111-4222-8333-944455556666.jpg',
      accessNote: '正面三级台阶，右侧有坡道；电动车不能进，停门口西侧',
      openHours: '07:30-22:00（考试周延后半小时）',
      sourceUrl: 'https://www.yeu.edu.cn/',
      collectedAt: '2026-11-10'
    },
    unlocks: '新生按导航走到楼下后不再原地打转；「我该从哪个门进」这类问题不再进 AI 问答。'
  },
  {
    id: 'F9',
    feature: '自习空间拥挤度',
    status: 'blocked',
    blockedBy: '没有实时占用数据源：图书馆与自习室没有座位系统对接，也没有人工上报入口；凭历史照片推断等于编数据。',
    owner: '图书馆（座位系统或每日人数）',
    ask: '图书馆有没有对外开放的座位预约或实时在馆人数接口？没有的话，能不能每天固定时间给一次在馆人数？两者都没有就先不做拥挤度。',
    target: 'data/study-occupancy.ts（新文件，仅在有真实数据源时创建）',
    fields: [
      { name: 'placeSlug', type: 'text', required: true, pattern: '^[a-z0-9-]{2,60}$', note: '自习地点 slug' },
      { name: 'sampledAt', type: 'text', required: true, pattern: '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}', note: '采样时间，精确到分钟' },
      { name: 'occupied', type: 'number', required: true, pattern: '^\\d{1,4}$', note: '当前在座人数' },
      { name: 'capacity', type: 'number', required: true, pattern: '^\\d{1,4}$', note: '座位总数；没有权威总数就不做这项' },
      { name: 'sourceKind', type: 'enum', required: true, values: ['seat-system', 'manual-count', 'campus-api'], note: '数据来源类型；manual-count 必须写采集人角色' },
      { name: 'sourceUrl', type: 'url', required: true, pattern: '^https://', note: '接口地址或当日登记表链接' }
    ],
    acceptance: [
      '有稳定数据源（座位系统接口 / 每日人工清点 / 学校开放接口）三选一，且能连续提供 7 天',
      'capacity 来自官方公布的座位数，不是估算',
      '页面上必须标注采样时间，超过 2 小时的数据不显示',
      '没有数据源时功能保持下线，不用「通常比较空」这类话替代'
    ],
    sampleRow: {
      placeSlug: 'library',
      sampledAt: '2026-11-10T14:05',
      occupied: 312,
      capacity: 800,
      sourceKind: 'seat-system',
      sourceUrl: 'https://www.yeu.edu.cn/'
    },
    unlocks: '考试周找座位不再靠碰运气；也避免把「今天很空」这种一次性观察当常态。'
  },
  {
    id: 'F10',
    feature: '宿舍按楼栋查（房型、床位、设施、报修入口）',
    status: 'blocked',
    blockedBy: 'shared/utils/dorm-presentation.ts 只有「普通型 / 舒适型」两种房型描述，没有楼栋清单，也没有楼栋与房型的对应关系。',
    owner: '学生事务部 / 总务处（宿舍管理）',
    ask: '能不能给一份宿舍楼清单：楼栋名（新旧区）、男生女生、房型、几人间、有没有独卫和空调、哪年翻修过？只要公开可说的部分。',
    target: 'data/dorm-buildings.ts（新文件）',
    fields: [
      { name: 'buildingName', type: 'text', required: true, pattern: '^.{2,20}$', note: '学校的正式楼栋叫法' },
      { name: 'zone', type: 'enum', required: true, values: ['old', 'new'], note: '旧区 / 新区' },
      { name: 'gender', type: 'enum', required: true, values: ['male', 'female', 'mixed'], note: '按学校公布口径' },
      { name: 'dormType', type: 'enum', required: true, values: ['standard', 'comfort'], note: '与现有 dorm-presentation 的两种房型对齐' },
      { name: 'bedsPerRoom', type: 'number', required: true, pattern: '^[1-8]$', note: '每间床位数' },
      { name: 'hasPrivateBath', type: 'enum', required: true, values: ['yes', 'no', 'unknown'], note: '独卫；不确定就 unknown，不要猜' },
      { name: 'hasAirConditioner', type: 'enum', required: true, values: ['yes', 'no', 'unknown'], note: '空调' },
      { name: 'sourceUrl', type: 'url', required: true, pattern: '^https://', note: '学校宿舍管理页面或迎新资料' }
    ],
    acceptance: [
      '楼栋清单来自学校公开资料，不是学生帖子拼出来的',
      '每栋楼至少有一项官方来源；没有的标 unknown，不留空也不猜',
      '页面文案必须写「以录取分配结果为准」，不承诺新生住哪栋',
      '不出现具体房间号、床位号与在住学生信息'
    ],
    sampleRow: {
      buildingName: '示例楼',
      zone: 'new',
      gender: 'male',
      dormType: 'comfort',
      bedsPerRoom: 4,
      hasPrivateBath: 'yes',
      hasAirConditioner: 'yes',
      sourceUrl: 'https://www.yeu.edu.cn/'
    },
    unlocks: '新生买床上用品前能确认床型与设施，不再照着短视频买错尺寸。'
  },
  {
    id: 'F12',
    feature: '专升本专业对照（专科专业 → 可报考本科专业）',
    status: 'blocked',
    blockedBy: 'data/transfer-major.ts 是 2017 年校内转专业的历史细则，不是专升本招考类别对照；仓库里没有任何专升本对照表。',
    owner: '招生办（专升本口径）或福建省教育考试院公开文件',
    ask: '今年专升本按哪个对照表执行？能不能给一份「专科专业 → 招考类别 → 可报本科专业」的表，并注明文号或发布页？',
    target: 'data/transfer-major-bachelor.ts（新文件）',
    fields: [
      { name: 'vocationalMajor', type: 'text', required: true, pattern: '^.{2,40}$', note: '专科专业名，按毕业证写' },
      { name: 'examCategory', type: 'text', required: true, pattern: '^.{2,20}$', note: '招考类别（如计算机类）' },
      { name: 'bachelorMajors', type: 'text', required: true, pattern: '^.{2,120}$', note: '可报考本科专业，多个用顿号分隔' },
      { name: 'year', type: 'number', required: true, pattern: '^20\\d{2}$', note: '适用年份，必须写' },
      { name: 'sourceTitle', type: 'text', required: true, pattern: '^.{4,80}$', note: '文件名或公告标题' },
      { name: 'sourceUrl', type: 'url', required: true, pattern: '^https://', note: '官方发布页；必须是教育考试院或学校官网' }
    ],
    acceptance: [
      '来源必须是省级教育考试院文件或学校招生办发布页，第三方机构整理的不算',
      '每行都写适用年份；跨年沿用要重新核对',
      '页面必须显示「以当年招生计划为准」与来源链接',
      '不出现「录取率」「保过」「内部名额」这类说法'
    ],
    sampleRow: {
      vocationalMajor: '示例专科专业',
      examCategory: '示例类别',
      bachelorMajors: '示例本科专业甲、示例本科专业乙',
      year: 2026,
      sourceTitle: '示例：2026 年福建省普通高校专升本招考类别对照表',
      sourceUrl: 'https://www.eeafj.cn/'
    },
    unlocks: '专升本新生第一周最焦虑的问题（我这个专业能报什么）有据可查，不再靠群里口口相传。'
  }
]
