"use client"

import { useChat } from "@ai-sdk/react"
import type { ChatSessionPersistedState } from "@trigger.dev/sdk/chat"
import { useTriggerChatTransport } from "@trigger.dev/sdk/chat/react"
import type { UIMessage } from "ai"
import Image from "next/image"
import { useEffect, useRef, useState } from "react"

import { ChatComposer } from "@/components/chat-composer"
import { Bubble, BubbleContent } from "@/components/ui/bubble"
import { Message, MessageAvatar, MessageContent } from "@/components/ui/message"
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller"
import {
  mintGameChatAccessToken,
  startGameChatSession,
} from "@/lib/games/chat"
// Type-only: the agent module pulls the database and the model provider in with
// it, and none of that belongs in the browser bundle.
import type { gameChat } from "@/trigger/chat"

export function ChatThread({
  gameId,
  initialMessages,
  initialSession,
}: {
  gameId: string
  initialMessages: UIMessage[]
  initialSession?: ChatSessionPersistedState
}) {
  // The game id doubles as the chat id, so the agent's hooks know which game's
  // thread to read and save. Both callbacks are server actions, so the browser
  // never holds anything wider than a token scoped to this one chat.
  const transport = useTriggerChatTransport<typeof gameChat>({
    task: "game-chat",
    accessToken: ({ chatId }) => mintGameChatAccessToken(chatId),
    startSession: ({ chatId, clientData }) =>
      startGameChatSession({ chatId, clientData }),
    sessions: initialSession ? { [gameId]: initialSession } : undefined,
  })

  const { messages, sendMessage, status, error } = useChat({
    id: gameId,
    messages: initialMessages,
    transport,
    // Reconnects to a reply that is still streaming — a refresh mid-answer picks
    // it back up from `lastEventId` rather than losing it. Only a game that has
    // already run a turn has a session to resume.
    resume: Boolean(initialSession),
  })
  const [prompt, setPrompt] = useState("")

  // A game created from the home page composer arrives with the user's prompt
  // already stored as the only message, so the opening reply is requested here
  // instead of being sent by the composer. `sendMessage` with no message asks
  // for a response to the thread as it stands; the agent recognises the prompt
  // it already holds and answers it rather than storing it twice. The ref keeps
  // the request from going out twice when React remounts the component in
  // development.
  const requestedOpeningReply = useRef(false)
  useEffect(() => {
    if (requestedOpeningReply.current) return
    // A session means the opening turn was already asked for. Requesting it
    // again would start a second turn alongside the one `resume` reconnects to.
    if (initialSession) return
    if (initialMessages.at(-1)?.role !== "user") return

    requestedOpeningReply.current = true
    sendMessage()
  }, [initialMessages, initialSession, sendMessage])

  const isBusy = status === "submitted" || status === "streaming"

  return (
    <MessageScrollerProvider defaultScrollPosition="end">
      <div className="flex h-svh flex-col">
        <MessageScroller className="flex-1">
          <MessageScrollerViewport>
            <MessageScrollerContent className="mx-auto w-full max-w-3xl px-4 py-8">
              {messages.map((message) => (
                <MessageScrollerItem key={message.id} messageId={message.id}>
                  <Message align={message.role === "user" ? "end" : "start"}>
                    {message.role === "assistant" && (
                      <MessageAvatar className="size-8 self-start rounded-lg bg-transparent">
                        <Image src="/logo.svg" alt="" width={32} height={32} />
                      </MessageAvatar>
                    )}
                    <MessageContent>
                      <Bubble
                        variant={
                          message.role === "user" ? "secondary" : "ghost"
                        }
                      >
                        <BubbleContent>
                          {message.parts.map((part, index) =>
                            part.type === "text" ? (
                              <span key={index}>{part.text}</span>
                            ) : null
                          )}
                        </BubbleContent>
                      </Bubble>
                    </MessageContent>
                  </Message>
                </MessageScrollerItem>
              ))}
              {error && (
                <p className="text-sm text-destructive">
                  Something went wrong. Please try again.
                </p>
              )}
            </MessageScrollerContent>
          </MessageScrollerViewport>
          <MessageScrollerButton />
        </MessageScroller>
        <div className="mx-auto w-full max-w-3xl px-4 pb-4">
          <ChatComposer
            value={prompt}
            onValueChange={setPrompt}
            disabled={isBusy}
            onSubmit={() => {
              sendMessage({ text: prompt })
              setPrompt("")
            }}
          />
        </div>
      </div>
    </MessageScrollerProvider>
  )
}
