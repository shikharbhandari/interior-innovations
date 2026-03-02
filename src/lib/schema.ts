import { pgTable, text, decimal, timestamp, integer, uuid, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ============================================================================
// New Tables for Multi-User Support
// ============================================================================

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  brand_color: text("brand_color").default('#eab308'),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  status: text("status").notNull().default('active'),
});

export const userProfiles = pgTable("user_profiles", {
  id: uuid("id").primaryKey(),
  email: text("email").notNull(),
  full_name: text("full_name"),
  avatar_url: text("avatar_url"),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const organizationMembers = pgTable("organization_members", {
  id: uuid("id").primaryKey().defaultRandom(),
  organization_id: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  user_id: uuid("user_id").notNull().references(() => userProfiles.id, { onDelete: 'cascade' }),
  role: text("role").notNull(),
  invited_by: uuid("invited_by").references(() => userProfiles.id),
  joined_at: timestamp("joined_at", { withTimezone: true }).defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  status: text("status").notNull().default('active'),
});

export const organizationInvitations = pgTable("organization_invitations", {
  id: uuid("id").primaryKey().defaultRandom(),
  organization_id: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  email: text("email").notNull(),
  role: text("role").notNull(),
  invited_by: uuid("invited_by").notNull().references(() => userProfiles.id),
  token: text("token").notNull().unique(),
  expires_at: timestamp("expires_at", { withTimezone: true }).notNull(),
  accepted_at: timestamp("accepted_at", { withTimezone: true }),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
  status: text("status").notNull().default('pending'),
});

// ============================================================================
// Updated Existing Tables with Multi-User Support
// ============================================================================

export const clients = pgTable("clients", {
  id: integer("id").primaryKey(),
  organization_id: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  name: text("name").notNull(),
  email: text("email").notNull(),
  phone: text("phone").notNull(),
  address: text("address").notNull(),
  contract_amount: decimal("contract_amount", { precision: 12, scale: 2 }),
  notes: text("notes"),
  status: text("status").notNull().default('active'),
  estimated_start_date: text("estimated_start_date"),
  estimated_end_date: text("estimated_end_date"),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  created_by: uuid("created_by").references(() => userProfiles.id),
  updated_by: uuid("updated_by").references(() => userProfiles.id),
});

export const vendors = pgTable("vendors", {
  id: integer("id").primaryKey(),
  organization_id: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  name: text("name").notNull(),
  email: text("email").notNull(),
  phone: text("phone").notNull(),
  category: text("category").notNull(),
  status: text("status").notNull().default('active'),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  created_by: uuid("created_by").references(() => userProfiles.id),
  updated_by: uuid("updated_by").references(() => userProfiles.id),
});

export const labors = pgTable("labors", {
  id: integer("id").primaryKey(),
  organization_id: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  name: text("name").notNull(),
  phone: text("phone").notNull(),
  specialization: text("specialization").notNull(),
  notes: text("notes"),
  status: text("status").notNull().default('active'),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  created_by: uuid("created_by").references(() => userProfiles.id),
  updated_by: uuid("updated_by").references(() => userProfiles.id),
});

export const tasks = pgTable("tasks", {
  id: integer("id").primaryKey(),
  organization_id: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  title: text("title").notNull(),
  description: text("description"),
  status: text("status").notNull(),
  due_date: timestamp("due_date", { withTimezone: true }).notNull(),
  client_id: integer("client_id").references(() => clients.id, { onDelete: 'cascade' }),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  created_by: uuid("created_by").references(() => userProfiles.id),
  updated_by: uuid("updated_by").references(() => userProfiles.id),
  assigned_to: uuid("assigned_to").references(() => userProfiles.id),
});

export const contracts = pgTable("contracts", {
  id: integer("id").primaryKey(),
  organization_id: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: 'cascade' }),
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
  created_by: uuid("created_by").references(() => userProfiles.id),
  updated_by: uuid("updated_by").references(() => userProfiles.id),
});

export const payments = pgTable("payments", {
  id: integer("id").primaryKey(),
  organization_id: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  date: timestamp("date", { withTimezone: true }).notNull(),
  type: text("type").notNull(),
  contract_id: integer("contract_id").references(() => contracts.id, { onDelete: 'cascade' }),
  client_id: integer("client_id").references(() => clients.id, { onDelete: 'cascade' }),
  description: text("description"),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  created_by: uuid("created_by").references(() => userProfiles.id),
  updated_by: uuid("updated_by").references(() => userProfiles.id),
});

