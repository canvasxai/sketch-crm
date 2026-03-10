import AnthropicBedrock from "@anthropic-ai/bedrock-sdk";
import { Hono } from "hono";
import type { Config } from "../config.js";
import type { createContactsRepository } from "../db/repositories/contacts.js";
import type { createEmailsRepository } from "../db/repositories/emails.js";
import { classifyContact } from "../lib/ai-classifier.js";

interface ClassificationDeps {
  contacts: ReturnType<typeof createContactsRepository>;
  emails: ReturnType<typeof createEmailsRepository>;
  config: Config;
}

export function classificationRoutes(deps: ClassificationDeps) {
  const routes = new Hono();

  // POST /contacts — classify all contacts with email history
  routes.post("/contacts", async (c) => {
    if (!deps.config.AWS_ACCESS_KEY_ID || !deps.config.AWS_SECRET_ACCESS_KEY) {
      return c.json(
        {
          error: {
            code: "CONFIG_ERROR",
            message: "AWS Bedrock credentials not configured",
          },
        },
        500,
      );
    }

    const anthropic = new AnthropicBedrock({
      awsAccessKey: deps.config.AWS_ACCESS_KEY_ID,
      awsSecretKey: deps.config.AWS_SECRET_ACCESS_KEY,
      awsRegion: deps.config.AWS_REGION ?? "us-east-1",
    });

    // Get all contacts
    const allContacts = await deps.contacts.list({ limit: 10000 });

    // Find contacts with email history
    const contactsWithEmails: Array<{
      contact: (typeof allContacts)[number];
      emails: Awaited<ReturnType<typeof deps.emails.list>>;
    }> = [];

    for (const contact of allContacts) {
      const emailList = await deps.emails.list({
        contactId: contact.id,
        limit: 20,
      });
      if (emailList.length > 0) {
        contactsWithEmails.push({ contact, emails: emailList });
      }
    }

    let classified = 0;
    let errors = 0;
    const changes: Array<{
      contactId: string;
      name: string;
      oldStage: string;
      newStage: string;
    }> = [];

    for (const { contact, emails } of contactsWithEmails) {
      try {
        const emailSummaries = emails.map((e) => ({
          from: e.from_email || "",
          to: e.to_email || "",
          subject: e.subject || "(no subject)",
          body: e.body || "",
          date: e.sent_at,
          direction: e.direction,
        }));

        const newStage = await classifyContact(
          anthropic,
          contact.name,
          contact.email || "",
          emailSummaries,
        );

        if (newStage !== contact.funnel_stage) {
          await deps.contacts.update(contact.id, {
            funnelStage: newStage,
          });
          changes.push({
            contactId: contact.id,
            name: contact.name,
            oldStage: contact.funnel_stage,
            newStage,
          });
        }
        classified++;
      } catch {
        errors++;
      }
    }

    return c.json({
      result: {
        totalContacts: contactsWithEmails.length,
        classified,
        changed: changes.length,
        errors,
        changes,
      },
    });
  });

  return routes;
}
