import { eq } from "drizzle-orm"

import { daytonaClient } from "@/lib/daytona/client"
import { db } from "@/lib/db"
import { games } from "@/lib/db/schema"

// Where the game's files live inside its sandbox.
const GAME_DIR = "/home/daytona/game"

// The port the game's static server listens on inside the sandbox. Exported so
// a caller minting a preview URL signs the port the server is actually on.
export const GAME_PORT = 3000

// Succeeds only once something is actually answering on the port, which is what
// makes it safe to skip the spawn below rather than a process-name check that
// would also match a server that died mid-boot.
const HEALTH_CHECK = `curl -sf -o /dev/null http://localhost:${GAME_PORT}/`

// Gives a game its own sandbox and seeds a placeholder page in it, then records
// the sandbox id on the game so later turns can find it again.
export async function createGameSandbox(gameId: string) {
  const sandbox = await daytonaClient.create()

  await sandbox.fs.createFolder(GAME_DIR, "755")
  await sandbox.fs.uploadFile(Buffer.from("New game"), `${GAME_DIR}/index.html`)

  await db.update(games).set({ sandboxId: sandbox.id }).where(eq(games.id, gameId))

  return sandbox
}

// Brings up the static server serving the game's page, unless one is already
// listening, and hands back the sandbox it runs in. Minting a preview URL is
// left to the caller, since how long that URL should live is a property of what
// it gets handed to rather than of the server being up.
//
// A sandbox outlives the turn that created it, so most calls land on one that is
// already serving — the health check is what keeps a preview request from
// stacking another `http.server` on top of the running one every time. The wait
// loop covers the gap between spawning a new server and it binding the port, so
// the sandbox is ready to serve by the time it is handed back.
export async function startGameServer(sandboxId: string) {
  const sandbox = await daytonaClient.get(sandboxId)

  // A sandbox that auto-stopped between sessions keeps its files but loses every
  // process, so it has to be running before anything can answer the check.
  if (sandbox.state !== "started") {
    await sandbox.start()
  }

  await sandbox.process.executeCommand(
    `${HEALTH_CHECK} || { ` +
      `nohup python3 -m http.server ${GAME_PORT} --directory ${GAME_DIR} > /tmp/game-server.log 2>&1 & ` +
      `for _ in $(seq 50); do ${HEALTH_CHECK} && break; sleep 0.1; done; }`
  )

  return { sandbox }
}
