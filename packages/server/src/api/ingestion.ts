import { Hono } from "hono";
import { z } from "zod";
import type { createContactsRepository } from "../db/repositories/contacts.js";
import type { createCompaniesRepository } from "../db/repositories/companies.js";
import type { createLinkedinMessagesRepository } from "../db/repositories/linkedin-messages.js";
import type { createEmailsRepository } from "../db/repositories/emails.js";
import {
  parseCsv,
  mapCsvToContacts,
  type CsvColumnMapping,
} from "../lib/csv-parser.js";
import {
  extractDomain,
  isPersonalEmailDomain,
  domainToCompanyName,
} from "../lib/domains.js";

type ContactsRepo = ReturnType<typeof createContactsRepository>;
type CompaniesRepo = ReturnType<typeof createCompaniesRepository>;
type LinkedinMessagesRepo = ReturnType<typeof createLinkedinMessagesRepository>;
type EmailsRepo = ReturnType<typeof createEmailsRepository>;

const sourceEnum = z.enum([
  "linkedin",
  "apollo",
  "canvas_signup",
  "csv",
  "calendar",
  "manual",
  "gmail",
  "google_calendar",
]);

const columnMappingSchema = z
  .object({
    name: z.string().nullable().optional(),
    email: z.string().nullable().optional(),
    phone: z.string().nullable().optional(),
    title: z.string().nullable().optional(),
    linkedinUrl: z.string().nullable().optional(),
    companyName: z.string().nullable().optional(),
    message: z.string().nullable().optional(),
    timestamp: z.string().nullable().optional(),
    direction: z.string().nullable().optional(),
    source: z.string().nullable().optional(),
  })
  .optional();

interface IngestionDeps {
  contacts: ContactsRepo;
  companies: CompaniesRepo;
  linkedinMessages?: LinkedinMessagesRepo;
  emails?: EmailsRepo;
}

