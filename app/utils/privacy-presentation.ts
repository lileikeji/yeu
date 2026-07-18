export interface PrivacySection {
  title: string
  icon: string
  items: string[]
}

export interface PrivacyHighlight {
  label: string
  value: string
  icon: string
}

export const privacyHighlights: PrivacyHighlight[] = [
  { label: '浏览指南', value: '不需要登录', icon: 'i-lucide-eye' },
  { label: '使用定位', value: '由你主动允许', icon: 'i-lucide-navigation' },
  { label: '进入群聊', value: '需要账号', icon: 'i-lucide-messages-square' }
]

export const privacySections: PrivacySection[] = [
  {
    title: '浏览和定位',
    icon: 'i-lucide-globe',
    items: [
      '浏览公开指南不需要学生账号。我们不会要求你提供学号、校园卡密码、校园网密码或个人档案。',
      '只有你主动点击定位时，浏览器才会询问是否允许。位置只用于把地图移动到你附近，本站不会保存你的准确位置。',
      '离线使用时，设备只会暂存打开页面所需的文件，不会保存管理页面内容或完整地图资料。'
    ]
  },
  {
    title: '网站安全记录',
    icon: 'i-lucide-radar',
    items: [
      '为了保障网站安全，会记录访问时使用的网络地址、推测到的城市或地区、打开过的页面和进行过的操作。',
      '浏览器会保存一个随机访客编号，用来辨认同一设备的连续访问。限制访问时可能按网络地址、设备或账号处理。',
      '只有网站管理员可以查看这些记录。发现频繁刷页面、辱骂或其他滥用时，可能限制访问。'
    ]
  },
  {
    title: '账号和聊天',
    icon: 'i-lucide-messages-square',
    items: [
      '当前暂不开放自己注册，账号由网站管理员创建。不登录也能使用指南和地图，但进入群聊必须登录。',
      '登录后可以修改显示名、专业和宿舍楼；宿舍楼只用于显示对应的楼群入口。',
      '群聊会保存用户名、发送时间和消息内容。网站管理员可以删除违规内容，并对全群或个人暂停发言。'
    ]
  },
  {
    title: '你提交的反馈',
    icon: 'i-lucide-message-square-warning',
    items: [
      '会保存你填写的具体情况、可选链接和可选联系方式，只有网站管理员可以查看。',
      '为了阻止短时间内反复提交，我们会把网络地址换成一个不能还原原地址的编号，只用来判断提交是否过于频繁。',
      '请勿提交密码、证件、个人宿舍房间号、他人私人联系方式或未经同意的群二维码。'
    ]
  },
  {
    title: '保存多久',
    icon: 'i-lucide-clock-3',
    items: [
      '访问记录和聊天记录只在维护网站和处理问题所需的时间内保留；账号停用或封禁后会立即退出登录。',
      '反馈处理结束后，可选联系方式默认再保留 90 天；反馈记录自提交起最多保留 730 天。',
      '需要查询或删除自己提交的信息时，可再次通过反馈页说明原提交时间、内容和可用于核对的信息。'
    ]
  },
  {
    title: '外部地图和网站',
    icon: 'i-lucide-map',
    items: [
      '打开地图时会连接所选地图服务，对方可能按自己的隐私规则处理正常访问所需的信息。',
      '点击学校官网、资料出处或导航链接离开本站后，请查看对应网站的隐私说明。',
      '今后如果使用网页加速或访问数量统计服务，这里会写明服务商和使用范围。'
    ]
  }
]
