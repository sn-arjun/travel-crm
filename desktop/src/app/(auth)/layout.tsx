import * as React from 'react';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      {/* Left: Brand Panel */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-ds-primary/90 via-ds-primary to-ds-primary/80 relative overflow-hidden">
        <div className="absolute inset-0 bg-grid-pattern opacity-40" />
        <div className="relative z-10 flex flex-col justify-between p-12 text-ds-primary-foreground">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-ds-primary-foreground/20 backdrop-blur-sm text-lg font-bold">
                T
              </div>
              <span className="text-2xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
                TravelCRM Pro
              </span>
            </div>
            <p className="text-ds-primary-foreground/85 text-sm mt-1">Travel Business Management Platform</p>
          </div>

          <div className="space-y-8">
            <div>
              <h1 className="text-4xl font-bold leading-tight tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
                Manage your travel<br />business smarter
              </h1>
              <p className="text-ds-primary-foreground/90 text-lg mt-4 max-w-md leading-relaxed">
                Leads, contacts, fleet, itineraries, invoicing — all in one place. Built for travel agencies that mean business.
              </p>
            </div>
            <div className="flex gap-8 text-sm">
              <div>
                <p className="text-3xl font-bold">500+</p>
                <p className="text-ds-primary-foreground/80">Travel agencies</p>
              </div>
              <div>
                <p className="text-3xl font-bold">1M+</p>
                <p className="text-ds-primary-foreground/80">Leads managed</p>
              </div>
              <div>
                <p className="text-3xl font-bold">50K+</p>
                <p className="text-ds-primary-foreground/80">Trips assigned</p>
              </div>
            </div>
          </div>

          <p className="text-ds-primary-foreground/70 text-xs">© 2026 TravelCRM Pro. All rights reserved.</p>
        </div>
      </div>

      {/* Right: Auth Form */}
      <div className="flex w-full lg:w-1/2 items-center justify-center p-6 bg-ds-background">
        <div className="w-full max-w-100">{children}</div>
      </div>
    </div>
  );
}
