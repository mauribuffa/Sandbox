"use client"

import { useChat } from "@ai-sdk/react"
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

export function ChatThread({
  gameId,
  initialMessages,
}: {
  gameId: string
  initialMessages: UIMessage[]
}) {
  // The game id doubles as the chat id, so the transport sends it to the API
  // route as `id` and the route knows which game's thread to save.
  const { messages, sendMessage, status, error } = useChat({
    id: gameId,
    messages: initialMessages,
  })
  const [prompt, setPrompt] = useState("")

  // A game created from the home page composer arrives with the user's prompt
  // already stored as the only message, so the opening reply is requested here
  // instead of being sent by the composer. `sendMessage` with no message asks
  // for a response to the thread as it stands. The ref keeps the request from
  // going out twice when React remounts the component in development.
  const requestedOpeningReply = useRef(false)
  useEffect(() => {
    if (requestedOpeningReply.current) return
    if (initialMessages.at(-1)?.role !== "user") return

    requestedOpeningReply.current = true
    sendMessage()
  }, [initialMessages, sendMessage])

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
