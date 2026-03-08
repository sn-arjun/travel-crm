import { z } from 'zod';

export const createTravellerSchema = z.object({
    contactId: z.string().optional().or(z.literal('')),
    firstName: z.string().min(1, 'First name is required'),
    lastName: z.string().min(1, 'Last name is required'),
    fullNamePassport: z.string().optional().or(z.literal('')),
    dateOfBirth: z.string().optional(),
    gender: z.enum(['male', 'female', 'other']).optional(),
    nationality: z.string().optional(),
    passportNumber: z.string().optional().or(z.literal('')),
    passportIssueDate: z.string().optional(),
    passportExpiryDate: z.string().optional(),
    passportIssuingCountry: z.string().optional(),
    frequentFlyerNumbers: z.string().optional(), // Expected to be a JSON string array if passed directly, or we handle it
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
