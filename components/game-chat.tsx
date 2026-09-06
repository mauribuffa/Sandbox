"use client"

import type { ChatSessionPersistedState } from "@trigger.dev/sdk/chat"
import type { UIMessage } from "ai"
import { useState } from "react"

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
  // A turn writes the game's files behind a preview URL that never changes, so
  // counting finished turns is what tells the preview it has something new to
  // show. It lives here rather than in either panel because the thread raises
  // it and the preview reads it.
  const [revision, setRevision] = useState(0)

  // A game has no sandbox until its first turn starts it, and until then there
  // is nothing to preview — so the thread takes the whole window rather than
  // sitting next to an empty panel the user can drag around. `sandboxId` is
  // whatever the page read at load, so a game that got its sandbox during the
  // turn that just ran is caught by the revision instead: a finished turn is
  // one whose `onChatStart` has already created one.
  const hasPreview = Boolean(sandboxId) || revision > 0

  return (
    <ResizablePanelGroup className="h-svh">
      {/* The thread stays in this slot whether or not the preview is beside it.
          Moving it into the group only once there was something to preview
          would remount it the moment the first turn ended — and a remounted
          `useChat` drops the reply it just streamed and asks for the opening
          reply a second time. Only the panel appears; the panel group re-lays
          itself out when the second one registers, and the thread is left
          alone. Which is also why only the preview claims a size: on its own
          the thread takes the whole group, and next to a panel asking for 60
          it settles at the 40 that is left. */}
      <ResizablePanel minSize="25">
        <ChatThread
          gameId={gameId}
          initialMessages={initialMessages}
          initialSession={initialSession}
          onTurnEnd={() => setRevision((current) => current + 1)}
        />
      </ResizablePanel>
      {hasPreview && (
        <>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize="60" minSize="25">
            <ChatPreview gameId={gameId} revision={revision} />
          </ResizablePanel>
        </>
      )}
    </ResizablePanelGroup>
  )
}
