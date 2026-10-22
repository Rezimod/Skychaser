# Stellar — open questions

Decisions taken during the build where the plan was ambiguous. Each took the
most reversible option; each needs a yes/no from Rezi.

## Phase 2

1. **`/api/award-stars` still pays 10 Stars for proof-of-find on `/sky`.**
   Gate 0 says Stars earning is frozen. Phase 2 trimmed the route to the
   `find:` branch only (quiz, check-in, cosmic bonus, weekly challenge and
   telescope registration are gone). Removing `find:` too — and the `/sky`
   call — is a one-line policy change. Freeze it fully?

2. **13 API routes with no in-repo caller were kept**, because an external
   caller (share links, crawlers, the Astroman till, old app builds) cannot be
   ruled out from the code: `og/*`, `sky/targets`, `sky/tonight`, `darksky/*`,
   `subscribe`, `products`, `observatory/nodes`, `users` and `wallet` stubs.
   Delete after checking Vercel logs for traffic?

3. **`/api/mint` and `observation-token.ts` stay** so pending legacy cNFT mints
   can still be retried from `/nfts`. No new verification tokens are issued
   (observe/verify is gone), so the route only settles old claims. Retire it
   once `/nfts` becomes `/collection` in Phase 6?

4. **The Name-a-Star registry (`/star`) is now read-only** — its only writer,
   `/api/star/claim`, was cut with the observe flow. Keep as a read-only
   catalogue, or bring claiming back as a Stellar card path?

5. **`src/lib/star-catalog.ts` was deleted** (cut-only). Phase 4 takes star
   coordinates from `src/lib/sky/stars.ts` (`BRIGHT_STARS`) instead.

6. **Pages now prerender statically.** The locale cookie read in
   `src/i18n/request.ts` was what forced every page dynamic; English-only removes
   it. A local `npm run build` therefore needs `NEXT_PUBLIC_PRIVY_APP_ID` set
   (Vercel already has it). Watch the preview for any page that relied on
   per-request rendering.

## Phase 3

7. **Crash gap in the lifecycle script.** A crash between `recordCapture` and
   the attach leaves one orphaned capture; a re-run records a second. Harmless
   on the simulator; worth a guard before the real node runs unattended.

8. **Customer captures can fill tonight's card.** The cron path attaches a
   First Light / request capture of tonight's object to the card when the night
   has none yet. That is the "one capture serves all" rule applied literally —
   confirm a customer's frame may become the public card image.

9. **TYCHO facts** (85 km, rays over 1,500 km) come from general knowledge —
   source-check with the Set 001 data pass.

10. **Real-node path is blocked on the Darkview contract.** `DarkviewAdapter.capture()`
    returns retry by design: the contract has no machine-to-machine capture
    operation, and it forbids inventing one. Needs a contract change from Darkview.

## Phase 5

11. **Digital, physical, or both?** Gate 2's cost list (fulfilment, packaging,
    returns) implies printed cards. The capsule order stores no shipping address
    today (the orders columns are written empty). Decide before Gate 2's numbers
    are final; `contentsCostPerCardGel`, `fulfilmentGel` and `packagingGel` are 0
    until then.

12. **Unpaid capsules.** A purchase fixes the nonce before payment, so an order
    that is never paid has to be voided (admin/cron `POST /api/skychaser/capsules/void`),
    and the log shows it as voided after purchase, with the reason and the
    revealed secret. What timeout voids an unpaid capsule — and should a cron do it?

13. **Refunds.** A direct card order whose card sells out between order and
    payment is marked `refund_due`; a payment that lands after its capsule was
    voided has nothing to open. Both need a manual refund path; none exists.

14. **Direct sales and capsule supply.** Listing refuses capsules the remaining
    editions cannot fill, but a direct card purchase can still take an edition a
    listed capsule was counting on. With Set 001's 3,035 editions this is
    theoretical; at a sold-out set it is not.

15. ~~**Release gating.**~~ **Decided 2026-09-20: gate on it.** A direct card
    purchase now refuses unless `card_set.status = 'released'`
    (`cardAvailability`), so one switch puts Set 001 on sale, capsules and
    cards alike. The card page says so rather than offering a button.

16. **CAPSULE_SEAL_KEY.** Must be set (32 bytes hex) in any environment that
    lists or opens capsules. Losing it strands every listed-but-unopened
    capsule: its secret can no longer be revealed, so it can be neither opened
    nor voided. Capsule 3 on the stellar branch is one such — listed by a demo
    run with a temporary key. It has since been withdrawn, with the reason in
    the log, and its record now says so.

