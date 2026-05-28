# Parade Companion — Official Details Update Plan

Date: 2026-05-28  
Event: Arsenal Champions Parade, Sunday 31 May 2026, from 14:00 BST  
Goal: Update the app from the provisional corridor to the official Arsenal/Islington parade guidance while preserving the offline-first promise.

Implementation status: P0 official route/data/copy landed on 2026-05-28. The baked offline pack now uses the official outer route, marks stadium/Drayton/Hornsey/Benwell no-access/no-view areas, updates station guidance, renames public bus copy to convoy, and blocks misleading convoy reports from restricted zones. Remaining items in this document are optional polish or operational checks unless explicitly marked otherwise.

## 0. Headline Change

The app must stop behaving like the parade runs through the stadium/Drayton Park corridor.

Official guidance now says Emirates Stadium, Drayton Park and surrounding roads will be closed and not accessible to the public. Supporters are specifically encouraged not to gather around the stadium area, Hornsey Road, Benwell Road or Drayton Park because they will not see the teams there.

The app’s route, map, copy, sync buckets and tap interpretation must now be based on the official outer parade route, not the old provisional stadium-to-town-hall line.

## 1. Source Of Truth

Use these sources in this priority order:

1. Arsenal official article: `https://www.arsenal.com/news/champions-parade-what-you-need-know`
2. Arsenal official route map download: `https://www.arsenal.com/media/558230/download`
3. Arsenal parade FAQ: `https://help.arsenal.com/support/solutions/articles/101000584937-parade`
4. Islington road closures: `https://www.islington.gov.uk/roads/arsenal-football-club-parade/road-closures`
5. TfL status updates and National Rail Enquiries for final travel state.

Because Arsenal’s article/download can be protected by Cloudflare, keep a copy of the route map image/PDF in the repo as the route digitisation reference, with source/date noted.

## 2. P0 Data Updates

### 2.1 Route Pack

Files:
- `apps/showcase-parade-companion/src/data/parade-2026.ts`
- `apps/showcase-parade-companion/public/route-pack.json`
- route-pack registry assets if generated separately

Required changes:

- Set `event.status` to `confirmed`.
- Bump `packVersion` to a 2026-05-28 timestamp.
- Replace `route.label` with `Official parade route`.
- Replace the old provisional route coordinates with a digitised polyline from the official Arsenal route map.
- Replace the old route note with:
  - starts from approximately 14:00
  - expected to take about two hours, indicative only
  - four open-top buses plus Champions truck
  - buses move continuously
  - no trophy lift
  - no large screens along route
  - fans should spread out along the full route

Route streets to digitise from the official map:

- Holloway Road
- Seven Sisters Road
- Blackstock Road
- Mountgrove Road
- Green Lanes
- Petherton Road
- Beresford Road
- Newington Green Road
- Essex Road
- Upper Street
- Highbury Corner / St Paul’s Road connection

Do not use Drayton Park as a public viewing route segment.

### 2.2 No-View / No-Pedestrian Zones

Add a first-class map concept, not just copy:

```ts
restrictedZones?: Array<{
  id: string;
  label: string;
  kind: 'no-view' | 'no-pedestrian' | 'closed-road';
  note: string;
  coordinates: [number, number][];
}>;
```

Initial zones:

- Stadium area: closed, not part of public parade viewing.
- Drayton Park: closed / no public access.
- Hornsey Road: avoid, no team visibility.
- Benwell Road: avoid, no team visibility.
- Red-and-white striped no-pedestrian zone from the Arsenal route map around the stadium/Drayton Park approach.

Map rendering:

- Use red hatching for `no-pedestrian`.
- Use muted red/paper fill for `no-view`.
- Label only at low zoom: `No public view`.
- Tapping inside a restricted zone should show a sheet: `Official guidance says you will not see the teams here. Move to the route.`

### 2.3 Transport State

Replace generic station copy with official parade-day statuses.

Stations:

- Holloway Road: closed.
- Drayton Park: closed.
- Essex Road: closed.
- Highbury & Islington: Victoria line will not stop; Overground exit-only; not step-free; unavailable after parade due to crowd management.
- Canonbury: exit-only; unavailable after parade due to crowd management.
- Finsbury Park: nearest station with both entry and exit; recommended for step-free access.
- Angel: alternative southern station.
- Manor House, Archway, King’s Cross St Pancras: alternatives to reduce congestion.
- Dalston Kingsland / Dalston Junction: alternative Overground routes for Crystal Palace, West Croydon or Stratford directions.

Buses:

- 23 of 26 local bus routes serving the event area are expected to be diverted or curtailed.
- Diversions are expected from 03:00 to 20:00 or until roads reopen.
- Station Place bus station at Finsbury Park closed.
- Wells Terrace bus station planned to remain open for W3, W7 and 210.

Road closures:

