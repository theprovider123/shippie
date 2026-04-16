/**
 * Node VM-based function runner for Shippie Functions (dev MVP).
 *
 * Takes a JavaScript bundle (esbuild-compiled CommonJS), evaluates it
 * in a fresh `vm.Context`, invokes `module.exports.default(ctx)`, and
 * returns the handler's Response.
 *
 * The context surface matches the spec:
 *   ctx.user        — resolved end-user (from the session handle) or null
 *   ctx.env         — decrypted secrets for this app
 *   ctx.request     — the incoming Request
 *   ctx.fetch       — wrapped fetch that enforces allowed_connect_domains
 *   ctx.log         — structured logger (stringified into function_logs)
 *
 * This is NOT a security boundary in dev — a malicious bundle can
 * ctx.env keys or reach the host through Node globals. Production swaps
 * this runner for a Cloudflare Worker for Platforms dispatch, which IS
 * a V8 isolate boundary.
 *
 * Spec v6 §1 (Shippie Functions).
 */
import vm from 'node:vm';

export interface FunctionCtx {
  user: {
    id: string;
    email: string;
    name: string | null;
    image: string | null;
  } | null;
  env: Record<string, string>;
  request: Request;
  fetch: typeof fetch;
  log: {
    info: (msg: string, meta?: Record<string, unknown>) => void;
    warn: (msg: string, meta?: Record<string, unknown>) => void;
    error: (msg: string, meta?: Record<string, unknown>) => void;
  };
}

export interface LogLine {
  level: 'info' | 'warn' | 'error';
  message: string;
  meta?: Record<string, unknown>;
  at: number;
}

export interface RunFunctionInput {
  bundleSource: string;
  ctx: Omit<FunctionCtx, 'fetch' | 'log'>;
  allowedDomains: readonly string[];
  timeoutMs?: number;
}

export interface RunFunctionResult {
  response: Response;
  durationMs: number;
  logs: LogLine[];
}

export async function runFunction(input: RunFunctionInput): Promise<RunFunctionResult> {
  const started = Date.now();
  const logs: LogLine[] = [];
  const logger: FunctionCtx['log'] = {
    info: (message, meta) => logs.push({ level: 'info', message, meta, at: Date.now() - started }),
    warn: (message, meta) => logs.push({ level: 'warn', message, meta, at: Date.now() - started }),
    error: (message, meta) => logs.push({ level: 'error', message, meta, at: Date.now() - started }),
  };

  const allowlistedFetch = buildAllowlistedFetch(input.allowedDomains, logger);

  const ctx: FunctionCtx = {
    ...input.ctx,
    fetch: allowlistedFetch,
    log: logger,
  };

  const sandbox: Record<string, unknown> = {
    module: { exports: {} as { default?: (ctx: FunctionCtx) => Promise<Response> | Response } },
    exports: {},
    console: {
      log: (...args: unknown[]) => logger.info(args.map(String).join(' ')),
      warn: (...args: unknown[]) => logger.warn(args.map(String).join(' ')),
      error: (...args: unknown[]) => logger.error(args.map(String).join(' ')),
    },
    // Standard web-platform globals we want to expose
    Response,
    Request,
    Headers,
    URL,
    URLSearchParams,
    TextEncoder,
    TextDecoder,
    fetch: allowlistedFetch,
    atob,
    btoa,
    crypto,
    // Node globals we want NOT to expose: process, Buffer, require, __dirname, __filename
  };

  const ctxObj = vm.createContext(sandbox, { name: 'shippie-fn' });

  try {
    const script = new vm.Script(input.bundleSource, { filename: 'user-function.js' });
    script.runInContext(ctxObj, { timeout: input.timeoutMs ?? 5000 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('bundle evaluation threw', { error: msg });
    return {
      response: new Response(JSON.stringify({ error: 'bundle_error', message: msg }), {
        status: 500,
        headers: { 'content-type': 'application/json' },
      }),
      durationMs: Date.now() - started,
      logs,
    };
  }

  const moduleExports = (sandbox.module as { exports?: { default?: (c: FunctionCtx) => Response | Promise<Response> } }).exports;
  const handler = moduleExports?.default;

  if (typeof handler !== 'function') {
    logger.error('bundle did not export a default function');
    return {
      response: new Response(JSON.stringify({ error: 'no_default_export' }), {
        status: 500,
        headers: { 'content-type': 'application/json' },
      }),
      durationMs: Date.now() - started,
      logs,
    };
  }

  try {
    const res = await Promise.resolve(handler(ctx));
    if (!(res instanceof Response)) {
      logger.error('handler returned non-Response value', { type: typeof res });
      return {
        response: new Response(JSON.stringify({ error: 'invalid_handler_return' }), {
          status: 500,
          headers: { 'content-type': 'application/json' },
        }),
        durationMs: Date.now() - started,
        logs,
      };
    }
    return { response: res, durationMs: Date.now() - started, logs };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('handler threw', { error: msg });
    return {
      response: new Response(JSON.stringify({ error: 'handler_error', message: msg }), {
        status: 500,
        headers: { 'content-type': 'application/json' },
      }),
      durationMs: Date.now() - started,
      logs,
    };
  }
}

function buildAllowlistedFetch(
  allowed: readonly string[],
  log: FunctionCtx['log'],
): typeof fetch {
  const allowedSet = new Set(allowed.map((d) => d.toLowerCase()));
  return async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url);
    const host = url.hostname.toLowerCase();
    if (!allowedSet.has(host)) {
      log.warn('blocked outbound fetch', { host, url: url.toString() });
      return new Response(
        JSON.stringify({ error: 'blocked_by_allowlist', host }),
        { status: 403, headers: { 'content-type': 'application/json' } },
      );
    }
    return fetch(input, init);
  };
}
