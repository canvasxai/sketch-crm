import { Hono } from "hono";
import { z } from "zod";
import type { Kysely } from "kysely";
import { sql } from "kysely";
import type { DB } from "../db/schema.js";

const batchIdsSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(200),
});

interface NextUpItem {
  type: "meeting" | "task" | "reply_needed" | "none";
  label: string;
  dueDate?: string;
  isOverdue?: boolean;
  contactName?: string;
}

interface LastTouchedItem {
  action: "email" | "meeting" | "linkedin_message";
  label: string;
  date: string;
}

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const d = new Date(dateStr).getTime();
  const diffMs = now - d;
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

function formatMeetingDate(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const dayStr =
    d.toDateString() === now.toDateString()
      ? "Today"
      : d.toDateString() === tomorrow.toDateString()
        ? "Tomorrow"
        : d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

  const timeStr = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `Meeting ${dayStr} ${timeStr}`;
}

export function insightsRoutes(db: Kysely<DB>) {
  const routes = new Hono();

  // Batch next-up for contacts
  routes.post("/contacts/next-up", async (c) => {
    const body = await c.req.json();
    const parsed = batchIdsSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: { code: "VALIDATION_ERROR", message: "ids array required" } }, 400);
    }

    const { ids } = parsed.data;
    const result: Record<string, NextUpItem> = {};

    // 1. Upcoming meetings (start_time > now)
    const upcomingMeetings = await db
      .selectFrom("meetings")
      .select(["contact_id", "title", "start_time"])
      .where("contact_id", "in", ids)
      .where("start_time", ">", new Date().toISOString())
      .orderBy("start_time", "asc")
      .execute();

    // Group by contact_id, take first (soonest)
    const meetingByContact: Record<string, { title: string | null; start_time: string }> = {};
    for (const m of upcomingMeetings) {
      if (!meetingByContact[m.contact_id]) {
        meetingByContact[m.contact_id] = m;
      }
    }

    // 2. Incomplete tasks with due dates
    const pendingTasks = await db
      .selectFrom("tasks")
      .select(["contact_id", "title", "due_date"])
      .where("contact_id", "in", ids)
      .where("completed", "=", false)
      .orderBy("due_date", "asc")
      .execute();

    const taskByContact: Record<string, { title: string; due_date: string | null }> = {};
    for (const t of pendingTasks) {
      if (t.contact_id && !taskByContact[t.contact_id]) {
        taskByContact[t.contact_id] = t;
      }
    }

    // 3. Unanswered inbound emails (last email is inbound)
    const lastEmails = await db
      .selectFrom("emails")
      .select(["contact_id", "direction", "sent_at"])
      .where("contact_id", "in", ids)
      .orderBy("sent_at", "desc")
      .execute();

    const lastEmailByContact: Record<string, { direction: string; sent_at: string }> = {};
    for (const e of lastEmails) {
      if (!lastEmailByContact[e.contact_id]) {
        lastEmailByContact[e.contact_id] = e;
      }
    }

    // Build results
    const now = new Date();
    for (const id of ids) {
      // Priority: meeting > task > reply_needed > none
      const meeting = meetingByContact[id];
      if (meeting) {
        result[id] = {
          type: "meeting",
          label: formatMeetingDate(meeting.start_time),
          dueDate: meeting.start_time,
          isOverdue: false,
        };
        continue;
      }

      const task = taskByContact[id];
      if (task) {
        const isOverdue = task.due_date ? new Date(task.due_date) < now : false;
        result[id] = {
          type: "task",
          label: task.title,
          dueDate: task.due_date ?? undefined,
          isOverdue,
        };
        continue;
      }

      const lastEmail = lastEmailByContact[id];
      if (lastEmail && lastEmail.direction === "inbound") {
        const daysAgo = Math.floor((now.getTime() - new Date(lastEmail.sent_at).getTime()) / 86400000);
        result[id] = {
          type: "reply_needed",
          label: `Reply needed (${daysAgo}d)`,
          isOverdue: daysAgo > 2,
        };
        continue;
      }

      result[id] = { type: "none", label: "—" };
    }

    return c.json(result);
  });

  // Batch next-up for companies
  routes.post("/companies/next-up", async (c) => {
    const body = await c.req.json();
    const parsed = batchIdsSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: { code: "VALIDATION_ERROR", message: "ids array required" } }, 400);
    }

    const { ids } = parsed.data;

    // Get all contacts for these companies
    const contacts = await db
      .selectFrom("contacts")
      .select(["id", "name", "company_id"])
      .where("company_id", "in", ids)
      .execute();

    const contactIdsByCompany: Record<string, string[]> = {};
    const contactNames: Record<string, string> = {};
    for (const contact of contacts) {
      if (contact.company_id) {
        if (!contactIdsByCompany[contact.company_id]) contactIdsByCompany[contact.company_id] = [];
        contactIdsByCompany[contact.company_id].push(contact.id);
        contactNames[contact.id] = contact.name;
      }
    }

    const allContactIds = contacts.map((c) => c.id);
    if (allContactIds.length === 0) {
      const result: Record<string, NextUpItem> = {};
      for (const id of ids) result[id] = { type: "none", label: "—" };
      return c.json(result);
    }

    // Upcoming meetings
    const upcomingMeetings = await db
      .selectFrom("meetings")
      .select(["contact_id", "title", "start_time"])
      .where("contact_id", "in", allContactIds)
      .where("start_time", ">", new Date().toISOString())
      .orderBy("start_time", "asc")
      .execute();

    // Pending tasks (company-level or contact-level)
    const pendingTasks = await db
      .selectFrom("tasks")
      .select(["contact_id", "company_id", "title", "due_date"])
      .where((eb) =>
        eb.or([
          eb("company_id", "in", ids),
          ...(allContactIds.length > 0 ? [eb("contact_id", "in", allContactIds)] : []),
        ]),
      )
      .where("completed", "=", false)
      .orderBy("due_date", "asc")
      .execute();

    const now = new Date();
    const result: Record<string, NextUpItem> = {};

    for (const companyId of ids) {
      const companyContactIds = contactIdsByCompany[companyId] || [];

      // Find soonest meeting for any contact in this company
      const meeting = upcomingMeetings.find((m) => companyContactIds.includes(m.contact_id));
      if (meeting) {
        result[companyId] = {
          type: "meeting",
          label: formatMeetingDate(meeting.start_time),
          dueDate: meeting.start_time,
          isOverdue: false,
          contactName: contactNames[meeting.contact_id],
        };
        continue;
      }

      // Find nearest task
      const task = pendingTasks.find(
        (t) => t.company_id === companyId || (t.contact_id && companyContactIds.includes(t.contact_id)),
      );
      if (task) {
        const isOverdue = task.due_date ? new Date(task.due_date) < now : false;
        result[companyId] = {
          type: "task",
          label: task.title,
          dueDate: task.due_date ?? undefined,
          isOverdue,
          contactName: task.contact_id ? contactNames[task.contact_id] : undefined,
        };
        continue;
      }

      result[companyId] = { type: "none", label: "—" };
    }

    return c.json(result);
  });

  // Batch last-touched for contacts
  routes.post("/contacts/last-touched", async (c) => {
    const body = await c.req.json();
    const parsed = batchIdsSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: { code: "VALIDATION_ERROR", message: "ids array required" } }, 400);
    }

    const { ids } = parsed.data;

    // Find most recent activity per contact across emails, meetings, linkedin_messages
    const [latestEmails, latestMeetings, latestLinkedin] = await Promise.all([
      db
        .selectFrom("emails")
        .select(["contact_id", sql<string>`max(sent_at)`.as("latest")])
        .where("contact_id", "in", ids)
        .groupBy("contact_id")
        .execute(),
      db
        .selectFrom("meetings")
        .select(["contact_id", sql<string>`max(start_time)`.as("latest")])
        .where("contact_id", "in", ids)
        .groupBy("contact_id")
        .execute(),
      db
        .selectFrom("linkedin_messages")
        .select(["contact_id", sql<string>`max(sent_at)`.as("latest")])
        .where("contact_id", "in", ids)
        .groupBy("contact_id")
        .execute(),
    ]);

    const result: Record<string, LastTouchedItem | null> = {};

    for (const id of ids) {
      const candidates: Array<{ action: "email" | "meeting" | "linkedin_message"; date: string }> = [];

      const emailEntry = latestEmails.find((e) => e.contact_id === id);
      if (emailEntry?.latest) candidates.push({ action: "email", date: emailEntry.latest });

      const meetingEntry = latestMeetings.find((m) => m.contact_id === id);
      if (meetingEntry?.latest) candidates.push({ action: "meeting", date: meetingEntry.latest });

      const linkedinEntry = latestLinkedin.find((l) => l.contact_id === id);
      if (linkedinEntry?.latest) candidates.push({ action: "linkedin_message", date: linkedinEntry.latest });

      if (candidates.length === 0) {
        result[id] = null;
        continue;
      }

      // Pick the most recent
      candidates.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      const latest = candidates[0];

      const actionLabels: Record<string, string> = {
        email: "Email",
        meeting: "Meeting",
        linkedin_message: "LinkedIn",
      };

      result[id] = {
        action: latest.action,
        label: `${actionLabels[latest.action]} ${timeAgo(latest.date)}`,
        date: latest.date,
      };
    }

    return c.json(result);
  });

  // Batch last-touched for companies
  routes.post("/companies/last-touched", async (c) => {
    const body = await c.req.json();
    const parsed = batchIdsSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: { code: "VALIDATION_ERROR", message: "ids array required" } }, 400);
    }

    const { ids } = parsed.data;

    // Get all contacts for these companies
    const contacts = await db
      .selectFrom("contacts")
      .select(["id", "company_id"])
      .where("company_id", "in", ids)
      .execute();

    const contactIdsByCompany: Record<string, string[]> = {};
    for (const contact of contacts) {
      if (contact.company_id) {
        if (!contactIdsByCompany[contact.company_id]) contactIdsByCompany[contact.company_id] = [];
        contactIdsByCompany[contact.company_id].push(contact.id);
      }
    }

    const allContactIds = contacts.map((c) => c.id);

    if (allContactIds.length === 0) {
      const result: Record<string, null> = {};
      for (const id of ids) result[id] = null;
      return c.json(result);
    }

    const [latestEmails, latestMeetings, latestLinkedin] = await Promise.all([
      db
        .selectFrom("emails")
        .select(["contact_id", sql<string>`max(sent_at)`.as("latest")])
        .where("contact_id", "in", allContactIds)
        .groupBy("contact_id")
        .execute(),
      db
        .selectFrom("meetings")
        .select(["contact_id", sql<string>`max(start_time)`.as("latest")])
        .where("contact_id", "in", allContactIds)
        .groupBy("contact_id")
        .execute(),
      db
        .selectFrom("linkedin_messages")
        .select(["contact_id", sql<string>`max(sent_at)`.as("latest")])
        .where("contact_id", "in", allContactIds)
        .groupBy("contact_id")
        .execute(),
    ]);

    const result: Record<string, LastTouchedItem | null> = {};
    const actionLabels: Record<string, string> = {
      email: "Email",
      meeting: "Meeting",
      linkedin_message: "LinkedIn",
    };

    for (const companyId of ids) {
      const companyContactIds = contactIdsByCompany[companyId] || [];
      const candidates: Array<{ action: "email" | "meeting" | "linkedin_message"; date: string }> = [];

      for (const cId of companyContactIds) {
        const emailEntry = latestEmails.find((e) => e.contact_id === cId);
        if (emailEntry?.latest) candidates.push({ action: "email", date: emailEntry.latest });

        const meetingEntry = latestMeetings.find((m) => m.contact_id === cId);
        if (meetingEntry?.latest) candidates.push({ action: "meeting", date: meetingEntry.latest });

        const linkedinEntry = latestLinkedin.find((l) => l.contact_id === cId);
        if (linkedinEntry?.latest) candidates.push({ action: "linkedin_message", date: linkedinEntry.latest });
      }

      if (candidates.length === 0) {
        result[companyId] = null;
        continue;
      }

      candidates.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      const latest = candidates[0];

      result[companyId] = {
        action: latest.action,
        label: `${actionLabels[latest.action]} ${timeAgo(latest.date)}`,
        date: latest.date,
      };
    }

    return c.json(result);
  });

  return routes;
}
