/**
 * Captain Plugin for OpenClaw
 *
 * Provides multimodal search across text, images, video, and audio
 * using Captain's RAG API (https://docs.runcaptain.com).
 *
 * Tools:
 *   captain_search        — Query a collection with natural language
 *   captain_list_collections — List available collections
 *   captain_index_url     — Index a URL into a collection
 */

import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { Type } from "@sinclair/typebox";

const CAPTAIN_API_VERSION = "v2";

interface CaptainConfig {
  apiKey: string;
  organizationId: string;
  baseUrl?: string;
}

function getConfig(pluginConfig: Record<string, unknown>): CaptainConfig {
  const apiKey = pluginConfig.apiKey as string;
  const organizationId = pluginConfig.organizationId as string;
  const baseUrl = (pluginConfig.baseUrl as string) || "https://api.runcaptain.com";

  if (!apiKey) throw new Error("Captain API key is not configured. Set it in plugin config.");
  if (!organizationId) throw new Error("Captain organization ID is not configured.");

  return { apiKey, organizationId, baseUrl };
}

async function captainFetch(
  config: CaptainConfig,
  path: string,
  options: { method?: string; body?: unknown } = {}
): Promise<any> {
  const url = `${config.baseUrl}/${CAPTAIN_API_VERSION}/${path}`;
  const response = await fetch(url, {
    method: options.method || "GET",
    headers: {
      "Authorization": `Bearer ${config.apiKey}`,
      "X-Organization-ID": config.organizationId,
      "Content-Type": "application/json",
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) {
    const error = await response.text().catch(() => response.statusText);
    throw new Error(`Captain API error (${response.status}): ${error}`);
  }

  return response.json();
}

export default definePluginEntry({
  id: "captain",
  name: "Captain",
  description: "Multimodal search across text, images, video, and audio using Captain's RAG API",

  register(api) {
    const logger = api.logger;

    // ── captain_search ──────────────────────────────────────────
    api.registerTool({
      name: "captain_search",
      description:
        "Search a Captain collection with natural language. Searches across text documents, images, video, and audio. " +
        "Returns relevant chunks with source citations. Use inference=true for AI-generated answers, or inference=false for raw search results.",
      parameters: Type.Object({
        collection: Type.String({
          description: "Collection name to search (e.g. 'my-docs', 'product-catalog')",
        }),
        query: Type.String({
          description: "Natural language search query",
        }),
        inference: Type.Optional(
          Type.Boolean({
            description: "If true, returns an AI-generated answer based on retrieved context. If false (default), returns raw search result chunks.",
            default: false,
          })
        ),
        top_k: Type.Optional(
          Type.Number({
            description: "Number of results to return (default 10, only when inference=false)",
            default: 10,
          })
        ),
        rerank: Type.Optional(
          Type.Boolean({
            description: "Enable cross-modal reranking for improved relevance. Required for multimodal collections.",
            default: true,
          })
        ),
      }),
      async execute(_id, params) {
        const config = getConfig(api.pluginConfig);
        logger.info(`[Captain] Searching '${params.collection}' for: ${params.query}`);

        const body: Record<string, unknown> = {
          query: params.query,
          inference: params.inference ?? false,
          rerank: params.rerank ?? true,
          rerank_model: "gemini",
        };

        if (!params.inference) {
          body.top_k = params.top_k ?? 10;
        }

        const data = await captainFetch(
          config,
          `collections/${encodeURIComponent(params.collection)}/query`,
          { method: "POST", body }
        );

        // Format results for the agent
        if (params.inference && data.answer) {
          // Inference mode — AI-generated answer
          let text = data.answer;
          if (data.sources?.length) {
            text += "\n\nSources:\n";
            for (const src of data.sources) {
              text += `- ${src.filename || src.document_id || "Unknown"} (score: ${src.score?.toFixed(3) ?? "N/A"})\n`;
            }
          }
          return { content: [{ type: "text", text }] };
        }

        // Raw search results
        const results = data.search_results || data.results || [];
        if (results.length === 0) {
          return { content: [{ type: "text", text: "No results found." }] };
        }

        const formatted = results
          .map((r: any, i: number) => {
            const source = r.filename || r.document_id || "Unknown";
            const score = r.score?.toFixed(3) ?? "N/A";
            const content = r.content || r.text || r.chunk || "";
            const modality = r.modality || "text";
            return `[${i + 1}] (${modality}, score: ${score}) ${source}\n${content}`;
          })
          .join("\n\n---\n\n");

        return {
          content: [
            {
              type: "text",
              text: `Found ${results.length} results in '${params.collection}':\n\n${formatted}`,
            },
          ],
        };
      },
    });

    // ── captain_list_collections ─────────────────────────────────
    api.registerTool({
      name: "captain_list_collections",
      description:
        "List all available Captain collections for the configured organization. " +
        "Returns collection names and document counts.",
      parameters: Type.Object({}),
      async execute() {
        const config = getConfig(api.pluginConfig);
        logger.info("[Captain] Listing collections");

        const data = await captainFetch(config, "collections");
        const collections = data.collections || [];

        if (collections.length === 0) {
          return {
            content: [{ type: "text", text: "No collections found. Create one at runcaptain.com or via the API." }],
          };
        }

        const lines = collections.map(
          (c: any) => `- ${c.database_name} (${c.file_count ?? 0} files)`
        );

        return {
          content: [
            {
              type: "text",
              text: `${collections.length} collection(s):\n${lines.join("\n")}`,
            },
          ],
        };
      },
    });

    // ── captain_index_url ───────────────────────────────────────
    api.registerTool(
      {
        name: "captain_index_url",
        description:
          "Index a public URL into a Captain collection. Supports documents (PDF, DOCX, etc.), " +
          "web pages (auto-scraped), images, video, and audio files. Returns a job ID for tracking.",
        parameters: Type.Object({
          collection: Type.String({
            description: "Collection name to index into",
          }),
          url: Type.String({
            description: "Public URL to index (e.g. https://example.com/report.pdf)",
          }),
          processing_type: Type.Optional(
            Type.Union([Type.Literal("advanced"), Type.Literal("basic")], {
              description: "Processing mode: 'advanced' (OCR + images, recommended) or 'basic' (text only, faster)",
              default: "advanced",
            })
          ),
        }),
        async execute(_id, params) {
          const config = getConfig(api.pluginConfig);
          logger.info(`[Captain] Indexing URL into '${params.collection}': ${params.url}`);

          const data = await captainFetch(
            config,
            `collections/${encodeURIComponent(params.collection)}/index/url`,
            {
              method: "POST",
              body: {
                url: params.url,
                processing_type: params.processing_type || "advanced",
              },
            }
          );

          return {
            content: [
              {
                type: "text",
                text: `Indexing started. Job ID: ${data.job_id}\nStatus: ${data.status || "pending"}\n\nThe URL is being processed in the background. Search results will be available once indexing completes.`,
              },
            ],
          };
        },
      },
      { optional: true }
    );

    logger.info("[Captain] Plugin registered — 3 tools available");
  },
});
