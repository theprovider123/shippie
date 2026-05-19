export type KeepsakeTemplate<T> = (
  ctx: CanvasRenderingContext2D,
  data: T,
  width: number,
  height: number,
) => void | Promise<void>;

export type KeepsakePayload = {
  pngBlob: Blob;
  pdfBlob: Blob;
  filename: string;
};
