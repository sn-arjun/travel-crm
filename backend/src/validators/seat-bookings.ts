import { z } from 'zod';

// Request schemas of the seat booking routes (R143). Dates are 'YYYY-MM-DD'.

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date as YYYY-MM-DD');
const idStr = z.string().min(1).max(64);

export const seatBookingStatusSchema = z.enum(['held', 'confirmed', 'waitlisted', 'cancelled', 'expired']);

export const passengerInputSchema = z.object({
  /** An existing passenger of this booking keeps its id (and its extras); without one a new passenger is added. */
  id: idStr.optional(),
  travellerId: idStr.nullable().optional(),
  firstName: z.string().trim().max(80).default(''),
  lastName: z.string().trim().max(80).default(''),
  gender: z.enum(['male', 'female', 'other']).nullable().optional(),
  dateOfBirth: dateStr.nullable().optional(),
  ageYears: z.number().int().min(0).max(120).nullable().optional(),
  pickupStopId: idStr.nullable().optional(),
  roomType: z.string().max(40).nullable().optional(),
  shareOk: z.boolean().optional(),
  shareGender: z.boolean().optional(),
  mealPreference: z.string().max(60).nullable().optional(),
  /** Staff-side details (R146): left out, the saved value stays; null clears it. */
  seatNumber: z.string().trim().max(20).nullable().optional(),
  roomGroup: z.string().trim().max(40).nullable().optional(),
  documentsStatus: z.enum(['unknown', 'provided', 'checked', 'problem']).optional(),
  /** Values of the agency-defined passenger fields and the optional built-in ones (nationality, document type, ...). */
  extraFields: z.record(z.string().max(40), z.union([z.string().max(300), z.number(), z.boolean(), z.null()])).optional(),
});
export type PassengerInput = z.infer<typeof passengerInputSchema>;

export const passengersBodySchema = z.object({
  passengers: z.array(passengerInputSchema).max(200),
  /** Create a travellers row under the booking contact for every passenger that has none, and link it. */
  createTravellers: z.boolean().optional(),
});

const contactInputSchema = z.object({
  contactId: idStr.optional(),
  name: z.string().trim().max(120).optional(),
  phone: z.string().trim().max(40).optional(),
  email: z.string().trim().max(200).optional(),
});

export const requestSeatsBodySchema = z
  .object({
    leadId: idStr.optional(),
    contact: contactInputSchema.optional(),
    seats: z.number().int().min(1).max(200).optional(),
    passengers: z.array(passengerInputSchema).max(200).optional(),
    createTravellers: z.boolean().optional(),
    /** The seats are held (the default); false is reserved for importing bookings that are confirmed already. */
    hold: z.boolean().optional(),
    notes: z.string().max(2000).nullable().optional(),
  })
  .refine((v) => v.leadId || v.contact, { message: 'Give a leadId or the contact details' })
  .refine((v) => v.seats !== undefined || (v.passengers && v.passengers.length > 0), { message: 'Give the number of seats or the passengers' });

export const holdSeatsBodySchema = z.object({
  departureId: idStr,
  seats: z.number().int().min(1).max(200),
  notes: z.string().max(2000).nullable().optional(),
});

export const bookingListSchema = z.object({
  status: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const confirmBodySchema = z.object({
  /** Who confirms when it is not the signed-in person: the deposit rule or an accepted quote. */
  by: z.enum(['deposit', 'quote_accept']).optional(),
});

export const cancelBodySchema = z.object({
  reason: z.string().trim().max(300).optional(),
});

export const moveBodySchema = z.object({
  toDepartureId: idStr,
});

export const changeSeatsBodySchema = z.object({
  seats: z.number().int().min(1).max(200),
});

export const bulkConfirmBodySchema = z.object({
  ids: z.array(idStr).min(1).max(200),
});
