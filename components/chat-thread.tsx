"use client"

import { useChat } from "@ai-sdk/react"
import type { ChatSessionPersistedState } from "@trigger.dev/sdk/chat"
import { useTriggerChatTransport } from "@trigger.dev/sdk/chat/react"
import { getToolName, isToolUIPart } from "ai"
import type { DynamicToolUIPart, ToolUIPart, UIMessage } from "ai"
import { CheckIcon, CircleXIcon } from "lucide-react"
import Image from "next/image"
import { useCallback, useEffect, useRef, useState } from "react"

import { ChatComposer } from "@/components/chat-composer"
import { Bubble, BubbleContent } from "@/components/ui/bubble"
import { Marker, MarkerContent, MarkerIcon } from "@/components/ui/marker"
import { Message, MessageAvatar, MessageContent } from "@/components/ui/message"
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller"
import { Spinner } from "@/components/ui/spinner"
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

  const {
    messages,
    sendMessage,
    stop: stopStream,
    status,
    error,
  } = useChat({
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

  // `useChat`'s own `stop` only settles the local stream — the run keeps
  // generating server-side, and on a stream picked back up by `resume` the
  // signal never reaches the backend at all. `stopGeneration` sends the stop
  // the agent's `abortSignal` is waiting on; `stopStream` then flips the UI
  // back to ready and keeps whatever streamed in before the interruption.
  const stopGenerating = useCallback(() => {
    transport.stopGeneration(gameId)
    stopStream()
  }, [transport, gameId, stopStream])

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
                        <BubbleContent className="flex flex-col gap-2">
                          {message.parts.map((part, index) => {
                            if (part.type === "text") {
                              return <span key={index}>{part.text}</span>
                            }

                            if (isToolUIPart(part)) {
                              return (
                                <ToolMarker key={part.toolCallId} part={part} />
                              )
                            }

                            return null
                          })}
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
            isStreaming={isBusy}
            onStop={stopGenerating}
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

// A tool call arrives as one part that is updated in place as the turn runs:
// its input streams in, the call goes out, and it settles on either an output
// or an error. Anything short of settling is still in flight.
function toolStatus(part: ToolUIPart | DynamicToolUIPart) {
  switch (part.state) {
    case "output-available":
      return "done"
    case "output-error":
      return "failed"
    default:
      return "active"
  }
}

// Every game tool takes a `path`, and the file being touched is the readable
// half of the line. It is picked out defensively: the part is typed against the
// whole tool set, and the input is half-parsed while it is still streaming.
function toolPath(input: unknown) {
  if (input && typeof input === "object" && "path" in input) {
    const { path } = input as { path?: unknown }

    if (typeof path === "string") return path
  }

  return undefined
}

function ToolMarker({ part }: { part: ToolUIPart | DynamicToolUIPart }) {
  const status = toolStatus(part)
  const path = toolPath(part.input)

  return (
    <Marker>
      <MarkerIcon>
        {status === "active" && <Spinner />}
        {status === "done" && <CheckIcon className="text-foreground" />}
        {status === "failed" && <CircleXIcon className="text-destructive" />}
      </MarkerIcon>
      <MarkerContent
        className={status === "failed" ? "text-destructive" : undefined}
      >
        {getToolName(part)}
        {path && <span className="ml-1.5 font-mono text-xs">{path}</span>}
        {/* The reason is the whole point of showing a failure — the model gets
            another attempt at the call, and this says what it is retrying. */}
        {part.state === "output-error" && (
          <span className="ml-1.5">— {part.errorText}</span>
        )}
      </MarkerContent>
    </Marker>
  )
}
