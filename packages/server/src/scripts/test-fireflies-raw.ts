import { loadConfig } from "../config.js";

const config = loadConfig();
const apiKey = config.FIREFLIES_API_KEY!;

// Raw GraphQL query to see all available fields
const res = await fetch("https://api.fireflies.ai/graphql", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  },
  body: JSON.stringify({
    query: `{
      transcripts(limit: 2) {
        id
        title
        date
        duration
        participants
        organizer_email
        transcript_url
        meeting_attendees {
          displayName
          email
          name
        }
      }
    }`,
  }),
});

const json = await res.json();
console.log(JSON.stringify(json, null, 2));
