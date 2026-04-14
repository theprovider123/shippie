# Project Brief: Shippie — The Micro-Tools Marketplace

## The One-Liner

Shippie is where micro-tools live. Deploy in seconds, get real user feedback, iterate fast, and grow — from side project to App Store if you want to.

## Brand Identity

**Ship + Hippie.** Countercultural, community-driven, anti-gatekeeper. The hippie ethos applied to software distribution: open, DIY, everyone can create, no barriers. "Ship your thing, man."

- The platform is radically open. No review queues, no $99/year dev fees, no provisioning hell
- The community is the curator — upvotes, feedback, trust scores replace corporate gatekeeping
- The vibe coding movement is our native culture — people building useful things fast with AI tools

## What Is a Micro-Tool?

A micro-tool is a small, focused, single-purpose web app that solves one problem well. It's too small for the App Store, too useful to not exist, and takes an afternoon to vibe-code.

**Examples:**
- Invoice generator — fill in details, get a PDF
- Timezone meeting planner — paste cities, see overlapping hours
- Freelance rate calculator — input expenses and goals, get your hourly rate
- Color palette extractor — upload an image, get hex codes
- Meal prep cost calculator — recipes in, cost per meal out
- Webhook tester — get a temporary URL, see incoming requests live
- Employee onboarding checklist — customizable, tracks completion per hire
- QR code generator — paste a URL, customize, download
- SaaS metrics dashboard — paste Stripe API key, see MRR and churn
- Domain availability bulk checker — check 20 names across TLDs at once
- Contrast checker — input two colors, get WCAG accessibility verdict
- Cron expression translator — cron string in, plain English out
- Privacy policy generator — answer questions, get a page for your project
- Pitch deck word counter — upload PDF, get word count per slide
- Tip splitter — split a receipt between people with per-item assignment
- Pomodoro timer with ambient sounds — focused work timer with lo-fi/rain
- Email subject line tester — paste options, get readability and spam scores
- Open graph preview tool — paste URL, see how it looks when shared
- Rent vs buy calculator — local market numbers in, real answer out
- SVG icon search — browse and copy open-source icons with one click

**The pattern:** Every one of these is too niche for the App Store, too useful to not exist, and buildable in a day with AI coding tools. That's the Shippie catalog.

## The Core Thesis

1. **Millions of people are building micro-tools with AI and have nowhere to put them.** They deploy to Vercel with zero discoverability, or share screenshots on Twitter. The gap between "I built a thing" and "people are using my thing" is massive.

2. **The App Store is wrong for this category.** Review queues, provisioning profiles, metadata requirements — all designed for major apps, absurd for a tip calculator. Micro-tools need a home that matches how fast they're built.

3. **Micro-tools are format-agnostic.** A freelancer uses a pricing calculator (B2C). A sales team uses an ROI estimator (B2B). The platform doesn't care. It's just where micro-tools live.

4. **User feedback is the missing piece for vibe coders.** People can build fast but can't learn fast. They ship something, get no signal, move on. Shippie closes the loop — deploy, get feedback, iterate, redeploy. The platform makes vibe coders better builders.

5. **Shippie is the warm-up lane for the App Store.** Not every micro-tool stays micro. Some grow into real products. Shippie is where you validate the idea, gather users, collect feedback, and iterate — before investing in a native app. It's the proving ground. Graduate to the App Store when you're ready, with real data and a real user base behind you.

## What Shippie Is NOT

