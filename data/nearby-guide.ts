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

export interface NearbyGuideImage {
  src: string
  alt: string
  credit: string
}

export interface NearbyGuideDestination {
  id: string
  label: string
  longitude: number
  latitude: number
  poiId?: string
  note?: string
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
  destinations: NearbyGuideDestination[]
  icon: string
  freshnessNote: string
  keywords: string[]
  sources: NearbyGuideSource[]
  image?: NearbyGuideImage
}

export const nearbyGuideCategoryLabels: Record<NearbyGuideCategory, string> = {
  'food': '就近吃点',
  'half-day': '半天出去',
  'evening': '傍晚走走',
  'weekend': '周末放风',
  'city-food': '边走边吃',
  'city-walk': '逛景点',
  'city-night': '晚上去哪',
  'city-culture': '看展看戏',
  'city-shopping': '商场放松'
}

export function nearbyGuideDestination(
  id: string,
  label: string,
  longitude: number,
  latitude: number,
  poiId?: string,
  note?: string
): NearbyGuideDestination {
  return { id, label, longitude, latitude, poiId, note }
}

export function buildNearbyGuideMapUrl(destination: NearbyGuideDestination): string {
  const url = new URL('https://uri.amap.com/marker')
  url.searchParams.set('position', `${destination.longitude},${destination.latitude}`)
  url.searchParams.set('name', destination.label)
  url.searchParams.set('coordinate', 'gaode')
  url.searchParams.set('src', 'yeu-guide')
  url.searchParams.set('callnative', '0')
  return url.toString()
}

