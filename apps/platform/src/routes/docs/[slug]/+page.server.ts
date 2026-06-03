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

const updated = 'May 30, 2026';

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
          'Shippie is built around local-first tools. Primary app data is created and stored inside your browser or home-screen app on your device by default. Shippie does not need that content to list or launch tools.',
          'We collect the platform data needed to run Shippie: account identity if you sign in, app/deploy metadata for makers, operational logs, security events, product telemetry such as launches or home-screen guide interactions, and optional encrypted backup, sync, relay, or private-space payloads when those features are enabled.',
        ],
      },
      {
        title: 'Controller and contact',
        body: [
          'For launch, Shippie is the controller for platform account, marketplace, deploy, analytics, support, and operational data it decides to collect. Makers may be responsible for their own app content, external services, and private workflows.',
          'Contact privacy@shippie.app for privacy questions, access, correction, export, deletion, or objection requests about data Shippie servers hold.',
        ],
      },
      {
        title: 'What stays on your device',
        body: [
          'Tool content such as recipes, trip notes, journals, counters, drawings, and local files belongs to the tool and the device where you created it unless the tool clearly asks to connect, share, export, sync, relay, or back up.',
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
          'Encrypted backup, sealed document, relay, or private-space payloads and their technical metadata when you choose features that need Shippie to store or relay sealed data.',
        ],
      },
      {
        title: 'Your controls',
        body: [
          'You can use local tools without signing in. When a tool exposes Your Data, use that panel to inspect local storage, disclosed connections, available export or restore options, and device-only wipe controls.',
          'For account deletion, access, correction, export, or privacy questions about data Shippie servers hold, contact privacy@shippie.app from the email tied to the account.',
        ],
      },
      {
        title: 'Children',
        body: [
          'Shippie is not directed to children under 13. If you believe a child under 13 has provided account information to Shippie, contact privacy@shippie.app so we can review and remove it where required.',
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
      { href: '/dock?section=data', label: 'Open Your Data' },
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
          'Shippie is not directed to children under 13. Do not create an account or deploy tools if you are not old enough to do so under the laws that apply to you.',
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
          'Tools that attempt to steal data, hide network behavior, or attack the Dock runtime may be removed.',
        ],
      },
      {
        title: 'Local data and backups',
        body: [
          'Shippie provides local-first platform features, but local data can still be lost if a device is cleared, a browser profile is deleted, storage is evicted, or a user removes the home-screen app.',
          'Use export, transfer, or backup flows for important data. Backup, sync, relay, and private spaces are optional features that may store or move sealed data plus technical metadata.',
        ],
      },
      {
        title: 'Paid plans during launch',
        body: [
          'Paid professional and team plans are handled manually during launch. Prices, scope, support levels, and billing cadence must be confirmed in writing before work starts.',
          'If something is wrong with a paid launch engagement, contact support@shippie.app. We will review refund or credit requests case by case unless a written order form says otherwise.',
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
          'Shippie treats each tool as untrusted until the platform can verify how it should run. Dock uses iframe boundaries, package receipts, app metadata, and explicit bridge APIs so tools ask for capabilities instead of reaching across the shell.',
        ],
      },
      {
        title: 'What we check',
        body: [
          'The platform scans deploys and generated packages for device support, external domains, local-data signals, security posture, and Dock compatibility. Runtime proof badges are earned only after Shippie observes a capability working on real devices.',
        ],
        bullets: [
          'Package hashes and package metadata help users identify the version they opened.',
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
          'Shippie is a web app platform. Browser isolation, Cloudflare Workers, package metadata, local storage boundaries, and user-visible capability surfaces are the core protections. Native app-store review is not part of the launch model.',
          'No platform can guarantee absolute security. Shippie reduces default cloud exposure, makes data movement visible, and treats vulnerability reports as launch-critical.',
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
          'After adding it, open Shippie from the home-screen icon for standalone Dock.',
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
          'The home-screen app starts at Dock. Your saved tools, recent tools, and local device data stay tied to the browser profile or app storage on that device.',
        ],
      },
    ],
    links: [
      { href: '/dock', label: 'Open Dock' },
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
          'Shippie turns a web app into a listed, phone-ready, Dock-ready tool with package metadata, app detail pages, local-data surfaces, and launch telemetry.',
        ],
      },
    ],
    links: [
      { href: '/new', label: 'Ship an app' },
      { href: '/docs/cli', label: 'CLI and MCP' },
      { href: '/docs', label: 'Docs home' },
    ],
  },
  cli: {
    title: 'CLI and MCP',
    eyebrow: 'For builders',
    description: 'Ship from your terminal, editor, or agent without leaving your build loop.',
    updated,
    sections: [
      {
        title: 'What it is',
        body: [
          'CLI and MCP use the same deploy path as the browser upload. You build a static bundle, Shippie scans it, uploads the package, and makes the tool available from its live URL and Tools listing.',
          'Use the browser form when you want the simplest path. Use CLI or MCP when you are already working from a repo, editor, or automated agent.',
        ],
      },
      {
        title: 'Fast path',
        body: [
          'Build your app to dist, build, out, or another static output folder. Then run shippie deploy with the output path and slug you want to claim.',
        ],
        bullets: [
          'Example: shippie deploy ./dist --slug my-tool.',
          'Private trials can be claimed later from Maker.',
          'Remixes should include the remix source so lineage stays visible.',
        ],
      },
      {
        title: 'What gets blocked',
        body: [
          'Shippie hosts static local tools. Server routes, bundled secrets, hidden trackers, ad code, unsafe network calls, and undisclosed user-data exits are blocked or flagged before publish.',
          'External reference data is allowed when it is disclosed cleanly and does not send personal tool content out by surprise.',
        ],
      },
      {
        title: 'After deploy',
        body: [
          'Open the live URL to test the tool, save it to Dock when you want it close, and use Maker for deploy history, visibility, feedback, access, and updates.',
        ],
      },
    ],
    links: [
      { href: '/new', label: 'Ship in browser' },
      { href: '/maker/apps', label: 'Maker apps' },
      { href: '/docs/build', label: 'Build guide' },
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
          'Open Dock, run the tool, add it to your phone later if it earns the spot, and understand where your data lives before you trust it.',
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
    description: 'Local-first tools for sensitive work, with explicit backup, sync, relay, and service boundaries.',
    updated,
    sections: [
      {
        title: 'Launch posture',
        body: [
          'Pro is handled manually during launch. If your team needs private deployment support, regulated workflow review, or a custom rollout, contact support@shippie.app.',
          'The promise is not magic compliance. It is a reviewable data-flow story: primary app data is local-first by default, and any backup, sync, relay, external AI, or hosted service use should be visible before a team relies on it.',
        ],
      },
      {
        title: 'What teams can review',
        body: [
          'App runtime assets, declared capabilities, connection badges, storage behavior, sealed backup and sync posture, and export/delete paths.',
          'Where a workflow is regulated, Shippie materials are review inputs, not legal advice or a substitute for your own compliance assessment.',
        ],
      },
    ],
    links: [
      { href: '/new', label: 'Ship an app' },
      { href: '/docs/security', label: 'Security' },
      { href: '/docs/privacy', label: 'Privacy' },
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
          'Labs is where experimental Shippie surfaces can be documented without taking a top-level nav slot. Production-ready tools should live in Tools and launch from Dock.',
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
