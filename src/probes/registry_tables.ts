import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { ProbeResult } from "../multica_doctor_check.ts";

export const MANAGED_PROJECTS_RELATIVE = join(
  "4_Project",
  "Multica-Agent-Strategy",
  "Registry",
  "managed-projects.md",
);

export const PROJECTS_HEADING = "## Projects";
export const IMPORT_HEADING = "## Local Issue Import mapping";

export const PROJECTS_HEADERS = [
  "project_key",
  "multica_project_id",
  "project_name",
  "repo/workspace",
  "status",
  "priority",
  "lead",
  "notes",
] as const;

export const IMPORT_HEADERS = [
  "project_key",
  "obsidian_project_path",
  "local_issue_dir",
  "local_issue_glob",
  "local_issue_import_enabled",
] as const;

export interface RegistryTablesDeps {
  cwd: () => string;
  getVaultRoot: () => string | undefined;
  existsSync: (path: string) => boolean;
  readFileSync: (path: string, encoding: BufferEncoding) => string;
}

const defaultDeps = (): RegistryTablesDeps => ({
  cwd: () => process.cwd(),
  getVaultRoot: () => process.env.OBSIDIAN_VAULT_ROOT,
  existsSync,
  readFileSync: (path, encoding) => readFileSync(path, encoding),
});

/**
 * Strip Markdown table cell padding and optional backticks.
 */
export function cleanCell(cell: string): string {
  let text = cell.trim();
  if (text.startsWith("`") && text.endsWith("`")) {
    text = text.slice(1, -1);
  }
  return text.trim();
}

/**
 * Collect contiguous Markdown table lines after a section heading.
 */
export function collectTableLines(text: string, heading: string): string[] {
  const lines = text.split(/\r?\n/);
  const idx = lines.findIndex((line) => line.trim() === heading);
  if (idx === -1) {
    throw new Error(`heading missing: ${heading}`);
  }

  const tableLines: string[] = [];
  let started = false;

  for (const line of lines.slice(idx + 1)) {
    if (/^#{1,6}\s/.test(line.trim()) && started) {
      break;
    }
    if (line.trim().startsWith("|")) {
      started = true;
      tableLines.push(line.trimEnd());
      continue;
    }
    if (started && !line.trim()) {
      break;
    }
  }

  if (tableLines.length < 2) {
    throw new Error(`table missing or too short after heading: ${heading}`);
  }

  return tableLines;
}

function parseTableRow(line: string): string[] {
  const trimmed = line.trim();
  const start = trimmed.startsWith("|") ? 1 : 0;
  const lastIndex = trimmed.length - 1;
  const end =
    trimmed.endsWith("|") && !isEscapedAt(trimmed, lastIndex)
      ? lastIndex
      : trimmed.length;
  const cells: string[] = [];
  let cell = "";
  let inCodeSpan = false;

  for (let index = start; index < end; index += 1) {
    const character = trimmed[index] ?? "";
    const isEscaped = isEscapedAt(trimmed, index);

    if (character === "`" && !isEscaped) {
      inCodeSpan = !inCodeSpan;
    }

    if (character === "|" && !inCodeSpan && !isEscaped) {
      cells.push(cleanCell(cell));
      cell = "";
    } else {
      cell += character;
    }
  }

  cells.push(cleanCell(cell));
  return cells;
}

function isEscapedAt(text: string, index: number): boolean {
  let slashCount = 0;
  for (
    let cursor = index - 1;
    cursor >= 0 && text[cursor] === "\\";
    cursor -= 1
  ) {
    slashCount += 1;
  }
  return slashCount % 2 === 1;
}

