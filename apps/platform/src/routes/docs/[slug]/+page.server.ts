import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

type DocsPage = {
  title: string;
  eyebrow: string;
  description: string;
  updated: string;
  sections: Array<{
    title: string;
    body: string[];
    bullets?: string[];
  }>;
  links?: Array<{ href: string; label: string }>;
};

const updated = 'May 18, 2026';

const pages: Record<string, DocsPage> = {
  privacy: {
    title: 'Privacy',
    eyebrow: 'For users',
    description: 'How Shippie treats your tools, app data, accounts, and local device storage.',
    updated,
    sections: [
      {
        title: 'The short version',
        body: [
          'Shippie is built around local-first tools. Most app data is created and stored inside your browser or home-screen app on your device. Shippie does not need that content to list or launch tools.',
          'We collect only the platform data needed to run Shippie: account identity if you sign in, app/deploy metadata for makers, operational logs, security events, and product telemetry such as launches or home-screen guide interactions.',
        ],
      },
      {
        title: 'What stays on your device',
        body: [
          'Tool content such as recipes, trip notes, journals, counters, drawings, and local files belongs to the tool and the device where you created it unless the tool clearly asks to connect, share, export, sync, or back up.',
        ],
        bullets: [
          'Local storage, IndexedDB, Cache Storage, OPFS, and service-worker caches are controlled by your browser.',
          'The Your Data panel helps you inspect, export, move, or clear Shippie-managed local storage on that device.',
          'Deleting local browser data can remove local-only tool data. Export first when the data matters.',
        ],
      },
      {
        title: 'What Shippie servers may receive',
        body: [
          'The platform receives requests needed to serve shippie.app, app listings, app packages, public pages, invite links, auth flows, and maker dashboards.',
        ],
        bullets: [
          'Account information when you sign in, such as email, display name, avatar, and provider identifiers.',
          'Maker app metadata, package hashes, scan results, deploy status, visibility settings, and public listing content.',
          'Operational logs, abuse-prevention signals, rate-limit events, and aggregate usage signals needed to keep the service reliable.',
          'Capability proof events when a tool or wrapper reports that a feature worked, such as home-screen launch, offline load, or local data export.',
        ],
      },
      {
        title: 'Third-party tools',
        body: [
          'A public Shippie listing must pass the Local Tool policy scanner before it publishes. That scanner blocks common cloud databases, third-party auth, trackers, ads, insecure connections, and bundled secrets.',
          'Static scanning is still not perfect proof. Check a tool detail page or Your Data for capability badges, disclosed connection domains, and proof status before relying on it with sensitive data.',
        ],
      },
      {
        title: 'Contact',
        body: [
          'For privacy questions, data requests, or concerns about a listed tool, contact privacy@shippie.app.',
        ],
      },
    ],
    links: [
      { href: '/docs/security', label: 'Security model' },
      { href: '/container?section=data', label: 'Open Your Data' },
    ],
  },
  terms: {
    title: 'Terms',
    eyebrow: 'For everyone',
    description: 'The practical rules for using, launching, and sharing tools on Shippie.',
    updated,
    sections: [
      {
        title: 'Using Shippie',
        body: [
          'You can browse and run many Shippie tools without an account. You need an account to ship apps, manage private access, publish listings, or use maker dashboard features.',
          'Do not use Shippie to harm people, distribute malware, exfiltrate data, spam users, violate law, or bypass platform security boundaries.',
        ],
      },
      {
        title: 'Shipping apps',
        body: [
          'Makers keep ownership of their code and content. By deploying to Shippie, you give Shippie permission to host, scan, wrap, package, cache, display, and serve your app so users can open it.',
          'You are responsible for the rights to your app, its dependencies, its content, and any services it contacts.',
        ],
        bullets: [
          'Public listings must be honest about what the tool does.',
          'Private tools must not rely on obscurity as their only security model.',
          'Tools that attempt to steal data, hide network behavior, or attack the container may be removed.',
        ],
      },
      {
        title: 'Local data and backups',
        body: [
          'Shippie provides local-first platform features, but local data can still be lost if a device is cleared, a browser profile is deleted, storage is evicted, or a user removes the home-screen app.',
          'Use export, transfer, or backup flows for important data.',
        ],
      },
      {
        title: 'Availability',
        body: [
          'Shippie is offered as-is during launch. We work to keep the platform available and safe, but we may change, limit, suspend, or remove features and listings to protect users and the service.',
        ],
      },
      {
        title: 'Contact',
        body: [
          'For terms or abuse questions, contact support@shippie.app.',
        ],
      },
    ],
    links: [
      { href: '/docs/privacy', label: 'Privacy' },
      { href: '/docs/security', label: 'Security' },
    ],
  },
  security: {
    title: 'Security',
    eyebrow: 'Trust model',
    description: 'How Shippie isolates tools, verifies packages, and handles vulnerability reports.',
    updated,
    sections: [
      {
        title: 'Security model',
        body: [
          'Shippie treats each tool as untrusted until the platform can verify how it should run. The container uses iframe boundaries, package receipts, app metadata, and explicit bridge APIs so tools ask for capabilities instead of reaching across the shell.',
        ],
      },
      {
        title: 'What we check',
        body: [
          'The platform scans deploys and generated packages for device support, external domains, local-data signals, security posture, and container compatibility. Runtime proof badges are earned only after Shippie observes a capability working on real devices.',
        ],
        bullets: [
          'Package hashes and signed metadata help users identify the version they opened.',
          'External domains and declared permissions are surfaced on app detail pages where available.',
          'Private-space invites and app grants are scoped rather than global account permissions.',
        ],
      },
      {
        title: 'Responsible disclosure',
        body: [
          'Please report suspected vulnerabilities to security@shippie.app. Include affected URLs, reproduction steps, expected impact, and whether you accessed any data that was not yours.',
          'Do not run destructive tests, exfiltrate user data, interrupt service, or publicly disclose an issue before we have had a reasonable chance to investigate and fix it.',
        ],
      },
      {
        title: 'Current launch posture',
        body: [
          'Shippie is a web app platform. Browser isolation, Cloudflare Workers, signed package metadata, local storage boundaries, and user-visible capability surfaces are the core protections. Native app-store review is not part of the launch model.',
        ],
      },
    ],
    links: [
      { href: '/docs/what-is-local', label: 'What local means' },
      { href: '/docs/privacy', label: 'Privacy' },
    ],
  },
  install: {
    title: 'Add Shippie to your home screen',
    eyebrow: 'For users',
    description: 'Optional home-screen setup for iPhone, Android, and desktop.',
    updated,
    sections: [
      {
        title: 'iPhone and iPad',
        body: [
          'Open shippie.app in Safari. Tap the Share button in the browser toolbar, scroll to Add to Home Screen, then confirm Add.',
          'iOS does not let websites open this prompt directly, so Shippie keeps the guide here instead of interrupting your first visit.',
        ],
        bullets: [
          'Use Safari, not an in-app browser, for the most reliable home-screen setup.',
          'After adding it, open Shippie from the home-screen icon for the standalone launcher.',
          'If the icon opens Safari instead of standalone mode, remove it and add it again from Safari.',
        ],
      },
      {
        title: 'Android',
        body: [
          'Open shippie.app in Chrome or another app-capable browser. If Chrome offers a prompt, accept it. If no prompt appears, open the browser menu and choose Add to Home screen or Install app.',
        ],
      },
      {
        title: 'Desktop',
        body: [
          'Open shippie.app in Chrome, Edge, or another desktop browser that supports app windows. Use the address-bar icon or browser menu to add Shippie.',
        ],
      },
      {
        title: 'After setup',
        body: [
          'The home-screen launcher starts at Home. Your saved tools, recent tools, and local device data stay tied to the browser profile or app storage on that device.',
        ],
      },
    ],
    links: [
      { href: '/', label: 'Open Home' },
      { href: '/docs/what-is-local', label: 'What local means' },
    ],
  },
  'what-is-local': {
    title: 'What local means',
    eyebrow: 'For users',
    description: 'The Local Tool promise, capabilities, and reference-data rule on Shippie.',
    updated,
    sections: [
      {
        title: 'Local Tool',
        body: [
          'A Shippie tool keeps its primary working data on your device. It may still download the app package, icons, fonts, or updates from Shippie, but the meaningful content you create stays in browser-managed storage unless you export, back up, or share it.',
        ],
      },
      {
        title: 'Capabilities',
        body: [
          'Capabilities are facts about a local tool: works offline, secure backup, reference data used, local AI, private relay via Shippie, shares with my tools, local database, and local files.',
        ],
      },
      {
        title: 'Reference data',
        body: [
          'Reference data may come in. User data does not go out. Weather, exchange rates, and public scores are fine when personal context is not sent to the external service.',
        ],
      },
      {
        title: 'How to read a listing',
        body: [
          'Look at the app detail page for capability badges, proof status, disclosed connection domains, and any review warnings. Quiet tools are not labelled as local-only; Shippie only raises a signal when something extra is connected.',
        ],
      },
    ],
    links: [
      { href: '/docs/privacy', label: 'Privacy' },
      { href: '/docs/security', label: 'Security' },
    ],
  },
  build: {
    title: 'Build with Shippie',
    eyebrow: 'For builders',
    description: 'The launch path for uploading or shipping a local tool.',
    updated,
    sections: [
      {
        title: 'Fast path',
        body: [
          'Start at Ship. Upload a built local tool, deploy with CLI, or use MCP from your editor. Hosted URL wraps are retired for marketplace publishing.',
        ],
      },
      {
        title: 'What Shippie adds',
        body: [
          'Shippie turns a web app into a listed, phone-ready, container-compatible tool with package metadata, app detail pages, local-data surfaces, and launch telemetry.',
        ],
      },
    ],
    links: [
      { href: '/new', label: 'Ship an app' },
      { href: '/docs', label: 'Docs home' },
    ],
  },
  remix: {
    title: 'Remix apps',
    eyebrow: 'For builders',
    description: 'How makers opt into remixing, and how remixers preserve source lineage.',
    updated,
    sections: [
      {
        title: 'Maker opt-in',
        body: [
          'A maker must explicitly mark an app as remixable before Shippie exposes remix handoff commands. The app must be public, have a source repository URL, have a license, and set remix_allowed to true.',
          'For zip, upload, CLI, and MCP deploys, put source_repo, license, and remix_allowed in shippie.json.',
        ],
        bullets: [
          'source_repo should be an HTTPS repository URL that users can read.',
          'license should be a short SPDX-style identifier such as MIT, Apache-2.0, or AGPL-3.0.',
          'remix_allowed is false by default. A remix is not automatically remixable unless its maker opts in again.',
        ],
      },
      {
        title: 'Remixer flow',
        body: [
          'Start with the remix handoff. It returns the source repo, license, fork URL when available, and exact deploy arguments needed to preserve lineage.',
          'After editing and rebuilding, deploy with --remix or remix_from. Shippie validates the original app is still remixable, records the parent app/version, and keeps the new maker as the owner of the new slug.',
        ],
        bullets: [
          'CLI: shippie remix recipe-saver, then shippie deploy ./dist --slug recipe-saver-remix --remix recipe-saver.',
          'MCP: call remix_info first, then deploy with remix_from.',
          'Workspaces: set remixFrom on each app entry that descends from an existing app.',
        ],
      },
      {
        title: 'Deploy paths',
        body: [
          'Zip upload, trial deploys, GitHub deploys, workspaces, and MCP deploys all preserve remix lineage when a remix source is supplied.',
          'Trial deploys are useful for quick experiments, but claiming the slug is still required for long-lived ownership.',
        ],
      },
    ],
    links: [
      { href: '/docs', label: 'Docs home' },
      { href: '/new', label: 'Ship an app' },
    ],
  },
  why: {
    title: 'Why Shippie',
    eyebrow: 'For teams',
    description: 'Why small tools should be launchable, phone-ready, and local-first by default.',
    updated,
    sections: [
      {
        title: 'The thesis',
        body: [
          'Teams and individuals need small software that behaves like an app without waiting for an app store, a procurement cycle, or a cloud platform redesign.',
          'Shippie packages local tools into phone-ready experiences, keeps local data visible, and gives builders a path from one-off utility to trusted product.',
        ],
      },
      {
        title: 'The launch promise',
        body: [
          'Open the launcher, run the tool, add it to your phone later if it earns the spot, and understand where your data lives before you trust it.',
        ],
      },
    ],
    links: [
      { href: '/whitepaper', label: 'Read the whitepaper' },
      { href: '/docs/install', label: 'Home-screen guide' },
    ],
  },
  pro: {
    title: 'Shippie Pro',
    eyebrow: 'For teams',
    description: 'A launch placeholder for professional and regulated workflows.',
    updated,
    sections: [
      {
        title: 'Launch posture',
        body: [
          'Pro is handled manually during launch. If your team needs private deployment support, regulated workflow review, or a custom rollout, contact support@shippie.app.',
        ],
      },
    ],
    links: [
      { href: '/new', label: 'Ship an app' },
      { href: '/docs/security', label: 'Security' },
    ],
  },
  labs: {
    title: 'Labs',
    eyebrow: 'Reference',
    description: 'Experimental surfaces and maker-facing prototypes.',
    updated,
    sections: [
      {
        title: 'What belongs here',
        body: [
          'Labs is where experimental Shippie surfaces can be documented without taking a top-level nav slot. Production-ready tools should live in Home or app detail pages.',
        ],
      },
    ],
    links: [
      { href: '/', label: 'Browse tools' },
      { href: '/docs', label: 'Docs home' },
    ],
  },
};

export const load: PageServerLoad = ({ params, setHeaders }) => {
  const page = pages[params.slug];
  if (!page) throw error(404, 'Docs page not found');
  setHeaders({ 'cache-control': 'public, max-age=300, stale-while-revalidate=3600' });
  return { slug: params.slug, page };
};
