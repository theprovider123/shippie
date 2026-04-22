/**
 * HTML injector.
 *
 * Parses an HTML document with htmlparser2, inserts Shippie PWA tags
 * into <head>, injects the service worker registration script before
 * </body>, and serializes back to a string.
 *
 * Idempotent: if a tag is already present (same href/src), it's left
 * alone. Makers can ship their own manifest/sw by setting
 * pwa.conflict_policy appropriately — that's enforced at the
 * deploy pipeline level, not here.
 *
 * Spec v6 §9.1 (build-time injection).
 */
import { parseDocument } from 'htmlparser2';
import serialize from 'dom-serializer';
import { Element, Text } from 'domhandler';
import type { ChildNode, Document, ParentNode } from 'domhandler';
import type { ShippieJson } from '@shippie/shared';
import type { InjectionOptions } from './types.ts';
import { IOS_SPLASH_SIZES, splashMediaQuery } from './splash-sizes.ts';

export function injectPwaTags(html: string, opts: InjectionOptions): { html: string; modified: boolean } {
  const doc = parseDocument(html, {
    recognizeSelfClosing: true,
    decodeEntities: false,
  });

  const head = findElementByTag(doc, 'head');
  const body = findElementByTag(doc, 'body');

  if (!head && !body) {
    // Not a full HTML document — skip.
    return { html, modified: false };
  }

  let modified = false;

  if (head) {
    modified = injectIntoHead(head, opts) || modified;
  }

  if (body) {
    modified = appendSwRegistration(body) || modified;
  }

  if (!modified) {
    return { html, modified: false };
  }

  return { html: serialize(doc, { encodeEntities: 'utf8' }), modified: true };
}

function findElementByTag(root: Document, tag: string): Element | null {
  let found: Element | null = null;
  const visit = (node: ChildNode) => {
    if (found) return;
    if (node.type === 'tag' && (node as Element).name === tag) {
      found = node as Element;
      return;
    }
    if ('children' in node) {
      for (const child of (node as ParentNode).children) visit(child as ChildNode);
    }
  };
  for (const child of root.children) visit(child as ChildNode);
  return found;
}

interface TagSpec {
  name: string;
  attribs: Record<string, string>;
  text?: string;
}

function injectIntoHead(head: Element, opts: InjectionOptions): boolean {
  const { manifest } = opts;

  const themeColor = manifest.theme_color ?? '#E8603C';
  const tagsToEnsure: TagSpec[] = [
    { name: 'link', attribs: { rel: 'manifest', href: '/__shippie/manifest' } },
    { name: 'meta', attribs: { name: 'theme-color', content: themeColor } },
    { name: 'meta', attribs: { name: 'apple-mobile-web-app-capable', content: 'yes' } },
    {
      name: 'meta',
      attribs: { name: 'apple-mobile-web-app-status-bar-style', content: 'default' },
    },
    { name: 'link', attribs: { rel: 'apple-touch-icon', href: '/__shippie/icons/180.png' } },
    {
      name: 'link',
      attribs: { rel: 'icon', type: 'image/png', sizes: '192x192', href: '/__shippie/icons/192.png' },
    },
    {
      name: 'link',
      attribs: { rel: 'icon', type: 'image/png', sizes: '512x512', href: '/__shippie/icons/512.png' },
    },
    {
      name: 'script',
      attribs: { src: '/__shippie/sdk.js', async: '' },
    },
  ];

  // iOS apple-touch-startup-image per device size. The worker serves
  // the generated PNG at /__shippie/splash/<device>.png — see Task 9
  // splash router and `apps/web/lib/shippie/splash-gen.ts`.
  for (const size of IOS_SPLASH_SIZES) {
    tagsToEnsure.push({
      name: 'link',
      attribs: {
        rel: 'apple-touch-startup-image',
        media: splashMediaQuery(size),
        href: `/__shippie/splash/${size.device}.png`,
      },
    });
  }

  if (opts.injectInlineCsp) {
    tagsToEnsure.push({
      name: 'meta',
      attribs: {
        'http-equiv': 'Content-Security-Policy',
        content: buildCspContent(manifest),
      },
    });
  }

  let modified = false;
  for (const spec of tagsToEnsure) {
    if (headHasTag(head, spec)) continue;
    appendChild(head, createElement(spec));
    modified = true;
  }
  return modified;
}

