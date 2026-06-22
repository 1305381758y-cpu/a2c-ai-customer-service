const baseUrl = process.env.FOLLOW_UP_BASE_URL || process.env.APP_BASE_URL || "https://a2c-ai-customer-service.onrender.com";
const apiKey = process.env.INTERNAL_API_KEY || "";
const limit = process.env.FOLLOW_UP_LIMIT || "50";

if (!apiKey || apiKey === "change-me") {
  console.error("INTERNAL_API_KEY is required for follow-up cron");
  process.exit(1);
}

const url = new URL("/internal/follow-ups/due", baseUrl);
url.searchParams.set("limit", limit);

const response = await fetch(url, {
  method: "POST",
  headers: {
    "x-api-key": apiKey,
    "accept": "application/json"
  }
});

const text = await response.text();
if (!response.ok) {
  console.error(`follow-up cron failed: ${response.status} ${text}`);
  process.exit(1);
}

console.log(text);
