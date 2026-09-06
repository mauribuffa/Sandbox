import { anthropic } from "@ai-sdk/anthropic"
import { auth } from "@clerk/nextjs/server"
import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  generateId,
  streamText,
  toUIMessageStream,
  type UIMessage,
} from "ai"

import { saveGameMessages } from "@/lib/games/messages"
import { getGame } from "@/lib/games/queries"

export const maxDuration = 30

export async function POST(req: Request) {
  const { userId, orgId } = await auth()
  if (!userId || !orgId) {
    return new Response("Unauthorized", { status: 401 })
  }

  // The game page uses the game id as the chat id, and useChat's transport
  // sends it as `id` alongside the full thread.
  const { id, messages }: { id: string; messages: UIMessage[] } =
    await req.json()

  // Confirms the game exists and belongs to the caller's active organization
  // before spending a model call on a thread we would not be able to save.
  const game = await getGame(id)
  if (!game) {
    return new Response("Not Found", { status: 404 })
  }

  const result = streamText({
    model: anthropic("claude-sonnet-5"),
    messages: await convertToModelMessages(messages),
  })

  // Drains the stream even if the client disconnects mid-response, so onEnd
  // still runs and the turn is not lost.
  result.consumeStream()

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({
      stream: result.stream,
      originalMessages: messages,
      // Assign the assistant message id on the server so the stored thread
      // keeps the same ids the client rendered.
      generateMessageId: generateId,
      onEnd: ({ messages }) => saveGameMessages({ id, orgId, messages }),
    }),
  })
}
