# World Cup Private Spaces Playbook

Last updated: 2026-05-17

## Thesis

Match Room is the launch showcase for Shippie Spaces.

The simple user story is:

> Create a private World Cup room. Share a QR or link. Friends join without an
> account. The room works locally where possible, syncs privately when needed,
> and turns into a read-only memory after the tournament.

This is stronger than "fantasy football app" because the app demonstrates the
platform's real difference: private groups between phones, no corporate account
graph, local/Hub-first transport, portable packages, and sealed data handoff.

## Product Shape

Keep the app focused:

- One visible concept: the room.
- One viral action: invite people by link or QR.
- One daily habit: predict, vote, react, or answer a quick prompt.
- One memory ending: archive the room after the final.

Do not turn the showcase into a full sports super-app. Avoid news feeds, player
databases, transfer markets, chat, and global anonymous leaderboards. The room
is the value.

## What Ships Now

- `match-room` declares `spaces.enabled` with `host`, `play`, and `display`
  roles.
- The dashboard creates private-space invite links and QR codes.
- Join tokens rotate independently from members.
- Spaces can be archived.
- The focused container passes active space context into the app.
- The Hub preserves package `spaces` metadata in local ambient discovery.
- A production smoke script proves create -> invite -> claim -> archive ->
  cleanup against `shippie.app`.
- The Match Room landing screen now presents the private-space demo directly.

## Room Types

| Room | Default Role Flow | Good For |
|---|---|---|
| Friends | host -> play | WhatsApp groups, pub tables, family friends |
| Family | host -> play/display | Low-friction mixed-age groups |
| Company | host -> play/display | Office leagues, Slack sharing, safe leaderboard |
| Pub | host -> play/display | One QR, many claims, expires at midnight |
| Watch party | host -> play/display | Local reactions, quick prompts, shared screen |

## Launch Loop

1. Seed 10 to 20 real groups manually.
2. Each group gets one room QR/link, not a generic app download link.
3. Ask people to make one prediction before explaining Shippie.
4. After an exact prediction or funny result, generate a share card.
5. Every card points back to "create your own private room".
6. During knockouts, ship archive/memory cards as the second viral wave.

## Hub Demo

Best venue story:

1. Install `match-room.shippie` onto a Hub.
2. Put a QR on the bar/table/screen.
3. Phones on the venue Wi-Fi discover the Hub.
4. Ambient discovery shows `Match Room` as a local space-aware tool.
5. Fans explicitly join the room.
6. Predictions, votes, and display roles coordinate over the LAN where possible.

The pitch is not "we built another sports app". It is:

> This room works in the place where every other app struggles: a busy venue with
> weak internet and lots of phones.

## Safety And Scope

- No global anonymous leaderboard in MVP.
- No public room directory in MVP.
- No phone-as-always-on server promise.
- No third-party app signing claims beyond existing package verification.
- No moderation promise for encrypted private room contents.

The platform governs public listings and package distribution. Room contents are
private app/user data.

## Success Signals

- A new user can create and share a room in under 30 seconds.
- A friend can join without creating an account.
- A host can rotate a leaked room link without deleting current members.
- A room can be archived after the final.
- A Hub can advertise Match Room locally without internet dependency.
- The production smoke script passes after every deploy.
