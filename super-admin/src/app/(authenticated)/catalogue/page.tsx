'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Breadcrumb } from '@/components/layout/breadcrumb';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import {
  formatMoney,
  type CatalogueAddon,
  type CatalogueData,
  type CataloguePlan,
  type CataloguePrice,
  type CatalogueUnitCost,
} from '@/lib/catalogue';

const ALLOWANCE_KEYS = ['ai_credits', 'sms', 'whatsapp', 'whatsapp_marketing', 'otp', 'call_minutes', 'email', 'storage_gb', 'websites'] as const;
const ALLOWANCE_LABELS: Record<string, string> = {
  ai_credits: 'AI credits',
  sms: 'SMS',
  whatsapp: 'WhatsApp',
  whatsapp_marketing: 'WhatsApp marketing (step B)',
  otp: 'OTP',
  call_minutes: 'Call minutes',
  email: 'Email',
  storage_gb: 'Storage GB (info)',
  websites: 'Websites (info)',
};

/** Same rule as the backend (services/plans/pricing.ts): units x unit cost x (1 + margin), rounded up to the minor unit. */
function packPrice(units: number, unitCost: number, marginPct: number, currency: string): number {
  const digits = ['JPY', 'KRW', 'VND'].includes(currency.toUpperCase()) ? 0 : 2;
  const factor = 10 ** digits;
  return Math.ceil(Math.round(units * unitCost * (1 + marginPct / 100) * factor * 1e6) / 1e6) / factor;
}