17. ~~**The homepage.**~~ **Decided 2026-09-20: delete them.** The legacy
    marketing sections went in a deletion commit of their own. The old
    homepage's last version is in commit `2a677ba`'s tree if Phase 9 wants
    any of it back.

18. **Tonight.** The design brief's top bar names Set 001, Collection and
    Tonight. `/tonight` arrives with the voting in Phase 8, so the bar links to
    Capsules in its place rather than to a 404. Restore Tonight when it exists.
    (Standing; nothing to decide until Phase 8.)

19. ~~**`/collection` and the wallet.**~~ **Decided 2026-09-20: keep the
    address in the URL.** A Collection is a public catalogue, like the log:
    readable and linkable by naming its holder.

20. ~~**The merchant wallet.**~~ **Settled 2026-09-21.**
    `NEXT_PUBLIC_MERCHANT_WALLET` is set on the skychaser Vercel project for
    production, preview and development — the same mainnet address the Stellar
    project pays to. Until it was set, "Take this capsule" reached the pay step
    and got a 503: the buy route refuses to quote without a recipient. The
    remaining part of Gate 3 needs a person, not a value: a signed-in stranger
    paying real SOL and opening what they bought.

21. ~~**Phase 7 — does the renderer carry card art?**~~ **Decided 2026-09-22:
    renders for the planets.** Saturn, Mars, Jupiter and Venus carry them; every
    other card keeps its drawn plate. The original finding: Rendered 2026-09-21, the
    three the plan names, then stopped. Saturn and Mars are usable
    (`public/cards/SATURN.webp`, `MARS.webp`; not yet wired to any card).
    Europa fails: Explore has no Europa map, so it comes out a plain beige
    sphere, and the still was not kept. Across Set 001 the renderer can carry
    about 4 objects well (Saturn, Mars, Jupiter, Venus), about 7 at the margin
    (Pluto, the Great Red Spot, the four craters and Tranquility Base, all
    limited by map resolution), and none of the 9 stars, clusters, nebulae and
    galaxies — or Europa, until a public-domain Galileo mosaic is added. **For
    the owner:** expand the renderer to the planets, or keep the drawn plates
    for every card and commission an illustrator. The drawn plates stay live
    until that is decided.

## Phase 8

22. **Where the invite gate closes.** The gate is live only while
    `STELLAR_INVITE_CODES` is set on the Vercel project, and it covers pages
    only: APIs, the on-chain metadata routes and static art stay open, so a
    capsule bought by an invited holder still reveals and verifies. Setting
    it on production closes app.stellarr.club to search and to anyone
    without a link, the Gate 3 stranger included — they need an
    `/invite/<code>` link. Took the reversible option: the code ships with
    the gate off until the variable is set. **For the owner:** the codes, and
    when to switch it on.

23. **How much a vote weighs, and how far a lost night carries.** Each held
    edition adds `VOTE_WEIGHT` by its rarity (1 / 2 / 5 / 20, in
    `economics.ts`, PROVISIONAL until Gate 4); holding nothing, there is no
    vote. A night lost to cloud carries its card one night only, and only if
    its object is up then; after that the vote decides again. A clear night
    with no photograph — Node 01 commissioning — is not lost and carries
    nothing. **For the owner:** the weights, and whether a lost card should
    keep carrying until it is photographed.

## Audit fixes (2026-09-24)

