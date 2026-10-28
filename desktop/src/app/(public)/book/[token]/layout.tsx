import type { Metadata } from 'next';
import * as React from 'react';

// A booking page is for the people who were sent its link: never indexed, and the link (which is the credential) is not passed on
// in a Referer header to anything the page loads.
export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
  referrer: 'no-referrer',
};

export default function BookingLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
