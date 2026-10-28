import Link from 'next/link';
import { readWebConfig } from '@/lib/web-config';

// The links come from the Worker's variables (desktop/wrangler.toml), so this page is rendered per request.
export const dynamic = 'force-dynamic';

export const metadata = { title: 'Download TravelCRM Pro' };

function Card({
  title,
  body,
  href,
  label,
  testId,
}: {
  title: string;
  body: string;
  href: string | null;
  label: string;
  testId: string;
}) {
  return (
    <section className="rounded-xl border bg-card p-5" data-testid={testId}>
      <h2 className="font-semibold">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{body}</p>
      {href ? (
        <a
          href={href}
          className="mt-4 inline-flex h-10 items-center rounded-md bg-ds-primary px-4 text-sm font-medium text-ds-primary-foreground hover:opacity-90"
        >
          {label}
        </a>
      ) : (
        <p className="mt-4 text-sm font-medium text-muted-foreground" data-testid={`${testId}-pending`}>
          This download has not been published yet. Ask your administrator, or use TravelCRM Pro in your browser meanwhile.
        </p>
      )}
    </section>
  );
}

/** The page behind the welcome email's download link: <APP_URL>/download. */
export default function DownloadPage() {
  const cfg = readWebConfig();
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
          Get TravelCRM Pro
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Use it in your browser, install the Windows app on your office computers, and give your drivers the Android app.
        </p>
      </header>

      <Card
        testId="download-web"
        title="In your browser"
        body="Nothing to install. Sign in with the email and password your administrator gave you."
        href="/login"
        label="Open TravelCRM Pro"
      />
      <Card
        testId="download-windows"
        title="Windows app"
        body="The desktop app keeps itself up to date. Run the installer and sign in. If Windows shows a warning, choose More info, then Run anyway."
        href={cfg.installerUrl}
        label="Download for Windows"
      />
      <Card
        testId="download-driver"
        title="Driver app (Android)"
        body="For drivers: trips, trip status updates and location sharing."
        href={cfg.driverAppUrl}
        label="Get the driver app"
      />

      <p className="text-sm text-muted-foreground">
        New here? Read the <Link href="/quick-start" className="underline">quick-start guide</Link>.
      </p>
    </div>
  );
}
