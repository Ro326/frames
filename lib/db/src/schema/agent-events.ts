import { pgTable, serial, integer, text, jsonb, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { usersTable } from "./users";

export const agentEventsTable = pgTable("agent_events", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  agentName: text("agent_name").notNull(),
  inputSummary: text("input_summary").notNull(),
  outputJson: jsonb("output_json").notNull(),
  humanDecision: text("human_decision"),
  timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
});
export const insertAgentEventSchema = createInsertSchema(agentEventsTable).omit({ id: true, timestamp: true });
export type AgentEvent = typeof agentEventsTable.$inferSelect;
