"use server"

import { auth } from "@clerk/nextjs/server"
import { refresh } from "next/cache"

import { db } from "@/lib/db"
import { games } from "@/lib/db/schema"

// Creates a game from the composer prompt and scopes it to the caller's active
// organization. Server Actions are reachable by direct POST, so the org is
// resolved from the session here rather than trusted from the caller.
export async function createGame(prompt: string) {
  const { orgId } = await auth()
  if (!orgId) {
    throw new Error("An active organization is required to create a game.")
  }

  const title = prompt.trim()
  if (!title) return

  await db.insert(games).values({ orgId, title })

  // The sidebar's games list is rendered by app/(app)/layout.tsx, so refresh
  // the router to re-render it with the new game.
  refresh()
}
