import { useEffect, useRef } from 'react';
import { renderQrSvg } from '@shippie/sdk/wrapper';

interface ShareCodeProps {
  code: string;
}

export function ShareCode({ code }: ShareCodeProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const url = `${window.location.origin}/?code=${code}`;
    el.innerHTML = renderQrSvg(url, { size: 192 });
  }, [code]);

  return (
    <section className="share-code">
      <p>Tell guests:</p>
      <h1 className="code">{code}</h1>
      <div ref={wrapRef} aria-label={`QR code for join link with code ${code}`} />
    </section>
  );
}
