# Stellar Explore and Stellar Academy

The space game and the children's learning app, in their own repository
and their own Vercel project, apart from the Stellar website and Skychaser.

| Path | What |
|---|---|
| `/` | The install page: about the game, add to home screen on iPhone, Android and desktop |
| `/play` | Stellar Explore, the game: orbit, atmospheric entry and landing on the Moon, Mars and Earth |
| `/academy` | Stellar Academy: short space lessons for children, in Georgian and English |

On an `academy.` domain (for example `academy.stellarr.club`), `/` opens
the Academy instead of the install page.

## How it connects to Stellar

This app has no server code and no database. Every `/api/*` request is
forwarded to the Stellar platform (`STELLAR_API_ORIGIN`, by default
`https://stellarsky.vercel.app`). That covers Stars credits for missions,
shared bases and the sky forecast. Sign-in uses the same Privy app as the
website, so a player's Stars land in the same account.

## Run it

```bash
npm install
cp .env.example .env.local   # fill in the values
npm run dev                  # http://localhost:3000
npm test                     # unit tests
npm run typecheck
npm run build
```

Browser walkthroughs (Playwright, with a server running):

```bash
npm run qa:academy -- http://localhost:3000 ./qa-out
npm run qa:flight  -- --url http://localhost:3000
```

## Deploy on Vercel

1. In Vercel, choose **Add New → Project** and import this repository. The
   framework is detected as Next.js, so no settings need changing.
2. Add the variables from `.env.example`. Use the same values as the
   Stellar project.
3. Add domains under **Settings → Domains**, for example
   `explore.stellarr.club` for the game and `academy.stellarr.club` for the
   Academy.
4. In the Privy dashboard, add those domains to the app's allowed origins.

## Map of the code

- `src/game`: the game's state machine, saves, settings and controls
- `src/lib/solar-system`: the worlds, planets, flight, landing and surfaces
- `src/components/play`, `src/components/solar-system`: the game's screens
- `src/app/explore`: the install page
- `src/lib/academy`, `src/app/academy`: Stellar Academy (see `docs/academy-plan.md`)
- `docs/explore-architecture.md`: how the game is put together
