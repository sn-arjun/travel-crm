'use client';

import * as React from 'react';
import { Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
import {
  Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Label, Separator, Switch, Textarea,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui';
import { useT } from '@/lib/i18n';
import {
  CAPTURE_MODES, chatbotApi,
  type CaptureFieldState, type CaptureMode, type ContactCaptureSettings,
} from '@/lib/api/chatbot';

const FIELDS = ['name', 'email', 'phone'] as const;
const STATES: CaptureFieldState[] = ['required', 'optional', 'hidden'];

/**
 * Settings > Chatbot > Contact details: when the website chat asks the visitor for name, email or phone, which of those
 * are required, and what consent wording sits next to the tick box. "Never" keeps the chat exactly as it was.
 */
export function ContactCaptureCard({ initial, onSaved }: { initial: ContactCaptureSettings; onSaved?: () => void }) {
  const t = useT();
  const [value, setValue] = React.useState<ContactCaptureSettings>(initial);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => setValue(initial), [initial]);

  const asking = value.mode !== 'off';
  const oneOfPossible = value.fields.email !== 'hidden' || value.fields.phone !== 'hidden';
  const needOne = value.requireOneOf.length > 0;

  function setField(name: (typeof FIELDS)[number], state: CaptureFieldState) {
    setValue((v) => ({ ...v, fields: { ...v.fields, [name]: state } }));
  }

  function setNeedOne(on: boolean) {
    setValue((v) => ({ ...v, requireOneOf: on ? ['email', 'phone'] : [] }));
  }

  async function save() {
    setSaving(true);
    try {
      await chatbotApi.contactCapture.save({
        ...value,
        // Only fields the visitor can see can be asked for.
        requireOneOf: value.requireOneOf.filter((f) => value.fields[f] !== 'hidden'),
      });
      toast.success(t('chatbot.capture.saved'));
      onSaved?.();
    } catch {
      toast.error(t('chatbot.capture.saveFailed'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('chatbot.capture.title')}</CardTitle>
        <CardDescription>{t('chatbot.capture.description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-ds-6">
        <div className="space-y-ds-2">
          <Label htmlFor="capture-mode" className="text-base font-medium">{t('chatbot.capture.mode')}</Label>
          <Select value={value.mode} onValueChange={(m) => setValue((v) => ({ ...v, mode: m as CaptureMode }))}>
            <SelectTrigger id="capture-mode"><SelectValue /></SelectTrigger>
            <SelectContent>
              {CAPTURE_MODES.map((m) => (
                <SelectItem key={m} value={m}>{t(`chatbot.capture.mode.${m}`)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!asking && <p className="text-xs text-ds-foreground-muted">{t('chatbot.capture.offHint')}</p>}
        </div>

        {asking && (
          <>
            <Separator />

            <div className="space-y-ds-3">
              <p className="text-base font-medium">{t('chatbot.capture.fields')}</p>
              {FIELDS.map((name) => (
                <div key={name} className="flex items-center justify-between gap-ds-4">
                  <Label htmlFor={`capture-field-${name}`}>{t(`chatbot.capture.field.${name}`)}</Label>
                  <Select value={value.fields[name]} onValueChange={(s) => setField(name, s as CaptureFieldState)}>
                    <SelectTrigger id={`capture-field-${name}`} className="w-40"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {STATES.map((s) => (
                        <SelectItem key={s} value={s}>{t(`chatbot.capture.state.${s}`)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
              <div className="flex items-center justify-between gap-ds-4">
                <div>
                  <Label htmlFor="capture-one-of">{t('chatbot.capture.requireOneOf')}</Label>
                  <p className="mt-ds-1 text-xs text-ds-foreground-muted">
                    {oneOfPossible ? t('chatbot.capture.requireOneOfHint') : t('chatbot.capture.requireOneOfBlocked')}
                  </p>
                </div>
                <Switch id="capture-one-of" checked={needOne && oneOfPossible} disabled={!oneOfPossible} onCheckedChange={setNeedOne} />
              </div>
            </div>

            <Separator />

            <div className="space-y-ds-2">
              <Label htmlFor="capture-consent" className="text-base font-medium">{t('chatbot.capture.consentText')}</Label>
              <Textarea
                id="capture-consent"
                value={value.consentText}
                maxLength={600}
                onChange={(e) => setValue((v) => ({ ...v, consentText: e.currentTarget.value }))}
                placeholder={t('chatbot.capture.consentPlaceholder')}
                className="min-h-20"
              />
              <p className="text-xs text-ds-foreground-muted">{t('chatbot.capture.consentHint')}</p>
            </div>

            <div className="flex items-center justify-between gap-ds-4">
              <div>
                <Label htmlFor="capture-marketing">{t('chatbot.capture.marketingOptIn')}</Label>
                <p className="mt-ds-1 text-xs text-ds-foreground-muted">{t('chatbot.capture.marketingHint')}</p>
              </div>
              <Switch id="capture-marketing" checked={value.marketingOptIn} onCheckedChange={(on) => setValue((v) => ({ ...v, marketingOptIn: on }))} />
            </div>

            <div className="flex items-center justify-between gap-ds-4">
              <div>
                <Label htmlFor="capture-auto-lead">{t('chatbot.capture.autoCreateLead')}</Label>
                <p className="mt-ds-1 text-xs text-ds-foreground-muted">{t('chatbot.capture.autoCreateLeadHint')}</p>
              </div>
              <Switch id="capture-auto-lead" checked={value.autoCreateLead} onCheckedChange={(on) => setValue((v) => ({ ...v, autoCreateLead: on }))} />
            </div>
          </>
        )}

        <div className="flex justify-end">
          <Button onClick={save} disabled={saving} className="gap-ds-2">
            {saving ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Save className="size-4" aria-hidden="true" />}
            {t('chatbot.capture.save')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
