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
  sandboxId,
  initialMessages,
  initialSession,
}: {
  gameId: string
  sandboxId: string | null
  initialMessages: UIMessage[]
  initialSession?: ChatSessionPersistedState
}) {
  const thread = (
    <ChatThread
      gameId={gameId}
      initialMessages={initialMessages}
      initialSession={initialSession}
    />
  )

  // A game has no sandbox until its first turn starts it, and until then there
  // is nothing to preview — so the thread takes the whole window rather than
  // sitting next to an empty panel the user can drag around.
  if (!sandboxId) return thread

  return (
    <ResizablePanelGroup className="h-svh">
      <ResizablePanel defaultSize="40" minSize="25">
        {thread}
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel defaultSize="60" minSize="25">
        <ChatPreview gameId={gameId} />
      </ResizablePanel>
    </ResizablePanelGroup>
  )
}
