import type { Kysely } from "kysely";
import type { DB } from "../schema.js";

export function createEmailsRepository(db: Kysely<DB>) {
  return {
    async list(opts?: { contactId?: string; limit?: number; offset?: number }) {
      let query = db
        .selectFrom("emails")
        .selectAll()
        .orderBy("sent_at", "desc");

      if (opts?.contactId !== undefined) {
        query = query.where("contact_id", "=", opts.contactId);
      }

      if (opts?.limit !== undefined) {
        query = query.limit(opts.limit);
      }

      if (opts?.offset !== undefined) {
        query = query.offset(opts.offset);
      }

      return query.execute();
    },

    async findById(id: string) {
      return db
        .selectFrom("emails")
        .selectAll()
        .where("id", "=", id)
        .executeTakeFirst();
    },

    async create(data: {
      contactId: string;
      subject?: string;
      body?: string;
      fromEmail?: string;
      toEmail?: string;
      cc?: string;
      bcc?: string;
      threadId?: string;
      inReplyTo?: string;
      direction?: string;
      sentAt: string;
      source: string;
    }) {
      return db
        .insertInto("emails")
        .values({
          contact_id: data.contactId,
          subject: data.subject ?? null,
          body: data.body ?? null,
          from_email: data.fromEmail ?? null,
          to_email: data.toEmail ?? null,
          cc: data.cc ?? null,
          bcc: data.bcc ?? null,
          thread_id: data.threadId ?? null,
          in_reply_to: data.inReplyTo ?? null,
          ...(data.direction !== undefined
            ? { direction: data.direction }
            : {}),
          sent_at: data.sentAt,
          source: data.source,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
    },

    async update(
      id: string,
      data: Partial<{
        contactId: string;
        subject: string | null;
        body: string | null;
        fromEmail: string | null;
        toEmail: string | null;
        cc: string | null;
        bcc: string | null;
        threadId: string | null;
        inReplyTo: string | null;
        direction: string;
        sentAt: string;
        source: string;
      }>,
    ) {
      const values: Record<string, unknown> = {};
      if (data.contactId !== undefined) values.contact_id = data.contactId;
      if (data.subject !== undefined) values.subject = data.subject;
      if (data.body !== undefined) values.body = data.body;
      if (data.fromEmail !== undefined) values.from_email = data.fromEmail;
      if (data.toEmail !== undefined) values.to_email = data.toEmail;
      if (data.cc !== undefined) values.cc = data.cc;
      if (data.bcc !== undefined) values.bcc = data.bcc;
      if (data.threadId !== undefined) values.thread_id = data.threadId;
      if (data.inReplyTo !== undefined) values.in_reply_to = data.inReplyTo;
      if (data.direction !== undefined) values.direction = data.direction;
      if (data.sentAt !== undefined) values.sent_at = data.sentAt;
      if (data.source !== undefined) values.source = data.source;

      if (Object.keys(values).length === 0) {
        return db
          .selectFrom("emails")
          .selectAll()
          .where("id", "=", id)
          .executeTakeFirstOrThrow();
      }

      return db
        .updateTable("emails")
        .set(values)
        .where("id", "=", id)
        .returningAll()
        .executeTakeFirstOrThrow();
    },

    async createFromGmail(data: {
      contactId: string;
      subject: string | null;
      body: string | null;
      bodyHtml: string | null;
      fromEmail: string | null;
      toEmail: string | null;
      cc: string | null;
      threadId: string | null;
      inReplyTo: string | null;
      direction: string;
      sentAt: string;
      source: string;
      gmailMessageId: string;
    }) {
      return db
        .insertInto("emails")
        .values({
          contact_id: data.contactId,
          subject: data.subject,
          body: data.body,
          body_html: data.bodyHtml,
          from_email: data.fromEmail,
          to_email: data.toEmail,
          cc: data.cc,
          bcc: null,
          thread_id: data.threadId,
          in_reply_to: data.inReplyTo,
          direction: data.direction,
          sent_at: data.sentAt,
          source: data.source,
          gmail_message_id: data.gmailMessageId,
        })
        .onConflict((oc) =>
          oc
            .column("gmail_message_id")
            .where("gmail_message_id", "is not", null)
            .doNothing(),
        )
        .returningAll()
        .executeTakeFirst(); // Returns undefined if conflict (already exists)
    },

    async remove(id: string) {
      return db
        .deleteFrom("emails")
        .where("id", "=", id)
        .returningAll()
        .executeTakeFirstOrThrow();
    },
  };
}
