import { loadConfig } from "../config.js";
import { createDatabase } from "../db/index.js";

const db = createDatabase(loadConfig());

const state = await db.selectFrom("fireflies_sync_state").selectAll().execute();
console.log("=== Fireflies Sync State ===");
console.log(JSON.stringify(state, null, 2));

const meetings = await db.selectFrom("meetings").selectAll().where("source", "=", "fireflies").execute();
console.log("\n=== Fireflies Meetings ===");
console.log("Count:", meetings.length);
if (meetings.length > 0) console.log("First:", JSON.stringify(meetings[0], null, 2));

const contacts = await db.selectFrom("contacts").selectAll().where("source", "=", "fireflies").execute();
console.log("\n=== Fireflies Contacts ===");
console.log("Count:", contacts.length);
if (contacts.length > 0) {
  for (const c of contacts.slice(0, 3)) {
    console.log(`  - ${c.name} (${c.email})`);
  }
}

await db.destroy();