export const documents = pgTable("documents", {
  id: integer("id").primaryKey(),
  organization_id: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  client_id: integer("client_id").references(() => clients.id, { onDelete: 'cascade' }),
  name: text("name").notNull(),
  description: text("description"),
  category: text("category").notNull(),
  file_path: text("file_path").notNull(),
  file_size: integer("file_size"),
  uploaded_at: timestamp("uploaded_at", { withTimezone: true }).defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  created_by: uuid("created_by").references(() => userProfiles.id),
  updated_by: uuid("updated_by").references(() => userProfiles.id),
});

// Schema definitions for inserts
export const insertClientSchema = createInsertSchema(clients)
  .omit({ id: true, created_at: true, updated_at: true, organization_id: true, created_by: true, updated_by: true });

export const insertVendorSchema = createInsertSchema(vendors)
  .omit({ id: true, created_at: true, updated_at: true, organization_id: true, created_by: true, updated_by: true });

export const insertLaborSchema = createInsertSchema(labors)
  .omit({ id: true, created_at: true, updated_at: true, organization_id: true, created_by: true, updated_by: true });

export const insertTaskSchema = createInsertSchema(tasks, {
  due_date: z.coerce.date(),
  client_id: z.union([z.coerce.number(), z.null()]).optional(),
  assigned_to: z.string().uuid().optional().nullable(),
})
  .omit({ id: true, created_at: true, updated_at: true, organization_id: true, created_by: true, updated_by: true });

export const insertContractSchema = createInsertSchema(contracts, {
  start_date: z.coerce.date(),
  end_date: z.coerce.date().optional(),
})
  .omit({ id: true, created_at: true, updated_at: true, organization_id: true, created_by: true, updated_by: true })
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
  .omit({ id: true, created_at: true, updated_at: true, organization_id: true, created_by: true, updated_by: true });

export const insertDocumentSchema = createInsertSchema(documents)
  .omit({ id: true, uploaded_at: true, updated_at: true, organization_id: true, created_by: true, updated_by: true });

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

export type Document = typeof documents.$inferSelect;
export type InsertDocument = z.infer<typeof insertDocumentSchema>;

// ============================================================================
// Financial Ledger Tables (Client Line Items)
// ============================================================================

export const clientLineItems = pgTable("client_line_items", {
  id: integer("id").primaryKey(),
  organization_id: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  client_id: integer("client_id").notNull().references(() => clients.id, { onDelete: 'cascade' }),
  // type: 'vendor' | 'labor' | 'fee'
  type: text("type").notNull().default('vendor'),
  // name: display name when vendor/labour is typed as custom (not linked to a record)
  name: text("name"),
  vendor_id: integer("vendor_id").references(() => vendors.id, { onDelete: 'set null' }),
  labor_id: integer("labor_id").references(() => labors.id, { onDelete: 'set null' }),
  description: text("description"),
  // BM: billing amount charged to client (or fee amount for 'fee' type)
  billing_amount: decimal("billing_amount", { precision: 12, scale: 2 }),
  // AM: actual amount paid to vendor/labour (null for 'fee' type)
  actual_amount: decimal("actual_amount", { precision: 12, scale: 2 }),
  // Used only for legacy records migrated from the old contracts system
  commission_amount: decimal("commission_amount", { precision: 12, scale: 2 }),
  is_legacy: boolean("is_legacy").notNull().default(false),
  legacy_contract_id: integer("legacy_contract_id"),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  created_by: uuid("created_by").references(() => userProfiles.id),
  updated_by: uuid("updated_by").references(() => userProfiles.id),
});

export const lineItemPayments = pgTable("line_item_payments", {
  id: integer("id").primaryKey(),
  organization_id: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  line_item_id: integer("line_item_id").notNull().references(() => clientLineItems.id, { onDelete: 'cascade' }),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  date: text("date").notNull(),
  description: text("description"),
  is_proxy: boolean("is_proxy").notNull().default(false),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  created_by: uuid("created_by").references(() => userProfiles.id),
  updated_by: uuid("updated_by").references(() => userProfiles.id),
});

