import assert from "node:assert/strict";
import { join } from "node:path";
import test from "node:test";

import {
  checkRegistryTables,
  cleanCell,
  collectTableLines,
  IMPORT_HEADERS,
  IMPORT_HEADING,
  MANAGED_PROJECTS_RELATIVE,
  parseTableAfterHeading,
  PROJECTS_HEADERS,
  PROJECTS_HEADING,
  resolveManagedProjectsPath,
  validateHeaders,
  validateRegistryTableContent,
} from "../src/probes/registry_tables.ts";

const validProjectsHeader = `| ${PROJECTS_HEADERS.join(" | ")} |`;
const validProjectsSeparator = `| ${PROJECTS_HEADERS.map(() => "---").join(" | ")} |`;
const validImportHeader = `| ${IMPORT_HEADERS.join(" | ")} |`;
const validImportSeparator = `| ${IMPORT_HEADERS.map(() => "---").join(" | ")} |`;

const validRegistryMarkdown = `
${PROJECTS_HEADING}

${validProjectsHeader}
${validProjectsSeparator}
| pi-multica-doctor | \`00000000-0000-4000-8000-000000000001\` | pi-multica-doctor Maintenance | \`C:/repo\` | in_progress | high | Pi Ace | notes |

${IMPORT_HEADING}

${validImportHeader}
${validImportSeparator}
| pi-multica-doctor | \`4_Project/OSS/pi-multica-doctor\` | \`4_Project/OSS/pi-multica-doctor/Issues\` | \`*.md\` | true |
`;

const vaultRoot = "/vault";

const healthyRegistryTables = {
  cwd: () => vaultRoot,
  getVaultRoot: () => undefined,
  existsSync: (path) =>
    path === join(vaultRoot, MANAGED_PROJECTS_RELATIVE),
  readFileSync: () => validRegistryMarkdown,
};

test("cleanCell strips padding and backticks", () => {
  assert.equal(cleanCell(" `4_Project/OSS/foo` "), "4_Project/OSS/foo");
});

test("collectTableLines returns header and separator rows", () => {
  const lines = collectTableLines(validRegistryMarkdown, PROJECTS_HEADING);
  assert.equal(lines.length, 3);
  assert.match(lines[0] ?? "", /project_key/);
});

test("parseTableAfterHeading parses rows with expected column counts", () => {
  const parsed = parseTableAfterHeading(validRegistryMarkdown, IMPORT_HEADING);
  assert.deepEqual(parsed.headers, [...IMPORT_HEADERS]);
  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.rows[0]?.[0], "pi-multica-doctor");
});

test("parseTableAfterHeading preserves escaped and code-span pipes", () => {
  const text = `
${PROJECTS_HEADING}
| a | b |
| --- | --- |
| escaped \\| pipe | \`code|pipe\` |
`;

  const parsed = parseTableAfterHeading(text, PROJECTS_HEADING);
  assert.deepEqual(parsed.rows, [["escaped \\| pipe", "code|pipe"]]);
});

test("validateRegistryTableContent fails when the separator row is missing", () => {
  const malformed = validRegistryMarkdown.replace(
    validProjectsSeparator,
    "| not a separator |",
  );
  const problems = validateRegistryTableContent(malformed);
  assert.ok(problems.some((problem) => /separator/i.test(problem.detail)));
});

test("validateRegistryTableContent requires exact section headings", () => {
  const malformed = validRegistryMarkdown.replace(
    PROJECTS_HEADING,
    "### Projects",
  );
  const problems = validateRegistryTableContent(malformed);
  assert.ok(problems.some((problem) => /heading missing/i.test(problem.detail)));
});

test("validateHeaders accepts expected Projects headers", () => {
  assert.equal(
    validateHeaders([...PROJECTS_HEADERS], PROJECTS_HEADERS, PROJECTS_HEADING),
    null,
  );
});

test("validateRegistryTableContent passes for valid tables", () => {
  assert.deepEqual(validateRegistryTableContent(validRegistryMarkdown), []);
});

test("validateRegistryTableContent fails on header drift", () => {
  const drifted = validRegistryMarkdown.replace(
    "project_key",
    "project id",
  );
  const problems = validateRegistryTableContent(drifted);
  assert.ok(problems.length >= 1);
  assert.match(problems[0]?.detail ?? "", /unexpected headers/i);
  assert.match(problems[0]?.hint ?? "", /Projects section/i);
});

test("validateRegistryTableContent fails on row column mismatch", () => {
  const malformed = validRegistryMarkdown.replace(
    "| pi-multica-doctor | `4_Project/OSS/pi-multica-doctor` | `4_Project/OSS/pi-multica-doctor/Issues` | `*.md` | true |",
    "| pi-multica-doctor | `4_Project/OSS/pi-multica-doctor` | true |",
  );
  const problems = validateRegistryTableContent(malformed);
  assert.ok(problems.some((problem) => /column mismatch/i.test(problem.detail)));
});

test("checkRegistryTables passes when managed-projects.md is valid", () => {
  const result = checkRegistryTables(healthyRegistryTables);

  assert.equal(result.status, "pass");
  assert.match(result.detail ?? "", /Projects and Local Issue Import mapping/i);
});

test("checkRegistryTables fails when managed-projects.md is missing", () => {
  const result = checkRegistryTables({
    cwd: () => vaultRoot,
    getVaultRoot: () => undefined,
    existsSync: () => false,
    readFileSync: () => {
      throw new Error("should not read");
    },
  });

  assert.equal(result.status, "fail");
  assert.match(result.detail ?? "", /not found/i);
  assert.match(result.hint ?? "", /OBSIDIAN_VAULT_ROOT/i);
});

test("checkRegistryTables fails on malformed table content", () => {
  const result = checkRegistryTables({
    ...healthyRegistryTables,
    readFileSync: () => `${PROJECTS_HEADING}\n\nno table here\n`,
  });

  assert.equal(result.status, "fail");
  assert.match(result.detail ?? "", /table missing or too short/i);
});

test("checkRegistryTables surfaces read errors as check failures", () => {
  const result = checkRegistryTables({
    ...healthyRegistryTables,
    readFileSync: () => {
      throw new Error("permission denied");
    },
  });

  assert.equal(result.status, "fail");
  assert.match(result.detail ?? "", /registry_tables probe error: permission denied/);
});

test("resolveManagedProjectsPath prefers OBSIDIAN_VAULT_ROOT", () => {
  const path = resolveManagedProjectsPath({
    cwd: () => "/ignored",
    getVaultRoot: () => "/env-vault",
    existsSync: () => true,
    readFileSync: () => validRegistryMarkdown,
  });

  assert.equal(path, join("/env-vault", MANAGED_PROJECTS_RELATIVE));
});

test("checkRegistryTables never throws", () => {
  assert.doesNotThrow(() =>
    checkRegistryTables({
      cwd: () => {
        throw new Error("boom");
      },
      getVaultRoot: () => undefined,
      existsSync: () => false,
      readFileSync: () => "",
    }),
  );
});