function isSeparatorRow(cells: readonly string[]): boolean {
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

export interface ParsedTable {
  headers: string[];
  rows: string[][];
}

/**
 * Parse a Markdown table that follows a section heading.
 */
export function parseTableAfterHeading(
  text: string,
  heading: string,
): ParsedTable {
  const tableLines = collectTableLines(text, heading);
  const headers = parseTableRow(tableLines[0] ?? "");
  const separator = parseTableRow(tableLines[1] ?? "");

  if (separator.length !== headers.length || !isSeparatorRow(separator)) {
    throw new Error(`invalid separator row in ${heading}`);
  }

  const rows: string[][] = [];

  for (const line of tableLines.slice(2)) {
    const cells = parseTableRow(line);
    if (cells.length !== headers.length) {
      throw new Error(
        `row column mismatch in ${heading}: expected ${headers.length} cells, got ${cells.length} :: ${line.trim()}`,
      );
    }
    rows.push(cells);
  }

  return { headers, rows };
}

/**
 * Compare actual headers to the expected registry schema.
 */
export function validateHeaders(
  actual: readonly string[],
  expected: readonly string[],
  tableName: string,
): string | null {
  if (actual.length !== expected.length) {
    return `unexpected column count in ${tableName}: expected ${expected.length}, got ${actual.length}`;
  }

  for (let index = 0; index < expected.length; index += 1) {
    if (actual[index] !== expected[index]) {
      return `unexpected headers in ${tableName}: expected ${JSON.stringify([...expected])}, got ${JSON.stringify(actual)}`;
    }
  }

  return null;
}

export interface RegistryTableValidationProblem {
  detail: string;
  hint: string;
}

/**
 * Validate Projects and Local Issue Import mapping table shapes.
 */
export function validateRegistryTableContent(
  text: string,
): RegistryTableValidationProblem[] {
  const problems: RegistryTableValidationProblem[] = [];

  const tables: Array<{
    heading: string;
    expectedHeaders: readonly string[];
    hintTableName: string;
  }> = [
    {
      heading: PROJECTS_HEADING,
      expectedHeaders: PROJECTS_HEADERS,
      hintTableName: "Projects",
    },
    {
      heading: IMPORT_HEADING,
      expectedHeaders: IMPORT_HEADERS,
      hintTableName: "Local Issue Import mapping",
    },
  ];

  for (const table of tables) {
    try {
      const parsed = parseTableAfterHeading(text, table.heading);
      const headerProblem = validateHeaders(
        parsed.headers,
        table.expectedHeaders,
        table.heading,
      );
      if (headerProblem) {
        problems.push({
          detail: headerProblem,
          hint: `Fix column count or headers in ${table.hintTableName} section of managed-projects.md`,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      problems.push({
        detail: message,
        hint: `Fix column count or headers in ${table.hintTableName} section of managed-projects.md`,
      });
    }
  }

  return problems;
}

export function resolveManagedProjectsPath(deps: RegistryTablesDeps): string {
  const vaultRoot = deps.getVaultRoot() ?? deps.cwd();
  return join(vaultRoot, MANAGED_PROJECTS_RELATIVE);
}

/**
 * Validate managed-projects.md table column shapes (read-only).
 */
export function checkRegistryTables(
  deps: RegistryTablesDeps = defaultDeps(),
): ProbeResult {
  try {
    const registryPath = resolveManagedProjectsPath(deps);

    if (!deps.existsSync(registryPath)) {
      return {
        check: "registry_tables",
        status: "fail",
        detail: `managed-projects.md not found (${MANAGED_PROJECTS_RELATIVE})`,
        hint: "Ensure OBSIDIAN_VAULT_ROOT or cwd points at the Obsidian vault root",
      };
    }

    const content = deps.readFileSync(registryPath, "utf8");
    const problems = validateRegistryTableContent(content);

    if (problems.length === 0) {
      return {
        check: "registry_tables",
        status: "pass",
        detail:
          "Projects and Local Issue Import mapping tables match expected column shapes",
      };
    }

    return {
      check: "registry_tables",
      status: "fail",
      detail: problems.map((problem) => problem.detail).join("; "),
      hint: [...new Set(problems.map((problem) => problem.hint))].join("; "),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      check: "registry_tables",
      status: "fail",
      detail: `registry_tables probe error: ${message}`,
      hint: "Fix managed-projects.md readability issues and retry",
    };
  }
}