async function send(path: string, method: 'PUT' | 'POST', body: unknown): Promise<string | null> {
  const res = await fetch(`/api/catalogue${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (res.ok) return null;
  return ((await res.json().catch(() => ({}))) as { error?: string }).error || `Request failed (${res.status})`;
}

export default function CataloguePage() {
  const [data, setData] = useState<CatalogueData | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    const res = await fetch('/api/catalogue');
    const json = (await res.json()) as CatalogueData & { error?: string };
    if (!res.ok) {
      setError(json.error || 'Could not load the catalogue');
      return;
    }
    setError('');
    setData(json);
  }, []);

  useEffect(() => { load(); }, [load]);

  const report = (err: string | null, ok: string) => {
    if (err) {
      setError(err);
      setNotice('');
    } else {
      setError('');
      setNotice(ok);
      load();
    }
  };

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: 'Plans & Pricing' }]} />
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Plans &amp; Pricing</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Every change is audited and takes effect on the next read. Prices are yearly. Top-up prices are computed from provider cost and margin.
        </p>
      </div>

      {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
      {notice && <div className="rounded-md bg-green-100 p-3 text-sm text-green-800 dark:bg-green-900/30 dark:text-green-300">{notice}</div>}

      {!data ? (
        <Skeleton className="h-64" />
      ) : (
        <Tabs defaultValue="plans">
          <TabsList>
            <TabsTrigger value="plans">Plans &amp; prices</TabsTrigger>
            <TabsTrigger value="allowances">Monthly allowances</TabsTrigger>
            <TabsTrigger value="costs">Provider costs &amp; margin</TabsTrigger>
            <TabsTrigger value="addons">Add-on products</TabsTrigger>
          </TabsList>

          <TabsContent value="plans" className="space-y-4">
            {data.plans.map((plan) => (
              <PlanCard key={plan.key} plan={plan} onDone={report} />
            ))}
          </TabsContent>

          <TabsContent value="allowances" className="space-y-4">
            {data.plans.map((plan) => (
              <AllowanceCard key={plan.key} plan={plan} onDone={report} />
            ))}
          </TabsContent>

          <TabsContent value="costs">
            <UnitCostTable unitCosts={data.unitCosts} addons={data.addons} onDone={report} />
          </TabsContent>

          <TabsContent value="addons">
            <AddonTable addons={data.addons} unitCosts={data.unitCosts} onDone={report} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

type Done = (err: string | null, ok: string) => void;

function PlanCard({ plan, onDone }: { plan: CataloguePlan; onDone: Done }) {
  const [name, setName] = useState(plan.name);
  const [description, setDescription] = useState(plan.description ?? '');
  const [trialDays, setTrialDays] = useState(String(plan.trialDays));
  const [isPublic, setIsPublic] = useState(plan.isPublic);
  const [isActive, setIsActive] = useState(plan.isActive);
  const [newPrice, setNewPrice] = useState({ market: '', currency: '', yearlyPrice: '', includedUsers: '' });

  const save = async () => {
    onDone(
      await send(`/plans/${plan.key}`, 'PUT', { name, description: description || null, trialDays: Number(trialDays), isPublic, isActive }),
      `Saved ${plan.key}`,
    );
  };

  const addPrice = async () => {
    onDone(
      await send('/prices', 'POST', {
        planKey: plan.key,
        market: newPrice.market,
        currency: newPrice.currency,
        yearlyPrice: Number(newPrice.yearlyPrice),
        includedUsers: Number(newPrice.includedUsers),
      }),
      `Added a ${newPrice.market.toUpperCase()} price for ${plan.key}`,
    );
    setNewPrice({ market: '', currency: '', yearlyPrice: '', includedUsers: '' });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          {plan.name} <Badge variant="outline">{plan.key}</Badge>
          {!plan.isActive && <Badge variant="secondary">inactive</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Labeled label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} /></Labeled>
          <Labeled label="Trial days"><Input type="number" min={0} value={trialDays} onChange={(e) => setTrialDays(e.target.value)} /></Labeled>
          <Labeled label="Description"><Input value={description} onChange={(e) => setDescription(e.target.value)} /></Labeled>
          <div className="flex items-end gap-4 text-sm">
            <label className="flex items-center gap-2"><input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} /> Public</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} /> Active</label>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          {plan.features.length} features on this plan.{' '}
          <Link href="/features" className="underline">Switch features on or off on the Features page</Link>.
        </p>
        <Button size="sm" onClick={save}>Save plan</Button>

        <div>
          <h4 className="text-sm font-semibold mb-2">Yearly price per market</h4>
          <div className="space-y-2">
            {plan.prices.map((price) => (
              <PriceRow key={price.id} price={price} onDone={onDone} />
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <Labeled label="Market"><Input className="w-20" value={newPrice.market} onChange={(e) => setNewPrice({ ...newPrice, market: e.target.value.toUpperCase() })} placeholder="US" /></Labeled>
            <Labeled label="Currency"><Input className="w-20" maxLength={3} value={newPrice.currency} onChange={(e) => setNewPrice({ ...newPrice, currency: e.target.value.toUpperCase() })} placeholder="USD" /></Labeled>
            <Labeled label="Yearly price"><Input className="w-28" type="number" min={0} value={newPrice.yearlyPrice} onChange={(e) => setNewPrice({ ...newPrice, yearlyPrice: e.target.value })} /></Labeled>
            <Labeled label="Included users"><Input className="w-28" type="number" min={1} value={newPrice.includedUsers} onChange={(e) => setNewPrice({ ...newPrice, includedUsers: e.target.value })} /></Labeled>
            <Button
              size="sm"
              variant="outline"
              onClick={addPrice}
              disabled={newPrice.market.length < 2 || newPrice.currency.length !== 3 || newPrice.yearlyPrice === '' || !(Number(newPrice.includedUsers) >= 1)}
            >
              Add market price
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function PriceRow({ price, onDone }: { price: CataloguePrice; onDone: Done }) {
  const [yearly, setYearly] = useState(String(price.yearlyPrice));
  const [users, setUsers] = useState(String(price.includedUsers));
  const [extra, setExtra] = useState(price.extraUserYearlyPrice == null ? '' : String(price.extraUserYearlyPrice));
  const [active, setActive] = useState(price.isActive);

  const save = async () =>
    onDone(
      await send(`/prices/${price.id}`, 'PUT', {
        yearlyPrice: Number(yearly),
        includedUsers: Number(users),
        extraUserYearlyPrice: extra === '' ? null : Number(extra),
        isActive: active,
      }),
      `Saved the ${price.market} price`,
    );

  return (
    <div className="flex flex-wrap items-end gap-2 rounded-md border p-2">
      <Badge variant="outline">{price.market} / {price.currency}</Badge>
      <Badge variant={price.priceKind === 'founder' ? 'default' : 'secondary'} title={`Applies from ${price.validFrom}`}>
        {price.priceKind === 'founder' ? 'Founder' : 'List'} from {price.validFrom.slice(0, 10)}
      </Badge>
      <Labeled label="Yearly price"><Input className="w-28" type="number" min={0} value={yearly} onChange={(e) => setYearly(e.target.value)} /></Labeled>
      <Labeled label="Included users"><Input className="w-24" type="number" min={1} value={users} onChange={(e) => setUsers(e.target.value)} /></Labeled>
      <Labeled label="Extra user / year"><Input className="w-28" type="number" min={0} value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="none" /></Labeled>
      <label className="flex items-center gap-2 text-sm pb-2"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Active</label>
      <Button size="sm" variant="outline" onClick={save}>Save</Button>
      <span className="text-xs text-muted-foreground pb-2">{formatMoney(Number(yearly) || 0, price.currency)} / year</span>
    </div>
  );
}

function AllowanceCard({ plan, onDone }: { plan: CataloguePlan; onDone: Done }) {
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(ALLOWANCE_KEYS.map((k) => [k, String(plan.allowances[k] ?? 0)])),
  );

  const save = async () =>
    onDone(
      await send(`/allowances/${plan.key}`, 'PUT', Object.fromEntries(ALLOWANCE_KEYS.map((k) => [k, Number(values[k]) || 0]))),
      `Saved the ${plan.key} allowances`,
    );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{plan.name}</CardTitle>
        <CardDescription>Included each month: AI credits, then communication caps per channel.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {ALLOWANCE_KEYS.map((k) => (
            <Labeled key={k} label={ALLOWANCE_LABELS[k]}>
              <Input type="number" min={0} value={values[k]} onChange={(e) => setValues({ ...values, [k]: e.target.value })} />
            </Labeled>
          ))}
        </div>
        <Button size="sm" onClick={save}>Save allowances</Button>
      </CardContent>
    </Card>
  );
}

function UnitCostTable({ unitCosts, addons, onDone }: { unitCosts: CatalogueUnitCost[]; addons: CatalogueAddon[]; onDone: Done }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Provider unit costs and margin</CardTitle>
        <CardDescription>The default margin is 20%. Top-up pack prices below each row update as you type.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {unitCosts.map((u) => (
          <UnitCostRow key={u.id} unitCost={u} packs={addons.filter((a) => a.kind === 'comm_pack' && a.channel === u.channel && a.market === u.market)} onDone={onDone} />
        ))}
        {unitCosts.length === 0 && <p className="text-sm text-muted-foreground">No provider costs yet.</p>}
      </CardContent>
    </Card>
  );
}

function UnitCostRow({ unitCost, packs, onDone }: { unitCost: CatalogueUnitCost; packs: CatalogueAddon[]; onDone: Done }) {
  const [cost, setCost] = useState(String(unitCost.unitCost));
  const [margin, setMargin] = useState(String(unitCost.marginPct));
  const [provider, setProvider] = useState(unitCost.provider);
  const [active, setActive] = useState(unitCost.isActive);

  const save = async () =>
    onDone(
      await send(`/unit-costs/${unitCost.id}`, 'PUT', { unitCost: Number(cost), marginPct: Number(margin), provider, isActive: active }),
      `Saved the ${unitCost.channel} cost`,
    );

  return (
    <div className="rounded-md border p-3 space-y-2">
      <div className="flex flex-wrap items-end gap-2">
        <Badge variant="outline">{unitCost.channel} / {unitCost.market}</Badge>
        <Labeled label="Provider"><Input className="w-32" value={provider} onChange={(e) => setProvider(e.target.value)} /></Labeled>
        <Labeled label={`Unit cost (${unitCost.currency})`}><Input className="w-28" type="number" min={0} step="any" value={cost} onChange={(e) => setCost(e.target.value)} /></Labeled>
        <Labeled label="Margin %"><Input className="w-24" type="number" min={0} value={margin} onChange={(e) => setMargin(e.target.value)} /></Labeled>
        <label className="flex items-center gap-2 text-sm pb-2"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Active</label>
        <Button size="sm" variant="outline" onClick={save}>Save</Button>
      </div>
      {packs.length > 0 && (
        <ul className="text-sm text-muted-foreground">
          {packs.map((p) => (
            <li key={p.key}>
              {p.name} ({p.units.toLocaleString()} units):{' '}
              <span className="font-medium text-foreground">
                {p.fixedPrice != null
                  ? `${formatMoney(p.fixedPrice, p.currency)} (fixed price)`
                  : formatMoney(packPrice(p.units, Number(cost) || 0, Number(margin) || 0, unitCost.currency), unitCost.currency)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AddonTable({ addons, unitCosts, onDone }: { addons: CatalogueAddon[]; unitCosts: CatalogueUnitCost[]; onDone: Done }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Add-on products</CardTitle>
        <CardDescription>Extra users, AI credit packs and communication packs. Leave the fixed price empty to compute it from provider cost and margin.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {addons.map((a) => (
          <AddonRow key={a.key} addon={a} unitCost={unitCosts.find((u) => u.channel === a.channel && u.market === a.market && u.isActive)} onDone={onDone} />
        ))}
      </CardContent>
    </Card>
  );
}

function AddonRow({ addon, unitCost, onDone }: { addon: CatalogueAddon; unitCost?: CatalogueUnitCost; onDone: Done }) {
  const [name, setName] = useState(addon.name);
  const [units, setUnits] = useState(String(addon.units));
  const [fixed, setFixed] = useState(addon.fixedPrice == null ? '' : String(addon.fixedPrice));
  const [active, setActive] = useState(addon.isActive);

  const save = async () =>
    onDone(
      await send(`/addons/${addon.key}`, 'PUT', { name, units: Number(units), fixedPrice: fixed === '' ? null : Number(fixed), isActive: active }),
      `Saved ${addon.key}`,
    );

  const computed =
    fixed !== ''
      ? formatMoney(Number(fixed), addon.currency)
      : addon.kind === 'comm_pack' && unitCost
        ? formatMoney(packPrice(Number(units) || 0, unitCost.unitCost, unitCost.marginPct, unitCost.currency), unitCost.currency)
        : addon.price != null
          ? formatMoney(addon.price, addon.currency)
          : 'per plan';

  return (
    <div className="flex flex-wrap items-end gap-2 rounded-md border p-2">
      <Badge variant="outline">{addon.kind.replace(/_/g, ' ')}{addon.channel ? ` / ${addon.channel}` : ''}</Badge>
      <Labeled label="Name"><Input className="w-48" value={name} onChange={(e) => setName(e.target.value)} /></Labeled>
      <Labeled label="Units"><Input className="w-24" type="number" min={1} value={units} onChange={(e) => setUnits(e.target.value)} /></Labeled>
      <Labeled label="Fixed price"><Input className="w-28" type="number" min={0} value={fixed} onChange={(e) => setFixed(e.target.value)} placeholder="computed" /></Labeled>
      <label className="flex items-center gap-2 text-sm pb-2"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Active</label>
      <Button size="sm" variant="outline" onClick={save}>Save</Button>
      <span className="text-sm pb-2">Price: <span className="font-medium">{computed}</span></span>
    </div>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}
