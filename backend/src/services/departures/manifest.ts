/**
 * The manifest of a departure (R146, design 9.4 and 10): the pickup list (stops in order, then who boards there), the rooming
 * list (room groups with names, gender, room type, sharing and meal) and the full manifest (every passenger field the agency
 * collects). One structure feeds the JSON answer, the CSV (UTF-8 with a byte order mark, so spreadsheet apps read accents) and
 * the PDF (agency name and colour, texts in the agency language, dates in the agency locale).
 *
 * Document numbers and expiry dates are only in the full view and only for roles that may export travellers.
 */

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { agencyDefaultLanguage, t, type TextLanguage } from '../../i18n';
import { loadLocaleContext } from '../../utils/money';
import { parseJson, toBool } from './common';
import { loadDepartureContext } from './seat-support';

type Row = Record<string, any>;

export type ManifestView = 'pickup' | 'rooming' | 'full';
export type ManifestFormat = 'json' | 'csv' | 'pdf';
export type ManifestCell = string | number | null;

export interface ManifestColumn { key: string; label: string }

export interface ManifestGroup {
  key: string;
  title: string;
  /** Local time of a pickup stop ("07:40", "08:10 +1d"). */
  time: string | null;
  documentsCheck: boolean;
  rows: Array<Record<string, ManifestCell>>;
}

export interface Manifest {
  view: ManifestView;
  title: string;
  language: TextLanguage;
  departure: { id: string; code: string; tourTitle: string; startDate: string; endDate: string; status: string };
  agencyName: string;
  brandColor: string | null;
  /** Label of the column that holds the group title in a CSV and of the heading in the PDF; null when the view has no groups. */
  groupLabel: string | null;
  columns: ManifestColumn[];
  groups: ManifestGroup[];
  totals: { passengers: number; seats: number };
  /** True when document numbers and expiry dates are part of the answer. */
  documentNumbersIncluded: boolean;
  dateLocale: string;
  timeZone: string;
}

export interface ManifestOptions {
  userId?: string | null;
  /** The signed-in role may export travellers: document numbers are included in the full view. */
  canSeeDocuments: boolean;
  /** `confirmed` leaves out parties whose seats are only held. */
  bookings?: 'all' | 'confirmed';
  language?: TextLanguage;
}

/** Built-in passenger field keys the manifest shows as columns of their own; the other agency fields follow as extra columns. */
const CORE_KEYS = new Set(['name', 'gender', 'dateOfBirth', 'pickupPoint', 'roomType', 'meal']);
/** Fields that identify a travel document: left out of every export for roles without the travellers export permission. */
const DOCUMENT_NUMBER_KEYS = new Set(['documentNumber', 'documentExpiry', 'documentExpiry2']);

const fullName = (r: Row): string => `${r.first_name ?? ''} ${r.last_name ?? ''}`.trim();

export const naturalCompare = (a: string, b: string): number => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });

function timeLabel(stop: Row): string | null {
  if (!stop.local_time) return null;
  return stop.day_offset > 0 ? `${stop.local_time} +${stop.day_offset}d` : stop.local_time;
}

async function agencyIdentity(db: D1Database): Promise<{ name: string; color: string | null }> {
  let name = '';
  let color: string | null = null;
  try {
    const branding = await db.prepare('SELECT agency_name, primary_color FROM tenant_branding LIMIT 1').first<{ agency_name: string | null; primary_color: string | null }>();
    name = branding?.agency_name?.trim() ?? '';
    color = branding?.primary_color && /^#[0-9a-fA-F]{6}$/.test(branding.primary_color) ? branding.primary_color : null;
  } catch {
    // no branding table row: the settings name below
  }
  if (!name) {
    const row = await db.prepare(`SELECT value FROM settings WHERE key = 'company_name'`).first<{ value: string | null }>();
    const parsed = parseJson<unknown>(row?.value, row?.value ?? '');
    name = typeof parsed === 'string' ? parsed.trim() : '';
  }
  return { name, color };
}

