import { loadConfig } from "../config.js";

const config = loadConfig();
const apiKey = config.FIREFLIES_API_KEY!;

// Fetch a transcript that has participants
const res = await fetch("https://api.fireflies.ai/graphql", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  },
  body: JSON.stringify({
    query: `{
      transcript(id: "01KKGFCRPFMQPZFKYH6E151WWQ") {
        id
        title
        date
        duration
        participants
        organizer_email
        meeting_attendees {
          displayName
          email
          name
        }
        summary {
          overview
          action_items
          keywords
        }
      }
    }`,
  }),
});

const json = await res.json();
console.log(JSON.stringify(json, null, 2));
