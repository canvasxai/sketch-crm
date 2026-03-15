import { loadConfig } from "../config.js";
import { createFirefliesClient } from "../lib/fireflies-client.js";

const config = loadConfig();
if (!config.FIREFLIES_API_KEY) {
  console.error("FIREFLIES_API_KEY not set");
  process.exit(1);
}

const client = createFirefliesClient(config.FIREFLIES_API_KEY);

// Test listing transcripts from last 3 months
const now = new Date();
const threeMonthsAgo = new Date(now);
threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

console.log(`Fetching transcripts from ${threeMonthsAgo.toISOString()} to ${now.toISOString()}...`);

try {
  const transcripts = await client.listTranscripts({
    fromDate: threeMonthsAgo.toISOString(),
    toDate: now.toISOString(),
    limit: 5,
  });

  console.log(`\nFound ${transcripts.length} transcripts:`);
  for (const t of transcripts) {
    console.log(`  - [${t.id}] ${t.title} (${t.date})`);
    console.log(`    Participants: ${t.participantEmails.join(", ")}`);
    console.log(`    Duration: ${t.durationMinutes}min`);
  }

  if (transcripts.length > 0) {
    console.log(`\nFetching summary for first transcript: ${transcripts[0].id}...`);
    const summary = await client.getTranscriptSummary(transcripts[0].id);
    if (summary) {
      console.log(`  Overview: ${summary.overview?.slice(0, 200)}...`);
      console.log(`  Action items: ${summary.actionItems?.length ?? 0}`);
      console.log(`  Keywords: ${summary.keywords?.join(", ") ?? "none"}`);
    } else {
      console.log("  No summary returned");
    }
  }
} catch (err) {
  console.error("API Error:", err);
}