/** The passengers of the departure that are on the list: active passengers of held and confirmed bookings. */
async function loadPassengers(db: D1Database, departureId: string, bookings: 'all' | 'confirmed'): Promise<Row[]> {
  const statuses = bookings === 'confirmed' ? `('confirmed')` : `('held', 'confirmed')`;
  const { results } = await db
    .prepare(
      `SELECT sp.*, sb.seats AS booking_seats, sb.status AS booking_status, sb.room_notes AS booking_room_notes,
              c.name AS contact_name, c.phone AS contact_phone, c.email AS contact_email,
              tr.phone AS traveller_phone, tr.email AS traveller_email, tr.passport_number AS traveller_passport_number,
              tr.passport_expiry_date AS traveller_passport_expiry, tr.nationality AS traveller_nationality
       FROM seat_passengers sp
       JOIN seat_bookings sb ON sb.id = sp.seat_booking_id
       LEFT JOIN contacts c ON c.id = sb.contact_id
       LEFT JOIN travellers tr ON tr.id = sp.traveller_id
       WHERE sp.departure_id = ? AND sp.status = 'active' AND sb.status IN ${statuses}
       ORDER BY sb.created_at, sp.created_at, sp.id`,
    )
    .bind(departureId)
    .all<Row>();
  return results ?? [];
}

