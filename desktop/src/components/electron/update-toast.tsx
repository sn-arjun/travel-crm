'use client';

import * as React from 'react';
import { toast } from 'sonner';

/** Shows "Restart to update" when the desktop app has finished downloading an update. No-op on the web. */
export function UpdateToast() {
  React.useEffect(() => {
    const api = window.electronAPI;
    if (!api?.onUpdateReady) return;
    return api.onUpdateReady((version) => {
      toast('Update ready', {
        id: 'app-update',
        description: version ? `Version ${version} has been downloaded.` : 'A new version has been downloaded.',
        duration: Infinity,
        action: { label: 'Restart to update', onClick: () => void api.installUpdate() },
      });
    });
  }, []);
  return null;
}
