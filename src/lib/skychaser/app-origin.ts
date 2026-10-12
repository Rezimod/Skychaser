/**
 * Where the app lives, as the landing page links to it. The marketing site is
 * skychaser.io; the app is app.skychaser.io, the way ripcars.io opens
 * app.ripcars.io — a separate origin keeps the landing page static and
 * crawlable and the app's sign-in, wallets and cookies on their own host.
 * The app host joins Privy's allowed origins and Helius's allowed domains
 * before Launch points at it; until then Launch opens the set on this host.
 */
export const APP_HOST = 'app.skychaser.io';
export const APP_URL = '/genesis';
