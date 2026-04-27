import { readToken } from './auth.ts';
import { deployDirectory, type DeployOptions, type DeployResult } from './deploy.ts';
import { fetchStatus, type StatusResult } from './status.ts';
import { fetchAppsList, type AppListItem } from './apps.ts';
import { streamDeploy, type StreamEvent, type StreamOptions } from './stream.ts';

/**
 * Per-instance client config. Construct via `createClient`.
 *
 * `apiUrl` is the load-bearing knob for the ethos check: pointing at
 * `http://hub.local:8787` should produce the exact same surface area as
 * pointing at `https://shippie.app`.
 */
export interface ClientConfig {
  apiUrl?: string;
  token?: string | null;
}

export interface Client {
  apiUrl: string;
  auth: {
    getToken(): string | null;
  };
  deploy(opts: DeployOptions): Promise<DeployResult>;
  status(deployId: string): Promise<StatusResult>;
  stream(deployId: string, opts?: StreamOptions): AsyncGenerator<StreamEvent, void, void>;
  appsList(): Promise<AppListItem[]>;
}

export function createClient(config: ClientConfig = {}): Client {
  const apiUrl =
    config.apiUrl ?? process.env.SHIPPIE_API_URL ?? 'https://shippie.app';
  const token = config.token ?? readToken();

  return {
    apiUrl,
    auth: { getToken: () => token },
    deploy: (opts) => deployDirectory({ apiUrl, token }, opts),
    status: (deployId) => fetchStatus({ apiUrl }, deployId),
    stream: (deployId, opts) => streamDeploy({ apiUrl }, deployId, opts),
    appsList: () => fetchAppsList({ apiUrl, token }),
  };
}
