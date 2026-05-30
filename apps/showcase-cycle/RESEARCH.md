# Cycle — research synthesis (private cycle tracking)

Research-first brief for elevating Shippie's `cycle` app into the most
trustworthy private cycle tracker. Grounded in current (2024–2026) literature
on reproductive-data privacy, cycle prediction accuracy, and inclusive design.

## User jobs (what people actually hire a cycle app to do)

1. **"Tell me what's coming."** Predict the next period / PMS window so life,
   work, travel, and supplies can be planned. The #1 retention driver.
2. **"Is this normal for *me*?"** Establish a personal baseline (cycle length,
   pain, flow, mood) and flag deviations — not population averages.
3. **"Log it in seconds."** Capture today's body signals with near-zero
   friction, often one-handed, sometimes discreetly.
4. **"Help me understand my body."** Connect symptoms (pain, mood, sleep,
   energy, headaches, digestion, skin, cravings) to cycle phase — bodily literacy.
5. **"Support my situation."** TTC, contraception, pregnancy/postpartum,
   perimenopause, irregular/no-cycle, or simply period-only — without being
   forced into a fertility/baby frame.
6. **"Keep it private and mine."** Especially post-Roe: clear user control,
   minimal disclosure, and no secondary use. A growing, non-negotiable job.
7. **"Share *some* of it, on my terms."** With a partner or clinician — selected
   fields, revocable, never the whole diary.

## Trust risks (why people delete period apps)

