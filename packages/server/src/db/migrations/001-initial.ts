/**
 * Initial migration — creates all CRM tables, indexes, and triggers.
 */
import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  // Enable trigram extension for fuzzy text search
  await sql`CREATE EXTENSION IF NOT EXISTS pg_trgm`.execute(db);

  // Auto-update updated_at trigger function
  await sql`
    CREATE OR REPLACE FUNCTION trigger_set_updated_at()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = now();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `.execute(db);

  // ═══════════════════════════════════════════
  // USERS (internal team members, Google OAuth)
  // ═══════════════════════════════════════════
  await db.schema
    .createTable("users")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("email", "text", (col) => col.notNull().unique())
    .addColumn("google_id", "text", (col) => col.unique())
    .addColumn("avatar_url", "text")
    .addColumn("role", "text", (col) => col.notNull().defaultTo("member"))
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("updated_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await sql`CREATE TRIGGER set_updated_at_users BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at()`.execute(db);

  // ═══════════════════════════════════════════
  // COMPANIES
  // ═══════════════════════════════════════════
  await db.schema
    .createTable("companies")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("domain", "text", (col) => col.unique())
    .addColumn("industry", "text")
    .addColumn("size", "text")
    .addColumn("location", "text")
    .addColumn("website_url", "text")
    .addColumn("linkedin_url", "text")
    .addColumn("source", "text")
    .addColumn("description", "text")
    .addColumn("tech_stack", "text")
    .addColumn("funding_stage", "text")
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("updated_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await sql`CREATE TRIGGER set_updated_at_companies BEFORE UPDATE ON companies
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at()`.execute(db);
  await sql`CREATE INDEX idx_companies_domain ON companies(domain) WHERE domain IS NOT NULL`.execute(db);
  await sql`CREATE INDEX idx_companies_name_trgm ON companies USING gin(name gin_trgm_ops)`.execute(db);

  // ═══════════════════════════════════════════
  // COMPANY_OWNERS (many-to-many)
  // ═══════════════════════════════════════════
  await db.schema
    .createTable("company_owners")
    .addColumn("company_id", "uuid", (col) => col.notNull().references("companies.id").onDelete("cascade"))
    .addColumn("user_id", "uuid", (col) => col.notNull().references("users.id").onDelete("cascade"))
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addPrimaryKeyConstraint("pk_company_owners", ["company_id", "user_id"])
    .execute();

  // ═══════════════════════════════════════════
  // CONTACTS (central entity — one person)
  // ═══════════════════════════════════════════
  await db.schema
    .createTable("contacts")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("email", "text")
    .addColumn("phone", "text")
    .addColumn("title", "text")
    .addColumn("linkedin_url", "text")
    .addColumn("company_id", "uuid", (col) => col.references("companies.id").onDelete("set null"))
    .addColumn("source", "text", (col) => col.notNull())
    .addColumn("funnel_stage", "text", (col) => col.notNull().defaultTo("new"))
    .addColumn("is_canvas_user", "boolean", (col) => col.notNull().defaultTo(false))
    .addColumn("is_sketch_user", "boolean", (col) => col.notNull().defaultTo(false))
    .addColumn("uses_services", "boolean", (col) => col.notNull().defaultTo(false))
    .addColumn("canvas_signup_date", "timestamptz")
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("updated_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await sql`CREATE TRIGGER set_updated_at_contacts BEFORE UPDATE ON contacts
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at()`.execute(db);

  // Dedup indexes (unique where not null, case-insensitive)
  await sql`CREATE UNIQUE INDEX idx_contacts_email_unique ON contacts(lower(email)) WHERE email IS NOT NULL`.execute(db);
  await sql`CREATE UNIQUE INDEX idx_contacts_linkedin_unique ON contacts(lower(linkedin_url)) WHERE linkedin_url IS NOT NULL`.execute(db);

  // Query indexes
  await sql`CREATE INDEX idx_contacts_company ON contacts(company_id)`.execute(db);
  await sql`CREATE INDEX idx_contacts_funnel_stage ON contacts(funnel_stage)`.execute(db);
  await sql`CREATE INDEX idx_contacts_source ON contacts(source)`.execute(db);
  await sql`CREATE INDEX idx_contacts_is_canvas_user ON contacts(is_canvas_user) WHERE is_canvas_user = true`.execute(db);
  await sql`CREATE INDEX idx_contacts_is_sketch_user ON contacts(is_sketch_user) WHERE is_sketch_user = true`.execute(db);
  await sql`CREATE INDEX idx_contacts_name_trgm ON contacts USING gin(name gin_trgm_ops)`.execute(db);

  // ═══════════════════════════════════════════
  // CONTACT_OWNERS (many-to-many)
  // ═══════════════════════════════════════════
  await db.schema
    .createTable("contact_owners")
    .addColumn("contact_id", "uuid", (col) => col.notNull().references("contacts.id").onDelete("cascade"))
    .addColumn("user_id", "uuid", (col) => col.notNull().references("users.id").onDelete("cascade"))
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addPrimaryKeyConstraint("pk_contact_owners", ["contact_id", "user_id"])
    .execute();

  // ═══════════════════════════════════════════
  // EMAILS
  // ═══════════════════════════════════════════
  await db.schema
    .createTable("emails")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("contact_id", "uuid", (col) => col.notNull().references("contacts.id").onDelete("cascade"))
    .addColumn("subject", "text")
    .addColumn("body", "text")
    .addColumn("from_email", "text")
    .addColumn("to_email", "text")
    .addColumn("cc", "text")
    .addColumn("bcc", "text")
    .addColumn("thread_id", "text")
    .addColumn("in_reply_to", "text")
    .addColumn("direction", "text", (col) => col.notNull().defaultTo("outbound"))
    .addColumn("sent_at", "timestamptz", (col) => col.notNull())
    .addColumn("source", "text", (col) => col.notNull())
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("updated_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await sql`CREATE TRIGGER set_updated_at_emails BEFORE UPDATE ON emails
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at()`.execute(db);
  await sql`CREATE INDEX idx_emails_contact ON emails(contact_id)`.execute(db);
  await sql`CREATE INDEX idx_emails_thread ON emails(thread_id) WHERE thread_id IS NOT NULL`.execute(db);
  await sql`CREATE INDEX idx_emails_sent_at ON emails(sent_at DESC)`.execute(db);

  // ═══════════════════════════════════════════
  // LINKEDIN MESSAGES
  // ═══════════════════════════════════════════
  await db.schema
    .createTable("linkedin_messages")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("contact_id", "uuid", (col) => col.notNull().references("contacts.id").onDelete("cascade"))
    .addColumn("message_text", "text")
    .addColumn("conversation_id", "text")
    .addColumn("aimfox_message_id", "text")
    .addColumn("connection_status", "text")
    .addColumn("direction", "text", (col) => col.notNull().defaultTo("outbound"))
    .addColumn("sent_at", "timestamptz", (col) => col.notNull())
    .addColumn("source", "text", (col) => col.notNull().defaultTo("aimfox"))
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("updated_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await sql`CREATE TRIGGER set_updated_at_linkedin_messages BEFORE UPDATE ON linkedin_messages
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at()`.execute(db);
  await sql`CREATE INDEX idx_linkedin_messages_contact ON linkedin_messages(contact_id)`.execute(db);
  await sql`CREATE INDEX idx_linkedin_messages_conversation ON linkedin_messages(conversation_id) WHERE conversation_id IS NOT NULL`.execute(db);
  await sql`CREATE INDEX idx_linkedin_messages_sent_at ON linkedin_messages(sent_at DESC)`.execute(db);
  await sql`CREATE UNIQUE INDEX idx_linkedin_messages_aimfox_id ON linkedin_messages(aimfox_message_id) WHERE aimfox_message_id IS NOT NULL`.execute(db);

  // ═══════════════════════════════════════════
  // MEETINGS
  // ═══════════════════════════════════════════
  await db.schema
    .createTable("meetings")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("contact_id", "uuid", (col) => col.notNull().references("contacts.id").onDelete("cascade"))
    .addColumn("title", "text")
    .addColumn("description", "text")
    .addColumn("location", "text")
    .addColumn("meeting_link", "text")
    .addColumn("start_time", "timestamptz", (col) => col.notNull())
    .addColumn("end_time", "timestamptz")
    .addColumn("attendees", "text")
    .addColumn("notes", "text")
    .addColumn("calendar_event_id", "text")
    .addColumn("source", "text", (col) => col.notNull().defaultTo("google_calendar"))
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("updated_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await sql`CREATE TRIGGER set_updated_at_meetings BEFORE UPDATE ON meetings
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at()`.execute(db);
  await sql`CREATE INDEX idx_meetings_contact ON meetings(contact_id)`.execute(db);
  await sql`CREATE INDEX idx_meetings_start_time ON meetings(start_time DESC)`.execute(db);
  await sql`CREATE UNIQUE INDEX idx_meetings_calendar_event_id ON meetings(calendar_event_id) WHERE calendar_event_id IS NOT NULL`.execute(db);

  // ═══════════════════════════════════════════
  // NOTES (manual notes / internal comments)
  // ═══════════════════════════════════════════
  await db.schema
    .createTable("notes")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("contact_id", "uuid", (col) => col.notNull().references("contacts.id").onDelete("cascade"))
    .addColumn("title", "text")
    .addColumn("content", "text", (col) => col.notNull())
    .addColumn("created_by", "uuid", (col) => col.references("users.id").onDelete("set null"))
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("updated_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await sql`CREATE TRIGGER set_updated_at_notes BEFORE UPDATE ON notes
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at()`.execute(db);
  await sql`CREATE INDEX idx_notes_contact ON notes(contact_id)`.execute(db);
  await sql`CREATE INDEX idx_notes_created_by ON notes(created_by) WHERE created_by IS NOT NULL`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("notes").ifExists().execute();
  await db.schema.dropTable("meetings").ifExists().execute();
  await db.schema.dropTable("linkedin_messages").ifExists().execute();
  await db.schema.dropTable("emails").ifExists().execute();
  await db.schema.dropTable("contact_owners").ifExists().execute();
  await db.schema.dropTable("contacts").ifExists().execute();
  await db.schema.dropTable("company_owners").ifExists().execute();
  await db.schema.dropTable("companies").ifExists().execute();
  await db.schema.dropTable("users").ifExists().execute();
  await sql`DROP FUNCTION IF EXISTS trigger_set_updated_at`.execute(db);
}
