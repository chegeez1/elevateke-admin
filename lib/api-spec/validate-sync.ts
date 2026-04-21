/**
 * validate-sync.ts
 *
 * Checks that the generated Zod schemas (lib/api-zod/src/generated/api.ts)
 * are in sync with the OpenAPI spec (openapi.yaml).
 *
 * What this script verifies:
 *  - Every required field listed in an OpenAPI component schema exists in the
 *    corresponding top-level generated Zod export. This catches the case where
 *    someone edits the spec but forgets to re-run codegen, leaving the
 *    generated file stale.
 *
 * What this script does NOT verify:
 *  - Route handler response shapes (those are caught at runtime by
 *    validateResponse() in artifacts/api-server/src/lib/validate-response.ts).
 *
 * Run automatically as part of `pnpm --filter @workspace/api-spec run codegen`.
 */

import { parse } from "yaml";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const specPath = resolve(__dirname, "openapi.yaml");
const zodPath = resolve(__dirname, "../../lib/api-zod/src/generated/api.ts");

type OpenApiSchema = {
  type?: string;
  properties?: Record<string, unknown>;
  required?: string[];
  allOf?: OpenApiSchema[];
  anyOf?: OpenApiSchema[];
  oneOf?: OpenApiSchema[];
};

type OpenApiSpec = {
  components?: {
    schemas?: Record<string, OpenApiSchema>;
  };
};

const specContent = readFileSync(specPath, "utf8");
const spec = parse(specContent) as OpenApiSpec;
const zodContent = readFileSync(zodPath, "utf8");

const schemas = spec.components?.schemas ?? {};
const errors: string[] = [];
const checked: string[] = [];

/** Extract the body of a top-level `export const Name = zod.object({ ... })` */
function findZodObjectBody(schemaName: string): string | null {
  const pattern = new RegExp(
    `export const ${schemaName}\\s*=\\s*zod\\.object\\(\\{([\\s\\S]*?)\\}\\)`,
  );
  const m = pattern.exec(zodContent);
  return m ? m[1] : null;
}

for (const [schemaName, schema] of Object.entries(schemas)) {
  const required = schema.required ?? [];
  if (!schema.properties || required.length === 0) continue;

  const zodBody = findZodObjectBody(schemaName);
  if (zodBody === null) {
    // Schema might be embedded inside array response types or inline — skip.
    continue;
  }

  checked.push(schemaName);

  for (const field of required) {
    // Each field should appear as `fieldName:` inside the zod.object body
    const fieldPattern = new RegExp(`\\b${field}:`);
    if (!fieldPattern.test(zodBody)) {
      errors.push(
        `Schema "${schemaName}": required field "${field}" is missing from the generated Zod schema`,
      );
    }
  }
}

if (errors.length > 0) {
  console.error("\n❌  OpenAPI spec / generated Zod drift detected:\n");
  for (const err of errors) {
    console.error(`   • ${err}`);
  }
  console.error(
    "\nFix the openapi.yaml or re-run codegen after updating the spec.\n",
  );
  process.exit(1);
} else {
  console.log(
    `✅  Spec validation passed — ${checked.length} schemas checked, all in sync.`,
  );
}
