import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { usersTable } from "./users";

export const paymentsTable = pgTable("payments", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  merchantReference: text("merchant_reference").notNull().unique(),
  orderId: text("order_id").unique(),
  amount: integer("amount").notNull().default(4900),
  currency: text("currency").notNull().default("INR"),
  environment: text("environment").notNull().default("uat"),
  status: text("status").notNull().default("CREATING"),
  checkoutUrl: text("checkout_url"),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export const insertPaymentSchema = createInsertSchema(paymentsTable).omit({ id: true, createdAt: true });
export type StoredPayment = typeof paymentsTable.$inferSelect;
