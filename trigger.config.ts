import { additionalFiles } from "@trigger.dev/build/extensions/core";
import { defineConfig } from "@trigger.dev/sdk";

export default defineConfig({
  project: "proj_sftifyrvvbenusjkipxz",
  runtime: "node-24",
  logLevel: "log",
  // The max compute seconds a task is allowed to run. If the task run exceeds this duration, it will be stopped.
  // You can override this on an individual task.
  // See https://trigger.dev/docs/runs/max-duration
  maxDuration: 3600,
  retries: {
    enabledInDev: true,
    default: {
      maxAttempts: 3,
      minTimeoutInMs: 1000,
      maxTimeoutInMs: 10000,
      factor: 2,
      randomize: true,
    },
  },
  dirs: ["trigger"],
  // Puts a dev task's working directory in the build directory, the way a
  // deployed one's already is, so the copied paths below resolve the same in
  // both.
  legacyDevProcessCwdBehaviour: false,
  build: {
    // Nothing imports the files seeded into a new game's sandbox, so the
    // bundler never sees them — they are copied into the build verbatim,
    // keeping their path relative to this file, which is what lets
    // `RUNTIME_DIR` in lib/daytona/utils.ts find them.
    extensions: [additionalFiles({ files: ["./lib/games/runtime/**"] })],
  },
});
