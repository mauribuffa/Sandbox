import type { SystemModelMessage } from "ai"

import { runtimeInstructions } from "@/lib/games/instructions/runtime"
import { workflowInstructions } from "@/lib/games/instructions/workflow"

// `streamText` takes an array of system messages, so the prompt is assembled
// rather than concatenated into one string: each block stays a file that can be
// read, rewritten or reordered on its own.
export const gameInstructions: SystemModelMessage[] = [
  workflowInstructions,
  runtimeInstructions,
]
