import { auth } from "@clerk/nextjs/server"
import { notFound } from "next/navigation"

import { GameChat } from "@/components/game-chat"
import { getGame } from "@/lib/games/queries"

export default async function GamePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await auth.protect({ unauthenticatedUrl: "/sign-in" })

  const { id } = await params
  const game = await getGame(id)
  if (!game) notFound()

  // The transport hydrates from the session the last turn persisted, so a fresh
  // tab reconnects to an in-flight reply instead of creating a second session.
  const initialSession = game.chatAccessToken
    ? {
        publicAccessToken: game.chatAccessToken,
        lastEventId: game.lastEventId ?? undefined,
      }
    : undefined

  return (
    <GameChat
      gameId={game.id}
      sandboxId={game.sandboxId}
      initialMessages={game.messages}
      initialSession={initialSession}
    />
  )
}
