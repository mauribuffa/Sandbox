export function ChatPreview({ gameId }: { gameId: string }) {
  return (
    <iframe
      // The route proxies the game out of its sandbox, so this is same-origin
      // and needs no token in the URL.
      src={`/api/games/${gameId}/preview`}
      title="Game preview"
      className="size-full border-0 bg-white"
      // Which means the game — model-written code served from this app's own
      // origin — would otherwise run with reach into the session that framed it.
      // `allow-scripts` alone puts it on an opaque origin: the game still runs,
      // but it is walled off from the app around it.
      sandbox="allow-scripts"
    />
  )
}
