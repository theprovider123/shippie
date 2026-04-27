import { describe, expect, test } from 'bun:test';
import { streamDeploy, type StreamEvent } from './stream.ts';

function sseResponse(body: string): Response {
  return new Response(body, {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  });
}

async function collect(deployId: string, mockBody: string): Promise<StreamEvent[]> {
  const fetchImpl = async () => sseResponse(mockBody);
  const events: StreamEvent[] = [];
  for await (const e of streamDeploy(
    { apiUrl: 'https://example.com' },
    deployId,
    { fetchImpl: fetchImpl as unknown as typeof fetch },
  )) {
    events.push(e);
  }
  return events;
}

describe('streamDeploy', () => {
  test('parses SSE frames into typed events', async () => {
    const body =
      `event: ready\ndata: {"deploy_id":"x","slug":"y","version":1,"eventCount":2}\n\n` +
      `event: deploy_received\ndata: {"slug":"y","version":1,"files":3,"bytes":100}\n\n` +
      `event: deploy_live\ndata: {"liveUrl":"https://y.shippie.app/","durationMs":12000}\n\n` +
      `event: end\ndata: {}\n\n`;
    const events = await collect('x', body);
    expect(events.length).toBe(4);
    expect(events[0].type).toBe('ready');
    expect(events[1].type).toBe('deploy_received');
    expect(events[1].data.files).toBe(3);
    expect(events[2].data.liveUrl).toBe('https://y.shippie.app/');
    expect(events[3].type).toBe('end');
  });

  test('handles missing data gracefully', async () => {
    const body = `event: pending\ndata: {"deploy_id":"x"}\n\n`;
    const events = await collect('x', body);
    expect(events.length).toBe(1);
    expect(events[0].type).toBe('pending');
  });

  test('throws on non-200 response', async () => {
    const fetchImpl = (async () =>
      new Response('nope', { status: 404, statusText: 'Not Found' })) as unknown as typeof fetch;
    let caught: Error | null = null;
    try {
      const gen = streamDeploy(
        { apiUrl: 'https://example.com' },
        'x',
        { fetchImpl },
      );
      await gen.next();
    } catch (e) {
      caught = e as Error;
    }
    expect(caught?.message).toContain('stream_request_failed');
  });
});
