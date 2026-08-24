# Captain Plugin for OpenClaw

Search text, images, video, and audio with natural language using [Captain's](https://runcaptain.com) multimodal RAG API. Index from any source — S3, GCS, Azure, R2, URLs, YouTube, or raw text.

## Install

```bash
openclaw plugins install @captain-sdk/openclaw-captain
```

## Setup

Get a Captain API key at [runcaptain.com/studio](https://runcaptain.com/studio), then add to your OpenClaw config:

```json5
{
  plugins: {
    entries: {
      captain: {
        apiKey: "cap_...",
        organizationId: "019a..."
      }
    }
  }
}
```

## Tools

### Always Available

| Tool | Description |
|------|-------------|
| `captain_search` | Search any collection with natural language. Works across text, images, video, and audio. Returns ranked chunks with source citations. |
| `captain_list_collections` | List all collections in your organization with file counts. |

### Optional (add to `tools.allow`)

**Collections & Documents:**

| Tool | Description |
|------|-------------|
| `captain_create_collection` | Create a new collection |
| `captain_delete_collection` | Delete a collection and all its data |
| `captain_list_documents` | List documents in a collection with file names and chunk counts |
| `captain_delete_document` | Delete a specific document by ID |
| `captain_wipe_documents` | Delete all documents in a collection (keeps the collection) |

**Jobs:**

| Tool | Description |
|------|-------------|
| `captain_job_status` | Check indexing job progress, stage, and file counts |
| `captain_cancel_job` | Cancel a running indexing job |

**Indexing Sources:**

| Tool | Description |
|------|-------------|
| `captain_index_url` | Index public URL(s) — documents, web pages, images, video, audio |
| `captain_index_youtube` | Index YouTube video transcripts (up to 20 videos) |
| `captain_index_text` | Index raw text content directly (notes, transcripts, etc.) |
| `captain_index_s3` | Index from Amazon S3 — bucket, directory, or single file |
| `captain_index_gcs` | Index from Google Cloud Storage — bucket, directory, or file |
| `captain_index_azure` | Index from Azure Blob Storage — container, directory, or file |
| `captain_index_r2` | Index from Cloudflare R2 — bucket, directory, or file |

**Documents & Chunks (v3):**

| Tool | Description |
|------|-------------|
| `captain_list_documents_v3` | List documents in a collection (v3, richer than the v2 list) |
| `captain_get_document_v3` | Get a document, or a specific page, by ID |
| `captain_mint_asset_urls` | Mint asset URLs for a document's figures/pages |
| `captain_update_document_metadata` | Replace or update a document's custom metadata |
| `captain_list_chunks` | List chunks in a collection |
| `captain_get_chunk` | Get a specific chunk by ID |
| `captain_get_chunk_metadata` | Get a chunk's custom metadata |
| `captain_set_chunk_metadata` | Replace or update a chunk's custom metadata |
| `captain_delete_chunk_metadata` | Delete a chunk's custom metadata |
| `captain_list_chunk_relations` | List relations for a chunk |
| `captain_create_chunk_relation` | Create a relation between two chunks |
| `captain_delete_chunk_relation` | Delete a chunk relation |

To enable all optional tools:
```json5
{
  tools: {
    allow: [
      "captain_create_collection",
      "captain_delete_collection",
      "captain_list_documents",
      "captain_delete_document",
      "captain_wipe_documents",
      "captain_job_status",
      "captain_cancel_job",
      "captain_index_url",
      "captain_index_youtube",
      "captain_index_text",
      "captain_index_s3",
      "captain_index_gcs",
      "captain_index_azure",
      "captain_index_r2",
      "captain_list_documents_v3",
      "captain_get_document_v3",
      "captain_mint_asset_urls",
      "captain_update_document_metadata",
      "captain_list_chunks",
      "captain_get_chunk",
      "captain_get_chunk_metadata",
      "captain_set_chunk_metadata",
      "captain_delete_chunk_metadata",
      "captain_list_chunk_relations",
      "captain_create_chunk_relation",
      "captain_delete_chunk_relation"
    ]
  }
}
```

## Examples

```
> Search my-docs for "quarterly revenue trends"
> Search product-catalog for "red sneakers with white sole"
> Search call-recordings for "customer complaints about billing errors"
> Search training-videos for "how to configure SSO settings"
> Index https://example.com/report.pdf into my-docs
> Index this YouTube video into training-videos: https://youtube.com/watch?v=abc123
> Index my S3 bucket "company-data" directory "reports/2026" into financial-docs
> List my collections
```

## Supported File Types

**Documents:** PDF, DOCX, DOC, TXT, MD, JSON, YAML, CSV, XLSX
**Images:** PNG, JPEG, GIF, BMP, TIFF, WEBP
**Video:** MP4, MOV, AVI, MKV, WEBM
**Audio:** MP3, WAV, AAC, FLAC, M4A, OGG

## Links

- [Captain Docs](https://docs.runcaptain.com)
- [API Reference](https://docs.runcaptain.com/api-reference)
- [Multimodal Search](https://docs.runcaptain.com/multimodal-search)
- [GitHub](https://github.com/runcaptain/openclaw-plugin-captain)
