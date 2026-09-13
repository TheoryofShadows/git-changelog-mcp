# @mcpx-digital/git-changelog

**MCP server that turns local `git log` into release notes and CHANGELOG drafts.**

Generate conventional-commit–grouped release notes between tags/commits, inspect commit groups, and write a `CHANGELOG.md` draft — from Cursor, Claude Desktop, or any MCP client.

> **Local git only.** This server reads your local repository via `git log`. It does **not** push, force-push, scrape remotes, or rewrite history. Use only on repos you own or have permission to inspect.

## Install (MCPX / npx)

```bash
npx -y @mcpx-digital/git-changelog
```

> **Publish note:** Prepared for npm as `@mcpx-digital/git-changelog`. Until published, run from a local clone.

## Cursor `mcp.json` example

```json
{
  "mcpServers": {
    "git-changelog": {
      "command": "npx",
      "args": ["-y", "@mcpx-digital/git-changelog"]
    }
  }
}
```

Local clone:

```json
{
  "mcpServers": {
    "git-changelog": {
      "command": "node",
      "args": ["/absolute/path/to/git-changelog-mcp/index.js"]
    }
  }
}
```

## Tools

| Tool | What it does |
|------|----------------|
| `generate_release_notes` | Markdown release notes from `git log` between optional `from`/`to` refs |
| `group_conventional_commits` | Group commits by conventional type (`feat`, `fix`, …) |
| `write_changelog_draft` | Write (or dry-run) a `CHANGELOG.md` section for a version |

## Example prompts

- “Generate release notes from tag `v0.1.0` to `HEAD` in this repo”
- “Group conventional commits since `v1.2.0`”
- “Draft CHANGELOG.md for version 0.2.0 (dry run first)”

## Development

```bash
git clone https://github.com/TheoryofShadows/git-changelog-mcp.git
cd git-changelog-mcp
npm install
npm test
node index.js
```

## Sell / list on MCPX

Suggested listing price: **$6**.

Install command: `npx -y @mcpx-digital/git-changelog`

## License

MIT © TheoryofShadows
