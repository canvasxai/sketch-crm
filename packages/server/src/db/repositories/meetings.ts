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
