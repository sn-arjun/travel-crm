'use client';

import * as React from 'react';

/**
 * API base URL for rendering (e.g. a URL shown to the user). Starts with the build-time value so
 * server and client markup match, then switches to the runtime value after mount.
 */
export function useApiBaseUrl(): string {
  const [url, setUrl] = React.useState(() => process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8787/api/v1');
  React.useEffect(() => {
    void import('./config').then((m) => setUrl(m.getApiBaseUrl()));
  }, []);
  return url;
}
