/** The test hooks on `window` (__stellarGame, __stellarFlight, __stellarWorld…):
 *  always in development, and in a production build made with
 *  NEXT_PUBLIC_GAME_QA=1, so the responsiveness harness can measure the real
 *  thing. An ordinary production build leaves them out entirely. */
export const QA_HOOKS = process.env.NODE_ENV !== 'production' || process.env.NEXT_PUBLIC_GAME_QA === '1';
