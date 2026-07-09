import { ApifyProbeInputError, runApifyProbe } from '../../utils/apifyProbe'

const DEFAULT_ACTOR_ID = 'harvestapi/linkedin-profile-search'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event)
  const token = config.apifyToken || process.env.NUXT_APIFY_TOKEN
  const actorId = config.apifyLinkedinProfileSearchActor || process.env.NUXT_APIFY_LINKEDIN_PROFILE_SEARCH_ACTOR || DEFAULT_ACTOR_ID
  const body = await readBody(event)

  if (!token) {
    throw createError({ statusCode: 500, statusMessage: 'Configure NUXT_APIFY_TOKEN no servidor antes de executar a sondagem.' })
  }

  try {
    return await runApifyProbe({ body, token, actorId })
  } catch (error) {
    if (error instanceof ApifyProbeInputError) {
      throw createError({ statusCode: error.statusCode, statusMessage: error.message })
    }

    throw error
  }
})