- Expected from approximately 04:00 Sunday 31 May until approximately 20:00, possibly later.
- Add Islington’s closed-road list to the safety/travel data, but do not dump the full list into the default UI.
- Surface only the relevant closure near the user when GPS is available.

## 3. P0 UX Changes

### 3.1 First Open Banner

Current first-run guidance should become official-route specific:

`Official route loaded. Stadium and Drayton Park are closed to the public. Pick a spot on the route and spread out.`

Actions:

- `Show route`
- `Travel warnings`
- `Got it`

This banner should reappear once after the official-pack upgrade even for users who already dismissed the old map brief.

Implementation:

- Store dismissal key as `parade-companion:official-route-2026-05-28:dismissed`.
- Do not reuse the old `map-brief-dismissed` key.

### 3.2 Rename “Bus” To “Convoy”

The official detail is more than a single bus: Champions truck, four open-top buses, teams and guests.

Change user-facing copy:

- `Bus here` → `Convoy here`
- `Bus timing estimate` → `Convoy timing`
- `Bus seen` pulse → `Convoy seen`
- Relay event type can remain `bus_seen` internally for compatibility, but UI should say convoy.

### 3.3 Tap Feedback

If a fan taps `Convoy here` while GPS is inside a restricted/no-view zone:

- Show warning: `Official route says the convoy will not be visible here. Move to the route if you can.`
- Still allow saving after a second confirm only if they insist.

If a fan taps `I’m here` inside a restricted/no-pedestrian zone:

- Save locally.
- Show: `You may be in a closed area. Follow steward/police instructions.`

### 3.4 Map Default View

The official route is larger and loop-shaped. Default map must show:

- the whole official route
- user dot
- route direction arrows
- no-view stadium/Drayton zone
- nearest station/travel warning

Hide by default:

- food/pub/ATM layers
- minor side streets
- all unverified toilets
- dense closure labels

## 4. P1 Safety Screen Updates

Safety tab should be refocused around official parade guidance.

Cards:

1. `Travel`
   - do not drive
   - road closures 04:00-20:00+
   - buses diverted
   - check TfL/National Rail before travel

2. `Stations`
   - Holloway Road closed
   - Drayton Park closed
   - Essex Road closed
   - Highbury & Islington restricted / not step-free
   - Finsbury Park recommended for step-free

3. `Closed / No View`
   - Emirates Stadium and Drayton Park closed to public
   - Hornsey Road and Benwell Road not viewing locations
   - buses move continuously

4. `Bring`
   - water
   - weather protection
   - small bag only
   - food/snacks if needed

5. `Do Not Bring`
   - flares / fireworks / pyrotechnics
   - drones
   - glass
   - tents / stools / folding chairs
   - BBQ/camping equipment

6. `If Something Feels Wrong`
   - tell a steward or police officer
   - emergency: 999
   - missing child: alert steward/police immediately

7. `Facilities`
   - no official toilets along the route
   - first aid points are to be signposted / confirmed
   - use stewards for nearest first aid

## 5. P1 Map Data Changes

### 5.1 Official Route Geometry

Digitise from the Arsenal route map into the same `MapExtent`.

Approach:

1. Add the official map image/PDF as a reference asset in `docs/superpowers/sources/parade-2026/`.
2. Trace 30-60 coordinate points along the gold route for a smooth loop.
3. Validate against known road/station anchors:
   - Holloway Road
   - Arsenal station
   - Finsbury Park
   - Blackstock Road
   - Highbury Fields
   - Highbury & Islington
   - Angel
4. Replace old six-point route with full traced route.
5. Update `buildRelaySegmentsFromRoute` tests so fan reports bucket correctly around the full loop.

### 5.2 No-Pedestrian Geometry

Trace the red/white no-pedestrian area from the official map around:

- Emirates Stadium
- Drayton Park
- Benwell Road
- Hornsey Road / Holloway Road footway area where applicable

Use this in:

- map overlay
- tap warnings
- location strip warning
- Safety tab

### 5.3 Station / Travel POIs

Update POIs and notes:

- Holloway Road: `closed`
- Drayton Park: `closed`
- Essex Road: `closed`
- Highbury & Islington: `exit-only / no Victoria stop / not step-free`
- Canonbury: `exit-only`
- Finsbury Park: `recommended step-free`
- Angel: `alternative`
- Manor House / Archway / King’s Cross St Pancras: `alternative`
- Dalston Kingsland / Dalston Junction: `post-parade Overground alternative`

Add map icons only for nearby/relevant stations by default. The Safety tab can hold the complete list.

## 6. P1 Toilet / Facilities Correction

The current app has static toilet POIs and a `Toilet here` tap. Official FAQ says there will be no toilet facilities available along the route.

Required correction:

- Remove `Event portaloos` placeholder.
- Reword static toilet POIs as `public toilet nearby, not event-provided`.
- Rename quick find:
  - `Toilet` → `WC nearby`
