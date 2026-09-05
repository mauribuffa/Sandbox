import "server-only";

import { drizzle } from "drizzle-orm/neon-http";

import * as schema from "./schema";

// App queries use the pooled connection (DATABASE_URL). The neon-http driver
// runs each query over HTTP; for interactive transactions switch to
// drizzle-orm/neon-serverless (WebSocket).
export const db = drizzle(process.env.DATABASE_URL!, { schema });
