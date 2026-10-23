import SkychaserShell from './SkychaserShell';

/** What a page built on request shows the moment it is opened: the frame at once, quiet blocks where its content will stand. */
export default function SkychaserPageSkeleton() {
  return (
    <SkychaserShell>
      <div className="sd-container sd-skel" aria-busy="true" aria-label="Loading">
        <div className="sd-skel__block sd-skel__kicker" />
        <div className="sd-skel__block sd-skel__title" />
        <div className="sd-skel__block sd-skel__line" />
        <div className="sd-skel__block sd-skel__line sd-skel__line--short" />
        <div className="sd-skel__grid">
          <div className="sd-skel__block sd-skel__card" />
          <div className="sd-skel__block sd-skel__card" />
          <div className="sd-skel__block sd-skel__card" />
        </div>
      </div>
    </SkychaserShell>
  );
}