export function buildNearbyGuideNavigationUrl(
  destination: NearbyGuideDestination,
  mode: 'bus' | 'car' | 'walk'
): string {
  const url = new URL('https://uri.amap.com/navigation')
  url.searchParams.set('to', `${destination.longitude},${destination.latitude},${destination.label}`)
  url.searchParams.set('mode', mode)
  url.searchParams.set('coordinate', 'gaode')
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
    destinations: [
      nearbyGuideDestination('new-student-street', '仰恩大学新区学生街', 118.601269, 25.10594, undefined, '新区学生街范围中心点'),
      nearbyGuideDestination('old-student-street', '仰恩大学旧区学生街', 118.6155, 25.1093, undefined, '旧区学生街范围中心点')
    ],
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
    destinations: [
      nearbyGuideDestination('majia-town', '马甲镇中心（镇政府附近）', 118.623258, 25.117048, 'B0FFG2URWL', '先到镇区，再按当天营业情况选店')
    ],
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
    destinations: [
      nearbyGuideDestination('xiangongshan', '仙公山风景区', 118.649002, 25.115137, 'B0FFHVOWSE')
    ],
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
    destinations: [
      nearbyGuideDestination('haisi-zoo', '泉州海丝野生动物世界', 118.616937, 25.09865, 'B0FFH8GRQ9')
    ],
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
    destinations: [
      nearbyGuideDestination('yongan-village', '马甲镇永安村村委会', 118.610725, 25.118866, 'B0FFM60JBL', '活动在永安村举办，临时舞台或市集位置以当天通知为准'),
      nearbyGuideDestination('butterfly-orchid', '永安村蝴蝶兰庄园', 118.608476, 25.122235, 'B0G3FCLPMJ', '是否开放接待以当天公告为准')
    ],
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
    destinations: [
      nearbyGuideDestination('hongshan-waterfall', '虹山瀑布', 118.60455, 25.282111, 'B0FFGRCERR')
    ],
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
    title: '第一顿先吃面线糊或牛肉汤',
    summary: '早上或刚到古城时，先从面线糊、牛肉羹、牛杂汤里选一样。店里排得太长就继续往前走，古城里同类小吃不只一家。',
    highlights: [
      '一个人吃：面线糊或牛肉汤更方便',
      '两三个人：可以多点几样分着尝',
      '先看菜单和价格，再决定要不要坐下'
    ],
    suitableFor: '早餐、刚到市区、一个人简单吃',
    travelNote: '西街、钟楼、中山路一带都能继续找，不必专门横穿古城追一家店。',
    costNote: '这里只推荐吃什么，不给商家排榜；价格和营业情况看当天。',
    mapKeyword: '泉州西街美食',
    destinations: [
      nearbyGuideDestination('west-street-food', '泉州西街', 118.579733, 24.920341, 'B0I13O0Z4I', '到西街后按营业和排队情况选面线糊或牛肉小吃')
    ],
    icon: 'i-lucide-cooking-pot',
    freshnessNote: '小吃品类来自 2025 年泉州市官方美食资料，具体店铺实时核验。',
    keywords: ['市区美食', '泉州美食', '古城吃什么', '西街美食', '面线糊', '牛肉羹', '牛杂汤', '肉粽', '土笋冻', '姜母鸭', '浮粿', '四果汤'],
    image: {
      src: '/images/nearby/city-food.webp',
      alt: '泉州土笋冻实拍',
      credit: '图片来自泉州市政府美食专题，受访者供图'
    },
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
    id: 'city-main-meal',
    scope: 'city',
    category: 'city-food',
    eyebrow: '泉州市区 · 正餐',
    title: '想吃饱：肉粽、姜母鸭、牛排、咸饭',
    summary: '到了饭点，按人数选肉粽、姜母鸭、牛排或咸饭。一个人别点太多大份菜，几个人一起更适合多点几样。',
    highlights: [
      '一个人：肉粽、牛排或咸饭更好控制分量',
      '多人一起：再考虑姜母鸭等适合分食的菜',
      '先问清分量、价格和是否另收配料费'
    ],
    suitableFor: '午饭、晚饭、同学聚餐',
    travelNote: '古城内先看步行距离，别为了一个店来回打车。',
    costNote: '正餐价格差别较大，点菜前直接确认总价和份量。',
    mapKeyword: '泉州古城闽南菜',
    destinations: [
      nearbyGuideDestination('zhongshan-meal', '泉州中山街', 118.589981, 24.908412, 'B0FFHCYR1W', '以中山街为古城正餐落脚点，具体店铺到场再选')
    ],
    icon: 'i-lucide-utensils',
    freshnessNote: '菜品来自泉州市官方美食资料，商家与价格当天复核。',
    keywords: ['泉州正餐', '肉粽', '姜母鸭', '泉州牛排', '咸饭', '同学聚餐', '古城午饭', '古城晚饭'],
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
    id: 'city-snacks-dessert',
    scope: 'city',
    category: 'city-food',
    eyebrow: '泉州市区 · 小吃甜汤',
    title: '边走边吃：浮粿、土笋冻、四果汤',
    summary: '逛累了再选一份小吃或甜汤。第一次吃土笋冻先买小份；天气热时四果汤更轻松，浮粿适合趁热吃。',
    highlights: [
      '土笋冻含海产原料，不确定口味先少量尝',
      '四果汤配料很多，过敏或忌口先问',
      '小吃是加餐，不用每样都打卡'
    ],
    suitableFor: '逛街加餐、天气热、想多尝几样',
    travelNote: '沿西街、中山路、新门街顺路找，避免为了排队打乱返校时间。',
    costNote: '先看明码标价；现场加料、套餐和网购券要核对使用条件。',
    mapKeyword: '泉州古城四果汤',
    destinations: [
      nearbyGuideDestination('west-street-snacks', '泉州西街', 118.579733, 24.920341, 'B0I13O0Z4I', '以西街为小吃起点，不绑定单一商家')
    ],
    icon: 'i-lucide-ice-cream-bowl',
    freshnessNote: '品类来自 2025 年泉州市官方美食资料，具体店铺实时核验。',
    keywords: ['泉州小吃', '浮粿', '土笋冻', '四果汤', '甜汤', '古城加餐', '解暑'],
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
    title: '第一次去：开元寺—西街—钟楼',
    summary: '第一次进城不用排十几个点。先走开元寺、西街、钟楼和中山路，半天刚好；还有体力再继续去府文庙。',
    highlights: [
      '半日版：开元寺—西街—钟楼—中山路',
      '一日版：继续到府文庙—清净寺—关岳庙',
      '巷子很多，不必追求一次打卡完所有点位'
    ],
    suitableFor: '第一次到泉州古城、拍照、看世遗与街巷',
    travelNote: '从学校进城先看 K2 到文化宫方案；进入古城后以步行为主，也可按当天运营情况选择古城“小白”。返校前先确认 K2 末班与候车点。',
    costNote: '沿线消费丰俭由人，宗教与文保场所请遵守现场规则。',
    mapKeyword: '泉州开元寺',
    destinations: [
      nearbyGuideDestination('kaiyuan-temple', '泉州大开元寺', 118.585519, 24.914168, 'B0253016EC', '推荐从这里开始'),
      nearbyGuideDestination('quanzhou-bell-tower', '泉州钟楼', 118.591034, 24.912291, 'B0FFKKYJ7P', '从开元寺沿西街步行前往'),
      nearbyGuideDestination('zhongshan-street', '泉州中山街', 118.589981, 24.908412, 'B0FFHCYR1W', '从钟楼继续步行')
    ],
    icon: 'i-lucide-landmark',
    freshnessNote: '主线来自泉州市文旅局公开的古城 Citywalk 路线。',
    keywords: ['泉州市区怎么玩', '泉州古城', 'Citywalk', '开元寺', '西街', '钟楼', '中山路', '府文庙', '清净寺', '关岳庙', '一日游'],
    image: {
      src: '/images/nearby/citywalk.webp',
      alt: '游客在泉州古城开元寺附近漫游',
      credit: '陈起拓 摄，来源：泉州市人民政府'
    },
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
    id: 'south-old-city',
    scope: 'city',
    category: 'city-walk',
    eyebrow: '泉州市区 · 古城南线',
    title: '府文庙—清净寺—关岳庙—天后宫',
    summary: '已经去过西街，下一次可以走古城南线。府文庙、清净寺、关岳庙、天后宫和德济门更适合放在同一趟，不要再绕回开元寺。',
    highlights: [
      '看建筑和世遗：府文庙、清净寺',
      '继续往南：关岳庙、天后宫、德济门',
      '宗教场所衣着和拍摄要遵守现场提示'
    ],
    suitableFor: '第二次逛古城、喜欢建筑和历史',
    travelNote: '从文化宫方向进入更顺路；全程以步行为主，累了就删掉最后一两个点。',
    costNote: '场所开放和讲解安排会变化，以现场公告为准。',
    mapKeyword: '泉州府文庙',
    destinations: [
      nearbyGuideDestination('confucian-temple', '泉州府文庙', 118.590096, 24.905954, 'B02530333U', '推荐从这里开始'),
      nearbyGuideDestination('qingjing-mosque', '清净古寺', 118.591483, 24.902682, 'B025302UY3'),
      nearbyGuideDestination('guanyue-temple', '通淮关岳庙', 118.592796, 24.901753, 'B02530QZPL'),
      nearbyGuideDestination('tianhou-temple', '泉州天后宫', 118.588755, 24.895235, 'B02530063E')
    ],
    icon: 'i-lucide-route',
    freshnessNote: '点位来自泉州市文旅局公布的古城 Citywalk 路线。',
    keywords: ['府文庙', '清净寺', '关岳庙', '天后宫', '德济门', '古城南线', '泉州世遗'],
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
    id: 'qingyuan-west-lake',
    scope: 'city',
    category: 'city-walk',
    eyebrow: '泉州市区 · 山和公园',
    title: '清源山 + 西湖公园，留出大半天',
    summary: '想爬山就去清源山；只想轻松走走就去西湖公园。两个点可以串起来，但不要再硬塞一整套古城路线。',
    highlights: [
      '清源山要穿防滑鞋、带水，出发前看天气',
      '只想散步拍照，可以只去西湖公园',
      '旅游 1 路可串联清源山与古城，线路当天再查'
    ],
    suitableFor: '爬山、散步、想离开古城人群',
    travelNote: '从古城或泉州站方向重新规划公交；返校前先留出回文化宫或换乘点的时间。',
    costNote: '清源山门票和开放区域以景区当天公告为准，西湖公园按现场规则进入。',
    mapKeyword: '泉州清源山风景名胜区',
    destinations: [
      nearbyGuideDestination('qingyuan-mountain', '清源山国家重点风景名胜区', 118.610818, 24.942414, 'B0253012I0'),
      nearbyGuideDestination('west-lake-park', '泉州西湖公园', 118.581605, 24.929148, 'B025302YEH', '两个点不在同一个入口，需单独规划市内接驳')
    ],
    icon: 'i-lucide-mountain',
    freshnessNote: '景区信息来自泉州市政府景点索引，公交衔接于 2026 年核验。',
    keywords: ['清源山', '西湖公园', '老君岩', '爬山', '市区公园', '旅游1路'],
    image: {
      src: '/images/nearby/qingyuan.webp',
      alt: '泉州清源山景区入口',
      credit: '图片来源：泉州市人民政府景点索引'
    },
    sources: [
      {
        title: '清源山风景名胜区',
        publisher: '泉州市人民政府',
        publishedAt: '2015-11-01',
        url: 'https://www.quanzhou.gov.cn/lyb/lysy/shfg/201510/t20151024_176894.htm'
      },
      {
        title: '西湖片区公交与清源山、古城接驳情况',
        publisher: '泉州市交通运输局',
        publishedAt: '2026-04-29',
        url: 'https://jtj.quanzhou.gov.cn/zfxxgkzl/xxgkml/rddbjy/rdjy/202605/t20260512_3290893.htm'
      }
    ]
  },
  {
    id: 'city-night',
    scope: 'city',
    category: 'city-night',
    eyebrow: '泉州市区 · 晚上去',
    title: '古城夜逛：西街—中山路—新门街',
    summary: '晚饭后想走走，就从西街、中山路、新门街里选一段。人多时别执着挤进每条巷子，返校时间比打卡数量重要。',
    highlights: [
      '西街和中山路适合看古城夜景与沿路小吃',
      '新门街、源和 1916 可作为继续逛的备选',
      '临时演出、市集和夜间开放不是每天都有'
    ],
    suitableFor: '晚饭后散步、夜景、朋友聊天',
    travelNote: '先倒推返校时间，再决定逛到哪里；不要把节假日延时公交当成日常班次。',
    costNote: '夜间消费按需选择，拒绝无明码标价或强行推销项目。',
    mapKeyword: '泉州中山路',
    destinations: [
      nearbyGuideDestination('west-street-night', '泉州西街', 118.579733, 24.920341, 'B0I13O0Z4I'),
      nearbyGuideDestination('zhongshan-night', '泉州中山街', 118.589981, 24.908412, 'B0FFHCYR1W'),
      nearbyGuideDestination('xinmen-street', '泉州新门街', 118.582125, 24.908943, 'BZ8BQD00OY')
    ],
    icon: 'i-lucide-moon-star',
    freshnessNote: '区域定位来自政府夜游资料，活动和营业时间按出发当天核验。',
    keywords: ['泉州夜游', '市区夜生活', '西街夜景', '中山路夜游', '新门街', '源和1916', '晚上去哪', '夜市'],
    image: {
      src: '/images/nearby/city-night.webp',
      alt: '泉州古城与城市夜景倒影',
      credit: '图片来源：泉州市人民政府夜游专题'
    },
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
    id: 'xunmei-waterfront',
    scope: 'city',
    category: 'city-night',
    eyebrow: '泉州市区 · 海边散步',
    title: '浔美湾滨海步道：傍晚去更舒服',
    summary: '不想挤古城，可以去浔美湾沿岸和滨海步道吹风散步。这里离返校换乘点更远，适合专门安排，不要和古城夜游硬拼在一起。',
    highlights: [
      '看落日和海边步道，傍晚比正午更舒服',
      '沿岸点位较长，先定一个具体入口再导航',
      '天气差、风大或太晚时及时取消'
    ],
    suitableFor: '看海、慢跑、傍晚散步、朋友聊天',
    travelNote: '先在地图上确定浔美湾或滨海浪漫线的具体入口，返校建议提前规划网约车或公交换乘。',
    costNote: '公共步道本身按现场规则使用，沿线消费自选。',
    mapKeyword: '泉州浔美湾滨海浪漫线',
    destinations: [
      nearbyGuideDestination('xunmei-park', '泉州城东浔美滞洪湖景观公园', 118.664141, 24.917293, 'B0HBNPWV42', '这是高德可识别的浔美片区入口；沿岸开放范围以现场为准')
    ],
    icon: 'i-lucide-waves',
    freshnessNote: '浔美湾通海段于 2026 年公开确认开放，天气和现场管理当天核验。',
    keywords: ['浔美湾', '滨海浪漫线', '海边散步', '泉州看海', '傍晚', '夜跑', '滨海步道'],
    image: {
      src: '/images/nearby/xunmei.webp',
      alt: '泉州浔美湾沿岸公园与滨海步道',
      credit: '泉州城建集团供图，来源：泉州市人民政府'
    },
    sources: [
      {
        title: '浔美湾沿岸景观提升项目通海段开放',
        publisher: '泉州市人民政府',
        publishedAt: '2026-03-13',
        url: 'https://www.quanzhou.gov.cn/zfb/xxgk/zfxxgkzl/szjs/202603/t20260319_3275908.htm'
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
    destinations: [
      nearbyGuideDestination('maritime-museum', '泉州海外交通史博物馆', 118.611368, 24.909925, 'B025303336'),
      nearbyGuideDestination('mintai-museum', '中国闽台缘博物馆', 118.589887, 24.934989, 'B025302I2Q'),
      nearbyGuideDestination('quanzhou-museum', '泉州博物馆', 118.585827, 24.935632, 'B025301URW', '闽台缘与泉州博物馆距离较近，可放在同一趟')
    ],
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
    id: 'city-heritage-show',
    scope: 'city',
    category: 'city-culture',
    eyebrow: '泉州市区 · 看一场非遗',
    title: '提线木偶、南音、梨园戏，先查当天场次',
    summary: '想看“真的会动起来”的泉州文化，就从木偶剧院、南音艺苑、梨园古典剧院里选一个。演出不是随到随看，先查城市日历和购票安排。',
    highlights: [
      '提线木偶节奏直观，第一次看更容易进入状态',
      '南音和梨园戏更适合想安静听、慢慢看的同学',
      '场次、票价和余票变化快，不在攻略里写死'
    ],
    suitableFor: '雨天、晚上、第一次体验泉州非遗',
    travelNote: '先确认演出地点，再从古城或文化宫规划；散场时间要能赶上返校交通。',
    costNote: '只通过场馆官方渠道或正规平台购票，不买来源不明的加价票。',
    mapKeyword: '泉州木偶剧院',
    destinations: [
      nearbyGuideDestination('puppet-theater', '泉州木偶剧院', 118.593653, 24.933095, 'B02530R2NV', '仅用于木偶戏场馆导航；南音、梨园戏需按当天演出地点重新选择')
    ],
    icon: 'i-lucide-theater',
    freshnessNote: '演出场馆由泉州市文旅局确认，具体场次请看当天城市日历。',
    keywords: ['泉州木偶戏', '提线木偶', '南音', '梨园戏', '木偶剧院', '南音艺苑', '非遗演出', '泉州看戏'],
    image: {
      src: '/images/nearby/heritage-show.webp',
      alt: '观众近距离观看泉州提线木偶表演',
      credit: '庄丽祥 摄，来源：泉州市人民政府'
    },
    sources: [
      {
        title: '非遗体验成泉州旅游新引擎',
        publisher: '泉州市人民政府',
        publishedAt: '2024-05-30',
        url: 'https://www.quanzhou.gov.cn/lyb/lyxw/202405/t20240530_3042502.htm'
      },
      {
        title: '泉州文旅城市日历',
        publisher: '泉州市文化广电和旅游局',
        publishedAt: '持续更新',
        url: 'https://www.quanzhou.gov.cn/lyb/csrl/'
      }
    ]
  },
  {
    id: 'xunpu-coast',
    scope: 'city',
    category: 'city-walk',
    eyebrow: '泉州市区 · 拍照与海风',
    title: '蟳埔民俗文化村与滨海线',
    summary: '想拍簪花围、看蚵壳厝和渔村海边，就单独安排蟳埔。它不在古城步行圈里，不要以为从西街拐个弯就能到。',
    highlights: [
      '簪花体验先问清套餐、底片、妆造和附加收费',
      '村落是居民生活空间，拍摄前尊重隐私和通行',
      '节假日拥挤，公交与接驳通常比临时打车更稳'
    ],
    suitableFor: '拍照、民俗体验、滨海散步',
    travelNote: '从古城前往需重新规划公交或旅游线路；返校路程长，留足回到文化宫换乘 K2 的时间。',
    costNote: '簪花和摄影套餐差异很大，消费前确认总价与交付内容。',
    mapKeyword: '蟳埔民俗文化村',
    destinations: [
      nearbyGuideDestination('xunpu-village', '蟳埔民俗文化村', 118.651229, 24.855056, 'B0FFLATDQR')
    ],
    icon: 'i-lucide-flower-2',
    freshnessNote: '旅游线路覆盖依据 2025 年交通部门公开资料，班次当天复核。',
    keywords: ['蟳埔', '簪花', '簪花围', '蚵壳厝', '滨海', '拍照', '泉州之眼'],
    image: {
      src: '/images/nearby/xunpu-life.webp',
      alt: '蟳埔村民与孩子在海边展示簪花围',
      credit: '庄群 摄，来源：泉州市人民政府'
    },
    sources: [
      {
        title: '在世遗之城赏非遗',
        publisher: '泉州市人民政府',
        publishedAt: '2023-05-12',
        url: 'https://www.quanzhou.gov.cn/lyb/lyxw/202305/t20230512_2879353.htm'
      },
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
    title: '浦西万达：吃饭、电影、逛店一次解决',
    summary: '不想做攻略，只想找空调、连锁餐饮和影院，可以去浦西万达。多人意见不同时，商场比临时拼景点省事。',
    highlights: [
      '适合雨天、多人需求不同或只想轻松聚会',
      '不要再顺路跑中骏世界城，两边距离不近',
      '电影场次、门店与活动直接看当天平台信息'
    ],
    suitableFor: '逛街、看电影、朋友聚会、雨天',
    travelNote: '从文化宫或古城出发要重新规划公交；返校前仍需回到 K2 可达的候车区域，别只看市区夜间线路。',
    costNote: '商圈消费弹性大，团购与优惠先核对使用门店、日期和附加条件。',
    mapKeyword: '泉州浦西万达广场',
    destinations: [
      nearbyGuideDestination('puxi-wanda', '万达广场（泉州浦西店）', 118.598521, 24.881783, 'B02530QJLJ')
    ],
    icon: 'i-lucide-shopping-bag',
    freshnessNote: '商圈与公交覆盖依据 2025 年官方资料，门店和场次实时查询。',
    keywords: ['泉州商场', '浦西万达', '看电影', '逛街', '购物', '雨天', '聚会'],
    sources: [
      {
        title: '泉州市重要商圈公交覆盖情况',
        publisher: '泉州市交通运输局',
        publishedAt: '2025-04-16',
        url: 'https://jtj.quanzhou.gov.cn/zfxxgkzl/xxgkml/rddbjy/zxta/202504/t20250424_3163039.htm'
      }
    ]
  },
  {
    id: 'city-world-city',
    scope: 'city',
    category: 'city-shopping',
    eyebrow: '泉州市区 · 商场放松',
    title: '中骏世界城：城东一带聚会的备选',
    summary: '如果当天本来就在城东、华大或东湖一带，中骏世界城更顺路。它不是古城步行路线的一部分，不要为了两个商场来回跑。',
    highlights: [
      '适合吃饭、电影、多人聚会和雨天',
      '从古城出发要重新规划公交或打车',
      '门店、电影场次和活动看当天平台'
    ],
    suitableFor: '城东方向、聚会、电影、雨天',
    travelNote: '返校前重新规划到 K2 候车区或直接选择正规网约车，不要只看市区内导航。',
    costNote: '团购券先核对门店、使用日期和是否需要预约。',
    mapKeyword: '泉州中骏世界城',
    destinations: [
      nearbyGuideDestination('world-city', '泉州中骏世界城', 118.658687, 24.920423, 'B02530S4Y9')
    ],
    icon: 'i-lucide-building-2',
    freshnessNote: '商圈与公交覆盖依据 2025 年交通部门资料，门店和场次实时查询。',
    keywords: ['中骏世界城', '泉州城东', '泉州商场', '看电影', '聚会', '雨天'],
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
