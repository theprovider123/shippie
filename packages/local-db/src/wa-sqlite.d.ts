declare module 'wa-sqlite/dist/wa-sqlite.mjs' {
  const factory: (config?: object) => Promise<unknown>;
  export default factory;
}

declare module 'wa-sqlite/dist/wa-sqlite-async.mjs' {
  const factory: (config?: object) => Promise<unknown>;
  export default factory;
}

declare module 'wa-sqlite/src/examples/OriginPrivateFileSystemVFS.js' {
  export class OriginPrivateFileSystemVFS {
    readonly name: string;
    close(): Promise<void>;
  }
}
