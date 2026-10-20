# Stellar Academy: the plan

A space-learning app for children in Georgia, in Georgian first and English
second. Short daily lessons, in the spirit of Duolingo. Each finished lesson
opens a mission in Stellar Explore, the game. Collected cards and, later,
real prizes from Astroman keep children coming back.

## Who it is for

- Children aged 6–17 in Georgia: at home, and in class with a teacher.
- Parents, who decide what is switched on.
- Teachers, who will be able to run a class through it (phase 2).

## Principles

- **Learn, then play.** In children's mode, a Moon mission in the game opens
  only after the lesson that teaches it.
- **Nobody fails.** There are no hearts and no game over. A missed question
  comes back once at the end. A second miss shows the answer and moves on.
- **Nothing is left to chance and nothing is for sale.** Each capsule holds a
  known card, shown before it is opened. There are no loot boxes, no
  purchases, and no currency that can be bought.
- **Private by default.** Phase 1 keeps progress on the device only. There is
  no account, no chat, no ads and no tracking. Anything that leaves the app
  sits behind a parent check.
- **Georgian is first-class.** Every string a child reads is written in
  Georgian, not machine-translated. A native-speaking teacher reviews it
  before release.

## Phase 1: the web app (built)

Live at `/academy`. The middleware is also ready for `academy.stellarr.club`
once that domain is pointed at the Stellar project in Vercel.

| Piece | Where |
|---|---|
| Course data types | `src/lib/academy/types.ts` |
| Moon unit: 5 lessons, 40 questions, 5 cards | `src/lib/academy/course-moon.ts`, `course.ts` |
| Rules: answers, the run, XP, streaks, capsules | `src/lib/academy/engine.ts` |
| On-device progress (one versioned key) | `src/lib/academy/store.ts` |
| Game link: missions wait for their lessons | `src/lib/academy/gates.ts`, `missions.ts`, `MissionsPanel.tsx` |
| Screens | `src/app/academy/_components/AcademyApp.tsx`, `Exercise.tsx` |
| Sounds (Web Audio, no files) | `src/lib/academy/sound.ts` |
| Tests | `src/test/academy-*.test.ts`, `game-menus.test.ts`, `missions.test.ts` |
| Browser walkthrough | `scripts/qa-academy.mjs` |

What a child does:

1. Pick a name or nickname, a badge (no photos) and an age band. Children's
   mode starts switched on.
2. Follow the path. Each lesson has 8 questions, in four kinds: choose one,
   true or false, put in order, and match pairs. Each question is explained
   after it is answered.
3. Earn XP, keep a daily streak, and reach a daily goal of 10, 20 or 30 XP.
4. Open the lesson's capsule and add its card to the collection.
5. Tap **Play the mission** to land on the Moon at Stellar Base. That
   mission is now open.

What a parent does, behind a multiplication question:

- turn children's mode on or off
- set the daily goal
- choose the language
- turn sounds on or off
- erase progress
- read what is and isn't collected

## Phase 2: accounts, classes and prizes

- **Parent accounts.** A parent signs in with email (the existing Privy sign-in, or a
  lighter magic link). A child never signs in. Progress syncs from the device
  to the parent's account, using the `AcademyState` shape as it is.
- **Class codes for teachers.** A teacher makes a class and gets a six-letter code. A
  child joins with a nickname only. The teacher sees lessons finished and
  accuracy by question, which shows what to reteach. Nothing else is shown.
- **Prizes from Astroman.** Finishing a world (all its lessons and its missions)
  earns a prize code. The parent claims it in their account, through the
  existing redeem-code API. A child never sees an address form or a payment.
  Rewards are tied to milestones, never to random draws.
- **Reminders.** An opt-in daily reminder that the parent switches on (web push,
  later native).
- **Weekly report.** An optional email to the parent each week.

## Phase 3: App Store and Google Play

- **Wrap the web app.** Use a Capacitor shell, kept in its own folder (`apps/academy-mobile`),
  that loads the bundled app and works offline. The course is plain data, so
  it ships inside the app.
- **Google Play first.** Its review is quicker. Join the Designed for Families
  programme: a privacy policy, a "target audience and content" form, and
  only Families-approved SDKs. Analytics stays off, and Privy is never loaded
  in the children's app.
- **Then the App Store.** List it in the Kids category, age bands 6–8 and 9–11.
  This means no third-party analytics or ads, a parental gate before any
  link out (already built), and a privacy nutrition label of "Data Not
  Collected" for phase 1.
- **The legal basis.** Comply with Georgia's Law on Personal Data Protection, and also with
  GDPR-K and COPPA, which the stores enforce. Phase 1 collects nothing.
  Phase 2 collects the parent's email only, with the parent's consent.
- **What we need from you.** An Apple Developer account ($99 a year), a Google Play
  Console account ($25 once), a support email, and a privacy-policy page.

## Phase 4: more to learn

- **New units.** Add Mars, the Solar System, Stars and constellations, and Rockets and
  astronauts. Each unit opens matching game content.
- **Real-sky challenges.** "Find the Moon tonight" and "spot Jupiter", checked
  against the existing sky data. Photos are never required.
- **A Moon diary.** Draw the Moon's phase each night for a week.
- **Voice narration.** For ages 6–9, every prompt read aloud in Georgian.
- **Classroom mode.** One screen for the whole class, with the teacher leading.

## Decisions for you and Astroman

1. Which prizes, and how many each month? A first idea: a sticker pack for the
   Moon world, a star map for three worlds, and a telescope draw for schools
   only, run by teachers.
2. Should prize claims need a parent account, or should a teacher be able to
   claim for a whole class?
3. Do we partner with schools, or with the Ministry of Education, for the
   class-code pilot?
4. The domain: `academy.stellarr.club` (already handled in the middleware),
   or a separate brand?
5. The Georgian review: who is the native-speaking teacher who signs off the
   lesson text?

## Known gaps

- The card pictures reuse the Moon and Earth photos and game screenshots
  already in the repo. Before release, they should be swapped for NASA
  public-domain photos (Apollo 11, Earthrise, the phases).
- Decimals use a point (1.3), as the rest of the site does. Standard Georgian
  uses a comma. That should be decided for the whole platform.
- Progress lives on one device until phase 2.
