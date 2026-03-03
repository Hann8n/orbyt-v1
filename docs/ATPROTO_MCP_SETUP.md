# AT Protocol MCP Server Setup

Instructions for installing and configuring the [AT Protocol MCP Server](https://cameronrye.github.io/atproto-mcp/guide/getting-started.html) so you can interact with Bluesky/AT Protocol from your code editor.

## Prerequisites

- **Node.js 20+**
- **npm** or **pnpm**
- A **Bluesky account** and an [app password](https://bsky.app/settings/app-passwords)

---

## 1. Install the MCP Server

### Global (recommended)

```bash
npm install -g atproto-mcp
```

### Or run without installing

```bash
npx atproto-mcp
```

---

## 2. Get Your Bluesky App Password

1. Go to [bsky.app/settings/app-passwords](https://bsky.app/settings/app-passwords)
2. Create a new app password (e.g. "MCP Server")
3. Copy the password (format: `xxxx-xxxx-xxxx-xxxx`)

---

## 3. Configure Your Editor

### Cursor

1. Create or edit the MCP config file:
   - **Project-level** (recommended for team repos): `.cursor/mcp.json` in the project root
   - **Global** (all workspaces): `~/.cursor/mcp.json`

2. Add the atproto server:

```json
{
  "mcpServers": {
    "atproto": {
      "command": "atproto-mcp",
      "args": [],
      "env": {
        "ATPROTO_IDENTIFIER": "your-handle.bsky.social",
        "ATPROTO_PASSWORD": "your-app-password"
      }
    }
  }
}
```

3. Replace `your-handle.bsky.social` with your Bluesky handle and `your-app-password` with your app password.

4. Fully restart Cursor.

5. Verify: **Settings → Tools & MCP** — the `atproto` server should appear and connect.

---

### Claude Desktop (or other MCP clients)

Edit your Claude config (e.g. `~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "atproto": {
      "command": "atproto-mcp",
      "args": [],
      "env": {
        "ATPROTO_IDENTIFIER": "your-handle.bsky.social",
        "ATPROTO_PASSWORD": "your-app-password"
      }
    }
  }
}
```

Restart the app after saving.

---

## 4. Optional: Use Environment Variables

To avoid storing credentials in config files:

```bash
export ATPROTO_IDENTIFIER="your-handle.bsky.social"
export ATPROTO_PASSWORD="your-app-password"
```

Then omit the `env` block from the config, or ensure your editor/shell passes these variables through to the MCP process.

---

## 5. What You Can Do

Once connected, you can use natural language to:

- Create posts
- Search posts by topic or timeframe
- Get user profiles
- Follow/unfollow users
- And more — ask your AI assistant what AT Protocol actions are available

---

## Troubleshooting

| Issue                  | Fix                                                           |
| ---------------------- | ------------------------------------------------------------- |
| Server won't start     | Check Node.js is 20+, verify port isn't in use                |
| Authentication fails   | Confirm handle and app password; ensure app password is valid |
| Editor doesn't see MCP | Restart the editor fully; check config path and JSON syntax   |
| Rate limiting          | Reduce request frequency; AT Protocol has rate limits         |
