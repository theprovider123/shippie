export interface LocalFileEntry {
  path: string;
  kind: 'file' | 'directory';
  size?: number;
  type?: string;
  createdAt?: string;
  modifiedAt?: string;
}

export interface LocalFileThumbnailOptions {
  width: number;
  height: number;
  type?: 'image/png' | 'image/jpeg' | 'image/webp';
  quality?: number;
}

export interface ShippieLocalFiles {
  write(path: string, value: Blob | ArrayBuffer | string): Promise<void>;
  read(path: string): Promise<Blob>;
  list(path?: string): Promise<LocalFileEntry[]>;
  delete(path: string): Promise<void>;
  usage(): Promise<{ usedBytes: number; quotaBytes?: number }>;
  thumbnail(path: string, opts: LocalFileThumbnailOptions): Promise<Blob>;
}
