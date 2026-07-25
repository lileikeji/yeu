export type NearbyGuideScope = 'nearby' | 'city'
export type NearbyGuideCategory
  = | 'food'
    | 'half-day'
    | 'evening'
    | 'weekend'
    | 'city-food'
    | 'city-walk'
    | 'city-night'
    | 'city-culture'
    | 'city-shopping'

export interface NearbyGuideSource {
  title: string
  publisher: string
  publishedAt: string
  url: string
}

export interface NearbyGuideItem {
  id: string
  scope: NearbyGuideScope
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
  'weekend': '周末出发',
  'city-food': '市区寻味',
  'city-walk': '古城漫游',
  'city-night': '夜游泉州',
  'city-culture': '场馆文化',
  'city-shopping': '商圈放松'
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
    scope: 'nearby',
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
    scope: 'nearby',
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
    scope: 'nearby',
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
    scope: 'nearby',
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
    scope: 'nearby',
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
    scope: 'nearby',
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
  },
  {
    id: 'city-food-trail',
    scope: 'city',
    category: 'city-food',
    eyebrow: '泉州市区 · 按类型吃',
    title: '别只排一家网红店，沿古城一路吃',
    summary: '泉州官方美食资料反复提到面线糊、牛肉与牛杂、肉粽、土笋冻、姜母鸭、浮粿、四果汤等代表味道。第一次进城更适合少量多样，不必把时间耗在单一长队。',
    highlights: [
      '早餐或第一站：面线糊、牛肉羹、牛杂汤',
      '正餐：肉粽、姜母鸭、牛排、咸饭等按人数选择',
      '逛累解暑：四果汤；土笋冻含海产原料，不确定口味先少量尝试'
    ],
    suitableFor: '第一次进城、朋友边走边吃、想尝泉州味',
    travelNote: '可把西街、钟楼、中山路和府文庙一带串起来，看到长队先继续走，古城同类小吃不只一家。',
    costNote: '本攻略推荐品类而非给商家排名；菜单、价格和营业状态看当天现场。',
    mapKeyword: '泉州西街美食',
    mapUrl: buildNearbyGuideMapUrl('泉州西街美食'),
    icon: 'i-lucide-cooking-pot',
    freshnessNote: '小吃品类来自 2025 年泉州市官方美食资料，具体店铺实时核验。',
    keywords: ['市区美食', '泉州美食', '古城吃什么', '西街美食', '面线糊', '牛肉羹', '牛杂汤', '肉粽', '土笋冻', '姜母鸭', '浮粿', '四果汤'],
    sources: [
      {
        title: '泉州盛宴的“五一食光”',
        publisher: '泉州市人民政府',
        publishedAt: '2025-05-09',
        url: 'https://www.quanzhou.gov.cn/gastronomy/ch/msdh/xwqz/202505/t20250509_3167615.htm'
      }
    ]
  },
  {
    id: 'old-city-walk',
    scope: 'city',
    category: 'city-walk',
    eyebrow: '泉州市区 · 第一次去',
    title: '开元寺—西街—钟楼—中山路—府文庙',
    summary: '这是对泉州市文旅局古城 Citywalk 线路的学生版压缩：先抓住开元寺、西街、钟楼和中山路主线，体力还有余量再接府文庙、清净寺与关岳庙。',
    highlights: [
      '半日版：开元寺—西街—钟楼—中山路',
      '一日版：继续到府文庙—清净寺—关岳庙',
      '巷子很多，不必追求一次打卡完所有点位'
    ],
    suitableFor: '第一次到泉州古城、拍照、看世遗与街巷',
    travelNote: '从学校进城先看 K2 到文化宫方案；进入古城后以步行为主，也可按当天运营情况选择古城“小白”。返校前先确认 K2 末班与候车点。',
    costNote: '沿线消费丰俭由人，宗教与文保场所请遵守现场规则。',
    mapKeyword: '泉州开元寺',
    mapUrl: buildNearbyGuideMapUrl('泉州开元寺'),
    icon: 'i-lucide-landmark',
    freshnessNote: '主线来自泉州市文旅局公开的古城 Citywalk 路线。',
    keywords: ['泉州市区怎么玩', '泉州古城', 'Citywalk', '开元寺', '西街', '钟楼', '中山路', '府文庙', '清净寺', '关岳庙', '一日游'],
    sources: [
      {
        title: '10条泉州古城Citywalk漫游路线发布',
        publisher: '泉州市人民政府',
        publishedAt: '2023-08-09',
        url: 'https://quanzhou.gov.cn/zfb/xxgk/zfxxgkzl/qzdt/qzyw/202308/t20230809_2915149.htm'
      }
    ]
  },
  {
    id: 'city-night',
    scope: 'city',
    category: 'city-night',
    eyebrow: '泉州市区 · 晚上去',
    title: '西街—中山路—新门街，慢慢逛到夜里',
    summary: '公开文旅资料把西街、中山路、新门街与源和 1916 列为古城夜游和夜间消费的重要区域。适合吃完晚饭散步、看骑楼与街巷，不需要追固定摊位。',
    highlights: [
      '西街和中山路适合看古城夜景与沿路小吃',
      '新门街、源和 1916 可作为继续逛的备选',
      '临时演出、市集和夜间开放不是每天都有'
    ],
    suitableFor: '晚饭后散步、夜景、朋友聊天',
    travelNote: '先倒推返校时间，再决定逛到哪里；不要把节假日延时公交当成日常班次。',
    costNote: '夜间消费按需选择，拒绝无明码标价或强行推销项目。',
    mapKeyword: '泉州中山路',
    mapUrl: buildNearbyGuideMapUrl('泉州中山路'),
    icon: 'i-lucide-moon-star',
    freshnessNote: '区域定位来自政府夜游资料，活动和营业时间按出发当天核验。',
    keywords: ['泉州夜游', '市区夜生活', '西街夜景', '中山路夜游', '新门街', '源和1916', '晚上去哪', '夜市'],
    sources: [
      {
        title: '夜游泉州古城的6种方式',
        publisher: '泉州市人民政府',
        publishedAt: '2022-08-30',
        url: 'https://www.quanzhou.gov.cn/lyb/lyxw/202208/t20220830_2769899.htm'
      }
    ]
  },
  {
    id: 'city-museums',
    scope: 'city',
    category: 'city-culture',
    eyebrow: '泉州市区 · 雨天/太热',
    title: '海交馆、闽台缘、泉州博物馆选一到两个',
    summary: '不适合户外暴走时，可以把泉州海外交通史博物馆、中国闽台缘博物馆、泉州博物馆作为室内备选。场馆内容多，半天选一到两个比赶场更舒服。',
    highlights: [
      '海交馆适合了解海上丝绸之路与泉州港历史',
      '闽台缘、泉州博物馆可按展览兴趣组合',
      '预约、闭馆日和停止入馆时间必须当天查'
    ],
    suitableFor: '雨天、炎热天气、想安静看展',
    travelNote: '这些场馆不都在古城步行范围内，可使用旅游公交或地图重新规划，避免只凭景点名称判断距离。',
    costNote: '常设展与临展规则可能不同，预约和收费以场馆官方信息为准。',
    mapKeyword: '泉州海外交通史博物馆',
    mapUrl: buildNearbyGuideMapUrl('泉州海外交通史博物馆'),
    icon: 'i-lucide-library-big',
    freshnessNote: '场馆与旅游公交覆盖由 2025—2026 年官方资料确认，开放时间不写死。',
    keywords: ['泉州博物馆', '海交馆', '海外交通史博物馆', '闽台缘博物馆', '下雨去哪', '室内游玩', '看展'],
    sources: [
      {
        title: '2026年“5·18国际博物馆日”重点活动',
        publisher: '泉州市人民政府',
        publishedAt: '2026-05-13',
        url: 'https://www.quanzhou.gov.cn/zfb/xxgk/zfxxgkzl/qzdt/qzyw/202605/t20260513_3291175.htm'
      }
    ]
  },
  {
    id: 'xunpu-coast',
    scope: 'city',
    category: 'city-walk',
    eyebrow: '泉州市区 · 拍照与海风',
    title: '蟳埔民俗文化村与滨海线',
    summary: '想看簪花围、蚵壳厝和滨海风貌，可以单独安排蟳埔方向，不建议硬塞进古城步行日。官方交通资料确认旅游线路覆盖蟳埔与滨海点位。',
    highlights: [
      '簪花体验先问清套餐、底片、妆造和附加收费',
      '村落是居民生活空间，拍摄前尊重隐私和通行',
      '节假日拥挤，公交与接驳通常比临时打车更稳'
    ],
    suitableFor: '拍照、民俗体验、滨海散步',
    travelNote: '从古城前往需重新规划公交或旅游线路；返校路程长，留足回到文化宫换乘 K2 的时间。',
    costNote: '簪花和摄影套餐差异很大，消费前确认总价与交付内容。',
    mapKeyword: '蟳埔民俗文化村',
    mapUrl: buildNearbyGuideMapUrl('蟳埔民俗文化村'),
    icon: 'i-lucide-flower-2',
    freshnessNote: '旅游线路覆盖依据 2025 年交通部门公开资料，班次当天复核。',
    keywords: ['蟳埔', '簪花', '簪花围', '蚵壳厝', '滨海', '拍照', '泉州之眼'],
    sources: [
      {
        title: '关于旅游公交线路及交通便利性的会办意见',
        publisher: '泉州市交通运输局',
        publishedAt: '2025-04-16',
        url: 'https://jtj.quanzhou.gov.cn/zfxxgkzl/xxgkml/rddbjy/zxta/202504/t20250424_3163043.htm'
      }
    ]
  },
  {
    id: 'city-shopping',
    scope: 'city',
    category: 'city-shopping',
    eyebrow: '泉州市区 · 纯放松',
    title: '浦西万达或中骏世界城：逛街、吃饭、看电影',
    summary: '不想做文化路线，只想找空调、连锁餐饮、购物和影院，可以从浦西万达与中骏世界城中选一个。官方资料确认两处均为城市商业集中区且公交覆盖较多。',
    highlights: [
      '适合雨天、多人需求不同或只想轻松聚会',
      '两个商圈距离不近，不建议为了打卡一天都跑',
      '电影场次、门店与活动直接看当天平台信息'
    ],
    suitableFor: '逛街、看电影、朋友聚会、雨天',
    travelNote: '从文化宫或古城出发要重新规划公交；返校前仍需回到 K2 可达的候车区域，别只看市区夜间线路。',
    costNote: '商圈消费弹性大，团购与优惠先核对使用门店、日期和附加条件。',
    mapKeyword: '泉州浦西万达广场',
    mapUrl: buildNearbyGuideMapUrl('泉州浦西万达广场'),
    icon: 'i-lucide-shopping-bag',
    freshnessNote: '商圈与公交覆盖依据 2025 年官方资料，门店和场次实时查询。',
    keywords: ['泉州商场', '浦西万达', '中骏世界城', '看电影', '逛街', '购物', '雨天', '聚会'],
    sources: [
      {
        title: '泉州市重要商圈公交覆盖情况',
        publisher: '泉州市交通运输局',
        publishedAt: '2025-04-16',
        url: 'https://jtj.quanzhou.gov.cn/zfxxgkzl/xxgkml/rddbjy/zxta/202504/t20250424_3163039.htm'
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
