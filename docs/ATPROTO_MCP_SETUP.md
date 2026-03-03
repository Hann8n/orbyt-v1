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
   - **Global** (recommended): `~/.cursor/mcp.json` — applies to all workspaces and keeps credentials out of the repo
   - **Project-level** (local-only): `.cursor/mcp.json` in the project root — **must be gitignored and must not contain plaintext credentials**

2. Add the atproto server, referencing credentials via environment variables:

```json
{
  "mcpServers": {
    "atproto": {
      "command": "atproto-mcp",
      "args": [],
      "env": {
        "ATPROTO_IDENTIFIER": "${ATPROTO_IDENTIFIER}",
        "ATPROTO_PASSWORD": "${ATPROTO_PASSWORD}"
      }
    }
  }
}
```

3. Set `ATPROTO_IDENTIFIER` and `ATPROTO_PASSWORD` in your shell environment (see [Use Environment Variables](#4-recommended-use-environment-variables) below).

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

## 4. Recommended: Use Environment Variables

Store credentials in your shell environment rather than in any config file:

```bash
export ATPROTO_IDENTIFIER="your-handle.bsky.social"
export ATPROTO_PASSWORD="your-app-password"
```

Add these lines to your shell profile (e.g. `~/.zshrc` or `~/.bashrc`) so they are set automatically. The MCP config's `env` block will then resolve `${ATPROTO_IDENTIFIER}` and `${ATPROTO_PASSWORD}` from the environment at runtime.

> **Warning:** Never commit plaintext credentials to version control. If you use a project-level `.cursor/mcp.json`, ensure it is listed in `.gitignore`.

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
