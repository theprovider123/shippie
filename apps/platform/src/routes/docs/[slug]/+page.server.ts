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
          'Shippie is built around local-first tools. Most app data is created and stored inside your browser or installed PWA on your device. Shippie does not need that content to list, launch, or install tools.',
          'We collect only the platform data needed to run Shippie: account identity if you sign in, app/deploy metadata for makers, operational logs, security events, and product telemetry such as launches or install-nudge interactions.',
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
          'Capability proof events when a tool or wrapper reports that a feature worked, such as install, offline load, or local data export.',
        ],
      },
      {
        title: 'Third-party tools',
        body: [
          'A Shippie listing can point to first-party showcases or maker-uploaded tools. Shippie scans and wraps tools where possible, but each maker is responsible for what their app does and what external services it contacts.',
          'Check a tool detail page for capability badges, privacy grade, external domains, and declared permissions before relying on it with sensitive data.',
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
          'Makers keep ownership of their code and content. By deploying to Shippie, you give Shippie permission to host, scan, wrap, package, cache, display, and serve your app so users can open and install it.',
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
          'Shippie provides local-first platform features, but local data can still be lost if a device is cleared, a browser profile is deleted, storage is evicted, or a user removes the PWA.',
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
          'The platform scans deploys and generated packages for installability, external domains, local-data signals, security posture, and container compatibility. Runtime proof badges are earned only after Shippie observes a capability working on real devices.',
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
          'Shippie is a web/PWA platform. Browser isolation, Cloudflare Workers, signed package metadata, local storage boundaries, and user-visible capability surfaces are the core protections. Native app-store review is not part of the launch model.',
        ],
      },
    ],
    links: [
      { href: '/docs/what-is-local', label: 'What local means' },
      { href: '/docs/privacy', label: 'Privacy' },
    ],
  },
  install: {
    title: 'Install Shippie',
    eyebrow: 'For users',
    description: 'Add Shippie to your home screen from iPhone, Android, or desktop.',
    updated,
    sections: [
      {
        title: 'iPhone and iPad',
        body: [
          'Open shippie.app in Safari. Tap the Share button in the browser toolbar, scroll to Add to Home Screen, then confirm Add.',
          'iOS does not let websites open the install prompt directly, so Shippie shows a manual guide when you have used a few tools and are still in Safari.',
        ],
        bullets: [
          'Use Safari, not an in-app browser, for the most reliable install.',
          'After install, open Shippie from the home-screen icon for the standalone launcher.',
          'If the icon opens Safari instead of standalone mode, remove it and add it again from Safari.',
        ],
      },
      {
        title: 'Android',
        body: [
          'Open shippie.app in Chrome or another install-capable browser. When prompted, tap Install. If no prompt appears, open the browser menu and choose Add to Home screen or Install app.',
        ],
      },
      {
        title: 'Desktop',
        body: [
          'Open shippie.app in Chrome, Edge, or another PWA-capable desktop browser. Use the install icon in the address bar or the browser menu to install Shippie as an app window.',
        ],
      },
      {
        title: 'After install',
        body: [
          'The installed launcher starts at Home. Your saved tools, recent tools, and local device data stay tied to the browser profile or installed app storage on that device.',
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
    description: 'The difference between Local, Connected, and Cloud tools on Shippie.',
    updated,
    sections: [
      {
        title: 'Local',
        body: [
          'A Local tool keeps its primary working data on your device. It may still download the app package, icons, fonts, or updates from Shippie, but the meaningful content you create is designed to remain in browser-managed storage unless you export or share it.',
        ],
      },
      {
        title: 'Connected',
        body: [
          'A Connected tool keeps important data local but can talk to nearby devices, private spaces, or user-approved services when that is the point of the tool. Collaboration, invites, transfers, and backups should be visible user actions.',
        ],
      },
      {
        title: 'Cloud',
        body: [
          'A Cloud tool depends on a remote service for its primary function or storage. Shippie can still wrap and launch it, but users should expect some data or requests to leave the device.',
        ],
      },
      {
        title: 'How to read a listing',
        body: [
          'Look at the app detail page for the current kind label, proof badges, privacy grade, security score, and external domains. Labels can start as deploy-time estimates and become stronger when runtime proof arrives from real devices.',
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
    description: 'The launch path for wrapping, uploading, or shipping a web tool.',
    updated,
    sections: [
      {
        title: 'Fast path',
        body: [
          'Start at Ship. Upload a built site, wrap an existing URL, or use the CLI when you want repeatable deploys.',
        ],
      },
      {
        title: 'What Shippie adds',
        body: [
          'Shippie turns a web app into a listed, installable, container-compatible tool with package metadata, app detail pages, local-data surfaces, and launch telemetry.',
        ],
      },
    ],
    links: [
      { href: '/new', label: 'Ship an app' },
      { href: '/docs', label: 'Docs home' },
    ],
  },
  why: {
    title: 'Why Shippie',
    eyebrow: 'For teams',
    description: 'Why small tools should be launchable, installable, and local-first by default.',
    updated,
    sections: [
      {
        title: 'The thesis',
        body: [
          'Teams and individuals need small software that behaves like an app without waiting for an app store, a procurement cycle, or a cloud platform redesign.',
          'Shippie wraps ordinary web apps into installable tools, keeps local data visible, and gives builders a path from one-off utility to trusted product.',
        ],
      },
      {
        title: 'The launch promise',
        body: [
          'Open the launcher, run the tool, install it when it earns a place on your phone, and understand where your data lives before you trust it.',
        ],
      },
    ],
    links: [
      { href: '/whitepaper', label: 'Read the whitepaper' },
      { href: '/docs/install', label: 'Install guide' },
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
