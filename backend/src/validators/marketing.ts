import { z } from 'zod';

// ============================================================
// FLYER TEMPLATES
// ============================================================

export const createFlyerTemplateSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  // 'destination' / 'offer' are the legacy values still sent by the Flutter CRM app
  category: z.enum(['festival', 'seasonal', 'promotional', 'general', 'destination', 'offer']).optional(),
  description: z.string().optional(),
  thumbnailUrl: z.string().optional(),
  previewUrl: z.string().optional(),
  layoutJson: z.string().optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  sizePreset: z.enum(['instagram_post', 'instagram_story', 'facebook_cover', 'whatsapp_status', 'custom']).optional(),
  placeholders: z.string().optional(),
  isQuickCreate: z.boolean().optional(),
});

export const updateFlyerTemplateSchema = createFlyerTemplateSchema.partial();

export const flyerTemplateListSchema = z.object({
  page: z.string().regex(/^\d+$/).transform(Number).default(1),
  limit: z.string().regex(/^\d+$/).transform(Number).default(20),
  category: z.string().optional(),
  size_preset: z.string().optional(),
  search: z.string().optional(),
  is_quick_create: z.string().transform(v => v === 'true').optional(),
});

// ============================================================
// IMAGE LIBRARY
// ============================================================

export const imageListSchema = z.object({
  page: z.string().regex(/^\d+$/).transform(Number).default(1),
  limit: z.string().regex(/^\d+$/).transform(Number).default(20),
  category: z.string().optional(),
  search: z.string().optional(),
  tags: z.string().optional(),
});

// ============================================================
// CONTACT SEGMENTS
// ============================================================

export const createSegmentSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  filtersJson: z.string().optional(),
  isDynamic: z.boolean().optional(),
});

export const updateSegmentSchema = createSegmentSchema.partial();

export const segmentListSchema = z.object({
  page: z.string().regex(/^\d+$/).transform(Number).default(1),
  limit: z.string().regex(/^\d+$/).transform(Number).default(20),
  search: z.string().optional(),
});

// ============================================================
// TENANT BRANDING
// ============================================================

export const updateBrandingSchema = z.object({
  logoUrl: z.string().optional(),
  primaryColor: z.string().optional(),
  secondaryColor: z.string().optional(),
  accentColor: z.string().optional(),
  fontFamily: z.string().optional(),
  primaryFont: z.string().optional(),
  secondaryFont: z.string().optional(),
  customCss: z.string().optional(),
  agencyName: z.string().optional(),
  agencyPhone: z.string().optional(),
  agencyEmail: z.string().optional(),
  agencyWebsite: z.string().optional(),
  tagline: z.string().optional(),
});

// ============================================================
// CAMPAIGNS
// ============================================================

export const createCampaignSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  type: z.enum(['whatsapp', 'sms', 'email']),
  segmentId: z.string().optional(),
  templateId: z.string().optional(),
  templateVariables: z.string().optional(),
  messageBody: z.string().optional(),
  emailSubject: z.string().optional(),
  scheduledAt: z.string().optional(),
});

export const updateCampaignSchema = createCampaignSchema.partial();

export const campaignListSchema = z.object({
  page: z.string().regex(/^\d+$/).transform(Number).default(1),
  limit: z.string().regex(/^\d+$/).transform(Number).default(20),
  type: z.string().optional(),
  status: z.string().optional(),
  search: z.string().optional(),
});

// ============================================================
// GENERATED FLYERS
// ============================================================

export const createGeneratedFlyerSchema = z
  .object({
    // The Flutter CRM app (and the pre-simplification API) sends `name` and no templateId,
    // so `name` is an alias of `title` and the template is optional.
    templateId: z.string().min(1, 'Pick a template').optional(),
    title: z.string().min(1, 'Title is required').optional(),
    content: z.record(z.string(), z.unknown()).optional(),
    imageUrl: z.string().optional(),
    name: z.string().min(1).optional(),
    layoutJson: z.string().optional(),
    format: z.enum(['png', 'jpeg', 'pdf']).optional(),
    width: z.number().int().positive().optional(),
    height: z.number().int().positive().optional(),
  })
  .refine((d) => !!(d.title || d.name), { message: 'Title is required', path: ['title'] });

export const updateGeneratedFlyerSchema = z.object({
  title: z.string().min(1).optional(),
  content: z.record(z.string(), z.unknown()).optional(),
  imageUrl: z.string().optional(),
  status: z.enum(['draft', 'published']).optional(),
});

export const flyerListSchema = z.object({
  page: z.string().regex(/^\d+$/).transform(Number).default(1),
  limit: z.string().regex(/^\d+$/).transform(Number).default(20),
  status: z.string().optional(),
  search: z.string().optional(),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});

// ============================================================
// FLYER SHARES
// ============================================================

export const createFlyerShareSchema = z.object({
  flyerId: z.string().min(1),
  channel: z.enum(['whatsapp', 'email', 'sms', 'download', 'link']),
  segmentId: z.string().optional(),
  contactIds: z.array(z.string()).optional(),
  recipientInfo: z.string().optional(),
});