export async function buildManifest(db: D1Database, departureId: string, view: ManifestView, opts: ManifestOptions): Promise<Manifest> {
  const dep = await loadDepartureContext(db, departureId);
  const language = opts.language ?? (await agencyDefaultLanguage(db));
  const L = (key: string, vars?: Record<string, string | number>) => t(language, key, vars);
  const [passengers, { results: stopRows }, identity, locale] = await Promise.all([
    loadPassengers(db, departureId, opts.bookings ?? 'all'),
    db.prepare('SELECT * FROM departure_stops WHERE departure_id = ? ORDER BY sort_order, id').bind(departureId).all<Row>(),
    agencyIdentity(db),
    loadLocaleContext(db, opts.userId),
  ]);
  const stops = stopRows ?? [];
  const roomLabels = new Map(dep.effective.roomTypes.map((r) => [r.key, r.label]));
  const docsLabel = (s: string | null): string => L(`manifest.docs.${s ?? 'unknown'}`);
  const genderLabel = (g: string | null): string => (g ? L(`manifest.gender.${g}`) : '');
  const phoneOf = (r: Row): string => r.traveller_phone || r.contact_phone || '';
  const sharingOf = (r: Row): string => [toBool(r.share_ok) ? L('manifest.share.ok') : '', toBool(r.share_gender) ? L('manifest.share.sameGender') : ''].filter(Boolean).join(', ');
  const roomTypeOf = (r: Row): string => (r.room_type ? roomLabels.get(r.room_type) ?? r.room_type : '');
  const extras = (r: Row): Record<string, unknown> => parseJson<Record<string, unknown>>(r.extra_fields, {});

  let columns: ManifestColumn[];
  let groupLabel: string | null = null;
  const groups: ManifestGroup[] = [];

  if (view === 'pickup') {
    groupLabel = L('manifest.col.stop');
    columns = [
      { key: 'name', label: L('manifest.col.name') },
      { key: 'seats', label: L('manifest.col.seats') },
      { key: 'phone', label: L('manifest.col.phone') },
      { key: 'documents', label: L('manifest.col.documents') },
    ];
    const byStop = new Map<string, Row[]>();
    for (const p of passengers) {
      const key = p.pickup_stop_id && stops.some((s) => s.id === p.pickup_stop_id) ? p.pickup_stop_id : '';
      byStop.set(key, [...(byStop.get(key) ?? []), p]);
    }
    const rowFor = (p: Row) => ({ name: fullName(p), seats: p.booking_seats as number, phone: phoneOf(p), documents: docsLabel(p.documents_status) });
    for (const s of stops) {
      const here = byStop.get(s.id) ?? [];
      // Waypoints and drop-offs with nobody boarding are not part of a pickup list.
      if (here.length === 0 && s.kind !== 'pickup' && s.kind !== 'both') continue;
      groups.push({ key: s.id, title: s.name, time: timeLabel(s), documentsCheck: toBool(s.documents_check), rows: here.map(rowFor) });
    }
    const loose = byStop.get('') ?? [];
    if (loose.length) groups.push({ key: '', title: L('manifest.group.noStop'), time: null, documentsCheck: false, rows: loose.map(rowFor) });
  } else if (view === 'rooming') {
    groupLabel = L('manifest.col.room');
    columns = [
      { key: 'name', label: L('manifest.col.name') },
      { key: 'gender', label: L('manifest.col.gender') },
      { key: 'roomType', label: L('manifest.col.roomType') },
      { key: 'sharing', label: L('manifest.col.sharing') },
      { key: 'meal', label: L('manifest.col.meal') },
      { key: 'notes', label: L('manifest.col.notes') },
    ];
    const byRoom = new Map<string, Row[]>();
    for (const p of passengers) {
      const key = (p.room_group ?? '').trim();
      byRoom.set(key, [...(byRoom.get(key) ?? []), p]);
    }
    const rowFor = (p: Row) => ({
      name: fullName(p), gender: genderLabel(p.gender), roomType: roomTypeOf(p), sharing: sharingOf(p), meal: p.meal_preference ?? '', notes: p.booking_room_notes ?? '',
    });
    for (const key of [...byRoom.keys()].filter((k) => k !== '').sort(naturalCompare)) {
      groups.push({ key, title: key, time: null, documentsCheck: false, rows: byRoom.get(key)!.map(rowFor) });
    }
    const loose = byRoom.get('') ?? [];
    if (loose.length) {
      // Unassigned people are listed by room type, so staff see who still needs pairing.
      loose.sort((a, b) => naturalCompare(roomTypeOf(a), roomTypeOf(b)));
      groups.push({ key: '', title: L('manifest.group.noRoom'), time: null, documentsCheck: false, rows: loose.map(rowFor) });
    }
  } else {
    const agencyFields = dep.effective.passengerFields.filter((f) => !CORE_KEYS.has(f.key) && (opts.canSeeDocuments || !DOCUMENT_NUMBER_KEYS.has(f.key)));
    columns = [
      { key: 'name', label: L('manifest.col.name') },
      { key: 'contact', label: L('manifest.col.contact') },
      { key: 'bookingStatus', label: L('manifest.col.bookingStatus') },
      { key: 'seats', label: L('manifest.col.seats') },
      { key: 'phone', label: L('manifest.col.phone') },
      { key: 'email', label: L('manifest.col.email') },
      { key: 'gender', label: L('manifest.col.gender') },
      { key: 'dateOfBirth', label: L('manifest.col.birth') },
      { key: 'age', label: L('manifest.col.age') },
      { key: 'band', label: L('manifest.col.band') },
      { key: 'pickup', label: L('manifest.col.stop') },
      { key: 'roomType', label: L('manifest.col.roomType') },
      { key: 'roomGroup', label: L('manifest.col.room') },
      { key: 'sharing', label: L('manifest.col.sharing') },
      { key: 'seatNumber', label: L('manifest.col.seatNumber') },
      { key: 'meal', label: L('manifest.col.meal') },
      { key: 'documents', label: L('manifest.col.documents') },
      ...agencyFields.map((f) => ({ key: `field:${f.key}`, label: f.label })),
    ];
    const stopName = new Map(stops.map((s) => [s.id, s.name as string]));
    const today = dep.row.start_date as string;
    const rows = passengers.map((p) => {
      const fields = extras(p);
      const row: Record<string, ManifestCell> = {
        name: fullName(p),
        contact: p.contact_name ?? '',
        bookingStatus: L(`manifest.status.${p.booking_status}`),
        seats: p.booking_seats,
        phone: phoneOf(p),
        email: p.traveller_email || p.contact_email || '',
        gender: genderLabel(p.gender),
        dateOfBirth: p.date_of_birth ?? '',
        age: p.date_of_birth ? ageAt(p.date_of_birth, today) : p.age_years ?? '',
        band: p.band_key ?? '',
        pickup: p.pickup_stop_id ? stopName.get(p.pickup_stop_id) ?? '' : '',
        roomType: roomTypeOf(p),
        roomGroup: p.room_group ?? '',
        sharing: sharingOf(p),
        seatNumber: p.seat_number ?? '',
        meal: p.meal_preference ?? '',
        documents: docsLabel(p.documents_status),
      };
      for (const f of agencyFields) {
        let value: unknown = fields[f.key];
        // A document typed on the traveller's own record counts when the booking form did not collect it.
        if ((value === undefined || value === null || value === '') && opts.canSeeDocuments) {
          if (f.key === 'documentNumber') value = p.traveller_passport_number;
          else if (f.key === 'documentExpiry') value = p.traveller_passport_expiry;
        }
        if ((value === undefined || value === null || value === '') && f.key === 'nationality') value = p.traveller_nationality;
        row[`field:${f.key}`] = value === undefined || value === null ? '' : typeof value === 'boolean' ? (value ? '1' : '0') : (value as string | number);
      }
      return row;
    });
    groups.push({ key: 'all', title: '', time: null, documentsCheck: false, rows });
  }

  const seatTotals = new Set<string>();
  let seats = 0;
  for (const p of passengers) {
    if (!seatTotals.has(p.seat_booking_id)) {
      seatTotals.add(p.seat_booking_id);
      seats += p.booking_seats as number;
    }
  }

  return {
    view,
    title: L(`manifest.title.${view}`),
    language,
    departure: { id: dep.row.id, code: dep.row.code, tourTitle: dep.tour.title, startDate: dep.row.start_date, endDate: dep.row.end_date, status: dep.row.status },
    agencyName: identity.name,
    brandColor: identity.color,
    groupLabel,
    columns,
    groups,
    totals: { passengers: passengers.length, seats },
    documentNumbersIncluded: view === 'full' && opts.canSeeDocuments,
    dateLocale: language === 'nl' ? 'nl-NL' : locale.locale,
    timeZone: locale.timezone,
  };
}

