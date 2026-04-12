/**
 * Captain Plugin for OpenClaw
 *
 * Provides multimodal search and indexing across text, images, video, and audio
 * using Captain's RAG API (https://docs.runcaptain.com).
 *
 * Tools:
 *   captain_search             — Query a collection with natural language
 *   captain_list_collections   — List available collections
 *   captain_index_url          — Index public URL(s) or web pages
 *   captain_index_youtube      — Index YouTube video transcripts
 *   captain_index_text         — Index raw text content directly
 *   captain_index_s3           — Index from Amazon S3
 *   captain_index_gcs          — Index from Google Cloud Storage
 *   captain_index_azure        — Index from Azure Blob Storage
 *   captain_index_r2           — Index from Cloudflare R2
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

function jobStartedResponse(jobId: string, source: string): { content: Array<{ type: "text"; text: string }> } {
  return {
    content: [{
      type: "text",
      text: `Indexing started from ${source}.\nJob ID: ${jobId}\nStatus: pending\n\nFiles are being processed in the background. Search results will be available once indexing completes.`,
    }],
  };
}

export default definePluginEntry({
  id: "captain",
  name: "Captain",
  description: "Multimodal search and indexing across text, images, video, and audio using Captain's RAG API",

  register(api) {
    const logger = api.logger;

    // ── captain_search ──────────────────────────────────────────
    api.registerTool({
      name: "captain_search",
      description:
        "Search a Captain collection with natural language. Searches across text documents, images, video, and audio. " +
        "Returns relevant ranked chunks with source citations and relevance scores.",
      parameters: Type.Object({
        collection: Type.String({ description: "Collection name to search" }),
        query: Type.String({ description: "Natural language search query" }),
        top_k: Type.Optional(Type.Number({ description: "Number of results to return (default 10)", default: 10 })),
        rerank: Type.Optional(Type.Boolean({ description: "Enable cross-modal reranking. Required for multimodal collections.", default: true })),
      }),
      async execute(_id, params) {
        const config = getConfig(api.pluginConfig);
        logger.info(`[Captain] Searching '${params.collection}' for: ${params.query}`);

        const body: Record<string, unknown> = {
          query: params.query,
          inference: false,
          top_k: params.top_k ?? 10,
          rerank: params.rerank ?? true,
          rerank_model: "gemini",
        };

        const data = await captainFetch(config, `collections/${encodeURIComponent(params.collection)}/query`, { method: "POST", body });

        const results = data.search_results || data.results || [];
        if (results.length === 0) return { content: [{ type: "text", text: "No results found." }] };

        const formatted = results
          .map((r: any, i: number) => {
            const source = r.filename || r.document_id || "Unknown";
            const score = r.score?.toFixed(3) ?? "N/A";
            const content = r.content || r.text || r.chunk || "";
            const modality = r.modality || "text";
            return `[${i + 1}] (${modality}, score: ${score}) ${source}\n${content}`;
          })
          .join("\n\n---\n\n");

        return { content: [{ type: "text", text: `Found ${results.length} results in '${params.collection}':\n\n${formatted}` }] };
      },
    });

    // ── captain_list_collections ─────────────────────────────────
    api.registerTool({
      name: "captain_list_collections",
      description: "List all available Captain collections for the configured organization.",
      parameters: Type.Object({}),
      async execute() {
        const config = getConfig(api.pluginConfig);
        const data = await captainFetch(config, "collections");
        const collections = data.collections || [];
        if (collections.length === 0) return { content: [{ type: "text", text: "No collections found." }] };
        const lines = collections.map((c: any) => `- ${c.database_name} (${c.file_count ?? 0} files)`);
        return { content: [{ type: "text", text: `${collections.length} collection(s):\n${lines.join("\n")}` }] };
      },
    });

    // ── captain_index_url ───────────────────────────────────────
    api.registerTool(
      {
        name: "captain_index_url",
        description:
          "Index public URL(s) into a Captain collection. Supports documents (PDF, DOCX, etc.), " +
          "web pages (auto-scraped for text and images), images, video, and audio files.",
        parameters: Type.Object({
          collection: Type.String({ description: "Collection name to index into" }),
          urls: Type.Union([Type.String(), Type.Array(Type.String())], { description: "URL or array of URLs to index" }),
          processing_type: Type.Optional(Type.Union([Type.Literal("advanced"), Type.Literal("basic")], { description: "'advanced' (OCR + images) or 'basic' (text only)", default: "advanced" })),
        }),
        async execute(_id, params) {
          const config = getConfig(api.pluginConfig);
          const urlList = Array.isArray(params.urls) ? params.urls : [params.urls];
          logger.info(`[Captain] Indexing ${urlList.length} URL(s) into '${params.collection}'`);
          const body: Record<string, unknown> = { processing_type: params.processing_type || "advanced" };
          if (urlList.length === 1) body.url = urlList[0]; else body.urls = urlList;
          const data = await captainFetch(config, `collections/${encodeURIComponent(params.collection)}/index/url`, { method: "POST", body });
          return jobStartedResponse(data.job_id, `${urlList.length} URL(s)`);
        },
      },
      { optional: true }
    );

    // ── captain_index_youtube ───────────────────────────────────
    api.registerTool(
      {
        name: "captain_index_youtube",
        description: "Index YouTube video transcripts into a Captain collection. Supports single or multiple videos (max 20).",
        parameters: Type.Object({
          collection: Type.String({ description: "Collection name to index into" }),
          urls: Type.Union([Type.String(), Type.Array(Type.String())], { description: "YouTube URL or array of YouTube URLs (max 20)" }),
        }),
        async execute(_id, params) {
          const config = getConfig(api.pluginConfig);
          const urlList = Array.isArray(params.urls) ? params.urls : [params.urls];
          logger.info(`[Captain] Indexing ${urlList.length} YouTube video(s) into '${params.collection}'`);
          const body: Record<string, unknown> = urlList.length === 1 ? { url: urlList[0] } : { urls: urlList };
          const data = await captainFetch(config, `collections/${encodeURIComponent(params.collection)}/index/youtube`, { method: "POST", body });
          return jobStartedResponse(data.job_id, `${urlList.length} YouTube video(s)`);
        },
      },
      { optional: true }
    );

    // ── captain_index_text ──────────────────────────────────────
    api.registerTool(
      {
        name: "captain_index_text",
        description: "Index raw text content directly into a Captain collection. Useful for indexing notes, transcripts, or any unstructured text without a file.",
        parameters: Type.Object({
          collection: Type.String({ description: "Collection name to index into" }),
          text: Type.String({ description: "Text content to index" }),
          filename: Type.Optional(Type.String({ description: "Optional filename label for the indexed text" })),
          processing_type: Type.Optional(Type.Union([Type.Literal("advanced"), Type.Literal("basic")], { default: "basic" })),
        }),
        async execute(_id, params) {
          const config = getConfig(api.pluginConfig);
          logger.info(`[Captain] Indexing text into '${params.collection}' (${params.text.length} chars)`);
          const body: Record<string, unknown> = { text: params.text, processing_type: params.processing_type || "basic" };
          if (params.filename) body.filename = params.filename;
          const data = await captainFetch(config, `collections/${encodeURIComponent(params.collection)}/index/text`, { method: "POST", body });
          return jobStartedResponse(data.job_id, "text content");
        },
      },
      { optional: true }
    );

    // ── captain_index_s3 ────────────────────────────────────────
    api.registerTool(
      {
        name: "captain_index_s3",
        description:
          "Index files from Amazon S3 into a Captain collection. Can index an entire bucket, a directory, or a single file. " +
          "Requires AWS credentials with read access to the bucket.",
        parameters: Type.Object({
          collection: Type.String({ description: "Collection name to index into" }),
          bucket_name: Type.String({ description: "S3 bucket name" }),
          aws_access_key_id: Type.String({ description: "AWS access key ID" }),
          aws_secret_access_key: Type.String({ description: "AWS secret access key" }),
          bucket_region: Type.Optional(Type.String({ description: "AWS region (default: us-east-1)", default: "us-east-1" })),
          directory_path: Type.Optional(Type.String({ description: "Directory path within the bucket (omit for full bucket)" })),
          file_path: Type.Optional(Type.String({ description: "Single file path within the bucket" })),
          processing_type: Type.Optional(Type.Union([Type.Literal("advanced"), Type.Literal("basic")], { default: "advanced" })),
        }),
        async execute(_id, params) {
          const config = getConfig(api.pluginConfig);
          const body: Record<string, unknown> = {
            bucket_name: params.bucket_name,
            aws_access_key_id: params.aws_access_key_id,
            aws_secret_access_key: params.aws_secret_access_key,
            bucket_region: params.bucket_region || "us-east-1",
            processing_type: params.processing_type || "advanced",
          };
          let endpoint: string;
          let source: string;
          if (params.file_path) {
            endpoint = `collections/${encodeURIComponent(params.collection)}/index/s3/file`;
            body.file_uri = `s3://${params.bucket_name}/${params.file_path}`;
            source = `s3://${params.bucket_name}/${params.file_path}`;
          } else if (params.directory_path) {
            endpoint = `collections/${encodeURIComponent(params.collection)}/index/s3/directory`;
            body.directory_path = params.directory_path;
            source = `s3://${params.bucket_name}/${params.directory_path}`;
          } else {
            endpoint = `collections/${encodeURIComponent(params.collection)}/index/s3`;
            source = `s3://${params.bucket_name}`;
          }
          logger.info(`[Captain] Indexing ${source} into '${params.collection}'`);
          const data = await captainFetch(config, endpoint, { method: "POST", body });
          return jobStartedResponse(data.job_id, source);
        },
      },
      { optional: true }
    );

    // ── captain_index_gcs ───────────────────────────────────────
    api.registerTool(
      {
        name: "captain_index_gcs",
        description:
          "Index files from Google Cloud Storage into a Captain collection. Can index an entire bucket, a directory, or a single file. " +
          "Requires a GCS service account JSON key with read access.",
        parameters: Type.Object({
          collection: Type.String({ description: "Collection name to index into" }),
          bucket_name: Type.String({ description: "GCS bucket name" }),
          service_account_json: Type.String({ description: "GCS service account JSON key (stringified)" }),
          directory_path: Type.Optional(Type.String({ description: "Directory path within the bucket" })),
          file_path: Type.Optional(Type.String({ description: "Single file path within the bucket" })),
          processing_type: Type.Optional(Type.Union([Type.Literal("advanced"), Type.Literal("basic")], { default: "advanced" })),
        }),
        async execute(_id, params) {
          const config = getConfig(api.pluginConfig);
          const body: Record<string, unknown> = {
            bucket_name: params.bucket_name,
            service_account_json: params.service_account_json,
            processing_type: params.processing_type || "advanced",
          };
          let endpoint: string;
          let source: string;
          if (params.file_path) {
            endpoint = `collections/${encodeURIComponent(params.collection)}/index/gcs/file`;
            body.file_uri = `gs://${params.bucket_name}/${params.file_path}`;
            source = `gs://${params.bucket_name}/${params.file_path}`;
          } else if (params.directory_path) {
            endpoint = `collections/${encodeURIComponent(params.collection)}/index/gcs/directory`;
            body.directory_path = params.directory_path;
            source = `gs://${params.bucket_name}/${params.directory_path}`;
          } else {
            endpoint = `collections/${encodeURIComponent(params.collection)}/index/gcs`;
            source = `gs://${params.bucket_name}`;
          }
          logger.info(`[Captain] Indexing ${source} into '${params.collection}'`);
          const data = await captainFetch(config, endpoint, { method: "POST", body });
          return jobStartedResponse(data.job_id, source);
        },
      },
      { optional: true }
    );

    // ── captain_index_azure ─────────────────────────────────────
    api.registerTool(
      {
        name: "captain_index_azure",
        description:
          "Index files from Azure Blob Storage into a Captain collection. Can index an entire container, a directory, or a single file. " +
          "Requires Azure storage account name and key.",
        parameters: Type.Object({
          collection: Type.String({ description: "Collection name to index into" }),
          container_name: Type.String({ description: "Azure container name" }),
          account_name: Type.String({ description: "Azure storage account name" }),
          account_key: Type.String({ description: "Azure storage account key" }),
          directory_path: Type.Optional(Type.String({ description: "Directory path within the container" })),
          file_path: Type.Optional(Type.String({ description: "Single file path within the container" })),
          processing_type: Type.Optional(Type.Union([Type.Literal("advanced"), Type.Literal("basic")], { default: "advanced" })),
        }),
        async execute(_id, params) {
          const config = getConfig(api.pluginConfig);
          const body: Record<string, unknown> = {
            container_name: params.container_name,
            account_name: params.account_name,
            account_key: params.account_key,
            processing_type: params.processing_type || "advanced",
          };
          let endpoint: string;
          let source: string;
          if (params.file_path) {
            endpoint = `collections/${encodeURIComponent(params.collection)}/index/azure/file`;
            body.file_uri = `azure://${params.container_name}/${params.file_path}`;
            source = `azure://${params.container_name}/${params.file_path}`;
          } else if (params.directory_path) {
            endpoint = `collections/${encodeURIComponent(params.collection)}/index/azure/directory`;
            body.directory_path = params.directory_path;
            source = `azure://${params.container_name}/${params.directory_path}`;
          } else {
            endpoint = `collections/${encodeURIComponent(params.collection)}/index/azure`;
            source = `azure://${params.container_name}`;
          }
          logger.info(`[Captain] Indexing ${source} into '${params.collection}'`);
          const data = await captainFetch(config, endpoint, { method: "POST", body });
          return jobStartedResponse(data.job_id, source);
        },
      },
      { optional: true }
    );

    // ── captain_index_r2 ────────────────────────────────────────
    api.registerTool(
      {
        name: "captain_index_r2",
        description:
          "Index files from Cloudflare R2 into a Captain collection. Can index an entire bucket, a directory, or a single file. " +
          "Requires R2 account ID and API token credentials.",
        parameters: Type.Object({
          collection: Type.String({ description: "Collection name to index into" }),
          bucket_name: Type.String({ description: "R2 bucket name" }),
          r2_account_id: Type.String({ description: "Cloudflare account ID" }),
          r2_access_key_id: Type.String({ description: "R2 access key ID" }),
          r2_secret_access_key: Type.String({ description: "R2 secret access key" }),
          jurisdiction: Type.Optional(Type.String({ description: "R2 jurisdiction (default, eu, fedramp)" })),
          directory_path: Type.Optional(Type.String({ description: "Directory path within the bucket" })),
          file_path: Type.Optional(Type.String({ description: "Single file path within the bucket" })),
          processing_type: Type.Optional(Type.Union([Type.Literal("advanced"), Type.Literal("basic")], { default: "advanced" })),
        }),
        async execute(_id, params) {
          const config = getConfig(api.pluginConfig);
          const body: Record<string, unknown> = {
            bucket_name: params.bucket_name,
            r2_account_id: params.r2_account_id,
            r2_access_key_id: params.r2_access_key_id,
            r2_secret_access_key: params.r2_secret_access_key,
            processing_type: params.processing_type || "advanced",
          };
          if (params.jurisdiction && params.jurisdiction !== "default") body.jurisdiction = params.jurisdiction;
          let endpoint: string;
          let source: string;
          if (params.file_path) {
            endpoint = `collections/${encodeURIComponent(params.collection)}/index/r2/file`;
            body.file_uri = `r2://${params.bucket_name}/${params.file_path}`;
            source = `r2://${params.bucket_name}/${params.file_path}`;
          } else if (params.directory_path) {
            endpoint = `collections/${encodeURIComponent(params.collection)}/index/r2/directory`;
            body.directory_path = params.directory_path;
            source = `r2://${params.bucket_name}/${params.directory_path}`;
          } else {
            endpoint = `collections/${encodeURIComponent(params.collection)}/index/r2`;
            source = `r2://${params.bucket_name}`;
          }
          logger.info(`[Captain] Indexing ${source} into '${params.collection}'`);
          const data = await captainFetch(config, endpoint, { method: "POST", body });
          return jobStartedResponse(data.job_id, source);
        },
      },
      { optional: true }
    );

    logger.info("[Captain] Plugin registered — 9 tools available");
  },
});
