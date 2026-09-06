import "server-only"

import type { UIMessage } from "ai"
import { and, eq } from "drizzle-orm"

import { db } from "@/lib/db"
import { games } from "@/lib/db/schema"

// Replaces a game's stored thread with the full thread from the current turn.
// The org is passed in rather than read from the session because this runs from
// the chat stream's onEnd callback, after the response has started streaming.
// Scoping the update by org keeps a request from writing into another org's game.
export async function saveGameMessages({
  id,
  orgId,
  messages,
}: {
  id: string
  orgId: string
  messages: UIMessage[]
}) {
  await db
    .update(games)
    .set({ messages })
    .where(and(eq(games.id, id), eq(games.orgId, orgId)))
}
