import { anthropic } from "@ai-sdk/anthropic"
import { chat, upsertIncomingMessage } from "@trigger.dev/sdk/ai"
import { streamText } from "ai"
import { eq } from "drizzle-orm"

import { createGameSandbox } from "@/lib/daytona/utils"
import { db } from "@/lib/db"
import { games } from "@/lib/db/schema"

export const gameChat = chat.agent({
  id: "game-chat",

  // The games table stays the source of truth for a thread, so history is read
  // from it every turn rather than trusted from the client. Only the new user
  // message arrives on the wire, in `incomingMessages`.
  //
  // Scoping by id alone is safe here: both server actions in lib/games/chat.ts
  // resolve the game through `getGame`, which is org-scoped, before a session
  // can be started or a token minted for this id.
  hydrateMessages: async ({ chatId, trigger, incomingMessages }) => {
    const [game] = await db
      .select({ messages: games.messages })
      .from(games)
      .where(eq(games.id, chatId))
      .limit(1)

    const stored = game?.messages ?? []

    // Pushes a fresh user message and no-ops when the client re-sends one the
    // thread already holds — which is what the game page does to request the
    // opening reply to a prompt `createGame` already stored.
    if (upsertIncomingMessage(stored, { trigger, incomingMessages })) {
      await db.update(games).set({ messages: stored }).where(eq(games.id, chatId))
    }

    return stored
  },

  // `chatId` is the game id, and this fires once on the thread's first turn, so
  // it is where a game gets the sandbox its files will live in.
  onChatStart: async ({ chatId }) => {
    await createGameSandbox(chatId)
  },

  // One statement, so a reload can never read the finished reply against the
  // previous turn's cursor and replay chunks on top of it.
  onTurnComplete: async ({ chatId, uiMessages, chatAccessToken, lastEventId }) => {
    await db
      .update(games)
      .set({ messages: uiMessages, chatAccessToken, lastEventId })
      .where(eq(games.id, chatId))
  },

  run: async ({ messages, signal }) =>
    streamText({
      // Spread first, so anything set below still wins.
      ...chat.toStreamTextOptions(),
      model: anthropic("claude-sonnet-5"),
      messages,
      abortSignal: signal,
    }),
})
