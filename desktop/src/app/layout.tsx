import type { Metadata } from 'next';
import { DM_Sans, Geist, Geist_Mono } from 'next/font/google';
import { ThemeProvider } from 'next-themes';
import { Toaster } from 'sonner';
import { UpdateToast } from '@/components/electron/update-toast';
import { isWebTarget } from '@/lib/web-config';
import './globals.css';

const geist = Geist({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-display',
  weight: ['400', '500', '600', '700'],
  display: 'swap',
});

const geistMono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'TravelCRM Pro',
  description: 'Multi-tenant SaaS CRM for Tours & Travels companies',
  // The website is a private workspace; the shared-quote and help pages are not for search engines either.
  ...(isWebTarget ? { robots: { index: false, follow: false } } : {}),
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geist.variable} ${dmSans.variable} ${geistMono.variable}`}
    >
      {isWebTarget && (
        <head>
          {/* The website has no Electron preload: the API address comes from the Worker's variables (route.ts). */}
          <script src="/runtime-config.js" />
        </head>
      )}
      <body className="min-h-screen antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          {/* Auto-update is an Electron feature: not rendered on the website. */}
          {!isWebTarget && <UpdateToast />}
          <Toaster
            position="bottom-right"
            toastOptions={{
              duration: 4000,
              classNames: {
                toast: 'font-sans',
              },
            }}
          />
        </ThemeProvider>
      </body>
    </html>
  );
}
