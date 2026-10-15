import Link from 'next/link';

export const metadata = { title: 'Quick start - TravelCRM Pro' };

const steps: Array<{ title: string; body: string }> = [
  {
    title: 'Sign in with your temporary password',
    body: 'Open the sign-in page, enter your email, then the temporary password from your welcome email. You are asked to choose your own password straight away.',
  },
  {
    title: 'Finish the short setup',
    body: 'Check your company name, country, currency and time zone, and add your logo. You can change all of this later in Settings.',
  },
  {
    title: 'Add your team',
    body: 'In Settings, open Team and invite your colleagues. They receive an email with a link to set their own password.',
  },
  {
    title: 'Bring in your contacts and leads',
    body: 'Add contacts one by one, or import a spreadsheet from the Import page. Every enquiry becomes a lead you can follow up.',
  },
  {
    title: 'Build and send a quotation',
    body: 'Create an itinerary for a lead, add days, hotels, transport and activities, then share the link. Your customer opens it without signing in.',
  },
  {
    title: 'Invoice and get paid',
    body: 'Turn an accepted itinerary into an invoice, record payments as they arrive, and watch what is outstanding on the dashboard.',
  },
];

/** The page behind the welcome email's quick-start link: <APP_URL>/quick-start. */
export default function QuickStartPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
          Quick start
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">Six steps from a new account to your first quotation.</p>
      </header>

      <ol className="space-y-3" data-testid="quick-start-steps">
        {steps.map((s, i) => (
          <li key={s.title} className="flex gap-4 rounded-xl border bg-card p-4">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ds-primary text-sm font-semibold text-ds-primary-foreground">
              {i + 1}
            </span>
            <div>
              <h2 className="font-semibold">{s.title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{s.body}</p>
            </div>
          </li>
        ))}
      </ol>

      <p className="text-sm text-muted-foreground">
        <Link href="/login" className="underline">Sign in</Link>
        {' '}or <Link href="/download" className="underline">download the apps</Link>.
      </p>
    </div>
  );
}