24. **Retired Stellar pages and SEO, ahead of Phase 9.** The plan leaves
    redirects and SEO to Phase 9, after Gate 4. An audit found every Stellar
    page telling search engines and link previews that it was the Stellar
    home (canonical, og:title, og:image, sitemap, robots all pointed at
    stellarr.club), and Stellar's /sky, /shop, /profile and the rest live on
    app.stellarr.club. The owner asked for the fix now. Took the
    reversible option: metadata, sitemap and robots name Stellar, and
    `src/middleware.ts` sends the retired pages to their Stellar counterpart
    with a temporary (307) redirect, one list to edit. Nothing is deleted.
    Still reachable: /nfts (the legacy observation view), /observatory/*
    (operator tools), /m/* and /api/*. **For the owner:** whether any
    redirected page should stay, and when to make the redirects permanent.

## First Light (2026-09-25)

25. **Set 001 replaced by First Light before anything sold.** The 24 cards
    are new (16 Objects, 8 dated Almanac cards); `card_set.code` stays
    `SET001` and the URL `/set/001`, the display name is First Light. The
    "committed before sale" commitment is per capsule (SHA-256 of that
    capsule's secret) and never covered the card list, so the 20 listed
    capsules keep their commitments; their draws run against whatever
    supply exists when they open. Sealing is read off the clock from
    `eventEndUtc` (`src/lib/skychaser/almanac.ts`), not stored: a sealed card
    has 0 editions to draw, is not sold outright, and its tile says Sealed.
    Re-seeding deletes the 18 old card rows only while no edition of them
    exists. **For the owner:** the old rows are still in the card database
    until `stellar:seed` is run; `RARITY_ODDS_BPS` (7570/1960/420/50) was
    tuned to the old 2,700/700/150/15 supply — First Light's is
    2,100/800/120/25 — and was left as published; the Almanac's promised
    capture on the night has no flow yet (nightly_target is by vote).

## Capsule tiers on sale (2026-09-26)

26. **The four shelf tiers sell for real.** A capsule is now listed as a tier
    (`capsule.tier`, `capsule.odds_bps`); it takes the tier's price and odds,
    and its 'listed' log entry carries them, so the odds it opens under are
    public before the sale. The audit flags `odds_changed` when an opening's
    logged odds differ from the listing's. Capsules listed before tiers keep
    `RARITY_ODDS_BPS` and their $15 price. Took the reversible option: the
    20 capsules already listed are left on sale as they are, shown on
    /capsules as "Listed before the tiers"; the tiers start empty until
    capsules are listed with `skychaser-release-set.ts <count> <tier>`. The tier
    odds in `tiers.ts` are PROVISIONAL (Gate 2) and were not checked against
    First Light's supply (2,100 / 800 / 120 / 25): Lunar draws no commons, so
    heavy Lunar sales run the 25 legendaries and 120 epics down first.
    **For the owner:** how many capsules of each tier to list, and whether to
    void the 20 older $15 capsules.

## A hundred cards (2026-09-26)

27. **First Light grows from 24 to 100 cards before any stranger has
    bought.** The owner asked for about a hundred: celestial objects, and
    cards from Star Wars, Interstellar and other iconic films. The film
    cards were not made as asked: their names, designs and imagery belong to
    their studios, and a card sold with them would be infringing. Took the
    reversible option: ten original Frontier worlds that carry the ideas
    those films made famous (twin suns, a wormhole, an ocean near a black
    hole, a ring around a world) under Stellar's own names and designs,
    labelled fiction on the face and back, paired with the real object that
    inspired them where one exists. Rarity mix 8 / 16 / 34 / 42 (legendary
    to common), so supply is 40 / 480 / 3,400 / 12,600 editions; the tier
    odds in `tiers.ts` and `RARITY_ODDS_BPS` were not retuned. The code and
    URL stay SET001 and /set/001. **For the owner:** whether to license any
    real film property (a separate, paid agreement), and the final rarity
    of each card.

## Owner's answers (2026-09-27)

- 22: the site stays open; no invite gate.
- 23: vote weights stay 1 / 2 / 5 / 20. A card lost to cloud is carried up to
  three nights in a row (`MAX_CARRIED_NIGHTS`, night.ts), then the vote decides.
- 24: the redirected Stellar pages stay as they are (307).
- 25/26: tier odds to be rebalanced against First Light's supply; proposal put
  to the owner before any change. The 20 capsules listed before the tiers are
  removed before Gate 3. Tier listing: Chondrite 40, Iron 25, Pallasite 10, Lunar 5.
- 27: the ten original Frontier cards stay; no film licence.
- Payments stay in rehearsal until the owner says otherwise.
- Tier odds: option B, in tiers.ts (8600/1250/140/10, 6000/3200/700/100,
  2500/5200/2000/300, 0/5300/4000/700). Applies to capsules listed after;
  the unsold shelf is to be voided and relisted at 40 / 25 / 10 / 5.
- V-1: drop the phase-7 card renderer with tools/explore. V-2: no rooms in
  the first version. V-3: a voyage is a record only. V-4: stellarr.club/play
  redirects to /voyage a week after /voyage goes live.

## Fly it, one card to a capsule (2026-10-01)

28. **One card to a capsule, at the same prices.** The owner asked for one
    card per capsule and the new opening, "Fly it": the capsule is launched,
    comes home and the card comes out of its hatch. `CARDS_PER_TIER` and
    `CARDS_PER_CAPSULE` are now 1. Took the reversible option on money:
    prices ($5 / $20 / $50 / $100) and per-card odds are unchanged, so each
    capsule now carries half the expected card value it did. Payments are
    still in rehearsal, so nothing has been charged at the new terms.
    **For the owner:** lower the prices, raise the per-card odds, or keep
    both. Capsules already listed hold two cards (`cards_per_capsule` is
    stored per capsule); they still open correctly — the scarcer card flies,
    the other waits beside it — but the unsold shelf should be voided and
    relisted so every capsule on sale holds one.


## Booking the telescope with credits (2026-10-12)

29. **Session prices, credit packs and the first bookable night are
    provisional.** /book sells half-hours on Live Telescope V1 from
    `FIRST_NIGHT` (1 November 2026, `src/lib/skychaser/booking.ts`), 20:00 to
    02:00 Tbilisi time inside the dark window. Took the reversible numbers: a
    30-minute session is 20 credits, an hour 36; packs of 20 / 60 / 150
    credits cost $20 / $54 / $120, paid in SOL on the capsule rail; one
    credit stands for one dollar and credits do not expire. An Epic edition
    pays for one half-hour (its perk), once per edition while the booking
    stands. A session cancels with its credits back until 24 hours before it
    starts. The tables are additive (`scripts/skychaser-bookings.sql`) and
    have to be applied to the card database by hand; until then the page
    shows every half-hour open and the routes answer 503.
    **For the owner:** the prices and pack sizes, the first night, whether
    sessions on cloudy nights are refunded by hand (nothing automatic yet),
    and whether the operator takes bookings past 02:00.


## Only the cards are live (2026-10-13)

30. **Booking went behind the coming-soon page with the observatory.** The
    owner's instruction: no simulated or demo payment anywhere, and the
    observatory and the vote are coming soon, not live products — only the
    cards are live. Booking sells half-hours on the same telescope, so /book
    now redirects to /node, which says first light is in November; the nav
    reads Genesis, Observatory, Vote. The booking console, its routes and
    the credits rail are untouched in code and come back by restoring the
    /book page and the nav entries. Credits already granted stay on the
    account. The vote and booking APIs still answer direct calls; no page
    reaches them.
    **For the owner:** whether /book should be live before first light
    (selling sessions for November now), and whether the 24 orders the
    rehearsal builds marked paid — 16 opened capsules, 5 still sealed, 1
    card, all on the owner's two accounts, nothing paid — should be cleared
    with the go-live reset or kept as the owner's own cards.

## Growth (2026-10-22)

31. **The welcome card is First Light.** Every account that signs in receives
    one edition of `FIRST-LIGHT` (then `BIG-DIPPER`, `ORION`, `SUMMER-TRIANGLE`
    once each is gone), numbered like any other and counted against supply
    (`src/lib/skychaser/welcome.ts`). First Light is a former headliner and
    votes ×3, so 300 welcomes add up to 900 votes a week. If that is too much
    weight to give away, move a plain-vote common to the front of the list; the
    order is one constant. `SKYCHASER_WELCOME=off` stops it entirely.

32. **One welcome per account and per wallet is the only sybil guard.** An
    email sign-in is cheap, so a determined person could collect First Light
    editions under many addresses, one an hour per IP. The cost of that is 300
    commons at most; the funnel (`welcome_granted` events) will show it if it
    happens. A stronger guard (a phone, a paid capsule first) was not added
    because it would remove the point of the first card.

33. **One common for each invited account's first capsule, up to ten.** The
    inviter's card is drawn at random among the commons with editions left,
    never a welcome card, never a sealed or limited one
    (`src/lib/skychaser/referral.ts`). It is a gift, not a sale, so the draw is
    not committed to in the public log. Ten is a guess at where generosity
    turns into farming; the constant is `REFERRAL_REWARD_CAP`.

34. **A holder's link opens the closed beta.** While `STELLAR_INVITE_CODES`
    is set, a holder's code admits whoever opens it, exactly as an owner's
    code does: the cookie carries a signature made with `INVITE_SIGNING_KEY`
    (or the capsule seal key). If the beta is meant to grow only by the
    owner's hand, the one line in `src/middleware.ts` that accepts the
    signature comes out, and holders' links still record who brought whom.
