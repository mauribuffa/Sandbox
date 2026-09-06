import { GAME_PORT, startGameServer } from "@/lib/daytona/utils"
import { getGame } from "@/lib/games/queries"

// An hour. The signed URL never reaches the browser — it is fetched server-side
// just below — so this only has to outlast a working session's worth of proxied
// requests rather than being short enough to be safe to hand out.
const PREVIEW_TTL_SECONDS = 3600

// Daytona answers anything that looks like a browser with a warning
// interstitial, and the header that skips it is not one an iframe can send. So
// the game is proxied through here rather than framed directly: this request is
// not a browser's, so it can set the header — and the signed preview URL, which
// is bearer-shaped and would be replayable by anyone who read it out of the
// page, never leaves the server.
const SKIP_PREVIEW_WARNING = { "X-Daytona-Skip-Preview-Warning": "true" }

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  // `getGame` scopes the lookup to the caller's active organization, so another
  // org's game is indistinguishable from a missing one here too. A game with no
  // sandbox yet has nothing to serve, which is the same 404 to the caller.
  const game = await getGame(id)
  if (!game?.sandboxId) {
    return new Response("Not Found", { status: 404 })
  }

  const { sandbox } = await startGameServer(game.sandboxId)
  const { url } = await sandbox.getSignedPreviewUrl(GAME_PORT, PREVIEW_TTL_SECONDS)
  const upstream = await fetch(url, { headers: SKIP_PREVIEW_WARNING })

  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      "content-type": upstream.headers.get("content-type") ?? "text/html",
      // The chat rewrites the game between turns, so a cached copy is always
      // the wrong answer.
      "cache-control": "no-store",
    },
  })
}