export const insertClientLineItemSchema = z.object({
  client_id: z.number().int(),
  type: z.enum(['vendor', 'labor', 'fee']).default('vendor'),
  name: z.string().optional().nullable(),
  vendor_id: z.number().int().nullable().optional(),
  labor_id: z.number().int().nullable().optional(),
  description: z.string().optional().nullable(),
  billing_amount: z.union([z.coerce.number(), z.null()]).optional(),
  actual_amount: z.union([z.coerce.number(), z.null()]).optional(),
  commission_amount: z.union([z.coerce.number(), z.null()]).optional(),
  is_legacy: z.boolean().optional().default(false),
});

export const insertLineItemPaymentSchema = z.object({
  line_item_id: z.number().int(),
  amount: z.coerce.number().min(0),
  date: z.string(),
  description: z.string().optional().nullable(),
  is_proxy: z.boolean().default(false),
});

export type ClientLineItem = typeof clientLineItems.$inferSelect;
export type InsertClientLineItem = z.infer<typeof insertClientLineItemSchema>;

export type LineItemPayment = typeof lineItemPayments.$inferSelect;
export type InsertLineItemPayment = z.infer<typeof insertLineItemPaymentSchema>;

// ============================================================================
// Leads Management Tables
// ============================================================================

export const leadStages = pgTable("lead_stages", {
  id: uuid("id").primaryKey().defaultRandom(),
  organization_id: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  name: text("name").notNull(),
  color: text("color").notNull().default('#6b7280'),
  sort_order: integer("sort_order").notNull().default(0),
  is_won: boolean("is_won").notNull().default(false),
  is_lost: boolean("is_lost").notNull().default(false),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  created_by: uuid("created_by").references(() => userProfiles.id),
  updated_by: uuid("updated_by").references(() => userProfiles.id),
});

export const leadSources = pgTable("lead_sources", {
  id: uuid("id").primaryKey().defaultRandom(),
  organization_id: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  name: text("name").notNull(),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  created_by: uuid("created_by").references(() => userProfiles.id),
  updated_by: uuid("updated_by").references(() => userProfiles.id),
});

export const leads = pgTable("leads", {
  id: uuid("id").primaryKey().defaultRandom(),
  organization_id: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  address: text("address"),
  notes: text("notes"),
  stage_id: uuid("stage_id").references(() => leadStages.id, { onDelete: 'set null' }),
  source_id: uuid("source_id").references(() => leadSources.id, { onDelete: 'set null' }),
  assigned_to: uuid("assigned_to").references(() => userProfiles.id),
  estimated_value: decimal("estimated_value", { precision: 12, scale: 2 }),
  converted_client_id: integer("converted_client_id").references(() => clients.id, { onDelete: 'set null' }),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  created_by: uuid("created_by").references(() => userProfiles.id),
  updated_by: uuid("updated_by").references(() => userProfiles.id),
});

export const leadActivities = pgTable("lead_activities", {
  id: uuid("id").primaryKey().defaultRandom(),
  organization_id: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  lead_id: uuid("lead_id").notNull().references(() => leads.id, { onDelete: 'cascade' }),
  type: text("type").notNull(),
  summary: text("summary").notNull(),
  notes: text("notes"),
  logged_at: timestamp("logged_at", { withTimezone: true }).notNull().defaultNow(),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  created_by: uuid("created_by").references(() => userProfiles.id),
  updated_by: uuid("updated_by").references(() => userProfiles.id),
});

// Insert schemas for leads
export const insertLeadStageSchema = createInsertSchema(leadStages)
  .omit({ id: true, created_at: true, updated_at: true, organization_id: true, created_by: true, updated_by: true });

export const insertLeadSourceSchema = createInsertSchema(leadSources)
  .omit({ id: true, created_at: true, updated_at: true, organization_id: true, created_by: true, updated_by: true });

export const insertLeadSchema = createInsertSchema(leads, {
  estimated_value: z.union([z.coerce.number(), z.null()]).optional(),
  stage_id: z.string().uuid().optional().nullable(),
  source_id: z.string().uuid().optional().nullable(),
  assigned_to: z.string().uuid().optional().nullable(),
})
  .omit({ id: true, created_at: true, updated_at: true, organization_id: true, created_by: true, updated_by: true, converted_client_id: true });

export const insertLeadActivitySchema = createInsertSchema(leadActivities, {
  type: z.enum(['call_message', 'email', 'site_visit_meeting', 'note']),
  logged_at: z.coerce.date(),
})
  .omit({ id: true, created_at: true, updated_at: true, organization_id: true, created_by: true, updated_by: true });

// Type exports for leads
export type LeadStage = typeof leadStages.$inferSelect;
export type InsertLeadStage = z.infer<typeof insertLeadStageSchema>;

