/**
 * validate-response.ts
 *
 * Runtime response validation against generated Zod schemas.
 *
 * In development (NODE_ENV !== "production") a safeParse mismatch logs a
 * structured error to stdout so it shows up immediately in the dev console.
 * In production the response is sent unchanged — the validation is advisory
 * so that a schema bug never takes down a production route.
 *
 * Usage in a route handler:
 *   import { validateResponse } from "../lib/validate-response";
 *   import { SomeResponseSchema } from "@workspace/api-zod";
 *
 *   res.json(validateResponse("/my-route", SomeResponseSchema, responseData));
 */

const isDev = process.env.NODE_ENV !== "production";

interface SafeParseSchema {
  safeParse(data: unknown): { success: boolean; error?: { issues: unknown[] } };
}

/**
 * Validates `data` against `schema` using safeParse.
 * - Dev: logs a structured warning when validation fails (never throws).
 * - Prod: skips validation entirely to avoid any overhead or breakage.
 * Always returns `data` unchanged so it can be inlined into `res.json(...)`.
 */
export function validateResponse<T>(
  routeLabel: string,
  schema: SafeParseSchema,
  data: T,
): T {
  if (!isDev) return data;

  const result = schema.safeParse(data);
  if (!result.success) {
    console.error(
      `[RESPONSE VALIDATION FAILED] ${routeLabel}\n` +
        JSON.stringify(result.error?.issues ?? [], null, 2),
    );
  }

  return data;
}
