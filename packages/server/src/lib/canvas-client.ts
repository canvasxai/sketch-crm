/**
 * Canvas platform API client — web search, web scraping, and LinkedIn activity.
 * Used for cross-source contact enrichment (finding LinkedIn profiles for email contacts).
 */

// ── Response Types ──

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface WebScrapeResult {
  markdown?: string;
  html?: string;
  json?: unknown;
  links?: string[];
  summary?: string;
}

export interface LinkedinActivityResult {
  posts?: Array<{
    text?: string;
    date?: string;
    type?: string;
    url?: string;
  }>;
}

// ── Client ──

export class CanvasClient {
  constructor(
    private baseUrl: string,
    private apiKey?: string,
  ) {}

  private async request<T>(path: string, body: unknown): Promise<T> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };
    if (this.apiKey) {
      headers.Authorization = `Bearer ${this.apiKey}`;
    }

    const res = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Canvas API error (${res.status}): ${text}`);
    }

    return res.json() as Promise<T>;
  }

  /**
   * Search the web using Canvas search API.
   */
  async webSearch(query: string, limit = 3): Promise<WebSearchResult[]> {
    const body = { query, limit, sources: ["web"] };
    console.log(`[canvas] POST ${this.baseUrl}/api/direct-executions/websearch`, JSON.stringify(body));
    const res = await this.request<{
      results?: WebSearchResult[];
      data?: { web?: Array<{ url: string; title: string; description: string }> };
    }>(
      "/api/direct-executions/websearch",
      body,
    );
    console.log(`[canvas] Response:`, JSON.stringify(res).slice(0, 500));
    // Handle both response formats: { results } and { data: { web } }
    if (res.results && res.results.length > 0) return res.results;
    if (res.data?.web) {
      return res.data.web.map((r) => ({
        title: r.title,
        url: r.url,
        snippet: r.description ?? "",
      }));
    }
    return [];
  }

  /**
   * Scrape a web page using Canvas scraper.
   */
  async webScrape(url: string): Promise<WebScrapeResult> {
    return this.request<WebScrapeResult>(
      "/api/direct-executions/webscrape",
      {
        url,
        formats: ["json", "markdown"],
        onlyMainContent: true,
        timeout: 15000,
      },
    );
  }

  /**
   * Get LinkedIn profile activity via Canvas LinkedIn API.
   */
  async linkedinActivity(profileUrl: string): Promise<LinkedinActivityResult> {
    return this.request<LinkedinActivityResult>(
      "/api/direct-executions/linkedin",
      { profileUrl },
    );
  }
}

/**
 * Create a Canvas client from config, or null if not configured.
 */
export function createCanvasClient(config: {
  CANVAS_API_URL?: string;
  CANVAS_API_KEY?: string;
}): CanvasClient | null {
  if (!config.CANVAS_API_URL) return null;
  return new CanvasClient(config.CANVAS_API_URL, config.CANVAS_API_KEY);
}
