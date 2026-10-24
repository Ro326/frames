import { pgTable, serial, integer, text, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { usersTable } from "./users";

export const projectsTable = pgTable("projects", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  title: text("title").notNull(),
  brief: text("brief").notNull(),
  niche: text("niche").notNull(),
  targetLength: integer("target_length").notNull(),
  vibe: text("vibe").notNull(),
  manual: boolean("manual").notNull().default(false),
  shots: jsonb("shots").notNull().default([]),
  coverage: jsonb("coverage"),
  voiceover: text("voiceover").notNull().default(""),
  checklist: jsonb("checklist").notNull().default([]),
  status: text("status").notNull().default("draft"),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, precision: 3 }).notNull().defaultNow(),
});
export const insertProjectSchema = createInsertSchema(projectsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type StoredProject = typeof projectsTable.$inferSelect;
