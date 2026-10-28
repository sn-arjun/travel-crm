import { z } from 'zod';

// Frequent flyer numbers are stored as TEXT. Clients may send a plain string (or a JSON string array);
// a real array is accepted too and serialised to a JSON string.
const frequentFlyerNumbersSchema = z.union([
    z.string(),
    z.array(z.string()).transform((list) => JSON.stringify(list)),
]);

export const createTravellerSchema = z.object({
    contactId: z.string().optional().or(z.literal('')),
    firstName: z.string().min(1, 'First name is required'),
    lastName: z.string().min(1, 'Last name is required'),
    fullNamePassport: z.string().optional().or(z.literal('')),
    email: z.string().email('Enter a valid email address').optional().or(z.literal('')),
    phone: z.string().optional().or(z.literal('')),
    dateOfBirth: z.string().optional(),
    gender: z.enum(['male', 'female', 'other']).optional(),
    nationality: z.string().optional(),
    passportNumber: z.string().optional().or(z.literal('')),
    passportIssueDate: z.string().optional(),
    passportExpiryDate: z.string().optional(),
    passportExpiry: z.string().optional(), // alias of passportExpiryDate
    passportIssuingCountry: z.string().optional(),
    frequentFlyerNumbers: frequentFlyerNumbersSchema.optional(),
    frequentFlyerNumber: frequentFlyerNumbersSchema.optional(), // alias of frequentFlyerNumbers
    mealPreference: z.string().optional(),
    seatPreference: z.string().optional(),
    roomPreference: z.string().optional(),
    medicalNotes: z.string().optional(),
    emergencyContactName: z.string().optional(),
    emergencyContactPhone: z.string().optional(),
    emergencyContactRelationship: z.string().optional(),
    profilePhotoUrl: z.string().url().optional().or(z.literal('')),
});

export const updateTravellerSchema = createTravellerSchema.partial();
