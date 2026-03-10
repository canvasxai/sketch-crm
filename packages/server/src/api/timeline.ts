import { Hono } from "hono";
import type { createEmailsRepository } from "../db/repositories/emails.js";
import type { createLinkedinMessagesRepository } from "../db/repositories/linkedin-messages.js";
import type { createMeetingsRepository } from "../db/repositories/meetings.js";
import type { createNotesRepository } from "../db/repositories/notes.js";
import type { createTasksRepository } from "../db/repositories/tasks.js";
import type { createStageChangesRepository } from "../db/repositories/stage-changes.js";
import type { createContactsRepository } from "../db/repositories/contacts.js";

type EmailsRepo = ReturnType<typeof createEmailsRepository>;
type LinkedinMessagesRepo = ReturnType<typeof createLinkedinMessagesRepository>;
type MeetingsRepo = ReturnType<typeof createMeetingsRepository>;
type NotesRepo = ReturnType<typeof createNotesRepository>;
type TasksRepo = ReturnType<typeof createTasksRepository>;
type StageChangesRepo = ReturnType<typeof createStageChangesRepository>;
type ContactsRepo = ReturnType<typeof createContactsRepository>;

interface TimelineEntry {
  type: "email" | "linkedin_message" | "meeting" | "note" | "task" | "stage_change";
  data: Record<string, unknown>;
  date: string;
  contactName?: string;
}

interface TimelineDeps {
  emails: EmailsRepo;
  linkedinMessages: LinkedinMessagesRepo;
  meetings: MeetingsRepo;
  notes: NotesRepo;
  tasks: TasksRepo;
  stageChanges: StageChangesRepo;
  contacts: ContactsRepo;
}

const TIMELINE_TYPE_FILTER: Record<string, string[]> = {
  emails: ["email"],
  meetings: ["meeting"],
  notes: ["note"],
  tasks: ["task"],
  linkedin: ["linkedin_message"],
};