function ageAt(dob: string, onDate: string): number {
  const [by, bm, bd] = dob.slice(0, 10).split('-').map(Number);
  const [y, m, d] = onDate.slice(0, 10).split('-').map(Number);
  return y - by - (m < bm || (m === bm && d < bd) ? 1 : 0);
}

// ---------------------------------------------------------------- CSV

/**
 * A cell as text. A value that a spreadsheet could read as a formula (starts with = + - @) gets a leading apostrophe, except
 * phone numbers and plain numbers, which have to stay as typed.
 */
export function csvCell(value: ManifestCell | undefined): string {
  let s = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(s) && !/^[+-]?[\d\s().-]+$/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function manifestCsv(m: Manifest): string {
  const lead = m.groupLabel ? [m.groupLabel, ...(m.view === 'pickup' ? [t(m.language, 'manifest.col.time')] : [])] : [];
  const header = [...lead, ...m.columns.map((c) => c.label)];
  const lines = [header.map(csvCell).join(',')];
  for (const g of m.groups) {
    for (const row of g.rows) {
      const first = m.groupLabel ? [g.title, ...(m.view === 'pickup' ? [g.time ?? ''] : [])] : [];
      lines.push([...first, ...m.columns.map((c) => row[c.key] ?? '')].map(csvCell).join(','));
    }
  }
  return `﻿${lines.join('\r\n')}\r\n`;
}

// ---------------------------------------------------------------- PDF

const PAGE_W = 842;
const PAGE_H = 595;
const MARGIN = 36;
const ROW_H = 15;

function hexColor(hex: string | null): ReturnType<typeof rgb> {
  if (!hex) return rgb(0.15, 0.25, 0.45);
  return rgb(parseInt(hex.slice(1, 3), 16) / 255, parseInt(hex.slice(3, 5), 16) / 255, parseInt(hex.slice(5, 7), 16) / 255);
}

/** The built-in PDF fonts draw Latin-1 only: anything else becomes a question mark instead of failing the whole file. */
export function pdfSafe(font: PDFFont, text: string): string {
  let out = '';
  for (const ch of text.replace(/[\r\n\t]+/g, ' ')) {
    try {
      font.encodeText(ch);
      out += ch;
    } catch {
      out += '?';
    }
  }
  return out;
}

function fit(font: PDFFont, size: number, text: string, width: number): string {
  const s = pdfSafe(font, text);
  if (font.widthOfTextAtSize(s, size) <= width) return s;
  let cut = s;
  while (cut.length > 1 && font.widthOfTextAtSize(`${cut}...`, size) > width) cut = cut.slice(0, -1);
  return `${cut}...`;
}

function formatDay(iso: string, locale: string, timeZone: string, font: PDFFont): string {
  const at = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  for (const loc of [locale, 'en-GB']) {
    try {
      const s = at.toLocaleDateString(loc, { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' });
      font.encodeText(s);
      return s;
    } catch {
      // that locale writes dates in a script the PDF font cannot draw: try the next
    }
  }
  return iso.slice(0, 10);
}

export async function manifestPdf(m: Manifest): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const brand = hexColor(m.brandColor);
  const L = (key: string, vars?: Record<string, string | number>) => t(m.language, key, vars);
  const usable = PAGE_W - MARGIN * 2;

  const labels = m.columns.map((c) => c.label);
  const sample = m.groups.flatMap((g) => g.rows).slice(0, 60);
  const raw = m.columns.map((c, i) => {
    const w = sample.reduce((max, r) => Math.max(max, font.widthOfTextAtSize(pdfSafe(font, String(r[c.key] ?? '')).slice(0, 40), 8)), bold.widthOfTextAtSize(pdfSafe(bold, labels[i]), 8));
    return Math.max(w + 10, 36);
  });
  const total = raw.reduce((a, b) => a + b, 0);
  const widths = raw.map((w) => (w / total) * usable);

  const pages: PDFPage[] = [];
  let page!: PDFPage;
  let y = 0;
  const newPage = (first: boolean): void => {
    page = pdf.addPage([PAGE_W, PAGE_H]);
    pages.push(page);
    y = PAGE_H - MARGIN;
    if (first) {
      if (m.agencyName) page.drawText(fit(bold, 9, m.agencyName, usable), { x: MARGIN, y, size: 9, font: bold, color: brand });
      y -= 18;
      page.drawText(fit(bold, 16, `${m.title} - ${m.departure.code}`, usable), { x: MARGIN, y, size: 16, font: bold, color: rgb(0.1, 0.1, 0.1) });
      y -= 15;
      const dates = `${formatDay(m.departure.startDate, m.dateLocale, m.timeZone, font)} - ${formatDay(m.departure.endDate, m.dateLocale, m.timeZone, font)}`;
      page.drawText(fit(font, 9, `${m.departure.tourTitle}  |  ${dates}  |  ${L('manifest.totals', { passengers: m.totals.passengers, seats: m.totals.seats })}`, usable), {
        x: MARGIN, y, size: 9, font, color: rgb(0.35, 0.35, 0.35),
      });
      y -= 20;
    }
  };
  const header = (): void => {
    page.drawRectangle({ x: MARGIN, y: y - ROW_H + 4, width: usable, height: ROW_H, color: brand });
    let x = MARGIN + 3;
    m.columns.forEach((c, i) => {
      page.drawText(fit(bold, 8, c.label, widths[i] - 6), { x, y: y - ROW_H + 8, size: 8, font: bold, color: rgb(1, 1, 1) });
      x += widths[i];
    });
    y -= ROW_H;
  };

  newPage(true);
  for (const g of m.groups) {
    if (g.title) {
      if (y - ROW_H * 3 < MARGIN + 20) newPage(false);
      const flag = g.documentsCheck ? `   [${L('manifest.group.documentsCheck')}]` : '';
      const label = `${g.time ? `${g.time}  ` : ''}${g.title}${flag}  (${g.rows.length})`;
      page.drawText(fit(bold, 10, label, usable), { x: MARGIN, y: y - 8, size: 10, font: bold, color: rgb(0.1, 0.1, 0.1) });
      y -= 16;
    }
    if (y - ROW_H * 2 < MARGIN + 20) newPage(false);
    header();
    g.rows.forEach((row, i) => {
      if (y - ROW_H < MARGIN + 20) {
        newPage(false);
        header();
      }
      if (i % 2 === 0) page.drawRectangle({ x: MARGIN, y: y - ROW_H + 4, width: usable, height: ROW_H, color: rgb(0.96, 0.96, 0.98) });
      let x = MARGIN + 3;
      m.columns.forEach((c, ci) => {
        page.drawText(fit(font, 8, String(row[c.key] ?? ''), widths[ci] - 6), { x, y: y - ROW_H + 8, size: 8, font, color: rgb(0.1, 0.1, 0.1) });
        x += widths[ci];
      });
      y -= ROW_H;
    });
    y -= 10;
  }

  const generated = L('manifest.footer.generated', { date: formatDay(new Date().toISOString(), m.dateLocale, m.timeZone, font) });
  pages.forEach((p, i) => {
    p.drawText(generated, { x: MARGIN, y: 20, size: 8, font, color: rgb(0.5, 0.5, 0.5) });
    const pageText = L('manifest.footer.page', { page: i + 1, total: pages.length });
    p.drawText(pageText, { x: PAGE_W - MARGIN - font.widthOfTextAtSize(pageText, 8), y: 20, size: 8, font, color: rgb(0.5, 0.5, 0.5) });
  });
  return pdf.save();
}

// ---------------------------------------------------------------- rooms

/** A suggested room: the passengers who would share and the label to save in room_group. */
export interface RoomSuggestion { room: string; passengers: Array<{ id: string; name: string }> }

interface RoomCandidate { id: string; name: string; bookingId: string; gender: string | null; roomType: string | null; shareOk: boolean; shareGender: boolean; roomGroup: string | null }

/**
 * Pairs the passengers who are willing to share into rooms of their room type's occupancy: same room type, people of one booking
 * together first, and the same gender whenever either of two asked for it. Passengers who already have a room, or did not say
 * they share, are left alone. Numbering continues after the highest numeric room already used. Pure: nothing is saved.
 */
export function suggestRoomGroups(passengers: RoomCandidate[], occupancy: Map<string, number>, existingRooms: string[] = []): RoomSuggestion[] {
  let next = existingRooms.reduce((max, r) => (/^\d+$/.test(r.trim()) ? Math.max(max, Number(r)) : max), 0) + 1;
  const open = passengers.filter((p) => !p.roomGroup && p.shareOk && p.roomType && (occupancy.get(p.roomType) ?? 1) > 1);
  const byType = new Map<string, RoomCandidate[]>();
  for (const p of open) byType.set(p.roomType!, [...(byType.get(p.roomType!) ?? []), p]);
  const out: RoomSuggestion[] = [];
  for (const [type, list] of [...byType.entries()].sort((a, b) => naturalCompare(a[0], b[0]))) {
    const size = occupancy.get(type)!;
    const pool = list.slice().sort((a, b) => naturalCompare(a.bookingId, b.bookingId));
    const taken = new Set<string>();
    for (const p of pool) {
      if (taken.has(p.id)) continue;
      const room = [p];
      taken.add(p.id);
      for (const q of pool) {
        if (room.length >= size) break;
        if (taken.has(q.id)) continue;
        if ((p.shareGender || q.shareGender) && (!p.gender || p.gender !== q.gender)) continue;
        room.push(q);
        taken.add(q.id);
      }
      if (room.length > 1) out.push({ room: String(next++), passengers: room.map((r) => ({ id: r.id, name: r.name })) });
      else taken.delete(p.id);
    }
  }
  return out;
}

/** The suggestion for a departure's current passengers (held and confirmed parties). */
export async function suggestRooms(db: D1Database, departureId: string): Promise<RoomSuggestion[]> {
  const dep = await loadDepartureContext(db, departureId);
  const rows = await loadPassengers(db, departureId, 'all');
  const candidates: RoomCandidate[] = rows.map((r) => ({
    id: r.id, name: fullName(r), bookingId: r.seat_booking_id, gender: r.gender ?? null, roomType: r.room_type ?? null,
    shareOk: toBool(r.share_ok), shareGender: toBool(r.share_gender), roomGroup: (r.room_group ?? '').trim() || null,
  }));
  const occupancy = new Map(dep.effective.roomTypes.map((r) => [r.key, r.occupancy]));
  return suggestRoomGroups(candidates, occupancy, candidates.map((c) => c.roomGroup ?? ''));
}

/** Saves room groups on passengers of this departure; a null or empty label clears the room. Returns how many passengers changed. */
export async function saveRoomGroups(db: D1Database, departureId: string, assignments: Array<{ passengerId: string; roomGroup: string | null }>): Promise<number> {
  if (!assignments.length) return 0;
  const now = new Date().toISOString();
  const statements = assignments.map((a) =>
    db
      .prepare(`UPDATE seat_passengers SET room_group = ?, updated_at = ? WHERE id = ? AND departure_id = ? AND status = 'active'`)
      .bind(a.roomGroup && a.roomGroup.trim() ? a.roomGroup.trim() : null, now, a.passengerId, departureId),
  );
  let changed = 0;
  for (let i = 0; i < statements.length; i += 80) {
    for (const r of await db.batch(statements.slice(i, i + 80))) changed += r.meta?.changes ?? 0;
  }
  return changed;
}
