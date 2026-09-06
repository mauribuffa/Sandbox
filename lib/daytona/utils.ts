import type { Sandbox } from "@daytona/sdk"
import { eq } from "drizzle-orm"
import { readdir } from "node:fs/promises"
import { join, posix, relative } from "node:path"

import { daytonaClient } from "@/lib/daytona/client"
import { db } from "@/lib/db"
import { games } from "@/lib/db/schema"

// Where the game's files live inside its sandbox. Exported so the system prompt
// names the directory the server is actually serving.
export const GAME_DIR = "/home/daytona/game"

// The port the game's static server listens on inside the sandbox. Exported so
// a caller minting a preview URL signs the port the server is actually on.
export const GAME_PORT = 3000

// Succeeds only once something is actually answering on the port, which is what
// makes it safe to skip the spawn below rather than a process-name check that
// would also match a server that died mid-boot.
const HEALTH_CHECK = `curl -sf -o /dev/null http://localhost:${GAME_PORT}/`

// What every new sandbox starts out holding. The files are kept as real files
// under lib/games/runtime rather than as strings in this module, so changing
// what a game begins as is a matter of editing files.
//
// Nothing imports them, so they only reach a deployed task because
// trigger.config.ts copies the directory into the build. That copy keeps each
// path relative to the project root, and `legacyDevProcessCwdBehaviour: false`
// puts dev's working directory in the build directory as well, so this one
// expression resolves in dev and in production alike.
const RUNTIME_DIR = join(process.cwd(), "lib", "games", "runtime")

// Copies lib/games/runtime into a sandbox's game directory, tree and all. An
// upload writes a file but does not create the directory it lands in, so every
// folder is created first — the recursive read lists a directory before its
// contents, which is the order they have to be created in.
async function seedRuntimeFiles(sandbox: Sandbox) {
  const entries = await readdir(RUNTIME_DIR, {
    recursive: true,
    withFileTypes: true,
  })

  // The sandbox is Linux, so the paths built from here on are posix ones.
  const inSandbox = (entry: (typeof entries)[number]) =>
    posix.join(GAME_DIR, relative(RUNTIME_DIR, join(entry.parentPath, entry.name)))

  await sandbox.fs.createFolder(GAME_DIR, "755")

  for (const entry of entries) {
    if (entry.isDirectory()) {
      await sandbox.fs.createFolder(inSandbox(entry), "755")
    }
  }

  await sandbox.fs.uploadFiles(
    entries
      .filter((entry) => entry.isFile())
      .map((entry) => ({
        source: join(entry.parentPath, entry.name),
        destination: inSandbox(entry),
      }))
  )
}

// Gives a game its own sandbox and seeds the runtime files into it, then records
// the sandbox id on the game so later turns can find it again.
export async function createGameSandbox(gameId: string) {
  const sandbox = await daytonaClient.create()

  await seedRuntimeFiles(sandbox)

  await db.update(games).set({ sandboxId: sandbox.id }).where(eq(games.id, gameId))

  return { sandbox }
}

// Hands back a running sandbox for a game, whatever state the game was left in.
// Tools that read or write the game's files can then treat the sandbox as a
// given rather than each re-deriving it from the row.
//
// The two cases it absorbs are a game whose thread never reached `onChatStart`,
// so nothing has created a sandbox for it yet, and the far more common one of a
// sandbox that auto-stopped between sessions — its files survive, but nothing
// runs in it until it is started again.
export async function getGameSandbox(gameId: string) {
  const [game] = await db
    .select({ sandboxId: games.sandboxId })
    .from(games)
    .where(eq(games.id, gameId))
    .limit(1)

  // A freshly created sandbox is already running and already seeded, so it can
  // be handed straight back.
  if (!game?.sandboxId) {
    return createGameSandbox(gameId)
  }

  const sandbox = await daytonaClient.get(game.sandboxId)

  if (sandbox.state !== "started") {
    await sandbox.start()
  }

  return { sandbox }
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
