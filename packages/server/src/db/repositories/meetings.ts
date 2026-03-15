import type { Kysely } from "kysely";
import type { DB } from "../schema.js";

export function createMeetingsRepository(db: Kysely<DB>) {
  return {
    async list(opts?: {
      contactId?: string;
      limit?: number;
      offset?: number;
    }) {
      let query = db
        .selectFrom("meetings")
        .selectAll()
        .orderBy("start_time", "desc");

      if (opts?.contactId !== undefined) {
        query = query.where((eb) =>
          eb.or([
            eb("meetings.contact_id", "=", opts.contactId!),
            eb.exists(
              eb.selectFrom("meeting_contacts")
                .select("meeting_contacts.meeting_id")
                .whereRef("meeting_contacts.meeting_id", "=", "meetings.id")
                .where("meeting_contacts.contact_id", "=", opts.contactId!),
            ),
          ]),
        );
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
        .selectFrom("meetings")
        .selectAll()
        .where("id", "=", id)
        .executeTakeFirst();
    },

    async findByCalendarEventId(calendarEventId: string) {
      return db
        .selectFrom("meetings")
        .selectAll()
        .where("calendar_event_id", "=", calendarEventId)
        .executeTakeFirst();
    },

    async findByFirefliesTranscriptId(transcriptId: string) {
      return db
        .selectFrom("meetings")
        .selectAll()
        .where("fireflies_transcript_id", "=", transcriptId)
        .executeTakeFirst();
    },

    async linkContacts(meetingId: string, contactIds: string[]) {
      if (contactIds.length === 0) return;
      const rows = contactIds.map((contactId) => ({
        meeting_id: meetingId,
        contact_id: contactId,
      }));
      await db
        .insertInto("meeting_contacts")
        .values(rows)
        .onConflict((oc) => oc.columns(["meeting_id", "contact_id"]).doNothing())
        .execute();
    },

    async findUnprocessedActivities(contactId: string) {
      return db
        .selectFrom("meetings")
        .selectAll()
        .where((eb) =>
          eb.or([
            eb("meetings.contact_id", "=", contactId),
            eb.exists(
              eb.selectFrom("meeting_contacts")
                .select("meeting_contacts.meeting_id")
                .whereRef("meeting_contacts.meeting_id", "=", "meetings.id")
                .where("meeting_contacts.contact_id", "=", contactId),
            ),
          ]),
        )
        .where("action_processed_at", "is", null)
        .orderBy("start_time", "desc")
        .execute();
    },

    async markActionProcessed(ids: string[]) {
      if (ids.length === 0) return;
      await db
        .updateTable("meetings")
        .set({ action_processed_at: new Date().toISOString() })
        .where("id", "in", ids)
        .execute();
    },

    async create(data: {
      contactId: string;
      title?: string;
      description?: string;
      location?: string;
      meetingLink?: string;
      startTime: string;
      endTime?: string;
      attendees?: string;
      notes?: string;
      calendarEventId?: string;
      firefliesTranscriptId?: string;
      aiSummary?: string;
      actionItems?: unknown;
      keywords?: unknown;
      durationMinutes?: number;
      source?: string;
    }) {
      return db
        .insertInto("meetings")
        .values({
          contact_id: data.contactId,
          title: data.title ?? null,
          description: data.description ?? null,
          location: data.location ?? null,
          meeting_link: data.meetingLink ?? null,
          start_time: data.startTime,
          end_time: data.endTime ?? null,
          attendees: data.attendees ?? null,
          notes: data.notes ?? null,
          calendar_event_id: data.calendarEventId ?? null,
          fireflies_transcript_id: data.firefliesTranscriptId ?? null,
          ai_summary: data.aiSummary ?? null,
          action_items: data.actionItems ? JSON.stringify(data.actionItems) : null,
          keywords: data.keywords ? JSON.stringify(data.keywords) : null,
          duration_minutes: data.durationMinutes ?? null,
          ...(data.source !== undefined ? { source: data.source } : {}),
        })
        .returningAll()
        .executeTakeFirstOrThrow();
    },

    async update(
      id: string,
      data: Partial<{
        contactId: string;
        title: string | null;
        description: string | null;
        location: string | null;
        meetingLink: string | null;
        startTime: string;
        endTime: string | null;
        attendees: string | null;
        notes: string | null;
        calendarEventId: string | null;
        source: string;
      }>,
    ) {
      const values: Record<string, unknown> = {};
      if (data.contactId !== undefined) values.contact_id = data.contactId;
      if (data.title !== undefined) values.title = data.title;
      if (data.description !== undefined) values.description = data.description;
      if (data.location !== undefined) values.location = data.location;
      if (data.meetingLink !== undefined) values.meeting_link = data.meetingLink;
      if (data.startTime !== undefined) values.start_time = data.startTime;
      if (data.endTime !== undefined) values.end_time = data.endTime;
      if (data.attendees !== undefined) values.attendees = data.attendees;
      if (data.notes !== undefined) values.notes = data.notes;
      if (data.calendarEventId !== undefined) values.calendar_event_id = data.calendarEventId;
      if (data.source !== undefined) values.source = data.source;

      if (Object.keys(values).length === 0) {
        return db
          .selectFrom("meetings")
          .selectAll()
          .where("id", "=", id)
          .executeTakeFirstOrThrow();
      }

      return db
        .updateTable("meetings")
        .set(values)
        .where("id", "=", id)
        .returningAll()
        .executeTakeFirstOrThrow();
    },

    async remove(id: string) {
      return db
        .deleteFrom("meetings")
        .where("id", "=", id)
        .returningAll()
        .executeTakeFirstOrThrow();
    },
  };
}
