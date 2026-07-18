import type { AdminOption, AdminResourceConfig } from '~/components/admin/types'

export const publicationStatusOptions: AdminOption[] = [
  { label: '草稿', value: 'draft' },
  { label: '已发布', value: 'published' },
  { label: '已下架', value: 'archived' }
]

export const sourcePlatformOptions: AdminOption[] = [
  { label: '学校官网', value: 'official-website' },
  { label: '官方公众号', value: 'official-wechat' },
  { label: '地图平台', value: 'map-platform' },
  { label: '高德工作地图（授权导入）', value: 'amap-workmap' },
  { label: '社交平台', value: 'social-platform' },
  { label: '现场确认', value: 'field-verification' },
  { label: '其他', value: 'other' }
]

export const adminSectionConfigs: Record<string, AdminResourceConfig> = {
  'places': {
    key: 'places',
    title: '地点管理',
    description: '维护校内与周边地点、坐标、发布状态和信息来源；主入口和场地点坐标需通过现场采点审核后更新。',
    icon: 'i-lucide-map-pin',
    endpoint: '/api/admin/places',
    createLabel: '新增地点',
    searchPlaceholder: '搜索名称、别名或地址',
    rowTitleKey: 'name',
    statusKey: 'status',
    publicationActions: true,
    stats: {
      responseKey: 'coordinateStats',
      items: [
        { key: 'total', label: '全部地点', icon: 'i-lucide-map-pinned' },
        { key: 'missing', label: '缺少坐标', icon: 'i-lucide-map-pin-off' },
        { key: 'unverified', label: '待确认', icon: 'i-lucide-map-pin-check-inside' },
        { key: 'verified', label: '已确认', icon: 'i-lucide-badge-check' },
        { key: 'rejected', label: '已驳回', icon: 'i-lucide-circle-x' }
      ]
    },
    filters: [
      {
        key: 'status',
        label: '发布状态',
        allLabel: '全部状态',
        options: publicationStatusOptions
      },
      {
        key: 'scope',
        label: '地点范围',
        allLabel: '校内与周边',
        options: [
          { label: '校内', value: 'campus' },
          { label: '周边', value: 'nearby' }
        ]
      },
      {
        key: 'category',
        label: '地点分类',
        allLabel: '全部分类',
        options: [
          { label: '教学/学习', value: 'campus-building' },
          { label: '宿舍', value: 'dorm' },
          { label: '餐饮', value: 'food' },
          { label: '服务', value: 'service' },
          { label: '快递', value: 'express' },
          { label: '校门', value: 'gate' },
          { label: '周边商铺', value: 'nearby' }
        ]
      },
      {
        key: 'coordinateVerification',
        label: '坐标确认状态',
        allLabel: '全部坐标状态',
        options: [
          { label: '缺少坐标', value: 'missing' },
          { label: '待确认', value: 'unverified' },
          { label: '已确认', value: 'verified' },
          { label: '已驳回', value: 'rejected' }
        ]
      }
    ],
    columns: [
      { key: 'name', label: '地点名称', class: 'min-w-48' },
      {
        key: 'type',
        label: '类型',
        fallbackKeys: ['category.name', 'category'],
        valueLabels: {
          'building': '校园建筑',
          'teaching-building': '教学楼',
          'dormitory': '宿舍',
          'dining': '餐厅',
          'service': '公共服务',
          'health-service': '医务服务',
          'express-service': '快递服务',
          'gate': '校门',
          'transit-stop': '公交/交通',
          'library': '图书馆',
          'sports-ground': '体育设施',
          'event-venue': '礼堂/报告厅',
          'shop': '周边商铺',
          'place': '其他地点'
        }
      },
      { key: 'scope', label: '范围', valueLabels: { campus: '校内', nearby: '周边' } },
      { key: 'coordinateVerification', label: '坐标确认', kind: 'status' },
      {
        key: 'coordinatePointRole',
        label: '坐标用途',
        valueLabels: { 'main-entrance': '主入口', 'site-point': '场地点' }
      },
      { key: 'status', label: '状态', kind: 'status' },
      { key: 'lastVerifiedAt', label: '最后确认', kind: 'date', fallbackKeys: ['last_verified_at'] }
    ],
    fields: [
      {
        key: 'name',
        label: '地点名称',
        required: true,
        placeholder: '使用当前正式名称',
        group: '基本信息'
      },
      {
        key: 'slug',
        label: '网页地址名称',
        required: true,
        placeholder: '例如 campus-library（仅小写字母、数字和短横线）',
        group: '基本信息'
      },
      {
        key: 'type',
        label: '地点类型',
        type: 'select',
        required: true,
        defaultValue: 'building',
        options: [
          { label: '校园建筑', value: 'building' },
          { label: '教学楼', value: 'teaching-building' },
          { label: '宿舍', value: 'dormitory' },
          { label: '餐厅', value: 'dining' },
          { label: '公共服务', value: 'service' },
          { label: '医务服务', value: 'health-service' },
          { label: '快递服务', value: 'express-service' },
          { label: '校门', value: 'gate' },
          { label: '公交/交通', value: 'transit-stop' },
          { label: '图书馆', value: 'library' },
          { label: '体育设施', value: 'sports-ground' },
          { label: '礼堂/报告厅', value: 'event-venue' },
          { label: '周边商铺', value: 'shop' },
          { label: '其他地点', value: 'place' }
        ],
        group: '基本信息'
      },
      {
        key: 'scope',
        label: '范围',
        type: 'select',
        required: true,
        defaultValue: 'campus',
        options: [
          { label: '校内', value: 'campus' },
          { label: '周边', value: 'nearby' }
        ],
        group: '基本信息'
      },
      {
        key: 'category',
        label: '分类标识',
        placeholder: '可选，用于更细的内容分组',
        group: '基本信息'
      },
      {
        key: 'summary',
        label: '地点摘要',
        type: 'textarea',
        required: true,
        rows: 3,
        placeholder: '说明地点用途与新生最需要知道的信息',
        group: '基本信息',
        span: 'full'
      },
      {
        key: 'body',
        label: '详细说明',
        type: 'textarea',
        rows: 6,
        placeholder: '到达提示、服务说明与注意事项。可加入【到这里前先确认】小节，每行用 - 写一条，前台地图详情会优先展示。',
        group: '基本信息',
        span: 'full'
      },
      {
        key: 'address',
        label: '文字地址',
        placeholder: '校区、区域或校外地址',
        group: '位置'
      },
      {
        key: 'campusArea',
        label: '校园区域',
        placeholder: '新区、旧区等',
        group: '位置'
      },
      {
        key: 'floor',
        label: '楼层',
        placeholder: '可选',
        group: '位置'
      },
      {
        key: 'room',
        label: '房间',
        placeholder: '可选',
        group: '位置'
      },
      {
        key: 'longitude',
        label: '经度',
        type: 'number',
        min: -180,
        max: 180,
        step: 0.000001,
        group: '坐标'
      },
      {
        key: 'latitude',
        label: '纬度',
        type: 'number',
        min: -90,
        max: 90,
        step: 0.000001,
        group: '坐标'
      },
      {
        key: 'coordinateSystem',
        label: '坐标类型',
        type: 'select',
        options: [
          { label: '标准地理坐标', value: 'WGS84' },
          { label: '国内地图坐标', value: 'GCJ-02' },
          { label: '百度地图坐标', value: 'BD-09' }
        ],
        description: '必须与坐标来源一致。',
        group: '坐标'
      },
      {
        key: 'coordinateVerification',
        label: '坐标确认状态',
        type: 'select',
        required: true,
        defaultValue: 'missing',
        options: [
          { label: '缺少坐标', value: 'missing' },
          { label: '待确认', value: 'unverified' },
          { label: '已驳回', value: 'rejected' }
        ],
        description: '“已确认”和坐标用途只能通过现场定位记录的独立审核更新；普通表单修改坐标后会自动变为待确认。',
        group: '坐标'
      },
      {
        key: 'openingHours',
        label: '开放时间',
        placeholder: '例：周一至周五 08:00-17:30',
        group: '联系与服务'
      },
      {
        key: 'phone',
        label: '公开电话',
        type: 'tel',
        group: '联系与服务'
      },
      {
        key: 'website',
        label: '网站',
        type: 'url',
        placeholder: 'https://',
        group: '联系与服务'
      },
      {
        key: 'externalMapUrl',
        label: '外部地图链接',
        type: 'url',
        placeholder: 'https://',
        group: '联系与服务'
      },
      {
        key: 'sourceRawRef',
        label: '导入记录说明',
        placeholder: '例如：工作地图第 12 行',
        group: '来源与确认'
      },
      {
        key: 'sourceIds',
        label: '关联来源编号',
        type: 'textarea',
        rows: 3,
        description: '每行填写一个来源编号；发布前至少需要一条有效来源。',
        group: '来源与确认',
        span: 'full'
      },
      {
        key: 'lastVerifiedAt',
        label: '最后确认时间',
        type: 'datetime-local',
        group: '发布与确认'
      },
      {
        key: 'isOfficial',
        label: '校方设施',
        type: 'checkbox',
        description: '表示地点主体属性，不代表本页面已获校方确认。',
        defaultValue: false,
        group: '发布与确认',
        span: 'full'
      },
      {
        key: 'isFeatured',
        label: '首页精选',
        type: 'checkbox',
        defaultValue: false,
        group: '发布与确认',
        span: 'full'
      }
    ]
  },
  'content': {
    key: 'content',
    title: '内容管理',
    description: '统一维护指南、部门、社团和时效公告。',
    icon: 'i-lucide-files',
    endpoint: '/api/admin/content',
    createLabel: '新增内容',
    searchPlaceholder: '搜索标题、摘要或正文',
    rowTitleKey: 'title',
    statusKey: 'status',
    publicationActions: true,
    filters: [
      {
        key: 'status',
        label: '发布状态',
        allLabel: '全部状态',
        options: publicationStatusOptions
      },
      {
        key: 'kind',
        label: '内容类型',
        allLabel: '全部类型',
        options: [
          { label: '指南', value: 'guide' },
          { label: '部门', value: 'department' },
          { label: '社团', value: 'club' },
          { label: '公告', value: 'notice' }
        ]
      }
    ],
    columns: [
      { key: 'title', label: '标题', fallbackKeys: ['name'], class: 'min-w-56' },
      {
        key: 'kind',
        label: '类型',
        valueLabels: { guide: '指南', department: '部门', club: '社团', notice: '公告' }
      },
      { key: 'audience', label: '适用人群' },
      { key: 'status', label: '状态', kind: 'status' },
      { key: 'lastVerifiedAt', label: '最后确认', kind: 'date', fallbackKeys: ['last_verified_at'] }
    ],
    fields: [
      {
        key: 'kind',
        label: '内容类型',
        type: 'select',
        required: true,
        defaultValue: 'guide',
        options: [
          { label: '指南', value: 'guide' },
          { label: '部门', value: 'department' },
          { label: '社团', value: 'club' },
          { label: '公告', value: 'notice' }
        ],
        group: '基本信息'
      },
      {
        key: 'title',
        label: '标题或名称',
        required: true,
        placeholder: '使用明确、可搜索的名称',
        group: '基本信息'
      },
      {
        key: 'slug',
        label: '网页地址名称',
        required: true,
        placeholder: '例如 freshman-arrival（仅小写字母、数字和短横线）',
        group: '基本信息'
      },
      {
        key: 'summary',
        label: '摘要',
        type: 'textarea',
        required: true,
        rows: 3,
        group: '基本信息',
        span: 'full'
      },
      {
        key: 'body',
        label: '正文',
        type: 'textarea',
        rows: 10,
        placeholder: '填写页面正文，可使用标题、段落和列表',
        group: '正文',
        span: 'full'
      },
      {
        key: 'category',
        label: '内容分类',
        placeholder: '可选，例：arrival、campus、life',
        group: '内容属性'
      },
      {
        key: 'audience',
        label: '适用人群',
        type: 'select',
        defaultValue: 'all',
        options: [
          { label: '全部新生', value: 'all' },
          { label: '本科新生', value: 'undergraduate' },
          { label: '专升本新生', value: 'upgrade' }
        ],
        group: '内容属性',
        condition: { key: 'kind', values: ['guide', 'notice'] }
      },
      {
        key: 'metadata.readMinutes',
        label: '预计阅读分钟',
        type: 'number',
        min: 1,
        max: 60,
        group: '内容属性',
        condition: { key: 'kind', values: ['guide'] }
      },
      {
        key: 'metadata.shortTitle',
        label: '指南短标题',
        placeholder: '用于卡片或移动端较短标题',
        group: '内容属性',
        condition: { key: 'kind', values: ['guide'] }
      },
      {
        key: 'metadata.icon',
        label: '卡片图标（高级）',
        placeholder: '例如 i-lucide-map',
        description: '一般无需修改，用于指定指南卡片的小图标。',
        group: '高级设置（一般无需修改）',
        condition: { key: 'kind', values: ['guide'] }
      },
      {
        key: 'metadata.statusText',
        label: '资料状态说明',
        placeholder: '例如 校历已确认，报到点待通知',
        group: '内容属性',
        condition: { key: 'kind', values: ['guide'] }
      },
      {
        key: 'metadata.leadNotice',
        label: '页面顶部提示',
        type: 'textarea',
        rows: 3,
        group: '内容属性',
        span: 'full',
        condition: { key: 'kind', values: ['guide'] }
      },
      {
        key: 'metadata.sections',
        label: '自定义卡片章节（高级）',
        type: 'json',
        rows: 12,
        placeholder: '[{"title":"先做什么","icon":"i-lucide-list-checks","items":["第一条说明"]}]',
        description: '一般无需填写。仅在需要自定义指南卡片结构时使用，留空会根据正文自动生成。',
        group: '高级设置（一般无需修改）',
        span: 'full',
        condition: { key: 'kind', values: ['guide'] }
      },
      {
        key: 'metadata.verificationState',
        label: '信息确认状态',
        type: 'select',
        options: [
          { label: '已确认', value: 'verified' },
          { label: '部分确认', value: 'partial' },
          { label: '等待通知', value: 'awaiting-notice' }
        ],
        group: '内容属性',
        condition: { key: 'kind', values: ['guide', 'department', 'club'] }
      },
      {
        key: 'metadata.website',
        label: '官网入口',
        type: 'url',
        group: '部门信息',
        condition: { key: 'kind', values: ['department'] }
      },
      {
        key: 'metadata.profileUrl',
        label: '部门简介页',
        type: 'url',
        group: '部门信息',
        condition: { key: 'kind', values: ['department'] }
      },
      {
        key: 'metadata.contactUrl',
        label: '部门联系页',
        type: 'url',
        group: '部门信息',
        condition: { key: 'kind', values: ['department'] }
      },
      {
        key: 'metadata.phone',
        label: '公开电话',
        type: 'tel',
        group: '部门信息',
        condition: { key: 'kind', values: ['department'] }
      },
      {
        key: 'metadata.email',
        label: '公开邮箱',
        type: 'email',
        group: '部门信息',
        condition: { key: 'kind', values: ['department'] }
      },
      {
        key: 'metadata.address',
        label: '办公地址',
        group: '部门信息',
        condition: { key: 'kind', values: ['department'] }
      },
      {
        key: 'metadata.officeHours',
        label: '办公时间',
        group: '部门信息',
        condition: { key: 'kind', values: ['department'] }
      },
      {
        key: 'metadata.group',
        label: '社团类别',
        placeholder: '例如 文化体育类',
        group: '社团信息',
        condition: { key: 'kind', values: ['club'] }
      },
      {
        key: 'metadata.direction',
        label: '社团方向',
        placeholder: '例如 音乐表演、志愿服务、创新创业',
        group: '社团信息',
        condition: { key: 'kind', values: ['club'] }
      },
      {
        key: 'metadata.recruitmentPeriod',
        label: '招新时间',
        group: '社团信息',
        condition: { key: 'kind', values: ['club'] }
      },
      {
        key: 'metadata.activitySchedule',
        label: '活动时间',
        group: '社团信息',
        condition: { key: 'kind', values: ['club'] }
      },
      {
        key: 'metadata.contactMethod',
        label: '公开联系方式',
        group: '社团信息',
        condition: { key: 'kind', values: ['club'] }
      },
      {
        key: 'metadata.validFrom',
        label: '公告生效时间',
        type: 'datetime-local',
        group: '公告时效',
        condition: { key: 'kind', values: ['notice'] }
      },
      {
        key: 'metadata.validUntil',
        label: '公告失效时间',
        type: 'datetime-local',
        group: '公告时效',
        condition: { key: 'kind', values: ['notice'] }
      },
      {
        key: 'sourceIds',
        label: '关联来源编号',
        type: 'textarea',
        rows: 3,
        description: '每行填写一个来源编号；发布前至少需要一条有效来源。',
        group: '来源与确认',
        span: 'full'
      },
      {
        key: 'lastVerifiedAt',
        label: '最后确认时间',
        type: 'datetime-local',
        group: '发布与确认'
      },
      {
        key: 'isFeatured',
        label: '精选内容',
        type: 'checkbox',
        defaultValue: false,
        group: '发布与确认',
        span: 'full'
      }
    ]
  },
  'sources': {
    key: 'sources',
    title: '来源管理',
    description: '维护来源链接、发布方、可信程度和可用状态。',
    icon: 'i-lucide-book-marked',
    endpoint: '/api/admin/sources',
    createLabel: '登记来源',
    searchPlaceholder: '搜索来源标题',
    rowTitleKey: 'title',
    statusKey: 'status',
    filters: [
      {
        key: 'level',
        label: '可信程度',
        allLabel: '全部可信程度',
        options: [
          { label: 'A · 官方一手', value: 'A' },
          { label: 'B · 权威或实地', value: 'B' },
          { label: 'C · 当事方', value: 'C' },
          { label: 'D · 线索', value: 'D' },
          { label: 'E · 未分级', value: 'E' }
        ]
      },
      {
        key: 'status',
        label: '可用状态',
        allLabel: '全部状态',
        options: [
          { label: '有效', value: 'active' },
          { label: '不可用', value: 'unavailable' },
          { label: '存在争议', value: 'disputed' }
        ]
      },
      {
        key: 'official',
        label: '官方属性',
        allLabel: '全部来源',
        options: [
          { label: '官方来源', value: 'true' },
          { label: '非官方来源', value: 'false' }
        ]
      }
    ],
    columns: [
      { key: 'title', label: '来源标题', class: 'min-w-56' },
      {
        key: 'platform',
        label: '平台',
        valueLabels: {
          'official-website': '学校官网',
          'official-wechat': '官方公众号',
          'map-platform': '地图平台',
          'amap-workmap': '高德工作地图（授权导入）',
          'social-platform': '社交平台',
          'field-verification': '现场确认',
          other: '其他'
        }
      },
      { key: 'publisherName', label: '发布方' },
      {
        key: 'sourceLevel',
        label: '可信程度',
        valueLabels: {
          A: 'A（学校官方）',
          B: 'B（权威或现场确认）',
          C: 'C（当事方或授权导入）',
          D: 'D（辅助线索）',
          E: 'E（尚未分级）'
        }
      },
      { key: 'status', label: '状态', kind: 'status' },
      { key: 'accessedAt', label: '访问日期', kind: 'date' }
    ],
    fields: [
      {
        key: 'title',
        label: '来源标题',
        required: true,
        placeholder: '页面、通知或现场记录名称',
        group: '来源信息'
      },
      {
        key: 'url',
        label: '来源链接',
        type: 'url',
        required: true,
        placeholder: 'https://',
        group: '来源信息'
      },
      {
        key: 'platform',
        label: '来源平台',
        type: 'select',
        required: true,
        options: sourcePlatformOptions,
        group: '来源信息'
      },
      {
        key: 'publisherName',
        label: '发布方',
        required: true,
        placeholder: '例：仰恩大学招生办公室',
        group: '来源信息'
      },
      {
        key: 'sourceLevel',
        label: '可信程度',
        type: 'select',
        required: true,
        defaultValue: 'D',
        options: [
          { label: 'A · 官方一手', value: 'A' },
          { label: 'B · 权威或实地', value: 'B' },
          { label: 'C · 当事方', value: 'C' },
          { label: 'D · 线索', value: 'D' },
          { label: 'E · 未分级', value: 'E' }
        ],
        group: '信息确认'
      },
      {
        key: 'accessedAt',
        label: '查看或确认日期',
        type: 'datetime-local',
        required: true,
        group: '来源信息'
      },
      {
        key: 'publishedAt',
        label: '原文发布时间',
        type: 'datetime-local',
        group: '来源信息'
      },
      {
        key: 'status',
        label: '可用状态',
        type: 'select',
        required: true,
        defaultValue: 'active',
        options: [
          { label: '有效', value: 'active' },
          { label: '不可用', value: 'unavailable' },
          { label: '存在争议', value: 'disputed' }
        ],
        group: '信息确认'
      },
      {
        key: 'isOfficial',
        label: '官方来源',
        type: 'checkbox',
        description: '仅在来源确属学校或部门官方渠道时勾选。',
        defaultValue: false,
        group: '信息确认',
        span: 'full'
      },
      {
        key: 'notes',
        label: '内部备注',
        type: 'textarea',
        rows: 4,
        group: '信息确认',
        span: 'full'
      }
    ]
  },
  'feedback': {
    key: 'feedback',
    title: '反馈管理',
    description: '处理地点纠错、内容与流程问题和资料补充建议。',
    icon: 'i-lucide-message-square-warning',
    endpoint: '/api/admin/feedback',
    createLabel: '登记反馈',
    searchPlaceholder: '搜索反馈内容',
    rowTitleKey: 'message',
    statusKey: 'status',
    canCreate: false,
    filters: [
      {
        key: 'status',
        label: '处理状态',
        allLabel: '全部处理状态',
        options: [
          { label: '待处理', value: 'new' },
          { label: '处理中', value: 'reviewing' },
          { label: '已解决', value: 'resolved' },
          { label: '已驳回', value: 'rejected' },
          { label: '垃圾信息', value: 'spam' }
        ]
      },
      {
        key: 'targetType',
        label: '关联对象',
        allLabel: '全部对象',
        options: [
          { label: '通用反馈', value: 'general' },
          { label: '地点', value: 'place' },
          { label: '内容', value: 'content' },
          { label: '办事流程', value: 'procedure' }
        ]
      }
    ],
    columns: [
      { key: 'message', label: '反馈内容', class: 'min-w-64 max-w-xl' },
      {
        key: 'targetType',
        label: '反馈事项',
        valueLabels: { general: '通用反馈', place: '地点', content: '内容', procedure: '办事流程' }
      },
      { key: 'reasonType', label: '原因' },
      { key: 'contact', label: '联系方式', class: 'max-w-48' },
      { key: 'pageUrl', label: '关联页面', class: 'max-w-56' },
      { key: 'evidenceUrl', label: '补充图片或链接', class: 'max-w-56' },
      { key: 'status', label: '状态', kind: 'status' },
      { key: 'createdAt', label: '提交时间', kind: 'date' }
    ],
    fields: [
      {
        key: 'status',
        label: '处理状态',
        type: 'select',
        required: true,
        defaultValue: 'new',
        options: [
          { label: '待处理', value: 'new' },
          { label: '处理中', value: 'reviewing' },
          { label: '已解决', value: 'resolved' },
          { label: '已驳回', value: 'rejected' },
          { label: '垃圾信息', value: 'spam' }
        ],
        group: '处理'
      },
      {
        key: 'resolutionNote',
        label: '处理备注',
        type: 'textarea',
        rows: 4,
        description: '内部字段，不在公开端展示。',
        group: '处理',
        span: 'full'
      }
    ]
  },
  'audit-logs': {
    key: 'audit-logs',
    title: '审计日志',
    description: '查看登录、创建、更新、发布、下架和删除记录。',
    icon: 'i-lucide-scroll-text',
    endpoint: '/api/admin/audit-logs',
    createLabel: '新增日志',
    searchPlaceholder: '搜索操作、对象或管理员',
    rowTitleKey: 'action',
    canCreate: false,
    canEdit: false,
    canDelete: false,
    searchable: false,
    readOnlyNote: '审计日志只能查看，由系统在管理操作发生时自动记录。',
    columns: [
      { key: 'action', label: '操作', class: 'min-w-32' },
      { key: 'entityType', label: '记录类型', fallbackKeys: ['entity_type'] },
      { key: 'entityTitle', label: '对象', fallbackKeys: ['entityId', 'entity_id'], class: 'min-w-48' },
      { key: 'adminName', label: '管理员', fallbackKeys: ['adminUsername', 'actorAdminId', 'admin_name'] },
      { key: 'createdAt', label: '时间', kind: 'date', fallbackKeys: ['created_at'] }
    ],
    fields: []
  }
}

export function getAdminSectionConfig(section: string): AdminResourceConfig | undefined {
  return adminSectionConfigs[section]
}

export function listAdminSectionKeys(): string[] {
  return Object.keys(adminSectionConfigs)
}
