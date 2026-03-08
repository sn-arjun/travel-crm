'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface AdminData {
  password: string;
  confirmPassword: string;
}

interface Props {
  data: AdminData;
  onNext: (data: AdminData) => void;
  onBack: () => void;
}

export function AdminUserStep({ data, onNext, onBack }: Props) {
  const [form, setForm] = useState<AdminData>({
    password: data.password || '',
    confirmPassword: data.confirmPassword || '',
  });
  const [errors, setErrors] = useState<Partial<Record<keyof AdminData, string>>>({});

  const validate = (): boolean => {
    const errs: Partial<Record<keyof AdminData, string>> = {};
    if (!form.password) errs.password = 'Password is required';
    else if (form.password.length < 8) errs.password = 'Must be at least 8 characters';
    else if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(form.password))
      errs.password = 'Must contain uppercase, lowercase, and number';
    if (form.password !== form.confirmPassword) errs.confirmPassword = 'Passwords do not match';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleNext = () => {
    if (validate()) onNext(form);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Admin User Setup</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 max-w-md">
        <p className="text-sm text-muted-foreground">
          Set the initial password for the tenant admin. They can change it after first login.
        </p>
        <div className="space-y-1">
          <label className="text-sm font-medium">Password</label>
          <Input
            type="password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            placeholder="Min 8 characters"
          />
          {errors.password && <p className="text-xs text-destructive">{errors.password}</p>}
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium">Confirm Password</label>
          <Input
            type="password"
            value={form.confirmPassword}
            onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
            placeholder="Re-enter password"
          />
          {errors.confirmPassword && <p className="text-xs text-destructive">{errors.confirmPassword}</p>}
        </div>
        <div className="flex justify-between pt-4">
          <Button variant="outline" onClick={onBack}>Back</Button>
          <Button onClick={handleNext}>Next: WordPress</Button>
        </div>
      </CardContent>
    </Card>
  );
}