- **Legal exposure (post-Dobbs).** Studies (CHI 2024, "I Deleted It After the
  Overturn of Roe") found users delete apps fearing data reaches law
  enforcement / third parties; pregnancy and abortion are inferable from cycle
  gaps. UK police guidance (Dec 2024) explicitly includes checking fertility
  trackers after pregnancy loss. **The data itself is the liability.**
- **Surveillance capitalism.** ~87% of women's mHealth apps share data; ~61%
  permit location tracking. Accounts, cloud sync, and SDKs are the leak vectors.
- **Opaque policies.** Privacy policies typically require college-level reading;
  users feel "powerless and uninformed." Trust requires *legible* guarantees.
- **Prediction over-promising.** Calendar prediction error averages ~3.4 days
  (accuracy 17–89%), much worse for irregular cycles. Apps that present
  predictions as certainty erode trust the first time a period comes "late."
- **Exclusion / dysphoria.** Pink-everything, baby-first framing, and gendered
  copy/notifications alienate trans, non-binary, perimenopausal, child-free,
  and period-only users. Inability to *turn off* fertility framing is a delete trigger.
- **Lock-in & loss.** No export / no delete / no portability = the diary is a hostage.

## Engagement loops (ethical, not dark-pattern)

- **Daily:** open → see "where am I in my cycle" + today's prediction → 5-second
  log → quiet acknowledgement. No streak guilt, no notification nags.
- **Cyclical:** period starts → confirm/correct prediction → model learns →
  next prediction tightens → "your range is narrowing" payoff.
- **Insight:** after ~2 cycles, surface *personal* patterns ("cramps cluster on
  days 1–2", "mood dips ~3 days pre-period") — bodily literacy as the reward.
- **Cross-app (Shippie):** ambient mood/sleep/hydration/workout signals fold in
  to enrich patterns without re-entry.

## Must-have flows

1. **5-second daily log** — flow, pain, symptoms, mood, energy, discharge/
   cervical, medication, optional sex/contraception, freeform note.
2. **Timeline + prediction** with **confidence ranges**, irregular-cycle
   support, **manual correction**, and explicit *"prediction, not certainty"* copy.
3. **Personal pattern insights** across symptoms + cycle variability.
4. **Modes** that re-frame the whole app: period-only, fertility-aware,
   contraception-aware, TTC, pregnancy/postpartum, perimenopause, irregular/
   no-cycle — with gender-neutral copy throughout.
5. **Privacy controls** — local canonical data, no account, app lock / privacy
   screen, optional duress/decoy, full export + delete, optional *encrypted* backup.
6. **Selective sharing** — opt-in, field-selective, revocable, offline-safe.
7. **"When to seek care"** education with a clear *not medical advice* disclaimer.

## The privacy-first benchmark (who to beat)

- **Drip** — open-source, Android, local-only, no account, app password,
  **transparent prediction math**, gender-inclusive, deliberately no pink. The bar for honesty.
- **Euki** — nonprofit, cross-platform, local-only, **duress PIN + decoy screen**,
  rich sexual-health info — but **no period prediction** (a gap Shippie can close).
- **Periodical** — minimal, local, open-source.
- Mainstream (Flo, Clue, etc.) carry the data-sharing baggage users now flee.

**Gap in the market:** a local-only, no-account app that *also* gives honest,
range-based predictions **and** Euki-grade safety (lock/duress) **and** real
inclusivity — none of the privacy leaders do all three.

## Shippie's structural advantages (lean into these)

- **Local-canonical by architecture.** Data lives in on-device wa-sqlite/OPFS;
  Shippie hosts only the tool package. No account, no analytics SDK, no ad
  network — the leak vectors simply aren't present. This is the post-Roe story.
- **Offline after first load.** No hidden network dependency = no server that can
  be compelled. Remote font dependencies were removed; keep typography local or
  system-backed.
- **Open source (AGPL).** Auditable privacy claims, like Drip/Euki.
- **Optional sealed/encrypted backup & private cloud** — portability without a
  honeypot; passphrase-encrypted, app-scoped.
- **Cross-app intents** — enrich patterns from sibling apps *on-device*, no
  third-party pipeline.
- **Selective, revocable sharing primitive** — opt-in field-level shares that
  work offline (QR/relay), never a hosted profile.

## Design north star

Private, protective, bodily-literate, calm, mature, inclusive. The opposite of
both the pink-flower cliché and the cold clinical chart. Predictions are offered
as ranges with visible reasoning ("here's why"), never as commands. The app
should feel like a **trusted, discreet logbook for your own body** that happens
to be very good at noticing patterns — and that you could hand to no one unless
you chose to.

## Sources

- [CHI 2024 — "I Deleted It After the Overturn of Roe v. Wade"](https://dl.acm.org/doi/10.1145/3613904.3642042) ([FTC PDF](https://www.ftc.gov/system/files/ftc_gov/pdf/10-Laabadli-Understanding-Womens-Privacy-Concerns-Toward-Period-Tracking-Apps-in-the-Post-Roe-v-Wade-Era.pdf))
- [Privacy International — All Eyes on my Period](https://privacyinternational.org/long-read/5593/all-eyes-my-period-period-tracking-apps-and-future-privacy-post-roe-world)
- [Context/TRF — how period apps threaten digital privacy](https://www.context.news/digital-rights/how-period-tracking-apps-threaten-digital-privacy-rights)
- [Consumer Reports — period tracker apps & privacy](https://www.consumerreports.org/health/health-privacy/period-tracker-apps-privacy-a2278134145/)
- [ExpressVPN — safe period trackers (Euki/Drip/Periodical)](https://www.expressvpn.com/blog/period-tracking-apps/)
- [Accuracy of calendar-based cycle-phase methods (PMC3658377)](https://pmc.ncbi.nlm.nih.gov/articles/PMC3658377/)
- [Predictive modeling of menstrual cycle length (arXiv 2308.07927)](https://arxiv.org/pdf/2308.07927)
- [Clue — using a cycle tracker when you're trans](https://helloclue.com/articles/cycle-a-z/tips-for-using-clue-when-you're-trans)
- [Cyc-all — inclusive gender-neutral cycle tracking (case study)](https://medium.com/design-bootcamp/cyc-all-the-inclusive-gender-neutral-cycle-tracking-app-case-study-e922aeae9a2d)
