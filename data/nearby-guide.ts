export type NearbyGuideCategory = 'food' | 'half-day' | 'evening' | 'weekend'

export interface NearbyGuideSource {
  title: string
  publisher: string
  publishedAt: string
  url: string
}

export interface NearbyGuideItem {
  id: string
  category: NearbyGuideCategory
  eyebrow: string
  title: string
  summary: string
  highlights: string[]
  suitableFor: string
  travelNote: string
  costNote: string
  mapKeyword: string
  mapUrl: string
  icon: string
  freshnessNote: string
  keywords: string[]
  sources: NearbyGuideSource[]
}

export const nearbyGuideCategoryLabels: Record<NearbyGuideCategory, string> = {
  'food': '吃点什么',
  'half-day': '半日放风',
  'evening': '傍晚散步',
  'weekend': '周末出发'
}

export function buildNearbyGuideMapUrl(keyword: string): string {
  const url = new URL('https://uri.amap.com/search')
  url.searchParams.set('keyword', keyword)
  url.searchParams.set('city', '泉州')
  url.searchParams.set('view', 'map')
  url.searchParams.set('src', 'yeu-guide')
  url.searchParams.set('callnative', '0')
  return url.toString()
}

export const nearbyGuideItems: NearbyGuideItem[] = [
  {
    id: 'student-streets',
    category: 'food',
    eyebrow: '校门口 · 随时能去',
    title: '新区、旧区学生街先看一圈',
    summary: '临时想吃饭、买饮料或补日用品，先按自己所在校区查看学生街候选地点，比盲目搜全城更省时间。',
    highlights: [
      '本页已整理新区、旧区共 30 个地图候选地点',
      '可以按餐饮、购物、快递和生活服务筛选',
      '商家不做主观排名，营业状态以出发当天地图和现场为准'
    ],
    suitableFor: '课间、晚饭、刚到校补给',
    travelNote: '先确认自己在新区还是旧区，再打开对应商家地图；卡片距离是从学生街参考点计算。',
    costNote: '菜单和价格变化较快，点单前看现场价目。',
    mapKeyword: '仰恩大学学生街',
    mapUrl: buildNearbyGuideMapUrl('仰恩大学学生街'),
    icon: 'i-lucide-utensils',
    freshnessNote: '地图候选名单整理于 2026-07-15，出发前仍需复核。',
    keywords: ['学生街', '新区学生街', '旧区学生街', '附近吃饭', '奶茶', '小吃', '便利店', '快递'],
    sources: []
  },
  {
    id: 'majia-flavors',
    category: 'food',
    eyebrow: '马甲镇 · 本地味道',
    title: '想吃得更本地，记住两道菜名',
    summary: '洛江区公开资料明确提到马甲镇的凤栖七宝羹、炒猪肝入选“洛水仙山宴”。先记菜名，再到地图里找近期仍在营业、评价较新的店。',
    highlights: [
      '凤栖七宝羹：公开资料确认的马甲特色菜名',
      '炒猪肝：同样进入洛江地方风味菜单',
      '资料只确认菜品，不替任何具体商家背书'
    ],
    suitableFor: '朋友聚餐、想尝马甲本地菜',
    travelNote: '以马甲镇区为范围搜索，先看近期评价和营业状态；多人出行再比较步行、骑行或打车方案。',
    costNote: '不同店做法和价格差异大，建议到店前问清份量与价格。',
    mapKeyword: '马甲镇 美食',
    mapUrl: buildNearbyGuideMapUrl('马甲镇 美食'),
    icon: 'i-lucide-soup',
    freshnessNote: '菜品名称来自洛江区政府公开资料，商家信息需实时核验。',
    keywords: ['马甲美食', '马甲镇吃什么', '凤栖七宝羹', '七宝羹', '炒猪肝', '本地菜', '聚餐'],
    sources: [
      {
        title: '2024，我们一起走过',
        publisher: '泉州市洛江区人民政府',
        publishedAt: '2025-01-16',
        url: 'https://www.qzlj.gov.cn/zwgk/xwzx/ljzx/202501/t20250116_3131284.htm'
      }
    ]
  },
  {
    id: 'xiangongshan',
    category: 'half-day',
    eyebrow: '半日 · 山景与人文',
    title: '仙公山：天气舒服时去爬山',
    summary: '仙公山位于马甲镇，是省级风景名胜区。更适合留出半天看山景、古迹和宗教文化，不要把它安排在满课的短空档里。',
    highlights: [
      '适合晴天或能见度较好的半日出行',
      '山地路线要穿防滑鞋并带水',
      '开放区域、索道、门票和天气影响需出发前核验'
    ],
    suitableFor: '半天空闲、爬山、拍风景',
    travelNote: '从学校出发先用地图重新规划；返程前确认末段交通，夜间不要临时走陌生山路。',
    costNote: '门票、索道等价格不在本攻略写死，以景区当天公示为准。',
    mapKeyword: '泉州仙公山风景名胜区',
    mapUrl: buildNearbyGuideMapUrl('泉州仙公山风景名胜区'),
    icon: 'i-lucide-mountain-snow',
    freshnessNote: '景区定位和属性来自政府规划；开放安排属于动态信息。',
    keywords: ['仙公山', '爬山', '登山', '山景', '半日游', '景点', '拍照'],
    sources: [
      {
        title: '泉州仙公山风景名胜区总体规划（2024—2035年）',
        publisher: '泉州市洛江区人民政府',
        publishedAt: '2025-01-03',
        url: 'https://www.qzlj.gov.cn/zwgk/zfxxgkzl/bmzfxxgk/zrzyj/zfxxgkml/202501/t20250103_3126225.htm'
      }
    ]
  },
  {
    id: 'haisi-zoo',
    category: 'half-day',
    eyebrow: '半日 · 轻松一点',
    title: '海丝野生动物世界：不想爬山就看动物',
    summary: '洛江区公开文旅项目资料把马甲海丝野生动物园列为当地现有项目。它和仙公山更适合二选一安排，避免一天塞得太满。',
    highlights: [
      '适合朋友结伴和偏轻松的半日出行',
      '节假日可能排队，先确认购票与入园要求',
      '不要沿用旧攻略里的票价和营业时间'
    ],
    suitableFor: '朋友结伴、看动物、轻松半日游',
    travelNote: '地图定位后按当天路线出发；若打车前往，返程前先确认能否叫到车。',
    costNote: '票种、优惠和表演安排以园区当天公示为准。',
    mapKeyword: '泉州海丝野生动物世界',
    mapUrl: buildNearbyGuideMapUrl('泉州海丝野生动物世界'),
    icon: 'i-lucide-paw-print',
    freshnessNote: '地点由政府公开资料交叉确认，票务和开放时间不作静态承诺。',
    keywords: ['海丝野生动物园', '海丝野生动物世界', '动物园', '看动物', '半日游', '门票'],
    sources: [
      {
        title: '关于加快发展洛江区乡村旅游的答复',
        publisher: '泉州市洛江区人民政府',
        publishedAt: '2024-04-26',
        url: 'https://www.qzlj.gov.cn/zwgk/szjs_52370/rddbjybljg/202404/t20240426_3031295.htm'
      }
    ]
  },
  {
    id: 'yongan-butterfly',
    category: 'evening',
    eyebrow: '傍晚 · 慢慢逛',
    title: '永安蝶村、福蝶广场一带',
    summary: '2026 年洛江夏季“村晚”在马甲镇永安村福蝶文化广场举办，公开资料还提到蝶恋花乡野营地；适合关注活动期的市集、音乐和乡村夜游。',
    highlights: [
      '活动期比普通工作日更有内容',
      '可顺带了解永安村蝴蝶兰产业与乡村景观',
      '临时活动、营地开放和夜间返程都要当天确认'
    ],
    suitableFor: '傍晚散步、活动日、市集和拍照',
    travelNote: '先确认当天是否有活动；夜间出发必须提前安排返程，不建议独自走偏僻路段。',
    costNote: '公共活动与营地消费项目不同，现场项目按实际公示选择。',
    mapKeyword: '马甲镇永安村福蝶文化广场',
    mapUrl: buildNearbyGuideMapUrl('马甲镇永安村福蝶文化广场'),
    icon: 'i-lucide-sparkles',
    freshnessNote: '活动信息发布于 2026-07-14；非活动日体验会不同。',
    keywords: ['永安蝶村', '福蝶文化广场', '蝶恋花乡野营地', '蝴蝶兰', '村晚', '市集', '夜游', '傍晚'],
    sources: [
      {
        title: '2026年全国夏季“村晚”示范展示活动在泉州洛江举办',
        publisher: '福建省文化和旅游厅',
        publishedAt: '2026-07-14',
        url: 'https://wlt.fujian.gov.cn/wldt/btdt/202607/t20260714_7178003.htm'
      }
    ]
  },
  {
    id: 'hongshan-weekend',
    category: 'weekend',
    eyebrow: '周末 · 远一点',
    title: '虹山生态线：瀑布、茶和乡野',
    summary: '近期公开报道把彩虹瀑布、石龙谷、樱梅园列为虹山乡的文旅点位。适合完整周末白天出发，不适合临时下课后赶过去。',
    highlights: [
      '可按季节在彩虹瀑布、石龙谷、樱梅园中选点',
      '虹山酸茶、白凤地瓜是公开报道提到的当地特色',
      '自然景观受季节、降雨和运营状态影响明显'
    ],
    suitableFor: '周末结伴、乡村路线、自然景观',
    travelNote: '先在地图确认具体目的地，不要只导航“虹山乡”；结伴出行并预留充足返程时间。',
    costNote: '不同点位收费和项目不同，以当天官方或现场信息为准。',
    mapKeyword: '洛江区虹山乡彩虹瀑布',
    mapUrl: buildNearbyGuideMapUrl('洛江区虹山乡彩虹瀑布'),
    icon: 'i-lucide-trees',
    freshnessNote: '点位来自 2026 年近期报道，自然景观仍需结合天气判断。',
    keywords: ['虹山乡', '彩虹瀑布', '石龙谷', '樱梅园', '虹山酸茶', '白凤地瓜', '周末游', '乡村游'],
    sources: [
      {
        title: '泉州洛江虹山乡：文旅融合绘就共富新画卷',
        publisher: '人民网福建频道',
        publishedAt: '2026-03-26',
        url: 'https://fj.people.com.cn/n2/2026/0326/c181466-41534586.html'
      }
    ]
  }
]

export function nearbyGuideSearchText(item: NearbyGuideItem): string {
  return [
    item.eyebrow,
    item.title,
    item.summary,
    ...item.highlights,
    item.suitableFor,
    item.travelNote,
    item.costNote,
    item.freshnessNote,
    ...item.keywords,
    ...item.sources.map(source => `${source.title} ${source.publisher} ${source.publishedAt}`)
  ].join(' ')
}
