export interface LocalRuntimeCapabilities {
  wasm: boolean;
  opfs: boolean;
  indexedDb: boolean;
  storageEstimate: boolean;
  storagePersist: boolean;
  webGpu: boolean;
  webWorker: boolean;
  crypto: boolean;
}

export function supportsWasm(): boolean {
  return typeof WebAssembly === 'object' && typeof WebAssembly.instantiate === 'function';
}

export function supportsIndexedDb(): boolean {
  return typeof indexedDB !== 'undefined';
}

export function supportsOpfs(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof navigator.storage?.getDirectory === 'function'
  );
}

export function supportsStorageEstimate(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof navigator.storage?.estimate === 'function'
  );
}

export function supportsStoragePersist(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof navigator.storage?.persist === 'function'
  );
}

export function supportsWebGPU(): boolean {
  return typeof navigator !== 'undefined' && 'gpu' in navigator;
}

export function detectLocalRuntimeCapabilities(): LocalRuntimeCapabilities {
  return {
    wasm: supportsWasm(),
    opfs: supportsOpfs(),
    indexedDb: supportsIndexedDb(),
    storageEstimate: supportsStorageEstimate(),
    storagePersist: supportsStoragePersist(),
    webGpu: supportsWebGPU(),
    webWorker: typeof Worker !== 'undefined',
    crypto: typeof crypto !== 'undefined' && typeof crypto.subtle !== 'undefined',
  };
}
