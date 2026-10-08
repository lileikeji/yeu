/**
 * 宿舍实拍的内容与文案：网页端与小程序共用。
 * 视频与海报是本站维护者自行拍摄的素材，托管在同域 /media 与 /images/panorama 下。
 * 这里只存站点相对路径，由各端自己拼域名（小程序必须绝对地址）。
 */

export type DormTourId = 'ordinary' | 'comfort'

export interface DormTour {
  id: DormTourId
  name: string
  badge: string
  duration: string
  summary: string
  detail: string
  videoPath: string
  posterPath: string
  highlights: string[]
}

export const dormTours: DormTour[] = [
  {
    id: 'ordinary',
    name: '普通型宿舍',
    badge: '28 秒实拍',
    duration: '约 28 秒',
    summary: '从宿舍内部走到公共洗衣、洗漱和卫生间区域。',
    detail: '这段走拍能看到床桌柜、公共洗衣机、公共洗漱台和卫生间。不同楼栋的布局、设备数量和维护状态可能不同。',
    videoPath: '/media/ordinary-dorm-tour.mp4',
    posterPath: '/images/panorama/ordinary-dorm-poster.jpg',
    highlights: [
      '视频内可见上床下桌和储物柜',
      '洗衣、洗漱与卫生间位于公共区域',
      '普通型洗澡通常使用水卡，单次约 0.5 至 1 元'
    ]
  },
  {
    id: 'comfort',
    name: '舒适型宿舍',
    badge: '24 秒实拍',
    duration: '约 24 秒',
    summary: '查看卧室、床桌柜、空调、独立卫浴和洗衣区域。',
    detail: '这段视频展示一间舒适型宿舍的实际状态，不是学校发布的标准样板间。楼栋、房型、家具和入住后的布置会有差异。',
    videoPath: '/media/comfort-dorm-tour.mp4',
    posterPath: '/images/panorama/comfort-dorm-poster.jpg',
    highlights: [
      '视频内可见床桌柜、空调和独立卫浴',
      '舒适型宿舍全天有热水，不使用普通宿舍水卡',
      '视频里的洗衣机和家具状态只代表拍摄房间'
    ]
  }
]

export const dormDisclaimers = [
  {
    title: '实拍不是标准样板间',
    body: '拍摄时间、楼栋、入住人数和个人布置都会影响画面。床位、家具、热水和公共设施以实际分配及学校最新安排为准。'
  },
  {
    title: '影像来源与隐私说明',
    body: '视频由本站维护者自行拍摄，本站只提供行前参考，不代表学校官方宣传。发布或转载时应确认入镜人员同意，并避免展示房号、联系方式和其他可识别的私人信息。'
  }
]

export function findDormTour(id: string): DormTour {
  return dormTours.find(tour => tour.id === id) ?? dormTours[0]!
}

/** 拼成绝对地址；小程序 video/image 的 src 不接受同域相对路径。 */
export function resolveDormAssetUrl(origin: string, path: string): string {
  const base = origin.replace(/\/$/, '')
  return path.startsWith('/') ? `${base}${path}` : `${base}/${path}`
}