- Rename tap:
  - `Toilet here` → `WC spotted`
- Add copy in sheet:
  - `Not official event provision. Check signs and opening.`

Do not remove peer reports. In a huge crowd, peer-reported open WCs may be useful, but the app must not imply official provision.

## 7. P1 Offline Update Flow

This is the app’s biggest risk: people may already have the provisional route cached.

Update flow:

1. On online launch, fetch latest `route-pack.json`.
2. If `packVersion` is newer and `event.status === confirmed`, save it.
3. Show a non-sticky toast:
   - `Official route saved offline. Stadium/Drayton closed.`
4. Show first-open official route banner once.
5. Preserve:
   - display name
   - group plan
   - room keys
   - local fan taps
   - banter votes
6. Do not wipe user data.

Add a visible status when saved:

`Saved offline · official pack 28 May 2026`

Clicking `Saved` should show:

`Official route, travel warnings, fonts, map detail and safety notes are saved on this phone.`

## 8. P2 Live Sync / Crowd Signal Changes

The old `bus_seen` event can remain internally, but the public display should be `convoy_seen`.

Signal processing:

- segment buckets must be rebuilt from the new full route
- no-view zone reports should not create public confidence unless multiple unique phones confirm from official-route-adjacent segments
- convoy confidence should display:
  - `1 fan`
  - `3 fans nearby`
  - `confirmed by 8 phones`
- if reports appear behind the route direction, show as `old sighting`

Crowd compass:

- default goal should prefer official route, not stadium.
- if user is in a no-view zone, primary suggestion becomes `Move to route`.
- if convoy cluster is active, goal can be `Convoy likely ahead`.

## 9. P2 “Spread Out” Guidance

Official messaging says wherever fans stand they should have a similar experience and should spread out along the full route.

Add gentle app nudges:

- If GPS is within 150m of stadium/no-view zone:
  - `This area is closed / no team view. Move to the route.`
- If local crowd density reports are high:
  - `Crowded here. Try another stretch of the route.`
- If user is on route but not near a known pinch point:
  - `Good spot. The convoy keeps moving.`

Do not create a “best spot” feature. That would pull users into unsafe clusters.

## 10. Tests

Required tests:

- Route pack validates with official route and status `confirmed`.
- Baked fallback and `public/route-pack.json` have matching packVersion.
- Route coordinates stay inside `CORRIDOR_EXTENT`.
- Restricted/no-view zones validate inside extent.
- Fan event route snapping works across the full loop.
- `Convoy here` UI still stores `bus_seen` for backward compatibility.
- Restricted-zone tap shows warning before public confidence.
- Safety copy includes closed/restricted stations.
- Offline-save bundle includes updated route pack.
- Existing group/share/local storage tests stay green.

Manual QA:

- Fresh online load saves official pack.
- Airplane-mode reload shows official route.
- Existing cached user gets upgrade banner.
- GPS at Drayton Park shows no-view warning.
- GPS at Holloway Road/Seven Sisters/Blackstock/Upper Street/Essex Road shows on-route state.
- `Convoy here` at route saves and syncs.
- `Convoy here` in no-view zone warns.
- Safety tab gives travel answer in under two taps.

## 11. Deployment Plan

### Today, Thursday 28 May

1. Implement official route data and copy.
2. Deploy baked app update.
3. Push live route-pack JSON so existing installs update on next online launch.
4. Smoke test live URL.

### Friday 29 May

1. Check Arsenal article/FAQ again.
2. Check Islington road closure list again.
3. Check TfL/National Rail final operational notices if published.
4. Push data-only route-pack update if anything changed.

### Saturday 30 May

1. Freeze app code unless critical.
2. Data-only update allowed.
3. Confirm offline load on iOS Safari + Android Chrome.
4. Post setup link with “open once on Wi-Fi before Sunday.”

### Sunday 31 May, 09:00

1. Final source check.
2. Push route-pack only if official source changed.
3. No app code deploy unless route is dangerously wrong.

## 12. Messaging Changes

Replace any `provisional` copy with:

- `Official route saved offline`
- `Check latest on Wi-Fi before travelling`
- `The convoy keeps moving`
- `Spread out along the route`
- `Stadium and Drayton Park are closed to the public`
- `No official toilets along the route`

Avoid:

- `best spot`
- `go to stadium`
- `bus stops here`
- `trophy lift`
- `screens`
- `toilets provided`

## 13. Acceptance Criteria

The app is ready when:

- default map matches official outer route, not provisional Drayton Park route
- no-view stadium/Drayton zones are visibly marked
- station statuses match Arsenal FAQ
- safety tab reflects official event rules
- offline reload shows the official pack
- user data survives pack update
- live sync still works with new route buckets
- all tests pass
- live deployed app smoke test passes
