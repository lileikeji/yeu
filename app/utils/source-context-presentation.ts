export interface StudentSourceContextOptions {
  includeUnavailableNote?: boolean
}

export function presentStudentSourceContext(
  value: string | undefined,
  options: StudentSourceContextOptions = {}
): string | undefined {
  if (!value?.trim()) return undefined

  const unavailableNote = options.includeUnavailableNote === false
    ? ''
    : '原分享目前打不开。'

  return value
    .replace(
      /社交平台参考信息；宿舍设施描述须以学校通知或现场(?:核验|确认)为准。(?:原分享目前打不开。)?/g,
      `这是往年的学生分享。宿舍里有什么，到校后看实际房间。${unavailableNote}`
    )
    .replace(
      /社交平台待核验线索；宿舍设施描述须以学校通知或现场核验为准。原外链当前不可稳定访问，前台仅保留为归档线索。?/g,
      `这是往年的学生分享。宿舍设施到校后看实际房间。${unavailableNote}`
    )
    .replace(
      /社交平台视频线索；楼栋、房型与拍摄时间仍待确认。原外链当前不可稳定访问，前台仅保留为归档线索。?/g,
      `这是往年的宿舍视频，楼栋、房型和拍摄时间都不明确，到校后看实际房间。${unavailableNote}`
    )
    .replace(
      /社交平台待核验线索；拉练可概述为约35[–-]40公里，2025年学校官方报道口径为35公里。原外链当前不可稳定访问，前台仅保留为归档线索。?/g,
      `这是往年的学生分享，讲吃饭、出行和校园生活；店铺和军训安排可能已经变了，出发前再看一眼。${unavailableNote}`
    )
    .replace(
      /与高德(?: POI|地图地点)\s*交叉命中的商铺候选；营业状态和菜品仍待(?:实地)?确认。(?:原外链|原链接)当前不可稳定访问，(?:前台|公开页面)仅保留为归档线索。?/g,
      `这家店同时出现在学生分享和高德地图中；是否营业、菜品和价格请到店前再确认。${unavailableNote}`
    )
    .replace(
      /2025 年社交平台旧线索；站点数量、品牌和营业状态均待复核。原外链当前不可稳定访问，前台仅保留为归档线索。?/g,
      `这是2025年的学生分享，快递点数量、品牌和营业情况可能已经变化。${unavailableNote}`
    )
    .replace(
      /2025 年不完整线索；不能替代校团委当年注册名册。原外链当前不可稳定访问，前台仅保留为归档线索。?/g,
      `这是2025年的不完整名单。这学期招不招新，看校团委公布的社团名单。${unavailableNote}`
    )
    .replace(
      /校内用户确认该交通工具通称“叮叮车”；票价、时段、上下车点仍待核验，争议配图禁止发布。原外链当前不可稳定访问，前台仅保留为归档线索。?/g,
      `学生通常把这种校内交通工具叫作“叮叮车”；票价、时间和上下车点，看学校最新安排和现场标识。${unavailableNote}`
    )
    .replace(/社交平台待核验线索/g, '这是一份学生分享，内容可能已经变化')
    .replace(/社交平台视频线索/g, '这是一段学生分享，内容可能已经变化')
    .replace(/与高德 POI 交叉命中的商铺候选/g, '在高德地图和学生分享中都出现过的商铺')
    .replace(/2025 年社交平台旧线索/g, '这是2025年的学生分享')
    .replace(/候选/g, '参考')
    .replace(/均待复核/g, '都要再确认')
    .replace(/待复核/g, '还要再确认')
    .replace(/仍待确认/g, '还要再确认')
    .replace(/仍待核验/g, '还要再确认')
    .replace(/待核验/g, '还要再确认')
    .replace(
      /(?:原外链|原链接)当前不可稳定访问，(?:前台|公开页面)仅保留为归档线索。?/g,
      unavailableNote
    )
    .replace(/归档线索/g, '仅供参考')
    .replace(/争议配图禁止发布。?/g, '有争议信息不作为公开参考。')
    .replace(/现场核验/g, '现场确认')
    .replace(/独立核验/g, '独立确认')
    .replace(/核验/g, '确认')
    .replace(/原外链/g, '原链接')
    .replace(/前台/g, '公开页面')
    .replace(/线索/g, '参考信息')
    .replace(/\s{2,}/g, ' ')
    .trim()
}
