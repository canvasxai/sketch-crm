import type { Kysely } from "kysely";
import type { DB } from "../schema.js";

export function createUsersRepository(db: Kysely<DB>) {
  return {
    async list() {
      return db.selectFrom("users").selectAll().orderBy("created_at", "desc").execute();
    },

    async findById(id: string) {
      return db
        .selectFrom("users")
        .selectAll()
        .where("id", "=", id)
        .executeTakeFirst();
    },

    async findByEmail(email: string) {
      return db
        .selectFrom("users")
        .selectAll()
        .where("email", "=", email)
        .executeTakeFirst();
    },

    async findByEmails(emails: string[]) {
      if (emails.length === 0) return [];
      return db
        .selectFrom("users")
        .selectAll()
        .where(
          "email",
          "in",
          emails.map((e) => e.toLowerCase()),
        )
        .execute();
    },

    async findByGoogleId(googleId: string) {
      return db
        .selectFrom("users")
        .selectAll()
        .where("google_id", "=", googleId)
        .executeTakeFirst();
    },

    async create(data: {
      name: string;
      email: string;
      googleId?: string;
      avatarUrl?: string;
      role?: string;
    }) {
      return db
        .insertInto("users")
        .values({
          name: data.name,
          email: data.email,
          google_id: data.googleId ?? null,
          avatar_url: data.avatarUrl ?? null,
          ...(data.role !== undefined ? { role: data.role } : {}),
        })
        .returningAll()
        .executeTakeFirstOrThrow();
    },

    async update(
      id: string,
      data: Partial<{
        name: string;
        email: string;
        googleId: string | null;
        avatarUrl: string | null;
        role: string;
        googleAccessToken: string | null;
        googleRefreshToken: string | null;
        googleTokenExpiry: string | null;
      }>,
    ) {
      const values: Record<string, unknown> = {};
      if (data.name !== undefined) values.name = data.name;
      if (data.email !== undefined) values.email = data.email;
      if (data.googleId !== undefined) values.google_id = data.googleId;
      if (data.avatarUrl !== undefined) values.avatar_url = data.avatarUrl;
      if (data.role !== undefined) values.role = data.role;
      if (data.googleAccessToken !== undefined)
        values.google_access_token = data.googleAccessToken;
      if (data.googleRefreshToken !== undefined)
        values.google_refresh_token = data.googleRefreshToken;
      if (data.googleTokenExpiry !== undefined)
        values.google_token_expiry = data.googleTokenExpiry;

      if (Object.keys(values).length === 0) {
        return db
          .selectFrom("users")
          .selectAll()
          .where("id", "=", id)
          .executeTakeFirstOrThrow();
      }

      return db
        .updateTable("users")
        .set(values)
        .where("id", "=", id)
        .returningAll()
        .executeTakeFirstOrThrow();
    },

    async remove(id: string) {
      return db
        .deleteFrom("users")
        .where("id", "=", id)
        .returningAll()
        .executeTakeFirstOrThrow();
    },

    async findOrCreateByGoogle(data: {
      email: string;
      name: string;
      googleId: string;
      avatarUrl?: string;
    }) {
      // Try to find by google_id first
      const byGoogleId = await db
        .selectFrom("users")
        .selectAll()
        .where("google_id", "=", data.googleId)
        .executeTakeFirst();

      if (byGoogleId) return byGoogleId;

      // Try to find by email
      const byEmail = await db
        .selectFrom("users")
        .selectAll()
        .where("email", "=", data.email)
        .executeTakeFirst();

      if (byEmail) {
        // Link the google_id to the existing user
        return db
          .updateTable("users")
          .set({
            google_id: data.googleId,
            ...(data.avatarUrl !== undefined
              ? { avatar_url: data.avatarUrl }
              : {}),
          })
          .where("id", "=", byEmail.id)
          .returningAll()
          .executeTakeFirstOrThrow();
      }

      // Create new user
      return db
        .insertInto("users")
        .values({
          name: data.name,
          email: data.email,
          google_id: data.googleId,
          avatar_url: data.avatarUrl ?? null,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
    },
  };
}
