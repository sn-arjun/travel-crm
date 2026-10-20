import type { Metadata } from 'next';
import Script from 'next/script';
import { DM_Sans, Geist, Geist_Mono } from 'next/font/google';
import { ThemeProvider } from 'next-themes';
import { Toaster } from 'sonner';
import { I18nProvider } from '@/components/providers/i18n-provider';
import { UpdateToast } from '@/components/electron/update-toast';
import { isWebTarget } from '@/lib/web-config';
import { bootLanguageScript } from '@/lib/i18n-boot';
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

const LANG_BOOT_SCRIPT = bootLanguageScript();

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
      <head>
        {/* Sets lang/dir from the saved language before the first paint, so Arabic does not flash left-to-right. */}
        <script dangerouslySetInnerHTML={{ __html: LANG_BOOT_SCRIPT }} />
      </head>
      <body className="min-h-screen antialiased">
        {/* The website has no Electron preload: the API address comes from the Worker's variables (runtime-config.js/route.ts). */}
        {isWebTarget && <Script src="/runtime-config.js" strategy="beforeInteractive" />}
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <I18nProvider>{children}</I18nProvider>
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
