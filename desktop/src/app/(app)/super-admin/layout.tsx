'use client';

import { ReactNode, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldAlert } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { EmptyState } from '@/components/ui/empty-state';
import { client } from '@/lib/api/client';
import { API_ENDPOINTS } from '@/lib/api/config';

type Access = 'checking' | 'granted' | 'denied';

export default function SuperAdminLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { user, isAuthenticated } = useAuthStore();
  const role = user?.role;
  const [access, setAccess] = useState<Access>('checking');

  useEffect(() => {
    if (!isAuthenticated) {
      router.replace('/login');
      return;
    }
    if (role !== 'admin') {
      router.replace('/');
    }
  }, [isAuthenticated, role, router]);

  // A tenant `role: admin` is not a platform super admin: the backend checks the
  // super_admins registry. Probe once so everyone else gets an explanation, not
  // a page full of 403 errors.
  useEffect(() => {
    if (!isAuthenticated || role !== 'admin') return;
    let cancelled = false;
    client
      .get(API_ENDPOINTS.admin.globalConfig)
      .then(() => !cancelled && setAccess('granted'))
      .catch((err: { status?: number }) => {
        if (cancelled) return;
        // Only an authorisation refusal means "denied"; other failures let the pages render their own errors.
        setAccess(err?.status === 403 ? 'denied' : 'granted');
      });
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, role]);

  if (!isAuthenticated || role !== 'admin') {
    return null;
  }

  if (access === 'checking') {
    return <div className="min-h-screen bg-gray-50" aria-busy="true" />;
  }

  if (access === 'denied') {
    return (
      <div className="min-h-screen bg-gray-50 p-ds-6" data-testid="super-admin-no-access">
        <EmptyState
          icon={<ShieldAlert className="size-6" aria-hidden="true" />}
          title="Platform administration access required"
          description="Your account is a tenant administrator, not a platform super admin. Platform-wide tenant, billing and system data is only available to super admin accounts."
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {children}
    </div>
  );
}
