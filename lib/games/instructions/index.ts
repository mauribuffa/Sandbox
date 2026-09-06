import type { SystemModelMessage } from "ai"

import { engineInstructions } from "@/lib/games/instructions/engine"
import { runtimeInstructions } from "@/lib/games/instructions/runtime"
import { workflowInstructions } from "@/lib/games/instructions/workflow"

// `streamText` takes an array of system messages, so the prompt is assembled
// rather than concatenated into one string: each block stays a file that can be
// read, rewritten or reordered on its own.
//
// The order is what a turn needs to know, in the order it needs to know it: the
// shape of the work, then what the machine will run, then what is already in the
// sandbox to build with.
export const gameInstructions: SystemModelMessage[] = [
  workflowInstructions,
  runtimeInstructions,
  engineInstructions,
]
