import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const games = pgTable("games", {
  id: uuid("id").defaultRandom().primaryKey(),
  // Clerk organization id that owns this game.
  orgId: text("org_id").notNull(),
  title: text("title").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});
