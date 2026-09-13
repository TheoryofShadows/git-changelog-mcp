/**
 * Local-git changelog helpers. Never talks to remotes; only reads the user's repo.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const CONVENTIONAL_RE =
  /^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\([^)]+\))?(!)?:\s*(.+)$/i;

export function resolveRepoPath(repoPath) {
  const p = path.resolve(repoPath || process.cwd());
  if (!fs.existsSync(p)) throw new Error(`Path does not exist: ${p}`);
  const gitDir = path.join(p, ".git");
  // Allow worktrees / .git as file
  if (!fs.existsSync(gitDir)) throw new Error(`Not a git repository: ${p}`);
  return p;
}

export function git(repoPath, args) {
  try {
    return execFileSync("git", args, {
      cwd: repoPath,
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch (err) {
    const msg = err.stderr?.toString?.() || err.message || String(err);
    throw new Error(`git ${args.join(" ")} failed: ${msg.trim()}`);
  }
}

export function parseCommitLine(line) {
  // format: hash<TAB>subject
  const tab = line.indexOf("\t");
  if (tab === -1) return { hash: line.slice(0, 7), subject: line, type: "other", scope: null, breaking: false, description: line };
  const hash = line.slice(0, tab);
  const subject = line.slice(tab + 1);
  const m = subject.match(CONVENTIONAL_RE);
  if (!m) {
    return { hash, subject, type: "other", scope: null, breaking: false, description: subject };
  }
  return {
    hash,
    subject,
    type: m[1].toLowerCase(),
    scope: m[2] ? m[2].slice(1, -1) : null,
    breaking: Boolean(m[3]) || /BREAKING CHANGE/i.test(subject),
    description: m[4],
  };
}

export function groupCommits(commits) {
  const order = ["feat", "fix", "perf", "refactor", "docs", "test", "build", "ci", "chore", "style", "revert", "other"];
  const groups = Object.fromEntries(order.map((k) => [k, []]));
  for (const c of commits) {
    const key = groups[c.type] ? c.type : "other";
    groups[key].push(c);
  }
  return groups;
}

export function formatReleaseNotes({ from, to, groups, title }) {
  const lines = [];
  lines.push(`# ${title || "Release notes"}`);
  lines.push("");
  if (from || to) {
    lines.push(`Range: \`${from || "(root)"}\` → \`${to || "HEAD"}\``);
    lines.push("");
  }
  const labels = {
    feat: "Features",
    fix: "Bug Fixes",
    perf: "Performance",
    refactor: "Refactors",
    docs: "Documentation",
    test: "Tests",
    build: "Build",
    ci: "CI",
    chore: "Chores",
    style: "Style",
    revert: "Reverts",
    other: "Other",
  };
  let any = false;
  for (const [type, label] of Object.entries(labels)) {
    const items = groups[type] || [];
    if (!items.length) continue;
    any = true;
    lines.push(`## ${label}`);
    lines.push("");
    for (const c of items) {
      const scope = c.scope ? `**${c.scope}:** ` : "";
      const bang = c.breaking ? " ⚠️ BREAKING" : "";
      lines.push(`- ${scope}${c.description || c.subject} (\`${c.hash.slice(0, 7)}\`)${bang}`);
    }
    lines.push("");
  }
  if (!any) {
    lines.push("_No commits in this range._");
    lines.push("");
  }
  return lines.join("\n");
}

export function listCommits(repoPath, { from, to } = {}) {
  const range = from ? `${from}..${to || "HEAD"}` : to || "HEAD";
  // %h short hash, %s subject
  let out;
  try {
    out = git(repoPath, ["log", "--no-merges", "--pretty=format:%h\t%s", range]);
  } catch (err) {
    // empty range or invalid — retry with full if from missing
    if (!from) throw err;
    out = git(repoPath, ["log", "--no-merges", "--pretty=format:%h\t%s", `${from}..${to || "HEAD"}`]);
  }
  if (!out) return [];
  return out.split("\n").filter(Boolean).map(parseCommitLine);
}

export function generateReleaseNotes(args = {}) {
  const repoPath = resolveRepoPath(args.repoPath);
  const from = args.from || null;
  const to = args.to || "HEAD";
  const commits = listCommits(repoPath, { from, to });
  const groups = groupCommits(commits);
  const markdown = formatReleaseNotes({
    from,
    to,
    groups,
    title: args.title || `Release notes (${from || "start"} → ${to})`,
  });
  return {
    repoPath,
    from,
    to,
    commitCount: commits.length,
    groups: Object.fromEntries(
      Object.entries(groups).map(([k, v]) => [k, v.map((c) => ({ hash: c.hash, subject: c.subject, breaking: c.breaking }))]),
    ),
    markdown,
  };
}

export function groupConventionalCommits(args = {}) {
  const repoPath = resolveRepoPath(args.repoPath);
  const from = args.from || null;
  const to = args.to || "HEAD";
  const commits = listCommits(repoPath, { from, to });
  const groups = groupCommits(commits);
  const summary = {};
  for (const [k, v] of Object.entries(groups)) {
    if (v.length) summary[k] = v.length;
  }
  return {
    repoPath,
    from,
    to,
    commitCount: commits.length,
    summary,
    groups: Object.fromEntries(
      Object.entries(groups)
        .filter(([, v]) => v.length)
        .map(([k, v]) => [
          k,
          v.map((c) => ({
            hash: c.hash,
            subject: c.subject,
            scope: c.scope,
            breaking: c.breaking,
            description: c.description,
          })),
        ]),
    ),
  };
}

export function writeChangelogDraft(args = {}) {
  const notes = generateReleaseNotes(args);
  const outPath = path.resolve(args.outputPath || path.join(notes.repoPath, "CHANGELOG.md"));
  const version = args.version || "Unreleased";
  const date = args.date || new Date().toISOString().slice(0, 10);
  const header = `# Changelog\n\n## [${version}] - ${date}\n\n`;
  // Strip the # title from notes.markdown and keep sections
  const body = notes.markdown.replace(/^# .+\n\n/, "").replace(/^Range: .+\n\n/, "");
  let content = header + body;
  if (args.prependExisting && fs.existsSync(outPath)) {
    const existing = fs.readFileSync(outPath, "utf8");
    // If existing starts with # Changelog, insert after first heading block
    const stripped = existing.replace(/^# Changelog\s*\n+/i, "");
    content = `# Changelog\n\n## [${version}] - ${date}\n\n` + body + stripped;
  }
  if (args.dryRun) {
    return { dryRun: true, outputPath: outPath, preview: content, commitCount: notes.commitCount };
  }
  fs.writeFileSync(outPath, content, "utf8");
  return { dryRun: false, outputPath: outPath, bytesWritten: Buffer.byteLength(content, "utf8"), commitCount: notes.commitCount };
}
