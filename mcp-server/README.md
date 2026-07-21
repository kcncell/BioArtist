# BioArtist MCP Server

Generate scientific SVG icons from a **desktop AI app** (Claude Desktop, Cursor, Grok Build, etc.) and drop them straight into **BioArtist → My Library**.

## Is this possible?

**Yes.** Flow:

```
Desktop AI app  ──stdio──►  bioartist-mcp
                                │
                                ▼
                    public/mcp-inbox/*.svg
                    public/mcp-inbox/manifest.json
                                │
                                ▼
              BioArtist “Sync MCP inbox” → My Library → canvas
```

The MCP server writes files into BioArtist’s `public/mcp-inbox/` folder (served by Vite). The web app pulls the manifest and imports icons into **My Library** (IndexedDB).

## Install

```bash
cd /path/to/BioArtist
npm run mcp:install
```

## Run (stdio MCP)

```bash
npm run mcp:start
# or
node mcp-server/src/index.js
```

## Claude Desktop / Cursor config example

Replace the path with the absolute path on **your** machine:

```json
{
  "mcpServers": {
    "bioartist": {
      "command": "node",
      "args": ["/absolute/path/to/BioArtist/mcp-server/src/index.js"]
    }
  }
}
```

## Tools

| Tool | Purpose |
|------|---------|
| `list_templates` | Available biology SVG templates |
| `create_scientific_svg` | Build icon from template + colors → inbox |
| `create_custom_svg` | Save any SVG markup → inbox |
| `list_inbox` | What’s waiting in the inbox |
| `get_inbox_path` | Absolute inbox folder path |

### Example prompts for your desktop agent

- “Create a pink virus icon named ‘Retrovirus’ with bioartist MCP”
- “Generate a DNA helix SVG and put it in the BioArtist inbox”
- “Save this custom SVG (paste markup) as ‘My organelle’ via BioArtist MCP”

Then in BioArtist:

1. Open **My Library**
2. Click **Sync MCP inbox**
3. Drag the new icon onto the canvas

## Colors

Default accent is flowery pink `#db2777` to match BioArtist’s theme. Pass `color` / `secondary` to customize.
