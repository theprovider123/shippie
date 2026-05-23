# Morning-Of Checklist

Run this on Sunday 31 May 2026 before the parade.

## Official Sources

- Islington Council parade page: https://www.islington.gov.uk/Roads/Arsenal-Football-Club-parade
- Islington possible route PDF: https://www.islington.gov.uk/~/media/sharepoint-lists/public-records/transportandinfrastructure/publicity/publicconsultation/20252026/20260521arsenal-parade-possible-route-map-and-closures.pdf
- TfL status updates: https://tfl.gov.uk/status-updates/

## Checks

1. Confirm the official start time and route status.
2. Update only `apps/showcase-parade-companion/public/route-pack.json` if official details changed.
3. Keep the baked fallback route in `src/data/parade-2026.ts` aligned with the route pack if the route changed materially.
4. Deploy only the route-pack fix unless there is a critical safety bug.
5. Open https://shippie.app/run/parade-companion/ on Wi-Fi.
6. Tap Offline and confirm the message says: `Saved offline`.
7. Put the test phone in airplane mode with Location Services still on.
8. Reload the app and verify Map, Group, and Safety open without network.
9. Create a group, open the QR sheet, scan from a second phone, and confirm import/side-ting behavior.
10. Tap one group quick signal and confirm it appears in the local activity feed.
11. Tap "I see the bus" on Map and confirm it appears on the map with an age/source label.

## Admin Watch

Watch first-party analytics for:

- `parade_app_opened`
- `parade_tab_viewed`
- `parade_plan_saved`
- `parade_plan_share_opened`
- `parade_group_signal`
- `parade_presence_tapped`
- `parade_bus_seen_tapped`
- `parade_crowd_reported`
- `parade_road_reported`
- `parade_help_reported`
- `parade_sync_qr_opened`
- `parade_signal_imported`

Signals can queue locally and flush when a phone gets a pocket of connection inside the Shippie container. Never depend on analytics for safety operations.

## Do Not Ship

- No public memory wall.
- No freeform chat.
- No photo or video sync.
- No new service-worker/runtime changes during parade hours unless the current version is unusable.
- No wording that implies affiliation with Arsenal, Islington Council, TfL, police, stewards, or the club.

