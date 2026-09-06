"use client"

import type { ChatSessionPersistedState } from "@trigger.dev/sdk/chat"
import type { UIMessage } from "ai"

import { ChatPreview } from "@/components/chat-preview"
import { ChatThread } from "@/components/chat-thread"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"

export function GameChat({
  gameId,
  initialMessages,
  initialSession,
}: {
  gameId: string
  initialMessages: UIMessage[]
  initialSession?: ChatSessionPersistedState
}) {
  return (
    <ResizablePanelGroup className="h-svh">
      <ResizablePanel defaultSize="40" minSize="25">
        <ChatThread
          gameId={gameId}
          initialMessages={initialMessages}
          initialSession={initialSession}
        />
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel defaultSize="60" minSize="25">
        <ChatPreview />
      </ResizablePanel>
    </ResizablePanelGroup>
  )
}
