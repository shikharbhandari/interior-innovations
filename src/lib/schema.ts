import { pgTable, text, decimal, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const clients = pgTable("clients", {
  id: integer("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  phone: text("phone").notNull(),
  address: text("address").notNull(),
  contract_amount: decimal("contract_amount", { precision: 12, scale: 2 }),
  notes: text("notes"),
  status: text("status").notNull().default('active'),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const vendors = pgTable("vendors", {
  id: integer("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  phone: text("phone").notNull(),
  category: text("category").notNull(),
  status: text("status").notNull().default('active'),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const labors = pgTable("labors", {
  id: integer("id").primaryKey(),
  name: text("name").notNull(),
  phone: text("phone").notNull(),
  specialization: text("specialization").notNull(),
  notes: text("notes"),
  status: text("status").notNull().default('active'),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const tasks = pgTable("tasks", {
  id: integer("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  status: text("status").notNull(),
  due_date: timestamp("due_date", { withTimezone: true }).notNull(),
  client_id: integer("client_id").references(() => clients.id, { onDelete: 'cascade' }),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const contracts = pgTable("contracts", {
  id: integer("id").primaryKey(),
  client_id: integer("client_id").references(() => clients.id, { onDelete: 'cascade' }).notNull(),
  vendor_id: integer("vendor_id").references(() => vendors.id, { onDelete: 'cascade' }),
  labor_id: integer("labor_id").references(() => labors.id, { onDelete: 'cascade' }),
  title: text("title").notNull(),
  description: text("description"),
  contract_amount: decimal("contract_amount", { precision: 12, scale: 2 }).notNull(),
  commission_percentage: decimal("commission_percentage", { precision: 5, scale: 2 }).notNull(),
  commission_amount: decimal("commission_amount", { precision: 12, scale: 2 }).notNull(),
  status: text("status").notNull().default('active'),
  start_date: timestamp("start_date", { withTimezone: true }).notNull(),
  end_date: timestamp("end_date", { withTimezone: true }),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const payments = pgTable("payments", {
  id: integer("id").primaryKey(),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  date: timestamp("date", { withTimezone: true }).notNull(),
  type: text("type").notNull(),
  contract_id: integer("contract_id").references(() => contracts.id, { onDelete: 'cascade' }),
  description: text("description"),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// Schema definitions for inserts
export const insertClientSchema = createInsertSchema(clients)
  .omit({ id: true, created_at: true, updated_at: true });

export const insertVendorSchema = createInsertSchema(vendors)
  .omit({ id: true, created_at: true, updated_at: true });

export const insertLaborSchema = createInsertSchema(labors)
  .omit({ id: true, created_at: true, updated_at: true });

export const insertTaskSchema = createInsertSchema(tasks, {
  due_date: z.coerce.date(),
  client_id: z.union([z.coerce.number(), z.null()]).optional(),
})
  .omit({ id: true, created_at: true, updated_at: true });

export const insertContractSchema = createInsertSchema(contracts, {
  start_date: z.coerce.date(),
  end_date: z.coerce.date().optional(),
})
  .omit({ id: true, created_at: true, updated_at: true })
  .refine(
    data => !(data.vendor_id && data.labor_id),
    { message: "Contract must be either with a vendor or a labor, not both" }
  )
  .refine(
    data => data.vendor_id || data.labor_id,
    { message: "Contract must have either a vendor or a labor" }
  );

export const insertPaymentSchema = createInsertSchema(payments, {
  date: z.coerce.date(),
})
  .omit({ id: true, created_at: true, updated_at: true });

// Type definitions
export type Client = typeof clients.$inferSelect;
export type InsertClient = z.infer<typeof insertClientSchema>;

export type Vendor = typeof vendors.$inferSelect;
export type InsertVendor = z.infer<typeof insertVendorSchema>;

export type Labor = typeof labors.$inferSelect;
export type InsertLabor = z.infer<typeof insertLaborSchema>;

export type Task = typeof tasks.$inferSelect;
export type InsertTask = z.infer<typeof insertTaskSchema>;

export type Contract = typeof contracts.$inferSelect;
export type InsertContract = z.infer<typeof insertContractSchema>;

export type Payment = typeof payments.$inferSelect;
export type InsertPayment = z.infer<typeof insertPaymentSchema>;