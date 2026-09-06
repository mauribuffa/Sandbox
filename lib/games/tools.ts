import type { Sandbox } from "@daytona/sdk"
import { tool } from "ai"
import { posix } from "node:path"
import { z } from "zod"

import { GAME_DIR, getGameSandbox } from "@/lib/daytona/utils"

// Every path a tool is handed is resolved against the game directory and
// rejected if it lands anywhere else. `resolve` collapses `..` and treats a
// leading `/` as absolute before the check runs, so neither traversal nor an
// absolute path reaches out of the directory — while an absolute path already
// inside it, which is how the runtime prompt names `index.html`, resolves to
// itself and passes.
function resolveInGameDir(path: string) {
  const resolved = posix.resolve(GAME_DIR, path)

  if (resolved !== GAME_DIR && !resolved.startsWith(`${GAME_DIR}/`)) {
    throw new Error(
      `${path} is outside the game directory. Paths are relative to ${GAME_DIR}.`
    )
  }

  return resolved
}

// The file tools one game's chat turn runs on. They are built per turn rather
// than once per module because each set is bound to a single game: `gameId`
// picks the sandbox, and nothing the model passes can widen that.
export function createGameTools(gameId: string) {
  // Resolving the sandbox costs a database read and a Daytona round-trip, and
  // may have to start a sandbox that auto-stopped between sessions, so a turn
  // that calls four tools pays for it once rather than four times.
  let pending: Promise<Sandbox> | undefined
  const gameFiles = async () => {
    pending ??= getGameSandbox(gameId).then(({ sandbox }) => sandbox)
    return (await pending).fs
  }

  return {
    write_file: tool({
      description:
        "Write a file in the game's directory, creating it or replacing its " +
        "contents whole.",
      inputSchema: z.object({
        path: z
          .string()
          .describe('Path relative to the game directory, e.g. "index.html".'),
        content: z.string().describe("The file's complete new contents."),
      }),
      execute: async ({ path, content }) => {
        const files = await gameFiles()

        await files.uploadFile(Buffer.from(content), resolveInGameDir(path))

        return `Wrote ${Buffer.byteLength(content)} bytes to ${path}.`
      },
    }),

    replace_text: tool({
      description:
        "Replace one exact stretch of text in a file and leave the rest of it " +
        "untouched. Cheaper than rewriting a whole file for a small change.",
      inputSchema: z.object({
        path: z.string().describe("Path relative to the game directory."),
        old_text: z
          .string()
          .min(1)
          .describe(
            "The exact text to replace, whitespace and indentation included. " +
              "It has to match one place in the file and one only, so include " +
              "the surrounding lines needed to make it unique."
          ),
        new_text: z.string().describe("What to put in its place."),
      }),
      execute: async ({ path, old_text, new_text }) => {
        const files = await gameFiles()
        const resolved = resolveInGameDir(path)
        const content = (await files.downloadFile(resolved)).toString()
        const occurrences = content.split(old_text).length - 1

        // Both refusals name what to do about them, because the model sees the
        // message and gets another attempt at the edit.
        if (occurrences === 0) {
          throw new Error(
            `old_text does not appear in ${path}. Read the file and copy the ` +
              `text to replace out of it exactly.`
          )
        }

        if (occurrences > 1) {
          throw new Error(
            `old_text appears ${occurrences} times in ${path}. Extend it with ` +
              `surrounding lines until it matches one place only.`
          )
        }

        // Spliced rather than `String.replace`d: a `$&` or `$'` in game code
        // would be a substitution pattern there, and would corrupt the file.
        const index = content.indexOf(old_text)
        const updated =
          content.slice(0, index) +
          new_text +
          content.slice(index + old_text.length)

        await files.uploadFile(Buffer.from(updated), resolved)

        return `Replaced one occurrence in ${path}.`
      },
    }),

    read_file: tool({
      description: "Read a file from the game's directory.",
      inputSchema: z.object({
        path: z
          .string()
          .describe('Path relative to the game directory, e.g. "index.html".'),
      }),
      execute: async ({ path }) => {
        const files = await gameFiles()

        return (await files.downloadFile(resolveInGameDir(path))).toString()
      },
    }),

    list_files: tool({
      description: "List what is in the game's directory.",
      inputSchema: z.object({
        path: z
          .string()
          .default(".")
          .describe(
            "Directory to list, relative to the game directory. Defaults to " +
              "the game directory itself."
          ),
      }),
      execute: async ({ path }) => {
        const files = await gameFiles()
        const resolved = resolveInGameDir(path)
        const entries = await files.listFiles(resolved)

        if (entries.length === 0) {
          return `${path} is empty.`
        }

        return entries
          .map((entry) => {
            const relative = posix.relative(
              GAME_DIR,
              entry.path ?? posix.join(resolved, entry.name)
            )

            return entry.isDir
              ? `${relative}/`
              : `${relative} (${entry.size} bytes)`
          })
          .join("\n")
      },
    }),

    delete_file: tool({
      description: "Delete a file from the game's directory.",
      inputSchema: z.object({
        path: z.string().describe("Path relative to the game directory."),
      }),
      execute: async ({ path }) => {
        const files = await gameFiles()
        const resolved = resolveInGameDir(path)

        // The one path `resolveInGameDir` allows that is not a file in the game
        // directory is the directory itself, and deleting it would take the
        // game with it.
        if (resolved === GAME_DIR) {
          throw new Error("The game directory itself cannot be deleted.")
        }

        await files.deleteFile(resolved)

        return `Deleted ${path}.`
      },
    }),
  }
}
