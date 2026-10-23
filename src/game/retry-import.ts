/** A chunk that failed to come down (a flaky phone network, a deploy since
 *  the page loaded) is asked for again, twice, before the failure stands:
 *  webpack forgets a failed chunk, so a second import() fetches it anew. */
export function retryImport<T>(load: () => Promise<T>, tries = 3, waitMs = 800): Promise<T> {
  return load().catch((e: unknown) => {
    if (tries <= 1) throw e;
    return new Promise<T>((resolve, reject) => {
      setTimeout(() => { retryImport(load, tries - 1, waitMs * 2).then(resolve, reject); }, waitMs);
    });
  });
}
