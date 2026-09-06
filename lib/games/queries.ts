import "server-only"

import { auth } from "@clerk/nextjs/server"
import { and, desc, eq } from "drizzle-orm"

import { db } from "@/lib/db"
import { games } from "@/lib/db/schema"

// Lists the games owned by the caller's active organization, newest first.
// The org is resolved from the session rather than trusted from the caller.
export async function listGames() {
  const { orgId } = await auth()
  if (!orgId) return []

  return db
    .select({ id: games.id, title: games.title })
    .from(games)
    .where(eq(games.orgId, orgId))
    .orderBy(desc(games.createdAt))
}

// Loads a single game by id. Scoping the lookup to the caller's active
// organization keeps another org's game indistinguishable from a missing one.
export async function getGame(id: string) {
  const { orgId } = await auth()
  if (!orgId) return null

  const [game] = await db
    .select({ id: games.id, title: games.title, messages: games.messages })
    .from(games)
    .where(and(eq(games.id, id), eq(games.orgId, orgId)))
    .limit(1)

  return game ?? null
}