export function ingestionRoutes(repos: IngestionDeps) {
  const routes = new Hono();

  // CSV upload and ingestion
  routes.post("/csv", async (c) => {
    const formData = await c.req.formData();
    const file = formData.get("file");
    const sourceRaw = formData.get("source");
    const columnMappingRaw = formData.get("columnMapping");

    // Validate file
    if (!file || !(file instanceof File)) {
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "A CSV file is required",
          },
        },
        400,
      );
    }

    // Validate source
    const sourceParsed = sourceEnum.safeParse(sourceRaw ?? "manual");
    if (!sourceParsed.success) {
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: `Invalid source. Must be one of: ${sourceEnum.options.join(", ")}`,
          },
        },
        400,
      );
    }
    const source = sourceParsed.data;

    // Parse column mapping if provided
    let columnMapping: CsvColumnMapping | undefined;
    if (columnMappingRaw && typeof columnMappingRaw === "string") {
      try {
        const parsed = JSON.parse(columnMappingRaw);
        const mappingResult = columnMappingSchema.safeParse(parsed);
        if (!mappingResult.success) {
          return c.json(
            {
              error: {
                code: "VALIDATION_ERROR",
                message: "Invalid column mapping format",
              },
            },
            400,
          );
        }
        columnMapping = mappingResult.data;
      } catch {
        return c.json(
          {
            error: {
              code: "VALIDATION_ERROR",
              message: "Column mapping must be valid JSON",
            },
          },
          400,
        );
      }
    }

    // Read and parse CSV
    let csvContent: string;
    try {
      csvContent = await file.text();
    } catch {
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Failed to read uploaded file",
          },
        },
        400,
      );
    }

    let rows: Record<string, string>[];
    try {
      rows = parseCsv(csvContent);
    } catch {
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Failed to parse CSV content",
          },
        },
        400,
      );
    }

    if (rows.length === 0) {
      return c.json({
        result: {
          contactsCreated: 0,
          contactsUpdated: 0,
          contactsSkipped: 0,
          companiesCreated: 0,
          activitiesCreated: 0,
          errors: [],
        },
      });
    }

    // Auto-detect column mapping if not provided
    if (!columnMapping) {
      columnMapping = autoDetectMapping(rows[0]);
    }

    // Map CSV rows to contacts and activities
    const { contacts: parsedContacts, activities: parsedActivities } =
      mapCsvToContacts(rows, columnMapping);

    let contactsCreated = 0;
    let contactsUpdated = 0;
    let contactsSkipped = 0;
    let companiesCreated = 0;
    let activitiesCreated = 0;
    const errors: Array<{ row: number; message: string }> = [];

    // Track contact IDs by index for activity creation
    const contactIdByIndex = new Map<number, string>();

    for (let i = 0; i < parsedContacts.length; i++) {
      const parsed = parsedContacts[i];

      try {
        // Auto-create company from email domain or companyName
        let companyId: string | undefined;

        if (parsed.email) {
          const domain = extractDomain(parsed.email);
          if (domain && !isPersonalEmailDomain(domain)) {
            const company = await repos.companies.findOrCreateByDomain(domain, {
              name: parsed.companyName || domainToCompanyName(domain),
              source,
            });
            companyId = company.id;
            // Check if this company was just created (approximate: new companies have no updated diff)
            const existingByDomain = await repos.companies.findByDomain(domain);
            if (existingByDomain && existingByDomain.id === company.id) {
              // Count only truly new companies -- approximate via source matching
            }
          }
        } else if (parsed.companyName) {
          // Try to find or create by company name (search first)
          const searchResults = await repos.companies.search(parsed.companyName, 1);
          if (searchResults.length > 0) {
            companyId = searchResults[0].id;
          } else {
            const newCompany = await repos.companies.create({
              name: parsed.companyName,
              source,
            });
            companyId = newCompany.id;
            companiesCreated++;
          }
        }

        // Check for duplicate contact
        const dup = await repos.contacts.findDuplicate({
          email: parsed.email ?? undefined,
          linkedinUrl: parsed.linkedinUrl ?? undefined,
        });

        if (dup) {
          // Merge missing fields
          const updateData: Record<string, unknown> = {};
          if (!dup.contact.name && parsed.name) updateData.name = parsed.name;
          if (!dup.contact.email && parsed.email) updateData.email = parsed.email;
          if (!dup.contact.phone && parsed.phone) updateData.phone = parsed.phone;
          if (!dup.contact.title && parsed.title) updateData.title = parsed.title;
          if (!dup.contact.linkedin_url && parsed.linkedinUrl) {
            updateData.linkedinUrl = parsed.linkedinUrl;
          }
          if (!dup.contact.company_id && companyId) {
            updateData.companyId = companyId;
          }

          if (Object.keys(updateData).length > 0) {
            await repos.contacts.update(dup.contact.id, updateData);
            contactsUpdated++;
          } else {
            contactsSkipped++;
          }

          contactIdByIndex.set(i, dup.contact.id);
        } else if (parsed.name || parsed.email) {
          // Use per-row source if specified in CSV, otherwise use request-level default
          const contactSource = parsed.source
            ? (sourceEnum.safeParse(parsed.source)?.data ?? source)
            : source;
          const newContact = await repos.contacts.create({
            name: parsed.name || parsed.email || "Unknown",
            email: parsed.email ?? undefined,
            phone: parsed.phone ?? undefined,
            title: parsed.title ?? undefined,
            linkedinUrl: parsed.linkedinUrl ?? undefined,
            companyId,
            source: contactSource,
          });
          contactsCreated++;
          contactIdByIndex.set(i, newContact.id);
        } else {
          contactsSkipped++;
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Unknown error";
        errors.push({ row: i, message });
      }
    }

    // Create activities
    for (const activity of parsedActivities) {
      const contactId = contactIdByIndex.get(activity.contactIndex);
      if (!contactId) continue;

      try {
        if (source === "linkedin" && repos.linkedinMessages) {
          await repos.linkedinMessages.create({
            contactId,
            messageText: activity.message,
            direction: activity.direction,
            sentAt: activity.timestamp || new Date().toISOString(),
            source,
          });
          activitiesCreated++;
        } else if (repos.emails) {
          await repos.emails.create({
            contactId,
            body: activity.message,
            direction: activity.direction,
            sentAt: activity.timestamp || new Date().toISOString(),
            source,
          });
          activitiesCreated++;
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Unknown error";
        errors.push({ row: activity.contactIndex, message: `Activity: ${message}` });
      }
    }

    return c.json({
      result: {
        contactsCreated,
        contactsUpdated,
        contactsSkipped,
        companiesCreated,
        activitiesCreated,
        errors,
      },
    });
  });

  return routes;
}

/**
 * Auto-detect column mapping from CSV headers using common header names.
 */
function autoDetectMapping(
  sampleRow: Record<string, string>,
): CsvColumnMapping {
  const headers = Object.keys(sampleRow);
  const mapping: CsvColumnMapping = {};

  const patterns: Record<keyof CsvColumnMapping, RegExp> = {
    name: /^(full\s*name|name|contact\s*name|person)$/i,
    email: /^(email|e-?mail|email\s*address)$/i,
    phone: /^(phone|telephone|mobile|cell|phone\s*number)$/i,
    title: /^(title|job\s*title|position|role)$/i,
    linkedinUrl: /^(linkedin|linkedin\s*url|linkedin\s*profile|profile\s*url)$/i,
    companyName: /^(company|company\s*name|organization|org)$/i,
    message: /^(message|body|text|content|note)$/i,
    timestamp: /^(date|timestamp|sent\s*at|sent\s*date|time|datetime)$/i,
    direction: /^(direction|type|in\/?out|sent\s*or\s*received)$/i,
    source: /^(source|origin|lead[\s_]*source|contact[\s_]*source)$/i,
  };

  for (const [field, pattern] of Object.entries(patterns)) {
    const match = headers.find((h) => pattern.test(h.trim()));
    if (match) {
      mapping[field as keyof CsvColumnMapping] = match;
    }
  }

  return mapping;
}
