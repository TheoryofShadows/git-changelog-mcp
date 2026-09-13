#!/usr/bin/env node
/**
 * @mcpx-digital/git-changelog — MCP server for release notes from local git history.
 *
 * Tools:
 *   - generate_release_notes
 *   - group_conventional_commits
 *   - write_changelog_draft
 *
 * Local git repositories only. Does not push, force-push, or talk to remotes.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import {
  generateReleaseNotes,
  groupConventionalCommits,
  writeChangelogDraft,
} from "./lib.js";

const LOCAL_NOTICE =
  "Operates on a local git working tree only (reads history via git log). Does not access remotes or rewrite history.";

const TOOLS = [
  {
    name: "generate_release_notes",
    description:
      "Generate markdown release notes from git log between optional from/to refs (tags or commits), with conventional-commit grouping. " +
      LOCAL_NOTICE,
    inputSchema: {
      type: "object",
      properties: {
        repoPath: { type: "string", description: "Path to local git repo (default: cwd)." },
        from: { type: "string", description: "Older ref (tag/commit). Omit for all history up to `to`." },
        to: { type: "string", description: "Newer ref (default: HEAD)." },
        title: { type: "string", description: "Optional markdown H1 title." },
      },
    },
  },
  {
    name: "group_conventional_commits",
    description:
      "List and group commits in a range by conventional type (feat/fix/docs/…). " + LOCAL_NOTICE,
    inputSchema: {
      type: "object",
      properties: {
        repoPath: { type: "string", description: "Path to local git repo (default: cwd)." },
        from: { type: "string", description: "Older ref (tag/commit)." },
        to: { type: "string", description: "Newer ref (default: HEAD)." },
      },
    },
  },
  {
    name: "write_changelog_draft",
    description:
      "Write a CHANGELOG.md draft for a version from local git history. Use dryRun to preview. " +
      LOCAL_NOTICE,
    inputSchema: {
      type: "object",
      properties: {
        repoPath: { type: "string", description: "Path to local git repo (default: cwd)." },
        from: { type: "string", description: "Older ref (tag/commit)." },
        to: { type: "string", description: "Newer ref (default: HEAD)." },
        version: { type: "string", description: "Version label (default: Unreleased)." },
        date: { type: "string", description: "ISO date YYYY-MM-DD (default: today)." },
        outputPath: { type: "string", description: "Output file path (default: <repo>/CHANGELOG.md)." },
        prependExisting: {
          type: "boolean",
          description: "If true and file exists, prepend new section under # Changelog.",
        },
        dryRun: { type: "boolean", description: "If true, return preview without writing." },
      },
    },
  },
];

const handlers = {
  generate_release_notes: generateReleaseNotes,
  group_conventional_commits: groupConventionalCommits,
  write_changelog_draft: writeChangelogDraft,
};

const server = new Server(
  { name: "git-changelog", version: "0.1.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const name = request.params.name;
  const args = request.params.arguments ?? {};
  const handler = handlers[name];
  if (!handler) {
    return { content: [{ type: "text", text: `Unknown tool: ${name}` }], isError: true };
  }
  try {
    const result = await handler(args);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      content: [{ type: "text", text: JSON.stringify({ error: message }, null, 2) }],
      isError: true,
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