export type LeadSource = typeof leadSources.$inferSelect;
export type InsertLeadSource = z.infer<typeof insertLeadSourceSchema>;

export type Lead = typeof leads.$inferSelect;
export type InsertLead = z.infer<typeof insertLeadSchema>;

export type LeadActivity = typeof leadActivities.$inferSelect;
export type InsertLeadActivity = z.infer<typeof insertLeadActivitySchema>;

// ============================================================================
// Project Stages Tables
// ============================================================================

export const organizationProjectStages = pgTable("organization_project_stages", {
  id: integer("id").primaryKey(),
  organization_id: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  name: text("name").notNull(),
  display_order: integer("display_order").notNull().default(0),
  fee_percentage: decimal("fee_percentage", { precision: 5, scale: 2 }).notNull().default('0'),
  color: text("color").notNull().default('#6b7280'),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const projectStages = pgTable("project_stages", {
  id: integer("id").primaryKey(),
  client_id: integer("client_id").notNull().references(() => clients.id, { onDelete: 'cascade' }),
  organization_id: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  name: text("name").notNull(),
  display_order: integer("display_order").notNull().default(0),
  fee_percentage: decimal("fee_percentage", { precision: 5, scale: 2 }).notNull().default('0'),
  target_date: text("target_date"),
  status: text("status").notNull().default('not_started'),
  is_completed: boolean("is_completed").notNull().default(false),
  completed_at: timestamp("completed_at", { withTimezone: true }),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const insertOrganizationProjectStageSchema = z.object({
  name: z.string().min(1, "Name is required"),
  display_order: z.number().int().default(0),
  fee_percentage: z.coerce.number().min(0).max(100),
  color: z.string().default('#6b7280'),
});

export const insertProjectStageSchema = z.object({
  client_id: z.number().int(),
  name: z.string().min(1, "Name is required"),
  display_order: z.number().int().default(0),
  fee_percentage: z.coerce.number().min(0).max(100),
  target_date: z.string().optional().nullable(),
  status: z.enum(['not_started', 'in_progress', 'completed']).default('not_started'),
  is_completed: z.boolean().default(false),
});

export type OrganizationProjectStage = typeof organizationProjectStages.$inferSelect;
export type InsertOrganizationProjectStage = z.infer<typeof insertOrganizationProjectStageSchema>;

export type ProjectStage = typeof projectStages.$inferSelect;
export type InsertProjectStage = z.infer<typeof insertProjectStageSchema>;

// ============================================================================
// Designer Fees Tables
// ============================================================================

export const designerFees = pgTable("designer_fees", {
  id: integer("id").primaryKey(),
  client_id: integer("client_id").notNull().references(() => clients.id, { onDelete: 'cascade' }),
  organization_id: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  description: text("description").notNull().default('Designer Fee'),
  billing_amount: decimal("billing_amount", { precision: 12, scale: 2 }).notNull().default('0'),
  is_legacy: boolean("is_legacy").notNull().default(false),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  created_by: uuid("created_by").references(() => userProfiles.id),
  updated_by: uuid("updated_by").references(() => userProfiles.id),
});

export const designerFeePayments = pgTable("designer_fee_payments", {
  id: integer("id").primaryKey(),
  designer_fee_id: integer("designer_fee_id").notNull().references(() => designerFees.id, { onDelete: 'cascade' }),
  organization_id: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull().default('0'),
  date: text("date").notNull(),
  description: text("description"),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  created_by: uuid("created_by").references(() => userProfiles.id),
  updated_by: uuid("updated_by").references(() => userProfiles.id),
});

export const insertDesignerFeeSchema = z.object({
  client_id: z.number().int(),
  description: z.string().min(1, "Description is required").default('Designer Fee'),
  billing_amount: z.coerce.number().min(0, "Amount must be non-negative"),
});

export const insertDesignerFeePaymentSchema = z.object({
  designer_fee_id: z.number().int(),
  amount: z.coerce.number().min(0.01, "Amount is required"),
  date: z.string().min(1, "Date is required"),
  description: z.string().optional().nullable(),
});

export type DesignerFee = typeof designerFees.$inferSelect;
export type InsertDesignerFee = z.infer<typeof insertDesignerFeeSchema>;

export type DesignerFeePayment = typeof designerFeePayments.$inferSelect;
export type InsertDesignerFeePayment = z.infer<typeof insertDesignerFeePaymentSchema>;
