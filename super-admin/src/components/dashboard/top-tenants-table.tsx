'use client';

import { Badge } from '@/components/ui/badge';
import { Building2 } from 'lucide-react';

interface TopTenant {
  id: string;
  company_name: string;
  plan: string;
  status: string;
  user_count: number;
}

interface TopTenantsTableProps {
  tenants: TopTenant[];
}

const statusVariant: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  active: 'default',
  trial: 'secondary',
  suspended: 'destructive',
  expired: 'destructive',
};

export function TopTenantsTable({ tenants }: TopTenantsTableProps) {
  if (tenants.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
        <Building2 className="h-8 w-8 mb-2" />
        <p className="text-sm">No tenants yet</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-muted-foreground">
            <th className="text-left py-2 font-medium">Company</th>
            <th className="text-left py-2 font-medium">Plan</th>
            <th className="text-left py-2 font-medium">Status</th>
            <th className="text-right py-2 font-medium">Users</th>
          </tr>
        </thead>
        <tbody>
          {tenants.map((tenant) => (
            <tr key={tenant.id} className="border-b last:border-0">
              <td className="py-2 font-medium">{tenant.company_name}</td>
              <td className="py-2 capitalize">{tenant.plan}</td>
              <td className="py-2">
                <Badge variant={statusVariant[tenant.status] || 'outline'}>
                  {tenant.status}
                </Badge>
              </td>
              <td className="py-2 text-right">{tenant.user_count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
