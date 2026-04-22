/**
 * Shared JSON body validation for route handlers.
 *
 * Centralizes the "parse the JSON, validate against a Zod schema,
 * return a 400 on failure" pattern that every mutating route needs.
 * Replaces the `JSON.parse(raw) as Type` and `.catch(() => ({})) as Type`
 * casts scattered through the API surface, which silently coerced
 * missing fields to undefined.
 *
 * Parse errors are logged (not swallowed) so bad callers surface in
 * observability rather than looking like empty bodies.
 */
import { NextResponse, type NextRequest } from 'next/server';
import type { z } from 'zod';

export type ValidatedBody<T> =
  | { ok: true; data: T }
  | { ok: false; response: NextResponse };

function buildInvalidBodyResponse(error: z.ZodError): NextResponse {
  return NextResponse.json(
    {
      error: 'invalid_body',
      issues: error.issues.map((i) => ({
        path: i.path.join('.'),
        code: i.code,
        message: i.message,
      })),
    },
    { status: 400 },
  );
}

function buildInvalidJsonResponse(err: unknown): NextResponse {
  return NextResponse.json(
    { error: 'invalid_json', message: (err as Error).message },
    { status: 400 },
  );
}

/**
 * Parse a `NextRequest` body as JSON and validate it against a schema.
 * Callers that need the raw string first (e.g. for HMAC verification)
 * should use `parseRawBody` instead.
 */
export async function parseBody<T>(
  req: NextRequest,
  schema: z.ZodType<T>,
): Promise<ValidatedBody<T>> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch (err) {
    console.warn('[validation] body parse failed', { err: (err as Error).message });
    return { ok: false, response: buildInvalidJsonResponse(err) };
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    return { ok: false, response: buildInvalidBodyResponse(result.error) };
  }
  return { ok: true, data: result.data };
}

/**
 * Validate an already-extracted value against a schema. Use when the
 * body comes from something other than a JSON body (e.g. FormData, or
 * a merge of headers + body).
 */
export function parseValue<T>(raw: unknown, schema: z.ZodType<T>): ValidatedBody<T> {
  const result = schema.safeParse(raw);
  if (!result.success) {
    return { ok: false, response: buildInvalidBodyResponse(result.error) };
  }
  return { ok: true, data: result.data };
}

/**
 * Validate a raw JSON string against a schema. Use when the caller
 * has already read the body (typically after `req.text()` for
 * signature verification).
 */
export function parseRawBody<T>(
  raw: string,
  schema: z.ZodType<T>,
): ValidatedBody<T> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    console.warn('[validation] body parse failed', { err: (err as Error).message });
    return { ok: false, response: buildInvalidJsonResponse(err) };
  }
  const result = schema.safeParse(parsed);
  if (!result.success) {
    return { ok: false, response: buildInvalidBodyResponse(result.error) };
  }
  return { ok: true, data: result.data };
}
