import type { UIMessage } from "ai";
import { sql } from "drizzle-orm";
import { jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const games = pgTable("games", {
  id: uuid("id").defaultRandom().primaryKey(),
  // Clerk organization id that owns this game.
  orgId: text("org_id").notNull(),
  title: text("title").notNull(),
  // The game's chat thread, stored in the `useChat` UIMessage format so it can
  // be handed straight back to the client. One game, one thread.
  messages: jsonb("messages").$type<UIMessage[]>().notNull().default(sql`'[]'::jsonb`),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});
