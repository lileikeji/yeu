import { getPublicNotice } from '../../../../modules/notices/service'
import { useAppDatabase } from '../../../../utils/database'
import { setPublicCache } from '../../../../utils/http'
import { presentPublicContent } from '../../../../utils/public-api-presentation'
import { requireSlugParam } from '../../../../utils/validation'

export default defineEventHandler((event) => {
  const notice = getPublicNotice(event, useAppDatabase(event), requireSlugParam(event))
  setPublicCache(event, 120)
  return {
    ...presentPublicContent(notice),
    pinned: notice.pinned,
    sortOrder: notice.sortOrder,
    autoPopup: notice.autoPopup,
    actions: notice.actions,
    confirmationCount: notice.confirmationCount,
    confirmed: notice.confirmed
  }
})
