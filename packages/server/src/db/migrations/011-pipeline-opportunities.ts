/**
 * Migration 011: Pipeline & Opportunities redesign.
 *
 * - Add company-level pipeline classification (uncategorized | sales | client | muted | hiring)
 * - Add contact-level pipeline override (for person-centric classifications like hiring)
 * - Remove contacts.funnel_stage (replaced by company pipeline + opportunities)
 * - Create configurable product pipelines + stages (Services, Canvas, Sketch)
 * - Create opportunities table (deals linked to company + pipeline + stage)
 * - Create opportunity_stage_changes audit trail
 * - Rename vendor_domains → muted_domains
 * - Add opportunity_id to tasks
 * - Drop stage_changes table (replaced by opportunity_stage_changes)
 */

import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  // ── 1. Company pipeline classification ──

  await db.schema
    .alterTable("companies")
    .addColumn("pipeline", "text", (col) => col.notNull().defaultTo("uncategorized"))
    .execute();

  await sql`CREATE INDEX idx_companies_pipeline ON companies(pipeline)`.execute(db);

  // ── 2. Contact pipeline override ──

  await db.schema
    .alterTable("contacts")
    .addColumn("pipeline", "text", (col) => col.defaultTo(null))
    .execute();

  // ── 3. Remove funnel_stage from contacts ──

  await sql`DROP INDEX IF EXISTS idx_contacts_funnel_stage`.execute(db);
  await db.schema.alterTable("contacts").dropColumn("funnel_stage").execute();

  // ── 4. Configurable product pipelines ──

  await db.schema
    .createTable("pipelines")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("name", "text", (col) => col.notNull().unique())
    .addColumn("position", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("updated_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await sql`
    CREATE TRIGGER set_updated_at_pipelines
    BEFORE UPDATE ON pipelines
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at()
  `.execute(db);

  // ── 5. Configurable pipeline stages ──

  await db.schema
    .createTable("pipeline_stages")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("pipeline_id", "uuid", (col) => col.notNull().references("pipelines.id").onDelete("cascade"))
    .addColumn("label", "text", (col) => col.notNull())
    .addColumn("stage_type", "text", (col) => col.notNull().defaultTo("active"))
    .addColumn("position", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("updated_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await sql`CREATE INDEX idx_pipeline_stages_pipeline ON pipeline_stages(pipeline_id)`.execute(db);

  await sql`
    CREATE TRIGGER set_updated_at_pipeline_stages
    BEFORE UPDATE ON pipeline_stages
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at()
  `.execute(db);

  // ── 6. Opportunities ──

  await db.schema
    .createTable("opportunities")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("company_id", "uuid", (col) => col.references("companies.id").onDelete("cascade"))
    .addColumn("contact_id", "uuid", (col) => col.references("contacts.id").onDelete("set null"))
    .addColumn("pipeline_id", "uuid", (col) => col.notNull().references("pipelines.id"))
    .addColumn("stage_id", "uuid", (col) => col.notNull().references("pipeline_stages.id"))
    .addColumn("title", "text")
    .addColumn("value", "integer")
    .addColumn("value_period", "text")
    .addColumn("confidence", "integer")
    .addColumn("close_date", "timestamptz")
    .addColumn("owner_id", "uuid", (col) => col.references("users.id").onDelete("set null"))
    .addColumn("notes", "text")
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("updated_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await sql`CREATE INDEX idx_opportunities_company ON opportunities(company_id)`.execute(db);
  await sql`CREATE INDEX idx_opportunities_contact ON opportunities(contact_id)`.execute(db);
  await sql`CREATE INDEX idx_opportunities_pipeline ON opportunities(pipeline_id)`.execute(db);
  await sql`CREATE INDEX idx_opportunities_stage ON opportunities(stage_id)`.execute(db);
  await sql`CREATE INDEX idx_opportunities_owner ON opportunities(owner_id)`.execute(db);

  await sql`
    CREATE TRIGGER set_updated_at_opportunities
    BEFORE UPDATE ON opportunities
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at()
  `.execute(db);

  // ── 7. Opportunity stage changes (audit trail) ──

  await sql`DROP TABLE IF EXISTS stage_changes`.execute(db);

  await db.schema
    .createTable("opportunity_stage_changes")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("opportunity_id", "uuid", (col) =>
      col.notNull().references("opportunities.id").onDelete("cascade"),
    )
    .addColumn("from_stage_id", "uuid", (col) => col.references("pipeline_stages.id"))
    .addColumn("to_stage_id", "uuid", (col) => col.notNull().references("pipeline_stages.id"))
    .addColumn("changed_by", "uuid", (col) => col.references("users.id").onDelete("set null"))
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await sql`CREATE INDEX idx_opp_stage_changes_opportunity ON opportunity_stage_changes(opportunity_id)`.execute(db);
  await sql`CREATE INDEX idx_opp_stage_changes_created ON opportunity_stage_changes(created_at DESC)`.execute(db);

  // ── 8. Rename vendor_domains → muted_domains ──

  await sql`DROP TRIGGER IF EXISTS set_updated_at_vendor_domains ON vendor_domains`.execute(db);
  await sql`ALTER TABLE vendor_domains RENAME TO muted_domains`.execute(db);
  await sql`
    CREATE TRIGGER set_updated_at_muted_domains
    BEFORE UPDATE ON muted_domains
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at()
  `.execute(db);

  // ── 9. Add opportunity_id to tasks ──

  await db.schema
    .alterTable("tasks")
    .addColumn("opportunity_id", "uuid", (col) => col.references("opportunities.id").onDelete("set null"))
    .execute();

  await sql`CREATE INDEX idx_tasks_opportunity_id ON tasks(opportunity_id)`.execute(db);

  // ── 10. Seed default pipelines and stages ──

  // Services pipeline
  const servicesPipeline = await db
    .insertInto("pipelines")
    .values({ name: "Services", position: 0 })
    .returning("id")
    .executeTakeFirstOrThrow();

  const servicesStages = [
    { label: "Lead", stage_type: "active", position: 0 },
    { label: "Qualified", stage_type: "active", position: 1 },
    { label: "Proposal", stage_type: "active", position: 2 },
    { label: "Negotiation", stage_type: "active", position: 3 },
    { label: "Won", stage_type: "won", position: 4 },
    { label: "Lost", stage_type: "lost", position: 5 },
  ];
  for (const stage of servicesStages) {
    await db
      .insertInto("pipeline_stages")
      .values({ pipeline_id: servicesPipeline.id, ...stage })
      .execute();
  }

  // Canvas pipeline
  const canvasPipeline = await db
    .insertInto("pipelines")
    .values({ name: "Canvas", position: 1 })
    .returning("id")
    .executeTakeFirstOrThrow();

  const canvasStages = [
    { label: "Lead", stage_type: "active", position: 0 },
    { label: "Qualified", stage_type: "active", position: 1 },
    { label: "Demo Scheduled", stage_type: "active", position: 2 },
    { label: "Demo Done", stage_type: "active", position: 3 },
    { label: "Trial", stage_type: "active", position: 4 },
    { label: "Won", stage_type: "won", position: 5 },
    { label: "Lost", stage_type: "lost", position: 6 },
  ];
  for (const stage of canvasStages) {
    await db
      .insertInto("pipeline_stages")
      .values({ pipeline_id: canvasPipeline.id, ...stage })
      .execute();
  }

  // Sketch pipeline
  const sketchPipeline = await db
    .insertInto("pipelines")
    .values({ name: "Sketch", position: 2 })
    .returning("id")
    .executeTakeFirstOrThrow();

  const sketchStages = [
    { label: "Lead", stage_type: "active", position: 0 },
    { label: "Qualified", stage_type: "active", position: 1 },
    { label: "Pilot", stage_type: "active", position: 2 },
    { label: "Won", stage_type: "won", position: 3 },
    { label: "Lost", stage_type: "lost", position: 4 },
  ];
  for (const stage of sketchStages) {
    await db
      .insertInto("pipeline_stages")
      .values({ pipeline_id: sketchPipeline.id, ...stage })
      .execute();
  }
}

export async function down(db: Kysely<any>): Promise<void> {
  // Remove opportunity_id from tasks
  await sql`DROP INDEX IF EXISTS idx_tasks_opportunity_id`.execute(db);
  await db.schema.alterTable("tasks").dropColumn("opportunity_id").execute();

  // Rename muted_domains → vendor_domains
  await sql`DROP TRIGGER IF EXISTS set_updated_at_muted_domains ON muted_domains`.execute(db);
  await sql`ALTER TABLE muted_domains RENAME TO vendor_domains`.execute(db);
  await sql`
    CREATE TRIGGER set_updated_at_vendor_domains
    BEFORE UPDATE ON vendor_domains
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at()
  `.execute(db);

  // Drop opportunity_stage_changes
  await sql`DROP INDEX IF EXISTS idx_opp_stage_changes_opportunity`.execute(db);
  await sql`DROP INDEX IF EXISTS idx_opp_stage_changes_created`.execute(db);
  await db.schema.dropTable("opportunity_stage_changes").ifExists().execute();

  // Drop opportunities
  await sql`DROP INDEX IF EXISTS idx_opportunities_company`.execute(db);
  await sql`DROP INDEX IF EXISTS idx_opportunities_contact`.execute(db);
  await sql`DROP INDEX IF EXISTS idx_opportunities_pipeline`.execute(db);
  await sql`DROP INDEX IF EXISTS idx_opportunities_stage`.execute(db);
  await sql`DROP INDEX IF EXISTS idx_opportunities_owner`.execute(db);
  await sql`DROP TRIGGER IF EXISTS set_updated_at_opportunities ON opportunities`.execute(db);
  await db.schema.dropTable("opportunities").ifExists().execute();

  // Drop pipeline_stages
  await sql`DROP INDEX IF EXISTS idx_pipeline_stages_pipeline`.execute(db);
  await sql`DROP TRIGGER IF EXISTS set_updated_at_pipeline_stages ON pipeline_stages`.execute(db);
  await db.schema.dropTable("pipeline_stages").ifExists().execute();

  // Drop pipelines
  await sql`DROP TRIGGER IF EXISTS set_updated_at_pipelines ON pipelines`.execute(db);
  await db.schema.dropTable("pipelines").ifExists().execute();

  // Restore funnel_stage on contacts
  await db.schema
    .alterTable("contacts")
    .addColumn("funnel_stage", "text", (col) => col.notNull().defaultTo("new"))
    .execute();
  await sql`CREATE INDEX idx_contacts_funnel_stage ON contacts(funnel_stage)`.execute(db);

  // Remove pipeline from contacts
  await db.schema.alterTable("contacts").dropColumn("pipeline").execute();

  // Remove pipeline from companies
  await sql`DROP INDEX IF EXISTS idx_companies_pipeline`.execute(db);
  await db.schema.alterTable("companies").dropColumn("pipeline").execute();

  // Restore stage_changes
  await db.schema
    .createTable("stage_changes")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("contact_id", "uuid", (col) => col.notNull().references("contacts.id").onDelete("cascade"))
    .addColumn("from_stage", "text", (col) => col.notNull())
    .addColumn("to_stage", "text", (col) => col.notNull())
    .addColumn("changed_by", "uuid", (col) => col.references("users.id").onDelete("set null"))
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute();
  await sql`CREATE INDEX idx_stage_changes_contact_id ON stage_changes(contact_id)`.execute(db);
  await sql`CREATE INDEX idx_stage_changes_created_at ON stage_changes(created_at DESC)`.execute(db);
}
