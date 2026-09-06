import { eq } from "drizzle-orm"

import { daytonaClient } from "@/lib/daytona/client"
import { db } from "@/lib/db"
import { games } from "@/lib/db/schema"

// Where the game's files live inside its sandbox.
const GAME_DIR = "/home/daytona/game"

// Gives a game its own sandbox and seeds a placeholder page in it, then records
// the sandbox id on the game so later turns can find it again.
export async function createGameSandbox(gameId: string) {
  const sandbox = await daytonaClient.create()

  await sandbox.fs.createFolder(GAME_DIR, "755")
  await sandbox.fs.uploadFile(Buffer.from("New game"), `${GAME_DIR}/index.html`)

  await db.update(games).set({ sandboxId: sandbox.id }).where(eq(games.id, gameId))

  return sandbox
}
