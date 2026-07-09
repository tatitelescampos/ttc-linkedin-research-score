import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { drizzle } from 'drizzle-orm/libsql'
import * as schema from '../database/schema'

const databaseUrl = process.env.NUXT_DATABASE_URL ?? 'file:.data/app.sqlite'

if (databaseUrl.startsWith('file:')) {
  mkdirSync(dirname(databaseUrl.slice('file:'.length)), { recursive: true })
}

export const db = drizzle(databaseUrl, { schema })