- Not a code editor or IDE (Claude Code, Cursor, etc. do that)
- Not a native App Store competitor (web-native, no iOS/Android distribution)
- Not just a directory of links (we host and run the apps — that's the product)
- Not trying to replace big apps (Instagram, banking, etc.)

## The Two Modes

One platform, two contexts — like GitHub with public and private repos.

### Public Marketplace (B2C + B2B)
- Open storefront anyone can browse
- Upvotes, comments, categories, trending feed
- Makers deploy public tools for anyone to use
- Community-driven discovery and curation
- Free for everyone, always

### Team Workspaces (B2B)
- Private micro-tool catalogs for companies
- Deploy internal tools only your team can access
- Same deploy flow, same maker experience, just a visibility toggle
- SSO, access controls, team management
- Where businesses get value they'll pay for

## Feedback & Iteration — The Core Loop

This is central to the Shippie experience. The platform isn't just deploy + discover. It's deploy → feedback → iterate → redeploy. Fast, continuous, public.

### For Users Giving Feedback:
- **Upvotes** — simple signal of value, surfaces the best tools
- **Comments** — general discussion, tips, use cases
- **Feature requests** — structured "I wish this could..." submissions that makers can see, organized and prioritized
- **Bug reports** — structured "this broke when I..." submissions with browser/device info auto-captured
- **Ratings on specific dimensions** — not just 1-5 stars, but: usefulness, ease of use, design quality, reliability (these feed into a composite trust/quality score)
- **Usage analytics** — makers see how people actually use their tool (what's clicked, what's ignored, where people drop off). Privacy-respecting, aggregated, no PII

### For Makers Receiving Feedback:
- **Feedback dashboard** — single view of all signals: upvotes over time, feature requests ranked by demand, bug reports by severity, usage patterns
- **Iteration prompts** — the platform suggests what to work on next based on feedback patterns ("12 users requested dark mode", "40% of users bounce on the settings page")
- **Changelog** — makers post what they changed per deploy, users see the app evolving and feel heard
- **Feedback-to-prompt pipeline** — this is the killer feature for vibe coders: take a cluster of user feedback (e.g. "users want CSV export") and generate a ready-to-paste prompt for Claude Code or Cursor that describes exactly what to build, with context from the existing app. Shippie helps you go from feedback to code to redeploy in minutes
- **Deploy history** — every version is tracked, makers can roll back, users can see how fast the tool is evolving (signals active maintenance and quality)
- **App health score** — a composite metric visible on the listing: last deploy date, response to feedback, upvote trend, bug resolution rate. Helps users trust the tool and motivates makers to stay engaged

### The Warm-Up-to-App-Store Path:
- Shippie tracks metrics that matter for App Store readiness: user count, retention, feature completeness, feedback sentiment, crash/bug rate
- When a tool hits certain thresholds, the platform can surface a "ready to graduate?" prompt with guidance on taking the next step to native
- Makers can export their user feedback, feature request backlog, and usage data as a product brief — essentially a spec doc for building the native version
- The Shippie listing can persist as the web version even after a native app launches, with a "now available on the App Store" badge
- This makes Shippie the **top of the funnel for the App Store itself** — a validation layer that Apple doesn't have

## Revenue Model

The hippie ethos: the door is always open, nobody gets locked out. Free at the core, business model on top.

### Free forever:
- Deploy unlimited public micro-tools
- Full access to the storefront and discovery
- Feedback, comments, upvotes
- Basic usage analytics
- Community features

### Shippie Pro for Makers (~$5-10/month):
- Custom domains (yourtool.com instead of yourtool.shippie.app)
- Advanced analytics dashboard (usage heatmaps, funnel analysis, retention)
- Priority builds (faster deploy queue)
- More compute for heavier apps
- Feedback-to-prompt pipeline (AI-powered iteration suggestions)
- Changelog and versioning tools

### Team Workspaces (~$20-50/month):
- Private micro-tool catalogs
- SSO integration
- Access controls and team management
- Internal feedback and request tracking
- Usage analytics across the team's tool portfolio
- Centralized billing

### Future (Phase 3+):
- Usage-based compute for serverless backends (free tier + metered)
- Agent API usage billing (per-call pricing when agents consume tools)
- Marketplace transactions (if makers charge for tools — small platform cut)

## Target Users

### Makers (supply side):
- Vibe coders building tools with Claude Code, Cursor, Bolt, Lovable, Replit
- Indie developers shipping side projects who want real users and feedback
- People who can integrate a niche API or data source nobody else has connected
- Entrepreneurs validating product ideas before committing to native development
- Teams building internal tools for their company

### Users (demand side):
- Anyone who wants quick, focused, single-purpose tools without app store downloads
- Professionals looking for niche workflow tools (freelancers, marketers, sales, ops)
- Companies looking for lightweight internal tools
- Future: AI agents discovering and calling tools programmatically

## MVP Scope (Phase 1)

The MVP proves two things:
1. Will makers deploy here instead of bare Vercel?
2. Will users give useful feedback that makes makers come back and iterate?

### What's IN the MVP:

**Deploy flow:**
- Sign in with GitHub
- Pick a repo or upload a zip
- Auto-detect framework (React, Vue, Next, static HTML) via Nixpacks
- Build and deploy to `appname.shippie.app`
- Target: live in under 60 seconds for static, 2-3 min for framework apps
- GitHub webhook integration for auto-redeploy on push

**Storefront:**
- Public feed of deployed micro-tools, sorted by recency and upvotes
- Each listing: app name, maker name, one-liner, category tag, screenshot/preview, upvote count
- Categories: Tools, Games, Creative, Health, Finance, Developer, Business
- Full-text search across names and descriptions
- Trending / new / top filters

**App detail page:**
- Live embed of the running app (or link to subdomain)
- Description, maker info, upvotes
- Comments section
- Feature request submissions (structured form)
- Bug report submissions (structured form with auto-captured browser info)
- Changelog (maker posts updates per deploy)
- App health indicators (last updated, response rate to feedback)

**Maker dashboard:**
- Your apps, total upvotes, deploy history
- Feedback inbox: comments, feature requests, bug reports in one view
- Basic usage stats (views, unique visitors per tool)
- Deploy log with rollback capability

**Maker profiles:**
- Public profile: your tools, total upvotes, member since
- Simple reputation/trust score based on activity

### What's OUT of MVP (Phase 2+):
- Backend/serverless functions for apps
- Platform SDK
- Managed databases per app
- Agent discovery API / MCP compatibility
- End-user auth system (for users of the micro-tools)
- Team workspaces and private tools
- SSO
- Monetization (Pro tier, team billing)
- Native iOS/Android wrapper app
- Advanced analytics (heatmaps, funnels, retention)
- Feedback-to-prompt pipeline (AI-powered)
- App Store readiness scoring
- Ratings on multiple dimensions
- Tool composability / chaining for agents

## Technical Architecture — Open Source, Cheap, Scalable

### Guiding principles:
- Open source everything possible
- Near-zero cost at low scale, scales horizontally when needed
- No vendor lock-in anywhere
- Best-in-class developer experience for makers
- GitHub-native (auth, repo import, webhooks)

### Proposed Stack:

| Layer | Tool | Why |
|-------|------|-----|
| **Server** | Hetzner dedicated/cloud | Best cost-to-performance, ~€40-50/mo to start |
| **Deploy engine** | Coolify (self-hosted) | Open-source Vercel/Netlify alt, handles builds, SSL, subdomain routing |
| **Build system** | Nixpacks | Open-source, auto-detects frameworks, generates containers. Used by Railway |
| **CDN** | Cloudflare free tier | Wildcard DNS, global caching for `*.shippie.app` subdomains |
| **Platform database** | PocketBase | Single Go binary — DB, auth, real-time API. MVP-appropriate |
| **Object storage** | MinIO (self-hosted) | S3-compatible, stores build artifacts, screenshots, avatars |
| **Search** | Meilisearch | Open-source, fast, typo-tolerant, single binary |
| **Auth** | GitHub OAuth (via PocketBase) | Makers sign in with GitHub. Add Google/Apple later |
| **Analytics** | Umami (self-hosted) | Privacy-focused, open-source. Per-app tracking |
| **CI/CD** | GitHub webhooks | Repo connected → webhook on push → trigger build → deploy |

### Day 1 infrastructure (single Hetzner server):
- Coolify (deploy engine + container management)
- PocketBase (platform DB + auth)
- MinIO (file storage)
- Meilisearch (search)
- The Shippie Next.js app itself
- Cloudflare in front for DNS + CDN + wildcard SSL

### Scaling path:
Separate concerns across multiple VPS instances when needed. Same components, more machines. Nothing changes architecturally.

## Deploy Flow

```
Maker signs in with GitHub
  → Picks a repo OR uploads a zip
  → Platform detects framework (Nixpacks)
  → Builds container
  → Deploys to appname.shippie.app via Coolify
  → Listing auto-generates from README or maker fills short form
  → App appears in storefront feed
  → Subsequent git pushes trigger auto-rebuild via webhook
  → Each deploy creates a changelog entry (maker adds notes)
  → Users get notified of updates to tools they've upvoted
```

## Data Model (Starting Point)

```
User (maker + browser — same entity, different capabilities)
  - id
  - github_id (nullable — browsers might sign in with Google later)
  - username
  - display_name
  - avatar_url
  - bio
  - created_at

App
  - id
  - slug (subdomain)
  - name
  - tagline (one-liner)
  - description (markdown, from README or manual)
  - category (enum: tools, games, creative, health, finance, developer, business)
  - github_repo_url (optional)
  - deploy_status (enum: building, live, failed, archived)
  - subdomain_url
  - screenshot_url
  - maker_id (FK → User)
  - is_public (boolean — true for marketplace, false for team workspace)
  - created_at
  - updated_at
  - last_deployed_at

Deploy
  - id
  - app_id (FK → App)
  - version_number (auto-incrementing per app)
  - commit_sha (if from GitHub)
  - changelog_notes (maker-written, markdown)
  - status (enum: building, success, failed)
  - build_log_url
  - created_at

Upvote
  - id
  - user_id (FK → User)
  - app_id (FK → App)
  - created_at
  - unique constraint on (user_id, app_id)

Comment
  - id
  - user_id (FK → User)
  - app_id (FK → App)
  - body (text)
  - created_at

FeatureRequest
  - id
  - user_id (FK → User)
  - app_id (FK → App)
  - title
  - description
  - upvote_count (denormalized)
  - status (enum: open, planned, shipped, declined)
  - created_at

BugReport
  - id
  - user_id (FK → User)
  - app_id (FK → App)
  - title
  - description
  - browser_info (auto-captured)
  - device_info (auto-captured)
  - status (enum: open, acknowledged, fixed, wont_fix)
  - created_at

FeatureRequestUpvote
  - id
  - user_id (FK → User)
  - feature_request_id (FK → FeatureRequest)
  - created_at
  - unique constraint on (user_id, feature_request_id)
```

## Platform App Tech

Next.js app with:
- SSR for SEO on listing pages
- PocketBase SDK for data
- Meilisearch client for search
- GitHub OAuth for auth
- Deployed on Coolify alongside the micro-tools it hosts

## Key Questions for Claude Code

Before writing code, challenge this plan and ask me questions. Specifically:

1. **Is Coolify the right deploy engine?** Does it support subdomain-per-app with Nixpacks builds triggered via API? Or do I need a custom pipeline?
2. **Wildcard subdomain routing** — exact Cloudflare + Coolify config for `*.shippie.app`? SSL cert gotchas?
3. **PocketBase limits** — robust enough for MVP? When does it break? Migration path?
4. **Build isolation and security** — makers upload arbitrary code. How to sandbox? How to prevent malicious apps from affecting the platform?
5. **Iframe vs subdomain** — should apps run embedded in the platform UI or on their own subdomain? Trade-offs?
6. **Static vs dynamic** — MVP static-only, or container hosting from day one?
7. **Data model gaps** — tags? Teams? Notifications? What's missing?
8. **Feedback system architecture** — real-time updates? Notification system for makers? How to handle high-volume feedback?
9. **Monorepo structure** — platform app + deploy scripts + infra config layout?
10. **The warm-up-to-App-Store pipeline** — what metrics should we track to signal "readiness"? How do we make the export useful?

## Success Criteria for MVP

- 50 micro-tools deployed by real makers within first month
- At least 10 tools getting organic upvotes from non-makers
- At least 5 makers who iterate on their tool based on feedback received through the platform
- Deploy flow under 2 minutes for a standard React app
- Platform costs under €100/month at this scale

## My Setup

- Claude Code is my primary development environment
- Experience with Next.js, React, and general web dev
- Building solo initially
- Obsidian-based knowledge management system with Claude Code session protocol
- Want to move fast but build on solid foundations

---

**Start by reviewing this brief. Identify gaps, flawed assumptions, and things I'm overcomplicating. Ask me the questions you need answered before we write any code. Then propose a project structure and a week-by-week build plan for the MVP.**
