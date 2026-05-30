# iOS Offline Release Checklist

Run this on a real iPhone before promoting a release that changes offline, storage, or app-runtime code.

## Device Setup

- Safari on current iOS release.
- Low Power Mode off for the first pass, on for the second pass.
- Shippie opened from Safari and from Add to Home Screen.

## Required Pass

1. Open Shippie online.
2. Open Palate, Chiwit, and one game.
3. Save each tool for offline.
4. Confirm each shows `Ready offline` before leaving the page.
5. Add Shippie to Home Screen.
6. Enable Airplane Mode.
7. Cold-launch Shippie from the Home Screen.
8. Open each saved tool directly from `/run/<slug>`.
9. Reload each saved tool while still offline.
10. Confirm the generic marketplace offline page never appears for a saved tool.
11. Turn the network back on.
12. Confirm any `Needs connection` state changes to `Repairing` and then `Ready offline`.

## Storage Pressure Pass

1. Save at least five tools.
2. Open `/you`.
3. Confirm storage usage and pin state are visible.
4. Tap `Pin offline storage`.
5. If Safari declines persistence, confirm Shippie still shows the saved-copy state honestly.
6. Simulate pressure by clearing Safari website data for a non-critical site or using a storage-heavy test profile.
7. Reopen Shippie.
8. Confirm evicted tools show `Needs connection`, not `Ready offline`.
9. Reconnect and confirm repair completes without manual cache clearing.

## Seven-Day Return Pass

1. Leave the Home Screen app unused for seven days.
2. Return offline first.
3. Confirm sealed tools either launch or clearly say they need connection.
4. Reconnect.
5. Confirm Shippie silently re-seals stale tools.

## Failure Criteria

- A saved tool shows the generic `You are offline` marketplace screen.
- A saved JavaScript or CSS miss returns HTML instead of a typed repair response.
- The UI says `Ready offline` when the capsule pointer or manifest is missing.
- User data restores only after a manual developer action.
- Private backup or sync starts without an explicit user choice.
