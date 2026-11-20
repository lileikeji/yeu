import { listMemberRegistrations } from '../../../../modules/yeuca/activity-service'
import { listMemberGiteaRepos, readGiteaConfig } from '../../../../modules/yeuca/gitea'
import { readOptionalYeucaMemberSession } from '../../../../modules/yeuca/member-service'
import { useAppDatabase } from '../../../../utils/database'
import { applyYeucaCors } from '../../../../utils/yeuca-cors'

export default defineEventHandler(async (event) => {
  applyYeucaCors(event)
  setHeader(event, 'Cache-Control', 'no-store')

  const client = useAppDatabase(event)
  const session = readOptionalYeucaMemberSession(event, client)
  const giteaConfig = readGiteaConfig()

  if (!session) {
    return {
      authenticated: false,
      member: null,
      gitPublicUrl: giteaConfig.publicGitUrl,
      repos: [],
      registrations: []
    }
  }

  const [repos, registrations] = await Promise.all([
    listMemberGiteaRepos(session.member.gitUsername),
    Promise.resolve(listMemberRegistrations(client, session.member.id))
  ])

  return {
    authenticated: true,
    member: session.member,
    gitPublicUrl: giteaConfig.publicGitUrl,
    repos,
    registrations
  }
})