export function timelineRoutes(repos: TimelineDeps) {
  const routes = new Hono();

  // Get merged timeline for a contact or company
  routes.get("/", async (c) => {
    const contactId = c.req.query("contactId");
    const companyId = c.req.query("companyId");
    const typeFilter = c.req.query("type"); // comma-separated: "email,meeting,note"
    const limit = c.req.query("limit") ? Number(c.req.query("limit")) : undefined;
    const offset = c.req.query("offset") ? Number(c.req.query("offset")) : 0;

    // Determine which types to include
    let allowedTypes: Set<string> | null = null;
    if (typeFilter) {
      allowedTypes = new Set<string>();
      for (const filter of typeFilter.split(",")) {
        const mapped = TIMELINE_TYPE_FILTER[filter.trim()];
        if (mapped) {
          for (const t of mapped) allowedTypes.add(t);
        } else {
          // Direct type name (e.g., "stage_change")
          allowedTypes.add(filter.trim());
        }
      }
    }

    // Global mode: fetch all contacts. Company/contact mode: scope to specific IDs.
    let contactIds: string[] = [];
    let contactNameMap: Record<string, string> = {};
    const isGlobal = !contactId && !companyId;

    if (isGlobal) {
      const contacts = await repos.contacts.list({ limit: 500 });
      contactIds = contacts.map((c) => c.id);
      for (const contact of contacts) {
        contactNameMap[contact.id] = contact.name;
      }
    } else if (companyId) {
      const contacts = await repos.contacts.list({ companyId });
      contactIds = contacts.map((c) => c.id);
      for (const contact of contacts) {
        contactNameMap[contact.id] = contact.name;
      }
    } else if (contactId) {
      contactIds = [contactId];
    }

    if (contactIds.length === 0) {
      return c.json({ timeline: [] });
    }

    // Fetch all activities in parallel
    const fetchPromises: Promise<void>[] = [];
    const timeline: TimelineEntry[] = [];

    // Emails
    if (!allowedTypes || allowedTypes.has("email")) {
      fetchPromises.push(
        (async () => {
          for (const cId of contactIds) {
            const emails = await repos.emails.list({ contactId: cId });
            for (const email of emails) {
              timeline.push({
                type: "email",
                data: email as unknown as Record<string, unknown>,
                date: email.sent_at,
                ...(companyId || isGlobal ? { contactName: contactNameMap[cId] } : {}),
              });
            }
          }
        })(),
      );
    }

    // LinkedIn Messages
    if (!allowedTypes || allowedTypes.has("linkedin_message")) {
      fetchPromises.push(
        (async () => {
          for (const cId of contactIds) {
            const messages = await repos.linkedinMessages.list({ contactId: cId });
            for (const message of messages) {
              timeline.push({
                type: "linkedin_message",
                data: message as unknown as Record<string, unknown>,
                date: message.sent_at,
                ...(companyId || isGlobal ? { contactName: contactNameMap[cId] } : {}),
              });
            }
          }
        })(),
      );
    }

    // Meetings
    if (!allowedTypes || allowedTypes.has("meeting")) {
      fetchPromises.push(
        (async () => {
          for (const cId of contactIds) {
            const meetings = await repos.meetings.list({ contactId: cId });
            for (const meeting of meetings) {
              timeline.push({
                type: "meeting",
                data: meeting as unknown as Record<string, unknown>,
                date: meeting.start_time,
                ...(companyId || isGlobal ? { contactName: contactNameMap[cId] } : {}),
              });
            }
          }
        })(),
      );
    }

    // Notes
    if (!allowedTypes || allowedTypes.has("note")) {
      fetchPromises.push(
        (async () => {
          for (const cId of contactIds) {
            const notes = await repos.notes.list({ contactId: cId });
            for (const note of notes) {
              timeline.push({
                type: "note",
                data: note as unknown as Record<string, unknown>,
                date: note.created_at,
                ...(companyId || isGlobal ? { contactName: contactNameMap[cId] } : {}),
              });
            }
          }
        })(),
      );
    }

    // Tasks
    if (!allowedTypes || allowedTypes.has("task")) {
      fetchPromises.push(
        (async () => {
          if (companyId || isGlobal) {
            // Fetch all tasks at once for company or global mode
            const tasks = companyId
              ? await repos.tasks.list({ companyId })
              : await repos.tasks.list({ limit: 500 });
            for (const task of tasks) {
              const cName = task.contact_id ? contactNameMap[task.contact_id] : undefined;
              timeline.push({
                type: "task",
                data: task as unknown as Record<string, unknown>,
                date: task.created_at,
                ...(cName ? { contactName: cName } : {}),
              });
            }
          } else {
            for (const cId of contactIds) {
              const tasks = await repos.tasks.list({ contactId: cId });
              for (const task of tasks) {
                timeline.push({
                  type: "task",
                  data: task as unknown as Record<string, unknown>,
                  date: task.created_at,
                });
              }
            }
          }
        })(),
      );
    }

    // Stage Changes
    if (!allowedTypes || allowedTypes.has("stage_change")) {
      fetchPromises.push(
        (async () => {
          if (contactIds.length === 1 && !isGlobal) {
            const changes = await repos.stageChanges.list({ contactId: contactIds[0] });
            for (const change of changes) {
              timeline.push({
                type: "stage_change",
                data: change as unknown as Record<string, unknown>,
                date: change.created_at,
              });
            }
          } else {
            const changes = await repos.stageChanges.listByContactIds(contactIds);
            for (const change of changes) {
              timeline.push({
                type: "stage_change",
                data: change as unknown as Record<string, unknown>,
                date: change.created_at,
                ...((companyId || isGlobal) ? { contactName: contactNameMap[change.contact_id] } : {}),
              });
            }
          }
        })(),
      );
    }

    await Promise.all(fetchPromises);

    // Sort by date descending (most recent first)
    timeline.sort((a, b) => {
      const dateA = new Date(a.date).getTime();
      const dateB = new Date(b.date).getTime();
      return dateB - dateA;
    });

    // Apply pagination
    const paginatedTimeline = limit
      ? timeline.slice(offset, offset + limit)
      : timeline.slice(offset);

    return c.json({ timeline: paginatedTimeline, total: timeline.length });
  });

  return routes;
}
