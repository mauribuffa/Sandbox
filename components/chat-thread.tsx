"use client"

import Image from "next/image"
import { useState } from "react"

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

const messages = [
  {
    id: "1",
    role: "user",
    content: "I want a top-down racing game set on a neon city grid.",
  },
  {
    id: "2",
    role: "assistant",
    content:
      "Neon city grid it is. I'll start with a single-screen track, drift physics and a lap timer. Do you want AI opponents, or time trial only?",
  },
  {
    id: "3",
    role: "user",
    content: "Three AI opponents, and give me boost pads.",
  },
  {
    id: "4",
    role: "assistant",
    content:
      "Done — three opponents with rubber-band difficulty, plus boost pads on the long straights that drain a small meter. Best lap is saved between runs.",
  },
  {
    id: "5",
    role: "user",
    content: "Can the car leave a light trail behind it?",
  },
  {
    id: "6",
    role: "assistant",
    content:
      "Added. The trail fades after two seconds and doesn't collide with anything, so it reads as decoration rather than a hazard. Say the word and I'll make it solid.",
  },
] as const

// Temporary stand-in until the thread is wired to the chat API route.
function sendMessage(message: string) {
  console.log(message)
}

export function ChatThread() {
  const [prompt, setPrompt] = useState("")

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
                        <BubbleContent>{message.content}</BubbleContent>
                      </Bubble>
                    </MessageContent>
                  </Message>
                </MessageScrollerItem>
              ))}
            </MessageScrollerContent>
          </MessageScrollerViewport>
          <MessageScrollerButton />
        </MessageScroller>
        <div className="mx-auto w-full max-w-3xl px-4 pb-4">
          <ChatComposer
            value={prompt}
            onValueChange={setPrompt}
            onSubmit={() => {
              sendMessage(prompt)
              setPrompt("")
            }}
          />
        </div>
      </div>
    </MessageScrollerProvider>
  )
}
