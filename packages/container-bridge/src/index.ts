import {
  AppPackageContractError,
  SHIPPIE_BRIDGE_PROTOCOL,
  assertCapabilityAllowed,
  createBridgeRequest,
  createBridgeResponse,
  normalizeHostname,
  type AppPermissions,
  type BridgeCapability,
  type BridgeRequest,
  type BridgeResponse,
} from '@shippie/app-package-contract';

export type BridgeMessage = BridgeRequest | BridgeResponse;

export interface BridgeTransport {
  post(message: BridgeMessage): void;
  subscribe(handler: (message: BridgeMessage) => void): () => void;
}

export interface BridgeClientOptions {
  appId: string;
  transport: BridgeTransport;
  timeoutMs?: number;
  createId?: () => string;
}

export type BridgeHandler = (context: BridgeHandlerContext) => unknown | Promise<unknown>;

export interface BridgeHandlerContext {
  request: BridgeRequest;
  capability: BridgeCapability;
  method: string;
  payload: unknown;
}

export interface BridgeHostOptions {
  appId: string;
  permissions: AppPermissions;
  transport: BridgeTransport;
  handlers: Partial<Record<BridgeCapability, BridgeHandler>>;
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

let nextRequestId = 0;

export class ContainerBridgeClient {
  private readonly pending = new Map<string, PendingRequest>();
  private readonly unsubscribe: () => void;
  private readonly timeoutMs: number;
  private readonly createId: () => string;

  constructor(private readonly options: BridgeClientOptions) {
    this.timeoutMs = options.timeoutMs ?? 5_000;
    this.createId = options.createId ?? (() => `bridge_${++nextRequestId}`);
    this.unsubscribe = options.transport.subscribe((message) => this.onMessage(message));
  }

  call<T = unknown>(capability: BridgeCapability, method: string, payload: unknown): Promise<T> {
    const id = this.createId();
    const request = createBridgeRequest({
      id,
      appId: this.options.appId,
      capability,
      method,
      payload,
    });

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new BridgeRpcError('Bridge request timed out.', 'bridge_timeout', { capability, method }));
      }, this.timeoutMs);

      this.pending.set(id, {
        resolve: (value) => resolve(value as T),
        reject,
        timer,
      });

      this.options.transport.post(request);
    });
  }

  dispose(): void {
    this.unsubscribe();
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(new BridgeRpcError('Bridge client disposed.', 'bridge_disposed', { id }));
    }
    this.pending.clear();
  }

  private onMessage(message: BridgeMessage): void {
    if (!isBridgeResponse(message)) return;
    const pending = this.pending.get(message.id);
    if (!pending) return;

    clearTimeout(pending.timer);
    this.pending.delete(message.id);

    if (message.ok) {
      pending.resolve(message.result);
      return;
    }

    pending.reject(new BridgeRpcError(message.error?.message ?? 'Bridge request failed.', message.error?.code ?? 'bridge_error'));
  }
}

export class ContainerBridgeHost {
  private readonly unsubscribe: () => void;

  constructor(private readonly options: BridgeHostOptions) {
    this.unsubscribe = options.transport.subscribe((message) => {
      void this.onMessage(message);
    });
  }

  dispose(): void {
    this.unsubscribe();
  }

  private async onMessage(message: BridgeMessage): Promise<void> {
    if (!isBridgeRequest(message)) return;
    if (message.appId !== this.options.appId) {
      this.options.transport.post(
        createBridgeResponse({
          id: message.id,
          ok: false,
          error: {
            code: 'app_mismatch',
            message: 'Bridge request was sent for a different app.',
          },
        }),
      );
      return;
    }

    try {
      assertCapabilityAllowed(
        this.options.permissions,
        message.capability,
        capabilityOptionsFromPayload(message.capability, message.payload),
      );

      const handler = this.options.handlers[message.capability];
      if (!handler) {
        throw new BridgeRpcError('No bridge handler is registered for this capability.', 'bridge_handler_missing', {
          capability: message.capability,
        });
      }

      const result = await handler({
        request: message,
        capability: message.capability,
        method: message.method,
        payload: message.payload,
      });

      this.options.transport.post(
        createBridgeResponse({
          id: message.id,
          ok: true,
          result,
        }),
      );
    } catch (error) {
      this.options.transport.post(
        createBridgeResponse({
          id: message.id,
          ok: false,
          error: bridgeErrorPayload(error),
        }),
      );
    }
  }
}

export class BridgeRpcError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'BridgeRpcError';
  }
}

export function createMemoryBridgeTransports(): { client: BridgeTransport; host: BridgeTransport } {
  const clientListeners = new Set<(message: BridgeMessage) => void>();
  const hostListeners = new Set<(message: BridgeMessage) => void>();

  return {
    client: {
      post(message) {
        queueMicrotask(() => {
          for (const listener of hostListeners) listener(message);
        });
      },
      subscribe(handler) {
        clientListeners.add(handler);
        return () => clientListeners.delete(handler);
      },
    },
    host: {
      post(message) {
        queueMicrotask(() => {
          for (const listener of clientListeners) listener(message);
        });
      },
      subscribe(handler) {
        hostListeners.add(handler);
        return () => hostListeners.delete(handler);
      },
    },
  };
}

export function isBridgeRequest(message: unknown): message is BridgeRequest {
  return (
    Boolean(message) &&
    typeof message === 'object' &&
    (message as Partial<BridgeRequest>).protocol === SHIPPIE_BRIDGE_PROTOCOL &&
    typeof (message as Partial<BridgeRequest>).capability === 'string'
  );
}

export function isBridgeResponse(message: unknown): message is BridgeResponse {
  return (
    Boolean(message) &&
    typeof message === 'object' &&
    (message as Partial<BridgeResponse>).protocol === SHIPPIE_BRIDGE_PROTOCOL &&
    typeof (message as Partial<BridgeResponse>).ok === 'boolean'
  );
}

function capabilityOptionsFromPayload(
  capability: BridgeCapability,
  payload: unknown,
): { domain?: string; intent?: string } {
  if (!payload || typeof payload !== 'object') return {};
  const record = payload as Record<string, unknown>;

  if (capability === 'network.fetch') {
    const domain = typeof record.domain === 'string' ? record.domain : undefined;
    const url = typeof record.url === 'string' ? record.url : undefined;
    const normalized = normalizeHostname(domain ?? url ?? '');
    return normalized ? { domain: normalized } : {};
  }

  if (capability === 'intent.provide' || capability === 'intent.consume') {
    return typeof record.intent === 'string' ? { intent: record.intent } : {};
  }

  return {};
}

function bridgeErrorPayload(error: unknown): NonNullable<BridgeResponse['error']> {
  if (error instanceof BridgeRpcError || error instanceof AppPackageContractError) {
    return {
      code: error.code,
      message: error.message,
    };
  }

  if (error instanceof Error) {
    return {
      code: 'bridge_error',
      message: error.message,
    };
  }

  return {
    code: 'bridge_error',
    message: 'Bridge request failed.',
  };
}
