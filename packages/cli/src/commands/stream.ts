/**
 * `shippie stream <deploy-id>` — replay the deploy event stream.
 *
 * Same code path as the MCP `stream` tool: client.stream() backed by
 * @shippie/core. Pretty-prints events as they arrive.
 */
import { createClient, formatDeployStreamLine } from '@shippie/core';

interface StreamOptions {
  api?: string;
  delay?: string;
}

export async function streamCommand(deployId: string, opts: StreamOptions): Promise<void> {
  const client = createClient({ apiUrl: opts.api ?? 'https://shippie.app' });
  const replayDelayMs = Number(opts.delay ?? '30');

  try {
    for await (const event of client.stream(deployId, { replayDelayMs })) {
      console.log(formatDeployStreamLine(event.type, event.data));
    }
  } catch (err) {
    console.error(`Stream failed: ${(err as Error).message}`);
    process.exit(1);
  }
}
