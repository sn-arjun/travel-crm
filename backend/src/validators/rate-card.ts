import { z } from 'zod';

export const createRateCardSchema = z.object({
    service_type: z.string().min(1),
    destination: z.string().optional(),
    name: z.string().min(1),
    description: z.string().optional(),
    season: z.enum(['peak', 'off_peak', 'shoulder', 'year_round']).optional(),
    cost_price: z.number().min(0),
    selling_price: z.number().min(0).optional(),
    currency: z.string().default('INR'),
    unit: z.enum(['per_night', 'per_person', 'per_trip', 'per_day', 'flat', 'per_vehicle', 'per_room']),
    valid_from: z.string().optional(),
    valid_to: z.string().optional(),
    notes: z.string().optional(),
});

export const updateRateCardSchema = createRateCardSchema.partial();

export const compareRatesSchema = z.object({
    service_type: z.string().min(1),
    destination: z.string().min(1),
    season: z.string().optional(),
    date: z.string().optional(), // 'YYYY-MM-DD'
});
