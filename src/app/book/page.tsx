import type { Metadata } from 'next';
import BookingConsole from '@/components/skychaser/booking/BookingConsole';
import SkychaserShell from '@/components/skychaser/SkychaserShell';
import { getDb } from '@/lib/db';
import { getNode } from '@/lib/observatory/nodes';
import { bookingBoard } from '@/lib/skychaser/booking';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Book the telescope',
  description: 'Half an hour or an hour on Live Telescope V1, from November. Pick a night, a start and a target; pay in credits.',
};

/** The booking board: the sky is computed here, the taken half-hours read from the database, the rest happens in the console. */
export default async function BookPage() {
  const node = getNode('tbilisi-01')!;
  let board;
  try {
    board = await bookingBoard(getDb(), node);
  } catch (err) {
    console.error('[skychaser] cannot read the booking board', err);
    board = await bookingBoard(null, node);
  }
  return (
    <SkychaserShell>
      <BookingConsole board={board} />
    </SkychaserShell>
  );
}
