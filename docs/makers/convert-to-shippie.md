# Convert an existing app to Shippie

This is the launch path for a maker who already has a Supabase, Vercel, iOS, Android, or AI-built app and wants a real Shippie test build quickly.

## The route

1. Classify the project.
2. Generate a localize plan.
3. Move primary user data to local primitives.
4. Build a static web bundle.
5. Deploy unlisted.
6. Share `https://shippie.app/<slug>` with testers.
7. Use feedback and the Flight Recorder before promoting public.

```bash
npx @shippie/cli classify .
npx @shippie/cli localize-plan .
npx @shippie/cli data doctor .
bun run build
npx @shippie/cli deploy ./dist --slug my-tool --unlisted --watch
```

## Supabase apps

Good candidates:

- CRUD apps where user content lives in a small set of tables.
- Storage uploads that can become device-local files.
- Auth only used to identify "my rows".

Convert:

- Supabase tables -> `shippie.local.db`.
- Supabase Storage -> `shippie.local.files`.
- Auth-owned rows -> local identity, private-space membership, or explicit export/import.
- Public/reference tables -> bundled data or disclosed reference fetches.

Manual redesign required:

- RLS-heavy multi-tenant apps.
- `.rpc()` workflows.
- Realtime channels.
- Edge functions.
- Admin clients or service-role keys.

## Vercel and Next apps

Good candidates:

- Client-heavy apps that can export to `dist`, `build`, `out`, or similar.
- Tools where server routes only fetch reference data.
- AI-built prototypes that already run as a static bundle.

Convert:

- Server actions/API routes -> local SDK calls, disclosed reference-data calls, or a separate non-Shippie backend.
- Cookies/session auth -> local identity or private-space invites.
- Environment secrets -> remove from the public bundle.

Do not deploy a Next server app as-is and pretend it is local. Shippie deploys static local tools.

## iOS and Android apps

Do not upload `.ipa` or `.apk` files to Shippie. Extract the smallest testable product loop into a mobile web/PWA build:

- A creation flow.
- A game loop.
- A checklist/tracker.
- A sharing/result card.
- A private-room or event flow.

Use browser equivalents for camera, files, clipboard, Web Share, haptics, local storage, offline cache, and install. Be honest about iOS background execution, Web Bluetooth, push, and long-running local AI limits.

## AI-assisted conversion prompt

Use this with Codex, Claude Code, Cursor, or another coding agent:

```text
Review this app for Shippie. Run classify, localize-plan, and data doctor.
Apply only safe local-first patches. Convert core user data to shippie.local.db
and files to shippie.local.files. Leave Supabase RPC/realtime/edge functions,
server secrets, and native-only APIs as explicit follow-up decisions.
Build the static bundle, deploy unlisted, and give me the short tester URL.
```

## Launch checklist

- The first action is obvious in ten seconds.
- The app works on a real phone.
- The core loop works offline after first load.
- Share links use the app's own name, result, and description.
- No hidden login, tracker, ad SDK, bundled secret, or silent user-data egress.
- Maker has reviewed the Flight Recorder.
- Testers have a clear feedback path.
