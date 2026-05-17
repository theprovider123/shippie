import { createClient } from '@shippie/core';

export async function remixCommand(slug: string, opts: { api?: string; json?: boolean }) {
  const client = createClient({ apiUrl: opts.api ?? 'https://shippie.app' });

  try {
    const remix = await client.remix(slug);
    if (opts.json) {
      console.log(JSON.stringify(remix, null, 2));
      return;
    }

    console.log(`Remix: ${remix.name} (${remix.slug})`);
    if (remix.tagline) console.log(remix.tagline);
    console.log(`Source:  ${remix.sourceRepo}`);
    console.log(`License: ${remix.license}`);
    if (remix.latestVersion) console.log(`Version: ${remix.latestVersion}`);
    if (remix.forkUrl) console.log(`Fork:    ${remix.forkUrl}`);
    console.log('');
    console.log('Deploy after your changes:');
    console.log(`  ${remix.deploy.cli}`);
    console.log('');
    console.log('MCP handoff:');
    console.log(`  deploy(directory="${remix.deploy.mcp.arguments.directory}", slug="${remix.deploy.mcp.arguments.slug}", remix_from="${remix.deploy.mcp.arguments.remix_from}")`);
  } catch (err) {
    console.error(`remix failed: ${(err as Error).message}`);
    process.exitCode = 1;
  }
}
