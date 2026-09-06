"use server"

import { auth } from "@clerk/nextjs/server"
import { auth as triggerAuth } from "@trigger.dev/sdk"
import { chat, type ChatStartSessionParams } from "@trigger.dev/sdk/ai"

import { getGame } from "@/lib/games/queries"
import type { gameChat } from "@/trigger/chat"

const start = chat.createStartSessionAction<typeof gameChat>("game-chat")

// The chat id is the game id, and it arrives from the browser. Signed in is not
// the same as entitled to this thread, so both actions below resolve the game
// through `getGame` — which scopes by the caller's active organization — before
// handing back anything that can drive the session. This is the check the
// deleted app/api/chat/route.ts used to run per request.
async function assertGameAccess(chatId: string) {
  const { userId, orgId } = await auth()
  if (!userId || !orgId) {
    throw new Error("Unauthorized")
  }

  const game = await getGame(chatId)
  if (!game) {
    throw new Error("Not Found")
  }
}

// Creates the session and its first run, then returns a session-scoped token.
// Idempotent on (environment, chatId).
export async function startGameChatSession(
  params: ChatStartSessionParams<typeof gameChat>
) {
  await assertGameAccess(params.chatId)

  return start(params)
}

// Pure mint. The transport calls this on a 401/403 to refresh an expired token.
export async function mintGameChatAccessToken(chatId: string) {
  await assertGameAccess(chatId)

  return triggerAuth.createPublicToken({
    scopes: {
      read: { sessions: chatId },
      write: { sessions: chatId },
    },
    expirationTime: "1h",
  })
}
