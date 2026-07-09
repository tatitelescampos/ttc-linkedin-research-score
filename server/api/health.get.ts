import { count } from 'drizzle-orm'
import { researchItems } from '../database/schema'
import { db } from '../utils/db'

export default defineEventHandler(async () => {
  const [result] = await db.select({ total: count() }).from(researchItems)

  return {
    ok: true,
    database: 'sqlite',
    researchItems: result?.total ?? 0
  }
})
