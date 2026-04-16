/**
 * OG social card generator — renders a 1200x630 PNG via satori + resvg.
 *
 * Layout:
 *   - theme-color background gradient
 *   - app name in large display weight
 *   - tagline in muted secondary
 *   - "shippie.app/{slug}" footer
 *
 * Font loading: we ship Inter via a workspace asset. Satori needs at
 * least one font with matching weights, or it throws.
 *
 * Spec v6 §8 (auto-packaging — OG card).
 */
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import type { ReactNode } from 'react';

export interface OgCardInput {
  name: string;
  tagline?: string | null;
  slug: string;
  themeColor?: string;
  /** Pre-loaded font Buffer(s). See loadDefaultFonts() below. */
  fonts: Array<{ name: string; data: ArrayBuffer; weight: 400 | 700; style: 'normal' }>;
}

export async function buildOgCard(input: OgCardInput): Promise<Buffer> {
  const theme = input.themeColor ?? '#E8603C';
  const tagline = input.tagline ?? 'Shipped with Shippie';

  const node = {
      type: 'div',
      props: {
        style: {
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          width: '100%',
          height: '100%',
          padding: '80px',
          background: `${theme}`,
          color: 'white',
          fontFamily: 'Inter',
        },
        children: [
          {
            type: 'div',
            props: {
              style: {
                display: 'flex',
                flexDirection: 'column',
                gap: '24px',
              },
              children: [
                {
                  type: 'div',
                  props: {
                    style: {
                      fontSize: '96px',
                      fontWeight: 700,
                      lineHeight: '1.0',
                      letterSpacing: '-0.03em',
                    },
                    children: input.name,
                  },
                },
                {
                  type: 'div',
                  props: {
                    style: {
                      fontSize: '36px',
                      fontWeight: 400,
                      opacity: 0.85,
                      lineHeight: '1.3',
                      maxWidth: '960px',
                    },
                    children: tagline,
                  },
                },
              ],
            },
          },
          {
            type: 'div',
            props: {
              style: {
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontSize: '28px',
                fontWeight: 400,
                opacity: 0.75,
              },
              children: [
                {
                  type: 'div',
                  props: { children: `shippie.app/${input.slug}` },
                },
                {
                  type: 'div',
                  props: { children: '◆ Shippie' },
                },
              ],
            },
          },
        ],
      },
    } as unknown as ReactNode;

  const svg = await satori(node, {
    width: 1200,
    height: 630,
    fonts: input.fonts,
  });

  const png = new Resvg(svg, { fitTo: { mode: 'width', value: 1200 } }).render().asPng();
  return Buffer.from(png);
}
