"use server"

import { anthropic } from "@ai-sdk/anthropic"
import { auth } from "@clerk/nextjs/server"
import { generateText } from "ai"
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

  const trimmed = prompt.trim()
  if (!trimmed) return

  // Naming a game is a one-line job, so it runs on the cheapest, fastest model
  // rather than the one that answers the chat. The prompt itself is the
  // fallback when the model returns nothing usable.
  const { text } = await generateText({
    model: anthropic("claude-haiku-4-5"),
    instructions:
      "Write a short title for the game described by the user, at most five words. Reply with the title alone: no quotes, no punctuation at the end, no explanation.",
    prompt: trimmed,
    maxOutputTokens: 32,
  })

  const title = text.trim() || trimmed

  await db.insert(games).values({ orgId, title })

  // The sidebar's games list is rendered by app/(app)/layout.tsx, so refresh
  // the router to re-render it with the new game.
  refresh()
}
