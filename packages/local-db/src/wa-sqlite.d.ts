// `export default` of a separate `const` inside `declare module` triggers
// rollup-plugin-dts' "namespace child (hoisting) not supported yet" error.
// `export default function` is hoisting-safe and produces equivalent typing.
declare module 'wa-sqlite/dist/wa-sqlite.mjs' {
  export default function factory(config?: object): Promise<unknown>;
}

declare module 'wa-sqlite/dist/wa-sqlite-async.mjs' {
  export default function factory(config?: object): Promise<unknown>;
}

declare module 'wa-sqlite/src/examples/OriginPrivateFileSystemVFS.js' {
  export class OriginPrivateFileSystemVFS {
    readonly name: string;
    close(): Promise<void>;
  }
}
