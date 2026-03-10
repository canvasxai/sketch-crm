import type { Kysely } from "kysely";
import type { DB } from "../schema.js";

export function createLinkedinMessagesRepository(db: Kysely<DB>) {
  return {
    async list(opts?: {
      contactId?: string;
      conversationId?: string;
      limit?: number;
      offset?: number;
    }) {
      let query = db
        .selectFrom("linkedin_messages")
        .selectAll()
        .orderBy("sent_at", "desc");

      if (opts?.contactId !== undefined) {
        query = query.where("contact_id", "=", opts.contactId);
      }

      if (opts?.conversationId !== undefined) {
        query = query.where("conversation_id", "=", opts.conversationId);
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
        .selectFrom("linkedin_messages")
        .selectAll()
        .where("id", "=", id)
        .executeTakeFirst();
    },

    async findByAimfoxId(aimfoxId: string) {
      return db
        .selectFrom("linkedin_messages")
        .selectAll()
        .where("aimfox_message_id", "=", aimfoxId)
        .executeTakeFirst();
    },

    async create(data: {
      contactId: string;
      messageText?: string;
      conversationId?: string;
      aimfoxMessageId?: string;
      connectionStatus?: string;
      direction?: string;
      sentAt: string;
      source?: string;
    }) {
      return db
        .insertInto("linkedin_messages")
        .values({
          contact_id: data.contactId,
          message_text: data.messageText ?? null,
          conversation_id: data.conversationId ?? null,
          aimfox_message_id: data.aimfoxMessageId ?? null,
          connection_status: data.connectionStatus ?? null,
          ...(data.direction !== undefined
            ? { direction: data.direction }
            : {}),
          sent_at: data.sentAt,
          ...(data.source !== undefined ? { source: data.source } : {}),
        })
        .returningAll()
        .executeTakeFirstOrThrow();
    },

    async update(
      id: string,
      data: Partial<{
        contactId: string;
        messageText: string | null;
        conversationId: string | null;
        aimfoxMessageId: string | null;
        connectionStatus: string | null;
        direction: string;
        sentAt: string;
        source: string;
      }>,
    ) {
      const values: Record<string, unknown> = {};
      if (data.contactId !== undefined) values.contact_id = data.contactId;
      if (data.messageText !== undefined) values.message_text = data.messageText;
      if (data.conversationId !== undefined) values.conversation_id = data.conversationId;
      if (data.aimfoxMessageId !== undefined) values.aimfox_message_id = data.aimfoxMessageId;
      if (data.connectionStatus !== undefined) values.connection_status = data.connectionStatus;
      if (data.direction !== undefined) values.direction = data.direction;
      if (data.sentAt !== undefined) values.sent_at = data.sentAt;
      if (data.source !== undefined) values.source = data.source;

      if (Object.keys(values).length === 0) {
        return db
          .selectFrom("linkedin_messages")
          .selectAll()
          .where("id", "=", id)
          .executeTakeFirstOrThrow();
      }

      return db
        .updateTable("linkedin_messages")
        .set(values)
        .where("id", "=", id)
        .returningAll()
        .executeTakeFirstOrThrow();
    },

    async remove(id: string) {
      return db
        .deleteFrom("linkedin_messages")
        .where("id", "=", id)
        .returningAll()
        .executeTakeFirstOrThrow();
    },

    async bulkCreate(
      messages: Array<{
        contactId: string;
        messageText?: string;
        conversationId?: string;
        aimfoxMessageId?: string;
        connectionStatus?: string;
        direction?: string;
        sentAt: string;
        source?: string;
      }>,
    ) {
      if (messages.length === 0) return [];

      const rows = messages.map((data) => ({
        contact_id: data.contactId,
        message_text: data.messageText ?? null,
        conversation_id: data.conversationId ?? null,
        aimfox_message_id: data.aimfoxMessageId ?? null,
        connection_status: data.connectionStatus ?? null,
        ...(data.direction !== undefined ? { direction: data.direction } : {}),
        sent_at: data.sentAt,
        ...(data.source !== undefined ? { source: data.source } : {}),
      }));

      return db
        .insertInto("linkedin_messages")
        .values(rows)
        .onConflict((oc) =>
          oc
            .column("aimfox_message_id")
            .where("aimfox_message_id", "is not", null)
            .doNothing(),
        )
        .returningAll()
        .execute();
    },
  };
}
