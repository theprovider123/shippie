import { useEffect, useState } from 'react';
import type { ShippieLocalFiles } from '@shippie/local-runtime-contract';
import type { Page } from '../db/schema.ts';

interface Props {
  page: Page;
  files: ShippieLocalFiles;
}

export function PageThumbnail({ page, files }: Props) {
  const [svg, setSvg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!page.svg_blob_id) {
        setSvg(null);
        return;
      }
      try {
        const blob = await files.read(page.svg_blob_id);
        if (cancelled) return;
        const text = await blob.text();
        setSvg(text);
      } catch {
        if (!cancelled) setSvg(null);
      }
    })();
    return () => { cancelled = true; };
  }, [files, page.svg_blob_id]);

  if (!svg) {
    return <div className="ss-thumb ss-thumb-empty" aria-label="Empty page" />;
  }
  return (
    <div
      className="ss-thumb"
      // SVG comes from canvas.ts (our own serialiser); safe.
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
