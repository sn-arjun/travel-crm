import { Breadcrumb } from '@/components/layout/breadcrumb';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Globe } from 'lucide-react';

// WordPress site provisioning has no backend endpoint yet (it ships in Tier 3, R309). Shown honestly as coming soon.
export default function WordPressPage() {
  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: 'WordPress' }]} />
      <h1 className="text-3xl font-bold tracking-tight">WordPress Sites</h1>
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Globe className="h-4 w-4" /> Coming soon
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Website provisioning for agencies is not available yet. It will appear here when the backend supports it.
        </CardContent>
      </Card>
    </div>
  );
}
