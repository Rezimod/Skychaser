import { redirect } from 'next/navigation';

/** Booking opens with first light. Until then the observatory page says so. */
export default function BookPage() {
  redirect('/node');
}