function appendSwRegistration(body: Element): boolean {
  // Shippie-specific marker so idempotency is unambiguous
  const marker = '/* shippie-sw-registration */';
  const alreadyHas = body.children.some((c) => {
    // htmlparser2's special <script> type
    if (c.type !== 'script' && !(c.type === 'tag' && (c as Element).name === 'script')) {
      return false;
    }
    const script = c as Element;
    return script.children.some(
      (t) => t.type === 'text' && (t as Text).data.includes(marker),
    );
  });
  if (alreadyHas) return false;

  const registrationCode = `${marker}
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('/__shippie/sw.js', { scope: '/' }).catch(function (err) {
      console.warn('[shippie] sw registration failed', err);
    });
  });
}`;

  const script = new Element('script', {}, [new Text(registrationCode)]);
  appendChild(body, script);
  return true;
}

/**
 * Dedup by the primary identifying attribute of each tag type.
 * Running injectPwaTags twice must be a no-op (idempotent).
 */
function headHasTag(head: Element, spec: TagSpec): boolean {
  const identify = identifyKey(spec);
  if (!identify) return false;

  return head.children.some((child) => {
    // htmlparser2 gives <script> and <style> their own `type` values
    // distinct from 'tag', but they're still Element instances.
    if (child.type !== 'tag' && child.type !== 'script' && child.type !== 'style') {
      return false;
    }
    const el = child as Element;
    if (el.name !== spec.name) return false;

    // For <link>, we compare rel (+ sizes) + href holistically instead of
    // using a single attribute.
    if (spec.name === 'link') {
      const sameRel = el.attribs.rel === spec.attribs.rel;
      const sameSizes = (el.attribs.sizes ?? '') === (spec.attribs.sizes ?? '');
      const sameHref = el.attribs.href === spec.attribs.href;
      return sameRel && sameSizes && sameHref;
    }

    return el.attribs[identify.attr] === identify.value;
  });
}

function identifyKey(spec: TagSpec): { attr: string; value: string } | null {
  // <link>: identified by rel + href (some links share href, e.g. icons at different sizes)
  if (spec.name === 'link') {
    const rel = spec.attribs.rel;
    const sizes = spec.attribs.sizes;
    const href = spec.attribs.href;
    if (!rel) return null;
    // Include sizes in the key when present so icon variants aren't dedup'd together
    const key = sizes ? `${rel}|${sizes}` : rel;
    return { attr: '__shippie_link_key__', value: `${key}|${href}` };
  }
  // <meta>: identified by name or http-equiv
  if (spec.name === 'meta') {
    if (spec.attribs.name) return { attr: 'name', value: spec.attribs.name };
    if (spec.attribs['http-equiv']) {
      return { attr: 'http-equiv', value: spec.attribs['http-equiv'] };
    }
    return null;
  }
  // <script>: identified by src
  if (spec.name === 'script' && spec.attribs.src) {
    return { attr: 'src', value: spec.attribs.src };
  }
  return null;
}

function createElement(spec: TagSpec): Element {
  const children: ChildNode[] = spec.text ? [new Text(spec.text)] : [];
  return new Element(spec.name, spec.attribs, children);
}

function appendChild(parent: Element, child: Element): void {
  child.parent = parent;
  if (parent.children.length > 0) {
    const last = parent.children[parent.children.length - 1];
    if (last) {
      child.prev = last as ChildNode;
      last.next = child;
    }
  }
  parent.children.push(child);
}

function buildCspContent(manifest: ShippieJson): string {
  const connect = [`'self'`, '/__shippie/*'];
  for (const domain of manifest.allowed_connect_domains ?? []) {
    connect.push(domain);
  }
  return [
    `default-src 'self'`,
    `script-src 'self' 'unsafe-inline'`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob:`,
    `font-src 'self' data:`,
    `connect-src ${connect.join(' ')}`,
    `worker-src 'self'`,
    `manifest-src 'self'`,
    `frame-ancestors 'none'`,
  ].join('; ');
}
