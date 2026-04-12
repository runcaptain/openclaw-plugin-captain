# Captain Plugin for OpenClaw

Search text, images, video, and audio with natural language using [Captain's](https://runcaptain.com) multimodal RAG API.

## Setup

1. Get a Captain API key at [runcaptain.com/studio](https://runcaptain.com/studio)
2. Add to your OpenClaw config:

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

### `captain_search`

Search a collection with natural language. Works across text, images, video, and audio.

```
> Search my-docs for "quarterly revenue trends"
```

Parameters:
- `collection` (required) — Collection name
- `query` (required) — Natural language query
- `inference` (optional, default: false) — Set true for AI-generated answers
- `top_k` (optional, default: 10) — Number of results (when inference=false)
- `rerank` (optional, default: true) — Enable cross-modal reranking

### `captain_list_collections`

List all collections in your organization.

### `captain_index_url` (optional — add to `tools.allow`)

Index a public URL into a collection. Supports PDFs, web pages, images, video, and audio.

```
> Index https://example.com/report.pdf into my-docs
```

To enable:
```json5
{
  tools: { allow: ["captain_index_url"] }
}
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
