import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import {
  parseCommitLine,
  groupCommits,
  formatReleaseNotes,
  generateReleaseNotes,
  groupConventionalCommits,
  writeChangelogDraft,
  resolveRepoPath,
} from "../lib.js";

describe("parseCommitLine", () => {
  it("parses conventional feat", () => {
    const c = parseCommitLine("abc1234\tfeat(api): add endpoint");
    assert.equal(c.type, "feat");
    assert.equal(c.scope, "api");
    assert.equal(c.description, "add endpoint");
    assert.equal(c.breaking, false);
  });

  it("detects breaking bang", () => {
    const c = parseCommitLine("deadbee\tfeat!: drop legacy");
    assert.equal(c.breaking, true);
    assert.equal(c.type, "feat");
  });

  it("falls back to other", () => {
    const c = parseCommitLine("1111111\tWIP stuff");
    assert.equal(c.type, "other");
  });
});

describe("groupCommits + formatReleaseNotes", () => {
  it("groups and formats", () => {
    const commits = [
      parseCommitLine("a\tfeat: one"),
      parseCommitLine("b\tfix: two"),
      parseCommitLine("c\trandom"),
    ];
    const groups = groupCommits(commits);
    assert.equal(groups.feat.length, 1);
    assert.equal(groups.fix.length, 1);
    assert.equal(groups.other.length, 1);
    const md = formatReleaseNotes({ from: "v1", to: "HEAD", groups, title: "Notes" });
    assert.match(md, /## Features/);
    assert.match(md, /## Bug Fixes/);
  });
});

describe("integration with temp git repo", () => {
  let dir;

  before(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "git-changelog-"));
    execFileSync("git", ["init"], { cwd: dir });
    execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: dir });
    execFileSync("git", ["config", "user.name", "Test"], { cwd: dir });
    fs.writeFileSync(path.join(dir, "a.txt"), "a");
    execFileSync("git", ["add", "."], { cwd: dir });
    execFileSync("git", ["commit", "-m", "feat: initial"], { cwd: dir });
    fs.writeFileSync(path.join(dir, "b.txt"), "b");
    execFileSync("git", ["add", "."], { cwd: dir });
    execFileSync("git", ["commit", "-m", "fix: bug"], { cwd: dir });
  });

  after(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("resolveRepoPath accepts git dir", () => {
    assert.equal(resolveRepoPath(dir), path.resolve(dir));
  });

  it("generateReleaseNotes", () => {
    const r = generateReleaseNotes({ repoPath: dir });
    assert.ok(r.commitCount >= 2);
    assert.match(r.markdown, /Features|Bug Fixes/);
  });

  it("groupConventionalCommits", () => {
    const r = groupConventionalCommits({ repoPath: dir });
    assert.ok(r.summary.feat >= 1);
    assert.ok(r.summary.fix >= 1);
  });

  it("writeChangelogDraft dryRun", () => {
    const r = writeChangelogDraft({ repoPath: dir, version: "0.1.0", dryRun: true });
    assert.equal(r.dryRun, true);
    assert.match(r.preview, /0\.1\.0/);
  });

  it("writeChangelogDraft writes file", () => {
    const out = path.join(dir, "CHANGELOG.md");
    const r = writeChangelogDraft({ repoPath: dir, version: "0.1.0", outputPath: out });
    assert.equal(r.dryRun, false);
    assert.ok(fs.existsSync(out));
    assert.match(fs.readFileSync(out, "utf8"), /Changelog/);
  });
});
