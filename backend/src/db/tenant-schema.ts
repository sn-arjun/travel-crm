import { sqliteTable, text, real, integer, index, uniqueIndex, primaryKey } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

const timestamp = sql`(strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`;

// ============================================================
// USERS & AUTH
// ============================================================

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull(),
  phone: text('phone'),
  name: text('name').notNull(),
  passwordHash: text('password_hash').notNull(),
  role: text('role').notNull(), // admin, sales_manager, salesperson, operations, accountant, view_only
  avatarUrl: text('avatar_url'),
  department: text('department'),
  language: text('language').default('en'),
  locale: text('locale'), // R202: BCP 47 override of the agency locale; null = agency setting
  timezone: text('timezone'), // R202: IANA zone override of the agency zone; null = agency setting
  inviteStatus: text('invite_status').default('active'), // pending, active
  invitedAt: text('invited_at'),
  emailSignature: text('email_signature'), // HTML or plain text email signature
  mustChangePassword: integer('must_change_password').notNull().default(0),
  isActive: integer('is_active').default(1),
  lastLoginAt: text('last_login_at'),
  createdAt: text('created_at').default(timestamp),
  updatedAt: text('updated_at').default(timestamp),
}, (table) => [
  uniqueIndex('users_email_idx').on(table.email),
  index('users_role_idx').on(table.role),
  index('users_is_active_idx').on(table.isActive),
]);

// ============================================================
// CONTACTS
// ============================================================

export const contacts = sqliteTable('contacts', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email'),
  phone: text('phone'),
  company: text('company'),
  type: text('type').notNull(), // customer, supplier, agent, partner
  address: text('address'),
  city: text('city'),
  state: text('state'),
  country: text('country'),
  postalCode: text('postal_code'),
  taxId: text('tax_id'), // GSTIN / VAT number of a business customer (R201)
  isBusiness: integer('is_business').default(0),
  tags: text('tags'), // JSON array as text
  notes: text('notes'),
  source: text('source'), // manual, website, referral, ad, facebook, google
  birthday: text('birthday'),
  anniversary: text('anniversary'),
  preferredLanguage: text('preferred_language').default('en'),
  dndEnabled: integer('dnd_enabled').default(0), // Do Not Disturb — block SMS to India (+91)
  optedOut: integer('opted_out').default(0), // 1 = opted out of marketing
  optedOutAt: text('opted_out_at'),
  optOutChannel: text('opt_out_channel'), // email, sms, whatsapp, manual
  optOutReason: text('opt_out_reason'), // user-provided reason for opting out
  isDeleted: integer('is_deleted').default(0),
  createdBy: text('created_by').references(() => users.id),
  createdAt: text('created_at').default(timestamp),
  updatedAt: text('updated_at').default(timestamp),
}, (table) => [
  index('contacts_type_idx').on(table.type),
  index('contacts_city_idx').on(table.city),
  index('contacts_country_idx').on(table.country),
  index('contacts_source_idx').on(table.source),
  index('contacts_created_by_idx').on(table.createdBy),
  index('contacts_created_at_idx').on(table.createdAt),
  index('contacts_is_deleted_idx').on(table.isDeleted),
]);

// ============================================================
// SHARED CONTACTS
// ============================================================

export const sharedContacts = sqliteTable('shared_contacts', {
  id: text('id').primaryKey(),
  contactId: text('contact_id').notNull().references(() => contacts.id),
  sharedBy: text('shared_by').notNull().references(() => users.id),
  sharedWith: text('shared_with').notNull().references(() => users.id),
  note: text('note'),
  createdAt: text('created_at').default(timestamp),
}, (table) => [
  index('shared_contacts_contact_id_idx').on(table.contactId),
  index('shared_contacts_shared_by_idx').on(table.sharedBy),
  index('shared_contacts_shared_with_idx').on(table.sharedWith),
]);

// ============================================================
// CONTACT CUSTOM FIELDS (EAV)
// ============================================================

export const contactCustomFieldDefs = sqliteTable('contact_custom_field_defs', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  label: text('label').notNull(),
  fieldType: text('field_type').notNull(), // text, number, date, select, multi_select, boolean
  options: text('options'), // JSON array for select/multi_select
  isRequired: integer('is_required').default(0),
  sortOrder: integer('sort_order').default(0),
  createdBy: text('created_by').references(() => users.id),
  createdAt: text('created_at').default(timestamp),
  updatedAt: text('updated_at').default(timestamp),
}, (table) => [
  uniqueIndex('custom_field_defs_name_idx').on(table.name),
]);

export const contactCustomFieldValues = sqliteTable('contact_custom_field_values', {
  id: text('id').primaryKey(),
  contactId: text('contact_id').notNull().references(() => contacts.id, { onDelete: 'cascade' }),
  fieldId: text('field_id').notNull().references(() => contactCustomFieldDefs.id, { onDelete: 'cascade' }),
  value: text('value'),
  createdAt: text('created_at').default(timestamp),
  updatedAt: text('updated_at').default(timestamp),
}, (table) => [
  index('custom_field_values_contact_id_idx').on(table.contactId),
  index('custom_field_values_field_id_idx').on(table.fieldId),
  uniqueIndex('custom_field_values_unique_idx').on(table.contactId, table.fieldId),
]);

// ============================================================
// LEADS
// ============================================================

export const leads = sqliteTable('leads', {
  id: text('id').primaryKey(),
  contactId: text('contact_id').notNull().references(() => contacts.id),
  title: text('title').notNull(),
  destination: text('destination'),
  travelDate: text('travel_date'),
  returnDate: text('return_date'),
  paxAdults: integer('pax_adults').default(1),
  paxChildren: integer('pax_children').default(0),
  paxInfants: integer('pax_infants').default(0),
  budget: real('budget'),
  currency: text('currency').default('INR'),
  tripType: text('trip_type'), // domestic, international, honeymoon, family, group, corporate, adventure, pilgrimage
  source: text('source'), // manual, website, facebook, google, referral, walkin
  status: text('status').notNull().default('new'), // new, contacted, requirement_gathered, proposal_sent, negotiation, booking_confirmed, completed, lost
  priority: text('priority').default('warm'), // hot, warm, cold
  assignedTo: text('assigned_to').references(() => users.id),
  lostReason: text('lost_reason'),
  passportAvailable: integer('passport_available').default(0),
  travelClass: text('travel_class'), // economy, premium_economy, business, first
  hotelPreference: text('hotel_preference'), // budget, standard, premium, luxury
  mealPreference: text('meal_preference'), // veg, non_veg, vegan, jain, halal
  specialRequirements: text('special_requirements'),
  estimatedValue: real('estimated_value'),
  probability: integer('probability'),
  expectedCloseDate: text('expected_close_date'),
  notes: text('notes'),
  isDeleted: integer('is_deleted').default(0),
  createdBy: text('created_by').references(() => users.id),
  createdAt: text('created_at').default(timestamp),
  updatedAt: text('updated_at').default(timestamp),
}, (table) => [
  index('leads_contact_id_idx').on(table.contactId),
  index('leads_status_idx').on(table.status),
  index('leads_priority_idx').on(table.priority),
  index('leads_assigned_to_idx').on(table.assignedTo),
  index('leads_source_idx').on(table.source),
  index('leads_destination_idx').on(table.destination),
  index('leads_travel_date_idx').on(table.travelDate),
  index('leads_created_at_idx').on(table.createdAt),
  index('leads_created_by_idx').on(table.createdBy),
  index('leads_is_deleted_idx').on(table.isDeleted),
]);

// ============================================================
// LEAD ACTIVITIES
// ============================================================

export const leadActivities = sqliteTable('lead_activities', {
  id: text('id').primaryKey(),
  leadId: text('lead_id').notNull().references(() => leads.id),
  type: text('type').notNull(), // note, call, email, whatsapp, sms, status_change, assignment, follow_up
  content: text('content'),
  metadata: text('metadata'), // JSON text for extra data (old_status, new_status, etc.)
  createdBy: text('created_by').references(() => users.id),
  createdAt: text('created_at').default(timestamp),
}, (table) => [
  index('lead_activities_lead_id_idx').on(table.leadId),
  index('lead_activities_type_idx').on(table.type),
  index('lead_activities_created_at_idx').on(table.createdAt),
]);

// ============================================================
// FOLLOW-UPS
// ============================================================

export const followUps = sqliteTable('follow_ups', {
  id: text('id').primaryKey(),
  leadId: text('lead_id').notNull().references(() => leads.id),
  scheduledAt: text('scheduled_at').notNull(),
  type: text('type').notNull(), // call, email, whatsapp, visit
  notes: text('notes'),
  outcome: text('outcome'),
  status: text('status').notNull().default('pending'), // pending, completed, missed
  completedAt: text('completed_at'),
  createdBy: text('created_by').references(() => users.id),
  createdAt: text('created_at').default(timestamp),
}, (table) => [
  index('follow_ups_lead_id_idx').on(table.leadId),
  index('follow_ups_scheduled_at_idx').on(table.scheduledAt),
  index('follow_ups_status_idx').on(table.status),
  index('follow_ups_created_by_idx').on(table.createdBy),
]);

// ============================================================
// ITINERARIES
// ============================================================

export const itineraries = sqliteTable('itineraries', {
  id: text('id').primaryKey(),
  leadId: text('lead_id').notNull().references(() => leads.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  version: integer('version').default(1),
  parentId: text('parent_id'), // previous version reference
  status: text('status').default('draft'), // draft, sent, approved, rejected, expired
  validityDate: text('validity_date'),
  notes: text('notes'),
  inclusions: text('inclusions'), // JSON array
  exclusions: text('exclusions'), // JSON array
  termsConditions: text('terms_conditions'),
  currency: text('currency').default('INR'),
  totalCost: real('total_cost').default(0),
  totalSelling: real('total_selling').default(0),
  totalTax: real('total_tax').default(0),
  grandTotal: real('grand_total').default(0),
  markupType: text('markup_type'), // percentage, fixed
  markupValue: real('markup_value'),
  // Share link fields
  shareToken: text('share_token'),
  shareLinkActive: integer('share_link_active').default(0),
  viewCount: integer('view_count').default(0),
  lastViewedAt: text('last_viewed_at'),
  isDeleted: integer('is_deleted').default(0),
  createdBy: text('created_by').references(() => users.id),
  createdAt: text('created_at').default(timestamp),
  updatedAt: text('updated_at').default(timestamp),
}, (table) => [
  index('itineraries_lead_id_idx').on(table.leadId),
  index('itineraries_status_idx').on(table.status),
  index('itineraries_created_by_idx').on(table.createdBy),
  index('itineraries_parent_id_idx').on(table.parentId),
  index('itineraries_share_token_idx').on(table.shareToken),
  index('itineraries_is_deleted_idx').on(table.isDeleted),
]);

export const itineraryDays = sqliteTable('itinerary_days', {
  id: text('id').primaryKey(),
  itineraryId: text('itinerary_id').notNull().references(() => itineraries.id, { onDelete: 'cascade' }),
  dayNumber: integer('day_number').notNull(),
  title: text('title'),
  description: text('description'), // HTML rich text
  city: text('city'),
  overnightCity: text('overnight_city'),
  images: text('images'), // JSON array of R2 keys
  isFreeDay: integer('is_free_day').default(0),
  createdAt: text('created_at').default(timestamp),
}, (table) => [
  index('itinerary_days_itinerary_id_idx').on(table.itineraryId),
]);

export const itineraryItems = sqliteTable('itinerary_items', {
  id: text('id').primaryKey(),
  dayId: text('day_id').notNull().references(() => itineraryDays.id, { onDelete: 'cascade' }),
  type: text('type').notNull(), // hotel, transport, activity, meal, flight
  title: text('title').notNull(),
  description: text('description'),
  supplierId: text('supplier_id'),
  rateCardId: text('rate_card_id'),
  costPrice: real('cost_price').default(0),
  sellingPrice: real('selling_price').default(0),
  markupType: text('markup_type'), // percentage, fixed
  markupValue: real('markup_value'),
  taxRate: real('tax_rate').default(0),
  taxAmount: real('tax_amount').default(0),
  quantity: integer('quantity').default(1),
  paxType: text('pax_type'), // adult, child, infant
  timeStart: text('time_start'),
  timeEnd: text('time_end'),
  sortOrder: integer('sort_order').default(0),
  detailsJson: text('details_json'), // type-specific: hotel(room_type, meal_plan), flight(airline, pnr), etc.
  internalNotes: text('internal_notes'),
  createdAt: text('created_at').default(timestamp),
}, (table) => [
  index('itinerary_items_day_id_idx').on(table.dayId),
  index('itinerary_items_type_idx').on(table.type),
]);

// ============================================================
// ITINERARY TEMPLATES
// ============================================================

export const itineraryTemplates = sqliteTable('itinerary_templates', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description'),
  destination: text('destination'),
  durationDays: integer('duration_days'),
  category: text('category'), // beach, mountain, heritage, adventure, honeymoon, family, corporate, pilgrimage, custom
  templateData: text('template_data'), // full JSON snapshot of days+items
  isSystem: integer('is_system').default(0),
  createdBy: text('created_by').references(() => users.id),
  createdAt: text('created_at').default(timestamp),
  updatedAt: text('updated_at').default(timestamp),
}, (table) => [
  index('itinerary_templates_destination_idx').on(table.destination),
  index('itinerary_templates_category_idx').on(table.category),
]);

// ============================================================
// RATE CARDS
// ============================================================

export const rateCards = sqliteTable('rate_cards', {
  id: text('id').primaryKey(),
  supplierId: text('supplier_id').references(() => suppliers.id, { onDelete: 'cascade' }),
  serviceType: text('service_type').notNull(), // hotel, transport, activity, flight, meal
  destination: text('destination'),
  name: text('name').notNull(),
  description: text('description'),
  season: text('season'), // peak, off_peak, shoulder
  costPrice: real('cost_price').notNull(),
  sellingPrice: real('selling_price'),
  currency: text('currency').default('INR'),
  unit: text('unit'), // per_person, per_room, per_vehicle, per_day
  validFrom: text('valid_from'),
  validTo: text('valid_to'),
  childPricePercent: real('child_price_percent'), // e.g., 50 means 50% of adult price
  groupDiscountJson: text('group_discount_json'), // JSON: [{min_pax: 5, discount_percent: 10}]
  detailsJson: text('details_json'), // type-specific: hotel(room_type, meal_plan, star_rating), transport(vehicle_type, capacity)
  isActive: integer('is_active').default(1),
  createdBy: text('created_by').references(() => users.id),
  createdAt: text('created_at').default(timestamp),
  updatedAt: text('updated_at').default(timestamp),
}, (table) => [
  index('rate_cards_supplier_id_idx').on(table.supplierId),
  index('rate_cards_service_type_idx').on(table.serviceType),
  index('rate_cards_destination_idx').on(table.destination),
  index('rate_cards_season_idx').on(table.season),
  index('rate_cards_is_active_idx').on(table.isActive),
]);

// ============================================================
// INVOICES
// ============================================================

export const invoices = sqliteTable('invoices', {
  id: text('id').primaryKey(),
  leadId: text('lead_id').references(() => leads.id),
  contactId: text('contact_id').notNull().references(() => contacts.id),
  invoiceNumber: text('invoice_number').notNull(),
  type: text('type').notNull().default('tax_invoice'), // tax_invoice, proforma, receipt, credit_note, debit_note
  subtotal: real('subtotal').notNull().default(0),
  discountType: text('discount_type'), // percentage, fixed
  discountValue: real('discount_value'),
  discountAmount: real('discount_amount').default(0),
  taxableAmount: real('taxable_amount').default(0),
  taxType: text('tax_type'), // treatment: cgst_sgst, igst, export_zero, vat, reverse_charge, sales_tax, none
  taxRegime: text('tax_regime').notNull().default('gst'), // gst, vat, sales_tax, none (R201)
  taxBreakdown: text('tax_breakdown'), // JSON [{code, rate, base, amount, label}]
  sellerTaxId: text('seller_tax_id'),
  buyerTaxId: text('buyer_tax_id'),
  placeOfSupply: text('place_of_supply'),
  taxNotes: text('tax_notes'),
  cgst: real('cgst').default(0),
  sgst: real('sgst').default(0),
  igst: real('igst').default(0),
  vatAmount: real('vat_amount').default(0),
  totalTax: real('total_tax').default(0),
  total: real('total').notNull().default(0),
  currency: text('currency').default('INR'),
  status: text('status').default('draft'), // draft, sent, paid, partially_paid, overdue, cancelled
  dueDate: text('due_date'),
  issueDate: text('issue_date'), // ISO date (YYYY-MM-DD)
  terms: text('terms'),
  paidAmount: real('paid_amount').default(0),
  balanceDue: real('balance_due').default(0),
  notes: text('notes'),
  bankDetails: text('bank_details'), // JSON text
  paymentLink: text('payment_link'),
  createdBy: text('created_by').references(() => users.id),
  createdAt: text('created_at').default(timestamp),
  updatedAt: text('updated_at').default(timestamp),
}, (table) => [
  uniqueIndex('invoices_number_idx').on(table.invoiceNumber),
  index('invoices_lead_id_idx').on(table.leadId),
  index('invoices_contact_id_idx').on(table.contactId),
  index('invoices_type_idx').on(table.type),
  index('invoices_status_idx').on(table.status),
  index('invoices_due_date_idx').on(table.dueDate),
  index('invoices_created_at_idx').on(table.createdAt),
]);

export const invoiceItems = sqliteTable('invoice_items', {
  id: text('id').primaryKey(),
  invoiceId: text('invoice_id').notNull().references(() => invoices.id, { onDelete: 'cascade' }),
  description: text('description').notNull(),
  hsnCode: text('hsn_code'), // SAC 998551, 998552 for travel
  quantity: integer('quantity').default(1),
  rate: real('rate').notNull(),
  discountPercent: real('discount_percent').default(0),
  taxableAmount: real('taxable_amount').default(0),
  taxRate: real('tax_rate').default(0), // e.g., 5, 12, 18, 28
  taxAmount: real('tax_amount').default(0),
  amount: real('amount').notNull(),
  sortOrder: integer('sort_order').default(0),
}, (table) => [
  index('invoice_items_invoice_id_idx').on(table.invoiceId),
]);

// ============================================================
// PAYMENTS
// ============================================================

export const payments = sqliteTable('payments', {
  id: text('id').primaryKey(),
  invoiceId: text('invoice_id').references(() => invoices.id),
  contactId: text('contact_id').references(() => contacts.id),
  supplierId: text('supplier_id').references(() => suppliers.id),
  amount: real('amount').notNull(),
  currency: text('currency').default('INR'),
  method: text('method'), // cash, bank_transfer, upi, card, cheque, online
  reference: text('reference'), // transaction ID, cheque number, etc.
  type: text('type').notNull().default('incoming'), // incoming, outgoing
  date: text('date').notNull(),
  notes: text('notes'),
  receiptUrl: text('receipt_url'),
  createdBy: text('created_by').references(() => users.id),
  createdAt: text('created_at').default(timestamp),
}, (table) => [
  index('payments_invoice_id_idx').on(table.invoiceId),
  index('payments_contact_id_idx').on(table.contactId),
  index('payments_supplier_id_idx').on(table.supplierId),
  index('payments_type_idx').on(table.type),
  index('payments_date_idx').on(table.date),
]);

// ============================================================
// VOUCHERS
// ============================================================

export const vouchers = sqliteTable('vouchers', {
  id: text('id').primaryKey(),
  leadId: text('lead_id').notNull().references(() => leads.id, { onDelete: 'cascade' }),
  type: text('type').notNull(), // hotel, transport, flight, activity
  supplierId: text('supplier_id').references(() => suppliers.id, { onDelete: 'set null' }),
  title: text('title').notNull(),
  detailsJson: text('details_json'), // Type-specific JSON data
  status: text('status').default('draft'), // draft, sent, confirmed
  language: text('language').default('en'),
  itineraryItemId: text('itinerary_item_id'),
  pdfR2Key: text('pdf_r2_key'),
  sentVia: text('sent_via'), // email, whatsapp, both
  sentAt: text('sent_at'),
  confirmedAt: text('confirmed_at'),
  notes: text('notes'),
  createdBy: text('created_by').references(() => users.id),
  createdAt: text('created_at').default(timestamp),
  updatedAt: text('updated_at').default(timestamp),
  isDeleted: integer('is_deleted').default(0),
}, (table) => [
  index('vouchers_lead_id_idx').on(table.leadId),
  index('vouchers_type_idx').on(table.type),
  index('vouchers_status_idx').on(table.status),
  index('vouchers_itinerary_item_id_idx').on(table.itineraryItemId),
  index('vouchers_type_status_idx').on(table.type, table.status),
  index('vouchers_created_by_idx').on(table.createdBy),
  index('vouchers_supplier_id_idx').on(table.supplierId),
]);

// ============================================================
// TRAVELLERS
// ============================================================

export const travellers = sqliteTable('travellers', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  contactId: text('contact_id').references(() => contacts.id),
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  fullNamePassport: text('full_name_passport').notNull(),
  email: text('email'),
  phone: text('phone'),
  dateOfBirth: text('date_of_birth'),
  gender: text('gender'), // male, female, other
  nationality: text('nationality'),
  passportNumber: text('passport_number'),
  passportIssueDate: text('passport_issue_date'),
  passportExpiryDate: text('passport_expiry_date'),
  passportIssuingCountry: text('passport_issuing_country'),
  frequentFlyerNumbers: text('frequent_flyer_numbers'), // JSON array
  mealPreference: text('meal_preference'),
  seatPreference: text('seat_preference'),
  roomPreference: text('room_preference'),
  medicalNotes: text('medical_notes'),
  emergencyContactName: text('emergency_contact_name'),
  emergencyContactPhone: text('emergency_contact_phone'),
  emergencyContactRelationship: text('emergency_contact_relationship'),
  profilePhotoUrl: text('profile_photo_url'),
  createdBy: text('created_by').references(() => users.id),
  createdAt: text('created_at').default(timestamp),
  updatedAt: text('updated_at').default(timestamp),
  isDeleted: integer('is_deleted').default(0),
}, (table) => [
  index('travellers_tenant_id_contact_id_idx').on(table.tenantId, table.contactId),
  index('travellers_tenant_id_passport_number_idx').on(table.tenantId, table.passportNumber),
]);

export const travellerDocuments = sqliteTable('traveller_documents', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  travellerId: text('traveller_id').notNull().references(() => travellers.id),
  documentType: text('document_type'), // passport_copy, photo, national_id, other 
  fileName: text('file_name').notNull(),
  fileUrl: text('file_url').notNull(),
  fileSize: integer('file_size'),
  mimeType: text('mime_type'),
  uploadedBy: text('uploaded_by').references(() => users.id),
  createdAt: text('created_at').default(timestamp),
  isDeleted: integer('is_deleted').default(0),
}, (table) => [
  index('traveller_docs_traveller_id_idx').on(table.travellerId),
]);

// ============================================================
// VISA APPLICATIONS
// ============================================================

export const visaApplications = sqliteTable('visa_applications', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  travellerId: text('traveller_id').notNull().references(() => travellers.id),
  leadId: text('lead_id').references(() => leads.id),
  destinationCountry: text('destination_country').notNull(),
  visaType: text('visa_type').notNull(), // tourist, business, transit, student, work, medical
  status: text('status').default('not_started'), // not_started, documents_collecting, applied, processing, approved, rejected
  applicationNumber: text('application_number'),
  appliedDate: text('applied_date'),
  appointmentDate: text('appointment_date'),
  expectedDate: text('expected_date'),
  approvedDate: text('approved_date'),
  rejectedDate: text('rejected_date'),
  rejectionReason: text('rejection_reason'),
  visaNumber: text('visa_number'),
  visaIssueDate: text('visa_issue_date'),
  visaExpiryDate: text('visa_expiry_date'),
  visaEntryType: text('visa_entry_type'), // single, multiple, transit
  embassyName: text('embassy_name'),
  notes: text('notes'),
  createdBy: text('created_by').references(() => users.id),
  createdAt: text('created_at').default(timestamp),
  updatedAt: text('updated_at').default(timestamp),
  isDeleted: integer('is_deleted').default(0),
}, (table) => [
  index('visa_apps_tenant_id_traveller_id_idx').on(table.tenantId, table.travellerId),
  index('visa_apps_tenant_id_status_idx').on(table.tenantId, table.status),
  index('visa_apps_tenant_id_visa_expiry_idx').on(table.tenantId, table.visaExpiryDate),
]);

export const visaChecklistItems = sqliteTable('visa_checklist_items', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  visaApplicationId: text('visa_application_id').notNull().references(() => visaApplications.id, { onDelete: 'cascade' }),
  documentName: text('document_name').notNull(),
  description: text('description'),
  isRequired: integer('is_required').default(1),
  isReceived: integer('is_received').default(0),
  receivedDate: text('received_date'),
  receivedBy: text('received_by').references(() => users.id),
  documentUrl: text('document_url'),
  notes: text('notes'),
  sortOrder: integer('sort_order').default(0),
  createdAt: text('created_at').default(timestamp),
  updatedAt: text('updated_at').default(timestamp),
}, (table) => [
  index('visa_checklist_visa_app_id_idx').on(table.visaApplicationId),
]);

export const visaDocuments = sqliteTable('visa_documents', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  visaApplicationId: text('visa_application_id').notNull().references(() => visaApplications.id, { onDelete: 'cascade' }),
  documentType: text('document_type'), // application_form, bank_statement, cover_letter, invitation_letter, travel_insurance, hotel_booking, flight_itinerary, photo, other
  fileName: text('file_name').notNull(),
  fileUrl: text('file_url').notNull(),
  fileSize: integer('file_size'),
  mimeType: text('mime_type'),
  uploadedBy: text('uploaded_by').references(() => users.id),
  createdAt: text('created_at').default(timestamp),
  isDeleted: integer('is_deleted').default(0),
}, (table) => [
  index('visa_docs_visa_app_id_idx').on(table.visaApplicationId),
]);

export const visaNotes = sqliteTable('visa_notes', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  visaApplicationId: text('visa_application_id').notNull().references(() => visaApplications.id, { onDelete: 'cascade' }),
  content: text('content').notNull(),
  createdBy: text('created_by').references(() => users.id),
  createdAt: text('created_at').default(timestamp),
  updatedAt: text('updated_at').default(timestamp),
  isDeleted: integer('is_deleted').default(0),
}, (table) => [
  index('visa_notes_visa_app_id_idx').on(table.visaApplicationId),
]);

export const expiryAlertsLog = sqliteTable('expiry_alerts_log', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  alertType: text('alert_type').notNull(), // visa_expiry, passport_expiry
  entityId: text('entity_id').notNull(), // visa_application_id or traveller_id
  alertDate: text('alert_date').notNull(),
  daysRemaining: integer('days_remaining'),
  sentAt: text('sent_at'),
}, (table) => [
  index('expiry_alerts_tenant_entity_date_idx').on(table.tenantId, table.entityId, table.alertDate),
]);

// ============================================================
// COMMUNICATION
// ============================================================

export const messageTemplates = sqliteTable('message_templates', {
  id: text('id').primaryKey(),
  channel: text('channel').notNull(), // whatsapp, sms, email
  name: text('name').notNull(),
  subject: text('subject'), // for email
  content: text('content').notNull(),
  variables: text('variables'), // JSON array of variable names
  category: text('category'), // greeting, follow_up, quotation, booking, reminder, wish, offer, visa
  language: text('language').default('en'),
  isActive: integer('is_active').default(1),
  isSystem: integer('is_system').default(0), // system-provided template, not user-created
  whatsappTemplateSid: text('whatsapp_template_sid'), // Twilio WhatsApp template SID
  whatsappStatus: text('whatsapp_status'), // pending, approved, rejected
  createdBy: text('created_by').references(() => users.id),
  createdAt: text('created_at').default(timestamp),
}, (table) => [
  index('msg_templates_channel_idx').on(table.channel),
  index('msg_templates_category_idx').on(table.category),
]);

export const messageLog = sqliteTable('message_log', {
  id: text('id').primaryKey(),
  contactId: text('contact_id').references(() => contacts.id),
  leadId: text('lead_id').references(() => leads.id),
  channel: text('channel').notNull(), // whatsapp, sms, email
  templateId: text('template_id').references(() => messageTemplates.id),
  subject: text('subject'),
  content: text('content'),
  direction: text('direction').default('outgoing'), // outgoing, incoming
  mediaUrl: text('media_url'), // for media messages (images, documents)
  metadata: text('metadata'), // JSON: extra info (batch_id, twilio_sid, etc.)
  status: text('status').default('queued'), // queued, sent, delivered, read, failed
  externalId: text('external_id'), // Twilio SID or SendGrid message ID
  fromAddress: text('from_address'), // incoming: sender phone (E.164) or email, also when no contact matches
  toAddress: text('to_address'), // incoming: the tenant number or mailbox that received it
  errorMessage: text('error_message'),
  sentBy: text('sent_by').references(() => users.id),
  sentAt: text('sent_at'),
  deliveredAt: text('delivered_at'),
  readAt: text('read_at'),
  createdAt: text('created_at').default(timestamp),
}, (table) => [
  index('msg_log_external_id_idx').on(table.externalId),
  index('msg_log_contact_id_idx').on(table.contactId),
  index('msg_log_lead_id_idx').on(table.leadId),
  index('msg_log_channel_idx').on(table.channel),
  index('msg_log_status_idx').on(table.status),
  index('msg_log_direction_idx').on(table.direction),
  index('msg_log_sent_at_idx').on(table.sentAt),
]);

export const bulkSendBatches = sqliteTable('bulk_send_batches', {
  id: text('id').primaryKey(),
  channel: text('channel').notNull(), // whatsapp, sms, email
  templateId: text('template_id').references(() => messageTemplates.id),
  message: text('message'), // custom message if no template
  totalCount: integer('total_count').default(0),
  sentCount: integer('sent_count').default(0),
  deliveredCount: integer('delivered_count').default(0),
  failedCount: integer('failed_count').default(0),
  status: text('status').default('pending'), // pending, in_progress, completed, failed
  createdBy: text('created_by').references(() => users.id),
  createdAt: text('created_at').default(timestamp),
  completedAt: text('completed_at'),
}, (table) => [
  index('bulk_batches_status_idx').on(table.status),
  index('bulk_batches_channel_idx').on(table.channel),
  index('bulk_batches_created_by_idx').on(table.createdBy),
]);

// ============================================================
// SUPPLIERS
// ============================================================

export const suppliers = sqliteTable('suppliers', {
  id: text('id').primaryKey(),
  companyName: text('company_name').notNull(),
  contactPerson: text('contact_person'),
  email: text('email'),
  phone: text('phone'),
  address: text('address'),
  city: text('city'),
  state: text('state'),
  country: text('country'),
  postalCode: text('postal_code'),
  gstNumber: text('gst_number'),
  taxId: text('tax_id'),
  category: text('category').notNull(), // hotel, transport, airline, activity_provider, guide, visa_agent, insurance
  website: text('website'),
  notes: text('notes'),
  rating: real('rating').default(0),
  isPreferred: integer('is_preferred').default(0),
  status: text('status').default('active'), // active, inactive
  createdBy: text('created_by').references(() => users.id),
  createdAt: text('created_at').default(timestamp),
  updatedAt: text('updated_at').default(timestamp),
  isDeleted: integer('is_deleted').default(0),
}, (table) => [
  index('suppliers_category_idx').on(table.category),
  index('suppliers_city_idx').on(table.city),
  index('suppliers_status_idx').on(table.status),
  index('suppliers_is_deleted_idx').on(table.isDeleted),
]);

export const supplierDocuments = sqliteTable('supplier_documents', {
  id: text('id').primaryKey(),
  supplierId: text('supplier_id').notNull().references(() => suppliers.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  type: text('type').default('other'), // contract, agreement, rate_sheet, license, insurance, other
  fileUrl: text('file_url').notNull(),
  fileSize: integer('file_size'),
  mimeType: text('mime_type'),
  uploadedBy: text('uploaded_by').references(() => users.id),
  uploadedAt: text('uploaded_at').default(timestamp),
  expiryDate: text('expiry_date'),
  notes: text('notes'),
  isDeleted: integer('is_deleted').default(0),
}, (table) => [
  index('supplier_docs_supplier_id_idx').on(table.supplierId),
]);

// ============================================================
// TASKS
// ============================================================

export const tasks = sqliteTable('tasks', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description'),
  status: text('status').default('todo'), // todo, in_progress, done
  priority: text('priority').default('medium'), // high, medium, low
  category: text('category').default('general'), // follow_up, voucher_creation, payment_collection, document_collection, visa_processing, general
  dueDate: text('due_date'),
  assignedTo: text('assigned_to').notNull(),
  relatedLeadId: text('related_lead_id'),
  parentTaskId: text('parent_task_id'),
  createdBy: text('created_by').notNull(),
  completedAt: text('completed_at'),
  overdueNotifiedDate: text('overdue_notified_date'),
  isDeleted: integer('is_deleted').default(0),
  createdAt: text('created_at').default(timestamp),
  updatedAt: text('updated_at').default(timestamp),
}, (table) => [
  index('tasks_assigned_to_status_idx').on(table.assignedTo, table.status),
  index('tasks_related_lead_id_idx').on(table.relatedLeadId),
  index('tasks_parent_task_id_idx').on(table.parentTaskId),
  index('tasks_due_date_idx').on(table.dueDate),
  index('tasks_status_idx').on(table.status),
  index('tasks_is_deleted_idx').on(table.isDeleted),
]);

// ============================================================
// EVENTS (Calendar / Planner)
// ============================================================

export const events = sqliteTable('events', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description'),
  eventType: text('event_type').notNull(), // trip_departure, trip_return, meeting, follow_up, deadline, reminder, holiday
  startAt: text('start_at').notNull(), // ISO8601 UTC
  endAt: text('end_at'), // ISO8601 UTC
  allDay: integer('all_day').default(0),
  location: text('location'),
  color: text('color'),
  recurrenceRule: text('recurrence_rule'), // JSON string
  recurrenceParentId: text('recurrence_parent_id'),
  relatedLeadId: text('related_lead_id'),
  relatedTaskId: text('related_task_id'),
  assignedTo: text('assigned_to').notNull(),
  createdBy: text('created_by').notNull(),
  timezone: text('timezone').default('Asia/Kolkata'),
  isDeleted: integer('is_deleted').default(0),
  createdAt: text('created_at').default(timestamp),
  updatedAt: text('updated_at').default(timestamp),
}, (table) => [
  index('events_assigned_to_start_at_idx').on(table.assignedTo, table.startAt),
  index('events_related_lead_id_idx').on(table.relatedLeadId),
  index('events_recurrence_parent_id_idx').on(table.recurrenceParentId),
  index('events_related_task_id_idx').on(table.relatedTaskId),
  index('events_event_type_idx').on(table.eventType),
  index('events_is_deleted_idx').on(table.isDeleted),
]);

// ============================================================
// TASK COMMENTS
// ============================================================

export const taskComments = sqliteTable('task_comments', {
  id: text('id').primaryKey(),
  taskId: text('task_id').notNull(),
  userId: text('user_id').notNull(),
  content: text('content').notNull(),
  createdAt: text('created_at').default(timestamp),
  updatedAt: text('updated_at').default(timestamp),
}, (table) => [
  index('task_comments_task_id_idx').on(table.taskId),
  index('task_comments_user_id_idx').on(table.userId),
]);

// ============================================================
// UTILITIES
// ============================================================

export const bookmarks = sqliteTable('bookmarks', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  entityType: text('entity_type').notNull(), // lead, contact, itinerary, invoice
  entityId: text('entity_id').notNull(),
  createdAt: text('created_at').default(timestamp),
}, (table) => [
  uniqueIndex('bookmarks_user_entity_idx').on(table.userId, table.entityType, table.entityId),
  index('bookmarks_user_id_idx').on(table.userId),
]);

export const stickyNotes = sqliteTable('sticky_notes', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  content: text('content').notNull(),
  color: text('color').default('yellow'), // yellow, blue, green, pink, purple
  isPinned: integer('is_pinned').default(0),
  createdAt: text('created_at').default(timestamp),
  updatedAt: text('updated_at').default(timestamp),
}, (table) => [
  index('sticky_notes_user_id_idx').on(table.userId),
  index('sticky_notes_pinned_idx').on(table.isPinned),
]);

export const documents = sqliteTable('documents', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  fileUrl: text('file_url').notNull(),
  fileSize: integer('file_size'),
  mimeType: text('mime_type'),
  type: text('type'), // passport, visa, id, contract, invoice, voucher, photo, other
  category: text('category').default('other'), // passport, visa, invoice, itinerary, voucher, contract, photo, other
  relatedTo: text('related_to'), // contact, lead, traveller, supplier, visa_application, invoice, voucher, general
  relatedId: text('related_id'),
  description: text('description'),
  uploadedBy: text('uploaded_by').references(() => users.id),
  isDeleted: integer('is_deleted').default(0),
  createdAt: text('created_at').default(timestamp),
  updatedAt: text('updated_at').default(timestamp),
}, (table) => [
  index('documents_related_idx').on(table.relatedTo, table.relatedId),
  index('documents_type_idx').on(table.type),
  index('documents_uploaded_by_idx').on(table.uploadedBy),
  index('documents_is_deleted_idx').on(table.isDeleted),
]);

export const notifications = sqliteTable('notifications', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  title: text('title').notNull(),
  message: text('message'),
  type: text('type'), // lead_assigned, follow_up_reminder, payment_received, task_assigned, birthday, system
  referenceType: text('reference_type'), // lead, contact, invoice, task
  referenceId: text('reference_id'),
  isRead: integer('is_read').default(0),
  createdAt: text('created_at').default(timestamp),
}, (table) => [
  index('notifications_user_id_idx').on(table.userId),
  index('notifications_is_read_idx').on(table.isRead),
  index('notifications_created_at_idx').on(table.createdAt),
]);

export const pushTokens = sqliteTable('push_tokens', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  fcmToken: text('fcm_token').notNull(),
  deviceType: text('device_type'), // android, ios, web
  deviceName: text('device_name'),
  isActive: integer('is_active').default(1),
  createdAt: text('created_at').default(timestamp),
  updatedAt: text('updated_at').default(timestamp),
}, (table) => [
  index('push_tokens_user_id_idx').on(table.userId),
  index('push_tokens_is_active_idx').on(table.isActive),
]);

export const reportSnapshots = sqliteTable('report_snapshots', {
  id: text('id').primaryKey(),
  reportType: text('report_type').notNull(),
  filtersJson: text('filters_json'),
  dataJson: text('data_json'),
  generatedBy: text('generated_by').references(() => users.id),
  generatedAt: text('generated_at').default(timestamp),
}, (table) => [
  index('report_snapshots_type_idx').on(table.reportType),
  index('report_snapshots_generated_at_idx').on(table.generatedAt),
]);

// ============================================================
// ACTIVITY LOGS
// ============================================================

export const activityLogs = sqliteTable('activity_logs', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  action: text('action').notNull(), // login, logout, create, update, delete, export, import, send_message
  entityType: text('entity_type').notNull(), // user, contact, lead, invoice, etc.
  entityId: text('entity_id'),
  details: text('details'), // JSON text with additional context
  ipAddress: text('ip_address'),
  createdAt: text('created_at').default(timestamp),
}, (table) => [
  index('activity_logs_user_id_idx').on(table.userId),
  index('activity_logs_entity_type_idx').on(table.entityType),
  index('activity_logs_entity_id_idx').on(table.entityId),
  index('activity_logs_action_idx').on(table.action),
  index('activity_logs_created_at_idx').on(table.createdAt),
]);

// ============================================================
// LOGIN HISTORY
// ============================================================

export const loginHistory = sqliteTable('login_history', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  ipAddress: text('ip_address'),
  country: text('country'),
  city: text('city'),
  browser: text('browser'),
  os: text('os'),
  device: text('device'),
  userAgent: text('user_agent'),
  status: text('status').notNull(), // success, failed, locked
  failureReason: text('failure_reason'),
  createdAt: text('created_at').default(timestamp),
}, (table) => [
  index('login_history_user_id_idx').on(table.userId),
  index('login_history_status_idx').on(table.status),
  index('login_history_created_at_idx').on(table.createdAt),
  index('login_history_ip_idx').on(table.ipAddress),
]);

// ============================================================
// SETTINGS (Key-Value)
// ============================================================

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value'),
  updatedBy: text('updated_by').references(() => users.id),
  updatedAt: text('updated_at').default(timestamp),
});

// ============================================================
// LEAD FOLLOW-UP SEQUENCES (TICKET-077)
// ============================================================

export const followUpSequences = sqliteTable('follow_up_sequences', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  triggerStatus: text('trigger_status').notNull(),
  steps: text('steps').notNull(), // JSON array: [{day, type, notes, template_id?}]
  isActive: integer('is_active').default(1),
  createdBy: text('created_by').references(() => users.id),
  createdAt: text('created_at').default(timestamp),
  updatedAt: text('updated_at').default(timestamp),
}, (table) => [
  index('follow_up_sequences_trigger_status_idx').on(table.triggerStatus),
  index('follow_up_sequences_is_active_idx').on(table.isActive),
]);

// ============================================================
// EMAIL CAMPAIGNS (MILESTONE 9)
// ============================================================

export const emailCampaigns = sqliteTable('email_campaigns', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  templateId: text('template_id'), // SendGrid template ID (optional)
  subject: text('subject').notNull(),
  body: text('body'), // HTML body content
  segmentFilters: text('segment_filters'), // JSON object with filter criteria
  status: text('status').notNull(), // draft, scheduled, sending, sent, cancelled
  scheduledAt: text('scheduled_at'), // ISO timestamp for scheduled campaigns
  sentAt: text('sent_at'), // ISO timestamp when campaign was sent
  totalRecipients: integer('total_recipients').default(0),
  sentCount: integer('sent_count').default(0),
  openedCount: integer('opened_count').default(0),
  clickedCount: integer('clicked_count').default(0),
  bouncedCount: integer('bounced_count').default(0),
  unsubscribedCount: integer('unsubscribed_count').default(0),
  createdBy: text('created_by').notNull().references(() => users.id),
  createdAt: text('created_at').default(timestamp),
  updatedAt: text('updated_at').default(timestamp),
}, (table) => [
  index('email_campaigns_status_idx').on(table.status),
  index('email_campaigns_created_by_idx').on(table.createdBy),
  index('email_campaigns_created_at_idx').on(table.createdAt),
  index('email_campaigns_scheduled_at_idx').on(table.scheduledAt),
]);

// ============================================================
// EMAIL MESSAGE LOG (track individual email sends)
// ============================================================

export const emailMessageLog = sqliteTable('email_message_log', {
  id: text('id').primaryKey(),
  campaignId: text('campaign_id').references(() => emailCampaigns.id),
  contactId: text('contact_id').notNull().references(() => contacts.id),
  recipientEmail: text('recipient_email').notNull(),
  messageId: text('message_id'), // SendGrid message ID
  status: text('status').notNull(), // queued, sent, delivered, opened, clicked, bounced, dropped, unsubscribed
  openedAt: text('opened_at'),
  clickedAt: text('clicked_at'),
  bounceReason: text('bounce_reason'),
  failureReason: text('failure_reason'),
  metadata: text('metadata'), // JSON for tracking data
  createdAt: text('created_at').default(timestamp),
  updatedAt: text('updated_at').default(timestamp),
}, (table) => [
  index('email_message_log_campaign_id_idx').on(table.campaignId),
  index('email_message_log_contact_id_idx').on(table.contactId),
  index('email_message_log_status_idx').on(table.status),
  index('email_message_log_message_id_idx').on(table.messageId),
  index('email_message_log_created_at_idx').on(table.createdAt),
]);

// ============================================================
// EMAIL UNSUBSCRIBES (TICKET-155)
// ============================================================

export const unsubscribes = sqliteTable('unsubscribes', {
  id: text('id').primaryKey(),
  contactId: text('contact_id').references(() => contacts.id),
  email: text('email').notNull(),
  channel: text('channel').notNull().default('email'), // email, sms, whatsapp
  reason: text('reason'), // user_request, spam_complaint, bounce, manual
  token: text('token'), // JWT or random token for unsubscribe link
  unsubscribedAt: text('unsubscribed_at').default(timestamp),
  resubscribedAt: text('resubscribed_at'), // NULL if still unsubscribed
  createdAt: text('created_at').default(timestamp),
}, (table) => [
  index('unsubscribes_email_idx').on(table.email),
  index('unsubscribes_contact_id_idx').on(table.contactId),
  index('unsubscribes_channel_idx').on(table.channel),
  index('unsubscribes_token_idx').on(table.token),
]);

// ============================================================
// DATA IMPORT & EXPORT
// ============================================================

export const importJobs = sqliteTable('import_jobs', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull().default(''),
  importType: text('import_type').notNull(), // contacts, leads, suppliers, rate_cards, travellers
  status: text('status').notNull().default('pending'), // pending, validating, importing, completed, failed, cancelled
  fileName: text('file_name').notNull(),
  fileUrl: text('file_url').notNull(),
  fileSizeBytes: integer('file_size_bytes').notNull().default(0),
  totalRows: integer('total_rows').notNull().default(0),
  processedRows: integer('processed_rows').notNull().default(0),
  successCount: integer('success_count').notNull().default(0),
  errorCount: integer('error_count').notNull().default(0),
  duplicateCount: integer('duplicate_count').notNull().default(0),
  duplicateStrategy: text('duplicate_strategy').notNull().default('skip'), // skip, merge, create
  columnMapping: text('column_mapping'), // JSON string: { csvColumn: crmField }
  createdBy: text('created_by').notNull().references(() => users.id),
  startedAt: text('started_at'),
  completedAt: text('completed_at'),
  createdAt: text('created_at').default(timestamp),
  updatedAt: text('updated_at').default(timestamp),
}, (table) => [
  index('import_jobs_created_by_idx').on(table.createdBy),
  index('import_jobs_status_idx').on(table.status),
  index('import_jobs_tenant_id_idx').on(table.tenantId),
]);

export const importErrors = sqliteTable('import_errors', {
  id: text('id').primaryKey(),
  importJobId: text('import_job_id').notNull().references(() => importJobs.id, { onDelete: 'cascade' }),
  rowNumber: integer('row_number').notNull(),
  rowData: text('row_data').notNull(), // original row as JSON
  errors: text('errors').notNull(),   // [{ field: 'email', message: 'Invalid format' }]
  createdAt: text('created_at').default(timestamp),
}, (table) => [
  index('import_errors_job_id_idx').on(table.importJobId),
]);

export const importTemplates = sqliteTable('import_templates', {
  id: text('id').primaryKey(),
  importType: text('import_type').notNull().unique(),
  displayName: text('display_name').notNull(),
  requiredFields: text('required_fields').notNull(), // JSON array
  optionalFields: text('optional_fields').notNull(), // JSON array
  sampleFileUrl: text('sample_file_url'),
  createdAt: text('created_at').default(timestamp),
  updatedAt: text('updated_at').default(timestamp),
});

export const exportJobs = sqliteTable('export_jobs', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull().default(''),
  exportType: text('export_type').notNull().default('full'), // full, contacts, leads, etc.
  status: text('status').notNull().default('pending'), // pending, processing, completed, failed
  fileUrl: text('file_url'),
  fileSizeBytes: integer('file_size_bytes').default(0),
  recordCounts: text('record_counts'), // JSON
  createdBy: text('created_by').notNull().references(() => users.id),
  startedAt: text('started_at'),
  completedAt: text('completed_at'),
  createdAt: text('created_at').default(timestamp),
  updatedAt: text('updated_at').default(timestamp),
}, (table) => [
  index('export_jobs_created_by_idx').on(table.createdBy),
  index('export_jobs_tenant_id_idx').on(table.tenantId),
]);

// ============================================================
// MARKETING: FLYER TEMPLATES
// ============================================================

export const flyerTemplates = sqliteTable('flyer_templates', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id'),  // NULL for system templates
  name: text('name').notNull(),
  category: text('category').notNull(),  // festival, destination, offer, general
  description: text('description'),
  thumbnailUrl: text('thumbnail_url'),
  previewUrl: text('preview_url'),
  layoutJson: text('layout_json'),  // Full canvas JSON definition
  width: integer('width'),
  height: integer('height'),
  sizePreset: text('size_preset'),  // instagram_post, instagram_story, facebook_cover, whatsapp_status, custom
  placeholders: text('placeholders'),  // JSON array of editable field defs
  isSystem: integer('is_system').default(0),
  isQuickCreate: integer('is_quick_create').default(0),
  isActive: integer('is_active').default(1),
  createdBy: text('created_by').references(() => users.id),
  createdAt: text('created_at').default(timestamp),
  updatedAt: text('updated_at').default(timestamp),
}, (table) => [
  index('flyer_templates_tenant_id_idx').on(table.tenantId),
  index('flyer_templates_category_idx').on(table.category),
  index('flyer_templates_size_preset_idx').on(table.sizePreset),
  index('flyer_templates_is_system_idx').on(table.isSystem),
  index('flyer_templates_is_active_idx').on(table.isActive),
]);

export const flyerTemplateAssets = sqliteTable('flyer_template_assets', {
  id: text('id').primaryKey(),
  templateId: text('template_id').notNull().references(() => flyerTemplates.id, { onDelete: 'cascade' }),
  assetType: text('asset_type').notNull(),  // image, shape, text
  assetUrl: text('asset_url'),
  positionJson: text('position_json'),  // {x, y, width, height, rotation}
  layerOrder: integer('layer_order').default(0),
  propertiesJson: text('properties_json'),  // font, color, opacity, etc.
  createdAt: text('created_at').default(timestamp),
}, (table) => [
  index('flyer_template_assets_template_id_idx').on(table.templateId),
]);

// ============================================================
// MARKETING: IMAGE LIBRARY
// ============================================================

export const imageLibrary = sqliteTable('image_library', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id'),  // NULL for stock images
  filename: text('filename').notNull(),
  originalFilename: text('original_filename'),
  r2Key: text('r2_key').notNull(),
  thumbnailR2Key: text('thumbnail_r2_key'),
  url: text('url').notNull(),
  thumbnailUrl: text('thumbnail_url'),
  category: text('category').default('uploaded'),  // stock, uploaded, logo
  tags: text('tags'),  // JSON array
  width: integer('width'),
  height: integer('height'),
  fileSize: integer('file_size'),
  mimeType: text('mime_type'),
  uploadedBy: text('uploaded_by').references(() => users.id),
  createdAt: text('created_at').default(timestamp),
}, (table) => [
  index('image_library_tenant_id_idx').on(table.tenantId),
  index('image_library_category_idx').on(table.category),
]);

// ============================================================
// MARKETING: CONTACT SEGMENTS
// ============================================================

export const contactSegments = sqliteTable('contact_segments', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id'),
  name: text('name').notNull(),
  description: text('description'),
  filtersJson: text('filters_json'),  // JSON: FilterGroup[]
  contactCount: integer('contact_count').default(0),
  isDynamic: integer('is_dynamic').default(1),
  isDeleted: integer('is_deleted').default(0),
  createdBy: text('created_by').references(() => users.id),
  createdAt: text('created_at').default(timestamp),
  updatedAt: text('updated_at').default(timestamp),
}, (table) => [
  index('contact_segments_tenant_id_idx').on(table.tenantId),
  index('contact_segments_is_deleted_idx').on(table.isDeleted),
]);

// ============================================================
// MARKETING: TENANT BRANDING
// ============================================================

export const tenantBranding = sqliteTable('tenant_branding', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  logoUrl: text('logo_url'),
  logoR2Key: text('logo_r2_key'),  // R2 storage key for cleanup
  primaryColor: text('primary_color').default('#1976D2'),
  secondaryColor: text('secondary_color').default('#424242'),
  accentColor: text('accent_color').default('#FF9800'),
  primaryFont: text('primary_font').default('Roboto'),
  secondaryFont: text('secondary_font').default('Open Sans'),
  agencyName: text('agency_name'),
  agencyPhone: text('agency_phone'),
  agencyEmail: text('agency_email'),
  agencyWebsite: text('agency_website'),
  tagline: text('tagline'),
  createdAt: text('created_at').default(timestamp),
  updatedAt: text('updated_at').default(timestamp),
}, (table) => [
  index('tenant_branding_tenant_id_idx').on(table.tenantId),
]);

// ============================================================
// MARKETING: CAMPAIGNS
// ============================================================

export const marketingCampaigns = sqliteTable('marketing_campaigns', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id'),
  name: text('name').notNull(),
  type: text('type').notNull(),  // whatsapp, sms, email
  segmentId: text('segment_id').references(() => contactSegments.id),
  templateId: text('template_id'),
  templateVariables: text('template_variables'),  // JSON
  messageBody: text('message_body'),  // For SMS/email content
  emailSubject: text('email_subject'),  // For email campaigns
  status: text('status').default('draft'),  // draft, scheduled, sending, sent, failed, cancelled
  scheduledAt: text('scheduled_at'),
  totalRecipients: integer('total_recipients').default(0),
  sentCount: integer('sent_count').default(0),
  deliveredCount: integer('delivered_count').default(0),
  failedCount: integer('failed_count').default(0),
  openedCount: integer('opened_count').default(0),
  clickedCount: integer('clicked_count').default(0),
  createdBy: text('created_by').references(() => users.id),
  createdAt: text('created_at').default(timestamp),
  updatedAt: text('updated_at').default(timestamp),
}, (table) => [
  index('mkt_campaigns_tenant_id_idx').on(table.tenantId),
  index('mkt_campaigns_status_idx').on(table.status),
  index('mkt_campaigns_type_idx').on(table.type),
  index('mkt_campaigns_segment_id_idx').on(table.segmentId),
]);

export const campaignRecipients = sqliteTable('campaign_recipients', {
  id: text('id').primaryKey(),
  campaignId: text('campaign_id').notNull().references(() => marketingCampaigns.id, { onDelete: 'cascade' }),
  contactId: text('contact_id').references(() => contacts.id),
  phone: text('phone'),
  email: text('email'),
  status: text('status').default('pending'),  // pending, queued, sent, delivered, failed, opted_out
  errorMessage: text('error_message'),
  sentAt: text('sent_at'),
  deliveredAt: text('delivered_at'),
  createdAt: text('created_at').default(timestamp),
}, (table) => [
  index('campaign_recipients_campaign_id_idx').on(table.campaignId),
  index('campaign_recipients_status_idx').on(table.status),
]);

// ============================================================
// MARKETING: GENERATED FLYERS & SHARES
// ============================================================

export const generatedFlyers = sqliteTable('generated_flyers', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id'),
  templateId: text('template_id').references(() => flyerTemplates.id),
  name: text('name'),  // legacy; nullable since 0033 (title is the primary label)
  title: text('title'),
  contentJson: text('content_json'),  // structured form fields: headline/subheadline/offerText/etc
  imageUrl: text('image_url'),
  status: text('status').default('draft'),  // draft, published
  layoutJson: text('layout_json'),  // Final canvas state JSON
  r2Key: text('r2_key'),
  url: text('url'),
  thumbnailUrl: text('thumbnail_url'),
  format: text('format').default('png'),  // png, jpeg, pdf
  width: integer('width'),
  height: integer('height'),
  fileSize: integer('file_size'),
  createdBy: text('created_by').references(() => users.id),
  createdAt: text('created_at').default(timestamp),
  updatedAt: text('updated_at').default(timestamp),
}, (table) => [
  index('generated_flyers_tenant_id_idx').on(table.tenantId),
  index('generated_flyers_template_id_idx').on(table.templateId),
  index('generated_flyers_created_by_idx').on(table.createdBy),
]);

export const flyerShares = sqliteTable('flyer_shares', {
  id: text('id').primaryKey(),
  flyerId: text('flyer_id').notNull().references(() => generatedFlyers.id, { onDelete: 'cascade' }),
  channel: text('channel').notNull(),  // whatsapp, email, download, link
  recipientInfo: text('recipient_info'),  // phone/email/etc
  segmentId: text('segment_id').references(() => contactSegments.id),  // for segment-based sharing
  // Real columns are shared_by / shared_at (0010_marketing_tables.sql)
  sharedBy: text('shared_by').references(() => users.id),
  sharedAt: text('shared_at').default(timestamp),
}, (table) => [
  index('flyer_shares_flyer_id_idx').on(table.flyerId),
  index('flyer_shares_channel_idx').on(table.channel),
  index('flyer_shares_segment_id_idx').on(table.segmentId),
]);

// ============================================================
// MARKETING: EMAIL TEMPLATES
// ============================================================

export const emailTemplates = sqliteTable('email_templates', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id'),
  name: text('name').notNull(),
  subject: text('subject').notNull(),
  htmlBody: text('html_body').notNull(),  // Full HTML content
  textBody: text('text_body'),  // Plain text fallback
  category: text('category').default('general'),  // general, promotional, transactional, newsletter
  isSystem: integer('is_system').default(0),  // 1 = system template (not editable)
  isDeleted: integer('is_deleted').default(0),
  createdBy: text('created_by').references(() => users.id),
  createdAt: text('created_at').default(timestamp),
  updatedAt: text('updated_at').default(timestamp),
}, (table) => [
  index('email_templates_tenant_id_idx').on(table.tenantId),
  index('email_templates_category_idx').on(table.category),
  index('email_templates_is_deleted_idx').on(table.isDeleted),
]);

// ============================================================
// MARKETING: FESTIVAL CAMPAIGNS
// ============================================================

export const festivalCampaigns = sqliteTable('festival_campaigns', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id'),
  name: text('name').notNull(),  // e.g., "Diwali Offer 2026"
  festivalName: text('festival_name').notNull(),  // e.g., "Diwali"
  festivalDate: text('festival_date').notNull(),  // ISO date of the festival
  daysBefore: integer('days_before').default(3),  // Send N days before festival
  templateId: text('template_id').references(() => emailTemplates.id),
  messageBody: text('message_body'),  // For SMS/WhatsApp campaigns
  campaignType: text('campaign_type').default('whatsapp'),  // whatsapp, sms, email
  isActive: integer('is_active').default(0),  // 0=inactive, 1=active
  segmentId: text('segment_id').references(() => contactSegments.id),
  lastRunAt: text('last_run_at'),
  createdBy: text('created_by').references(() => users.id),
  createdAt: text('created_at').default(timestamp),
  updatedAt: text('updated_at').default(timestamp),
}, (table) => [
  index('festival_campaigns_tenant_id_idx').on(table.tenantId),
  index('festival_campaigns_festival_date_idx').on(table.festivalDate),
  index('festival_campaigns_is_active_idx').on(table.isActive),
]);

// ============================================================
// FLEET MANAGEMENT: VEHICLES
// ============================================================

export const vehicles = sqliteTable('vehicles', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  registrationNumber: text('registration_number').notNull(),
  type: text('type').notNull(),  // sedan, suv, muv, tempo_traveller, mini_bus, bus, luxury_coach
  make: text('make'),
  model: text('model'),
  year: integer('year'),
  seatingCapacity: integer('seating_capacity'),
  color: text('color'),
  photoUrl: text('photo_url'),
  status: text('status').default('available'),  // available, on_trip, under_maintenance, out_of_service
  insuranceExpiry: text('insurance_expiry'),
  permitExpiry: text('permit_expiry'),
  pollutionExpiry: text('pollution_expiry'),
  lastServiceDate: text('last_service_date'),
  nextServiceDue: text('next_service_due'),
  odometerKm: integer('odometer_km'),
  notes: text('notes'),
  isDeleted: integer('is_deleted').default(0),
  createdBy: text('created_by').references(() => users.id),
  createdAt: text('created_at').default(timestamp),
  updatedAt: text('updated_at').default(timestamp),
}, (table) => [
  index('vehicles_tenant_id_idx').on(table.tenantId),
  index('vehicles_registration_number_idx').on(table.registrationNumber),
  index('vehicles_status_idx').on(table.status),
  index('vehicles_type_idx').on(table.type),
  index('vehicles_is_deleted_idx').on(table.isDeleted),
  index('vehicles_created_by_idx').on(table.createdBy),
]);

export const vehicleDocuments = sqliteTable('vehicle_documents', {
  id: text('id').primaryKey(),
  vehicleId: text('vehicle_id').notNull().references(() => vehicles.id, { onDelete: 'cascade' }),
  type: text('type').notNull(),  // rc, insurance, permit, pollution
  documentNumber: text('document_number'),
  fileUrl: text('file_url'),
  fileName: text('file_name'),
  expiryDate: text('expiry_date'),
  issuedDate: text('issued_date'),
  isActive: integer('is_active').default(1),
  createdAt: text('created_at').default(timestamp),
  updatedAt: text('updated_at').default(timestamp),
}, (table) => [
  index('vehicle_documents_vehicle_id_idx').on(table.vehicleId),
  index('vehicle_documents_type_idx').on(table.type),
  index('vehicle_documents_expiry_date_idx').on(table.expiryDate),
  index('vehicle_documents_is_active_idx').on(table.isActive),
]);

export const vehicleMaintenance = sqliteTable('vehicle_maintenance', {
  id: text('id').primaryKey(),
  vehicleId: text('vehicle_id').notNull().references(() => vehicles.id, { onDelete: 'cascade' }),
  serviceType: text('service_type').notNull(),  // regular_service, oil_change, tyre_replacement, brake_service, ac_service, other
  description: text('description'),
  serviceDate: text('service_date'),
  odometerAtService: integer('odometer_at_service'),
  cost: real('cost'),
  vendorName: text('vendor_name'),
  nextServiceDueDate: text('next_service_due_date'),
  nextServiceDueKm: integer('next_service_due_km'),
  notes: text('notes'),
  createdBy: text('created_by').references(() => users.id),
  createdAt: text('created_at').default(timestamp),
}, (table) => [
  index('vehicle_maintenance_vehicle_id_idx').on(table.vehicleId),
  index('vehicle_maintenance_service_date_idx').on(table.serviceDate),
]);

// ============================================================
// FLEET MANAGEMENT: DRIVERS
// ============================================================

export const drivers = sqliteTable('drivers', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  name: text('name').notNull(),
  phone: text('phone').notNull(),
  email: text('email'),
  photoUrl: text('photo_url'),
  licenseNumber: text('license_number'),
  licenseExpiry: text('license_expiry'),
  address: text('address'),
  emergencyContactName: text('emergency_contact_name'),
  emergencyContactPhone: text('emergency_contact_phone'),
  status: text('status').default('active'),  // active, on_trip, off_duty, on_leave
  rating: real('rating').default(0),
  totalTrips: integer('total_trips').default(0),
  dateOfJoining: text('date_of_joining'),
  notes: text('notes'),
  isDeleted: integer('is_deleted').default(0),
  createdBy: text('created_by').references(() => users.id),
  createdAt: text('created_at').default(timestamp),
  updatedAt: text('updated_at').default(timestamp),
}, (table) => [
  index('drivers_tenant_id_idx').on(table.tenantId),
  index('drivers_phone_idx').on(table.phone),
  index('drivers_status_idx').on(table.status),
  index('drivers_is_deleted_idx').on(table.isDeleted),
  index('drivers_created_by_idx').on(table.createdBy),
]);

export const driverDocuments = sqliteTable('driver_documents', {
  id: text('id').primaryKey(),
  driverId: text('driver_id').notNull().references(() => drivers.id, { onDelete: 'cascade' }),
  type: text('type').notNull(),  // license, id_proof, police_verification
  documentNumber: text('document_number'),
  fileUrl: text('file_url'),
  fileName: text('file_name'),
  expiryDate: text('expiry_date'),
  issuedDate: text('issued_date'),
  isActive: integer('is_active').default(1),
  createdAt: text('created_at').default(timestamp),
  updatedAt: text('updated_at').default(timestamp),
}, (table) => [
  index('driver_documents_driver_id_idx').on(table.driverId),
  index('driver_documents_type_idx').on(table.type),
  index('driver_documents_expiry_date_idx').on(table.expiryDate),
  index('driver_documents_is_active_idx').on(table.isActive),
]);

export const driverRatings = sqliteTable('driver_ratings', {
  id: text('id').primaryKey(),
  driverId: text('driver_id').notNull().references(() => drivers.id, { onDelete: 'cascade' }),
  tripId: text('trip_id').notNull(),
  rating: integer('rating').notNull(),  // 1-5
  comments: text('comments'),
  ratedBy: text('rated_by').references(() => users.id),
  createdAt: text('created_at').default(timestamp),
}, (table) => [
  index('driver_ratings_driver_id_idx').on(table.driverId),
  index('driver_ratings_trip_id_idx').on(table.tripId),
]);

// ============================================================
// FLEET MANAGEMENT: TRIP ASSIGNMENTS
// ============================================================

export const tripAssignments = sqliteTable('trip_assignments', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  leadId: text('lead_id').references(() => leads.id),
  vehicleId: text('vehicle_id').references(() => vehicles.id),
  driverId: text('driver_id').references(() => drivers.id),
  pickupLocation: text('pickup_location'),
  dropLocation: text('drop_location'),
  pickupDatetime: text('pickup_datetime'),
  dropDatetime: text('drop_datetime'),
  status: text('status').default('assigned'),  // assigned, accepted, en_route, started, completed, cancelled
  passengerName: text('passenger_name'),
  passengerPhone: text('passenger_phone'),
  specialInstructions: text('special_instructions'),
  assignedBy: text('assigned_by').references(() => users.id),
  acceptedAt: text('accepted_at'),
  enRouteAt: text('en_route_at'),
  startedAt: text('started_at'),
  completedAt: text('completed_at'),
  cancelledAt: text('cancelled_at'),
  cancellationReason: text('cancellation_reason'),
  // M19: Check-in/check-out (via 0012_driver_app.sql)
  checkInAt: text('check_in_at'),
  checkInLat: real('check_in_lat'),
  checkInLng: real('check_in_lng'),
  checkInPhotoUrl: text('check_in_photo_url'),
  checkOutAt: text('check_out_at'),
  checkOutLat: real('check_out_lat'),
  checkOutLng: real('check_out_lng'),
  checkOutPhotoUrl: text('check_out_photo_url'),
  // M20: Trip type, costing, lat/lng, linked invoice/voucher (via 0013_vehicle_rate_cards.sql)
  tripType: text('trip_type').default('one_way'), // one_way, round_trip, airport_pickup, airport_drop, local_8h80km, local_12h120km, outstation
  rateCardId: text('rate_card_id').references(() => vehicleRateCards.id),
  estimatedDistanceKm: real('estimated_distance_km'),
  estimatedDurationMin: real('estimated_duration_min'),
  estimatedCost: real('estimated_cost'),
  estimatedBreakdown: text('estimated_breakdown'), // JSON
  actualDistanceKm: real('actual_distance_km'),
  actualDurationMin: real('actual_duration_min'),
  actualCost: real('actual_cost'),
  actualBreakdown: text('actual_breakdown'), // JSON
  costOverride: real('cost_override'),
  costOverrideReason: text('cost_override_reason'),
  pickupLat: real('pickup_lat'),
  pickupLng: real('pickup_lng'),
  dropLat: real('drop_lat'),
  dropLng: real('drop_lng'),
  contactId: text('contact_id').references(() => contacts.id),
  invoiceId: text('invoice_id').references(() => invoices.id),
  voucherId: text('voucher_id').references(() => vouchers.id),
  isDeleted: integer('is_deleted').default(0),
  createdAt: text('created_at').default(timestamp),
  updatedAt: text('updated_at').default(timestamp),
}, (table) => [
  index('trip_assignments_tenant_id_idx').on(table.tenantId),
  index('trip_assignments_lead_id_idx').on(table.leadId),
  index('trip_assignments_vehicle_id_idx').on(table.vehicleId),
  index('trip_assignments_driver_id_idx').on(table.driverId),
  index('trip_assignments_status_idx').on(table.status),
  index('trip_assignments_pickup_datetime_idx').on(table.pickupDatetime),
  index('trip_assignments_is_deleted_idx').on(table.isDeleted),
  index('trip_assignments_rate_card_id_idx').on(table.rateCardId),
  index('trip_assignments_trip_type_idx').on(table.tripType),
  index('trip_assignments_contact_id_idx').on(table.contactId),
  index('trip_assignments_invoice_id_idx').on(table.invoiceId),
]);

export const tripCosts = sqliteTable('trip_costs', {
  id: text('id').primaryKey(),
  tripId: text('trip_id').notNull().references(() => tripAssignments.id, { onDelete: 'cascade' }),
  costType: text('cost_type').notNull(),  // fuel, toll, driver_allowance, parking, other
  amount: real('amount').notNull(),
  description: text('description'),
  receiptUrl: text('receipt_url'),
  createdBy: text('created_by').references(() => users.id),
  createdAt: text('created_at').default(timestamp),
}, (table) => [
  index('trip_costs_trip_id_idx').on(table.tripId),
  index('trip_costs_cost_type_idx').on(table.costType),
]);

export const tripTimeline = sqliteTable('trip_timeline', {
  id: text('id').primaryKey(),
  tripId: text('trip_id').notNull().references(() => tripAssignments.id, { onDelete: 'cascade' }),
  status: text('status').notNull(),
  changedBy: text('changed_by').references(() => users.id),
  changedByDriver: text('changed_by_driver').references(() => drivers.id),
  latitude: real('latitude'),
  longitude: real('longitude'),
  notes: text('notes'),
  createdAt: text('created_at').default(timestamp),
}, (table) => [
  index('trip_timeline_trip_id_idx').on(table.tripId),
  index('trip_timeline_status_idx').on(table.status),
]);

// ============================================================
// DRIVER APP: AUTH & PUSH TOKENS (M19)
// ============================================================

export const driverRefreshTokens = sqliteTable('driver_refresh_tokens', {
  id: text('id').primaryKey(),
  driverId: text('driver_id').notNull().references(() => drivers.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull(),
  deviceInfo: text('device_info'),
  expiresAt: text('expires_at').notNull(),
  createdAt: text('created_at').default(timestamp),
}, (table) => [
  index('driver_refresh_tokens_driver_id_idx').on(table.driverId),
  index('driver_refresh_tokens_expires_at_idx').on(table.expiresAt),
]);

export const driverOtpLog = sqliteTable('driver_otp_log', {
  id: text('id').primaryKey(),
  phone: text('phone').notNull(),
  tenantId: text('tenant_id').notNull(),
  status: text('status').notNull().default('sent'), // sent, verified, expired, failed
  ipAddress: text('ip_address'),
  createdAt: text('created_at').default(timestamp),
}, (table) => [
  index('driver_otp_log_phone_idx').on(table.phone),
  index('driver_otp_log_created_at_idx').on(table.createdAt),
]);

export const driverPushTokens = sqliteTable('driver_push_tokens', {
  id: text('id').primaryKey(),
  driverId: text('driver_id').notNull().references(() => drivers.id, { onDelete: 'cascade' }),
  fcmToken: text('fcm_token').notNull(),
  platform: text('platform'), // android, ios
  isActive: integer('is_active').default(1),
  createdAt: text('created_at').default(timestamp),
  updatedAt: text('updated_at').default(timestamp),
}, (table) => [
  index('driver_push_tokens_driver_id_idx').on(table.driverId),
  index('driver_push_tokens_fcm_token_idx').on(table.fcmToken),
  index('driver_push_tokens_is_active_idx').on(table.isActive),
]);

// ============================================================
// FLEET MANAGEMENT: VEHICLE RATE CARDS (M20)
// ============================================================

export const vehicleRateCards = sqliteTable('vehicle_rate_cards', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  name: text('name').notNull(),
  vehicleType: text('vehicle_type').notNull(), // sedan, suv, muv, tempo_traveller, mini_bus, bus, luxury_coach
  tripType: text('trip_type').notNull(), // one_way, round_trip, airport_pickup, airport_drop, local_8h80km, local_12h120km, outstation
  baseFare: real('base_fare').notNull().default(0),
  perKmRate: real('per_km_rate').default(0),
  perHourRate: real('per_hour_rate').default(0),
  minKm: real('min_km').default(0),
  minHours: real('min_hours').default(0),
  nightCharge: real('night_charge').default(0),
  driverAllowance: real('driver_allowance').default(0),
  flatRate: real('flat_rate'), // if set, overrides per-km/per-hour calculation
  extraKmRate: real('extra_km_rate').default(0),
  extraHourRate: real('extra_hour_rate').default(0),
  tollIncluded: integer('toll_included').default(0),
  parkingIncluded: integer('parking_included').default(0),
  currency: text('currency').default('INR'),
  validFrom: text('valid_from'),
  validTo: text('valid_to'),
  notes: text('notes'),
  isActive: integer('is_active').default(1),
  isDeleted: integer('is_deleted').default(0),
  createdBy: text('created_by').references(() => users.id),
  createdAt: text('created_at').default(timestamp),
  updatedAt: text('updated_at').default(timestamp),
}, (table) => [
  index('vrc_tenant_id_idx').on(table.tenantId),
  index('vrc_vehicle_type_idx').on(table.vehicleType),
  index('vrc_trip_type_idx').on(table.tripType),
  index('vrc_type_combo_idx').on(table.vehicleType, table.tripType),
  index('vrc_is_active_idx').on(table.isActive),
  index('vrc_is_deleted_idx').on(table.isDeleted),
]);

// ============================================================
// FLEET MANAGEMENT: REMINDER LOG (avoid duplicate notifications)
// ============================================================

export const cronJobRuns = sqliteTable('cron_job_runs', {
  tenantId: text('tenant_id').notNull(),
  job: text('job').notNull(),
  periodKey: text('period_key').notNull(),
  claimedAt: text('claimed_at').notNull().default(timestamp),
}, (table) => [
  primaryKey({ columns: [table.tenantId, table.job, table.periodKey] }),
  index('cron_job_runs_claimed_idx').on(table.claimedAt),
]);

export const reminderLog = sqliteTable('reminder_log', {
  id: text('id').primaryKey(),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id').notNull(),
  reminderType: text('reminder_type').notNull(),
  sentDate: text('sent_date').notNull(),
  createdAt: text('created_at').default(timestamp),
}, (table) => [
  index('reminder_log_entity_idx').on(table.entityType, table.entityId),
  index('reminder_log_sent_date_idx').on(table.sentDate),
]);

// ============================================================
// VOIP SETTINGS (TICKET-367)
// ============================================================

export const voipSettings = sqliteTable('voip_settings', {
  id: text('id').primaryKey(),
  // Provider discriminator
  voipProvider: text('voip_provider').default('twilio'), // twilio, plivo
  // Generic provider credentials (preferred)
  providerAccountId: text('provider_account_id'),
  providerAuthToken: text('provider_auth_token'),
  providerApiKeyId: text('provider_api_key_id'),
  providerApiKeySecret: text('provider_api_key_secret'),
  providerAppId: text('provider_app_id'),
  // Legacy Twilio-specific (backward compat)
  twilioAccountSid: text('twilio_account_sid'),
  twilioAuthToken: text('twilio_auth_token'),
  twilioApiKeySid: text('twilio_api_key_sid'),
  twilioApiKeySecret: text('twilio_api_key_secret'),
  twilioTwimlAppSid: text('twilio_twiml_app_sid'),
  // Common settings
  defaultCallerId: text('default_caller_id'),
  recordingPolicy: text('recording_policy').default('all'), // all, inbound, outbound, none
  ivrEnabled: integer('ivr_enabled').default(0),
  ivrConfig: text('ivr_config'), // JSON
  businessHoursEnabled: integer('business_hours_enabled').default(0),
  businessHours: text('business_hours'), // JSON
  voicemailEnabled: integer('voicemail_enabled').default(1),
  voicemailGreetingUrl: text('voicemail_greeting_url'),
  maxRingDuration: integer('max_ring_duration').default(30),
  routingStrategy: text('routing_strategy').default('assigned'), // assigned, round_robin, least_recent
  autoCreateLeadMissedCall: integer('auto_create_lead_missed_call').default(1),
  recordingRetentionDays: integer('recording_retention_days').default(90),
  recordingStorageBytes: integer('recording_storage_bytes').default(0),
  createdAt: text('created_at').default(timestamp),
  updatedAt: text('updated_at').default(timestamp),
});

// ============================================================
// CALL LOGS (TICKET-370)
// ============================================================

export const callLogs = sqliteTable('call_logs', {
  id: text('id').primaryKey(),
  contactId: text('contact_id').references(() => contacts.id, { onDelete: 'set null' }),
  leadId: text('lead_id').references(() => leads.id, { onDelete: 'set null' }),
  direction: text('direction').notNull(), // inbound, outbound
  fromNumber: text('from_number').notNull(),
  toNumber: text('to_number').notNull(),
  durationSeconds: integer('duration_seconds').default(0),
  status: text('status').notNull().default('initiated'), // initiated, ringing, in-progress, completed, busy, no-answer, canceled, failed
  outcome: text('outcome'), // interested, not_interested, follow_up_needed, wrong_number, no_answer, voicemail
  twilioCallSid: text('twilio_call_sid'), // legacy — use providerCallId for new code
  providerCallId: text('provider_call_id'),
  recordingUrl: text('recording_url'),
  recordingR2Key: text('recording_r2_key'),
  recordingDuration: integer('recording_duration'),
  notes: text('notes'),
  ivrPath: text('ivr_path'), // JSON array of IVR digits pressed
  routedTo: text('routed_to').references(() => users.id, { onDelete: 'set null' }),
  answeredBy: text('answered_by').references(() => users.id, { onDelete: 'set null' }),
  createdBy: text('created_by').references(() => users.id), // NULL for inbound calls (no user made them)
  createdAt: text('created_at').default(timestamp),
  updatedAt: text('updated_at').default(timestamp),
}, (table) => [
  index('call_logs_contact_id_idx').on(table.contactId),
  index('call_logs_lead_id_idx').on(table.leadId),
  index('call_logs_created_by_idx').on(table.createdBy),
  index('call_logs_created_at_idx').on(table.createdAt),
  index('call_logs_status_idx').on(table.status),
  uniqueIndex('call_logs_twilio_sid_idx').on(table.twilioCallSid),
  index('call_logs_provider_call_id_idx').on(table.providerCallId),
  uniqueIndex('call_logs_provider_call_id_uniq').on(table.providerCallId).where(sql`provider_call_id IS NOT NULL`),
  index('call_logs_routed_to_idx').on(table.routedTo),
]);

// ============================================================
// TWILIO NUMBERS (TICKET-390)
// ============================================================

export const twilioNumbers = sqliteTable('twilio_numbers', {
  id: text('id').primaryKey(),
  phoneNumber: text('phone_number').notNull(),
  friendlyName: text('friendly_name'),
  twilioSid: text('twilio_sid').notNull(),
  assignedTo: text('assigned_to').references(() => users.id, { onDelete: 'set null' }),
  purpose: text('purpose').default('general'), // general, inbound, outbound, marketing
  isDefault: integer('is_default').default(0),
  monthlyCost: real('monthly_cost').default(0),
  capabilities: text('capabilities'), // JSON: {voice, sms, mms}
  createdAt: text('created_at').default(timestamp),
  updatedAt: text('updated_at').default(timestamp),
}, (table) => [
  uniqueIndex('twilio_numbers_phone_idx').on(table.phoneNumber),
  uniqueIndex('twilio_numbers_sid_idx').on(table.twilioSid),
  index('twilio_numbers_assigned_to_idx').on(table.assignedTo),
  index('twilio_numbers_is_default_idx').on(table.isDefault),
]);

// ============================================================
// VOIP NUMBERS — Generic (replaces twilio_numbers)
// ============================================================

export const voipNumbers = sqliteTable('voip_numbers', {
  id: text('id').primaryKey(),
  phoneNumber: text('phone_number').notNull(),
  friendlyName: text('friendly_name'),
  providerNumberId: text('provider_number_id').notNull(),
  provider: text('provider').default('twilio'), // twilio, plivo
  assignedTo: text('assigned_to').references(() => users.id, { onDelete: 'set null' }),
  purpose: text('purpose').default('general'), // general, inbound, outbound, marketing
  isDefault: integer('is_default').default(0),
  monthlyCost: real('monthly_cost').default(0),
  capabilities: text('capabilities'), // JSON: {voice, sms, mms}
  createdAt: text('created_at').default(timestamp),
  updatedAt: text('updated_at').default(timestamp),
}, (table) => [
  uniqueIndex('voip_numbers_phone_idx').on(table.phoneNumber),
  index('voip_numbers_provider_idx').on(table.provider),
  index('voip_numbers_assigned_to_idx').on(table.assignedTo),
  index('voip_numbers_is_default_idx').on(table.isDefault),
]);

// ============================================================
// CALL TRANSCRIPTS (TICKET-392)
// ============================================================

export const callTranscripts = sqliteTable('call_transcripts', {
  id: text('id').primaryKey(),
  callLogId: text('call_log_id').notNull().references(() => callLogs.id, { onDelete: 'cascade' }),
  fullTranscript: text('full_transcript').notNull(),
  speakerSegments: text('speaker_segments'), // JSON: [{speaker, text, start, end, confidence}]
  language: text('language').default('en'),
  confidence: real('confidence').default(0),
  wordCount: integer('word_count').default(0),
  durationSeconds: real('duration_seconds').default(0),
  transcriptionModel: text('transcription_model').default('deepgram-nova-2'),
  isEdited: integer('is_edited').default(0),
  editedBy: text('edited_by').references(() => users.id, { onDelete: 'set null' }),
  editedAt: text('edited_at'),
  createdAt: text('created_at').default(timestamp),
}, (table) => [
  uniqueIndex('call_transcripts_call_log_id_idx').on(table.callLogId),
  index('call_transcripts_language_idx').on(table.language),
  index('call_transcripts_created_at_idx').on(table.createdAt),
]);

// ============================================================
// AI CALL EXTRACTIONS (TICKET-398)
// ============================================================

export const aiCallExtractions = sqliteTable('ai_call_extractions', {
  id: text('id').primaryKey(),
  callLogId: text('call_log_id').notNull().references(() => callLogs.id, { onDelete: 'cascade' }),
  transcriptId: text('transcript_id').references(() => callTranscripts.id, { onDelete: 'set null' }),
  // Extracted lead data
  destination: text('destination'),
  travelDates: text('travel_dates'), // JSON: {from, to, flexible}
  paxCount: integer('pax_count'),
  paxDetails: text('pax_details'), // JSON: {adults, children, infants}
  budget: real('budget'),
  budgetCurrency: text('budget_currency').default('INR'),
  preferences: text('preferences'), // JSON array
  tripType: text('trip_type'), // honeymoon, family, adventure, business, etc.
  hotelPreference: text('hotel_preference'), // budget, mid-range, luxury
  mealPreference: text('meal_preference'),
  specialRequests: text('special_requests'),
  // AI analysis
  summary: text('summary'), // 3-5 bullet points
  keyTopics: text('key_topics'), // JSON array of topic strings
  actionItems: text('action_items'), // JSON: [{text, assignee?, dueDate?, completed}]
  sentiment: text('sentiment'), // positive, neutral, negative, urgent
  sentimentScore: real('sentiment_score'), // -1.0 to 1.0
  dealLikelihood: real('deal_likelihood'), // 0.0 to 1.0
  likelihoodSignals: text('likelihood_signals'), // JSON array
  coachingHints: text('coaching_hints'), // JSON array
  // Confidence and status
  overallConfidence: real('overall_confidence').default(0),
  fieldConfidences: text('field_confidences'), // JSON: {destination: 0.9, budget: 0.7, ...}
  status: text('status').default('pending'), // pending, confirmed, rejected
  reviewedBy: text('reviewed_by').references(() => users.id, { onDelete: 'set null' }),
  reviewedAt: text('reviewed_at'),
  // Link to created/updated entities
  createdLeadId: text('created_lead_id').references(() => leads.id, { onDelete: 'set null' }),
  createdContactId: text('created_contact_id').references(() => contacts.id, { onDelete: 'set null' }),
  modelUsed: text('model_used').default('claude-haiku-4-20250514'),
  tokensUsed: integer('tokens_used').default(0),
  costEstimate: real('cost_estimate').default(0),
  createdAt: text('created_at').default(timestamp),
  updatedAt: text('updated_at').default(timestamp),
}, (table) => [
  uniqueIndex('ai_extractions_call_log_id_idx').on(table.callLogId),
  index('ai_extractions_status_idx').on(table.status),
  index('ai_extractions_sentiment_idx').on(table.sentiment),
  index('ai_extractions_created_at_idx').on(table.createdAt),
]);

// ============================================================
// AI USAGE LOG (TICKET-411)
// ============================================================

export const aiUsageLog = sqliteTable('ai_usage_log', {
  id: text('id').primaryKey(),
  taskType: text('task_type').notNull(), // transcription, extraction, summary, sentiment, coaching, deal_likelihood
  modelName: text('model_name').notNull(),
  inputTokens: integer('input_tokens').default(0),
  outputTokens: integer('output_tokens').default(0),
  costEstimate: real('cost_estimate').default(0),
  callLogId: text('call_log_id').references(() => callLogs.id, { onDelete: 'set null' }),
  durationMs: integer('duration_ms').default(0),
  success: integer('success').default(1),
  errorMessage: text('error_message'),
  createdAt: text('created_at').default(timestamp),
}, (table) => [
  index('ai_usage_log_task_type_idx').on(table.taskType),
  index('ai_usage_log_created_at_idx').on(table.createdAt),
  index('ai_usage_log_call_log_id_idx').on(table.callLogId),
]);

// ============================================================
// AI CONVERSATIONS (TICKET-412)
// ============================================================

export const aiConversations = sqliteTable('ai_conversations', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  title: text('title'),
  feature: text('feature').notNull(), // lead_creation, itinerary_gen, invoice_gen, communication, search, general
  entityType: text('entity_type'), // lead, itinerary, invoice, contact
  entityId: text('entity_id'),
  messages: text('messages').notNull(), // JSON: [{role, content, timestamp}]
  totalInputTokens: integer('total_input_tokens').default(0),
  totalOutputTokens: integer('total_output_tokens').default(0),
  totalCost: real('total_cost').default(0),
  modelUsed: text('model_used'),
  isActive: integer('is_active').default(1),
  createdAt: text('created_at').default(timestamp),
  updatedAt: text('updated_at').default(timestamp),
}, (table) => [
  index('ai_conversations_user_id_idx').on(table.userId),
  index('ai_conversations_feature_idx').on(table.feature),
  index('ai_conversations_entity_idx').on(table.entityType, table.entityId),
  index('ai_conversations_created_at_idx').on(table.createdAt),
  index('ai_conversations_is_active_idx').on(table.isActive),
]);

// ============================================================
// AI GENERATED CONTENT (TICKET-413)
// ============================================================

export const aiGeneratedContent = sqliteTable('ai_generated_content', {
  id: text('id').primaryKey(),
  conversationId: text('conversation_id').references(() => aiConversations.id, { onDelete: 'set null' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  contentType: text('content_type').notNull(), // lead_extraction, itinerary, invoice, message, summary, email
  prompt: text('prompt').notNull(),
  rawOutput: text('raw_output'),
  structuredOutput: text('structured_output'), // JSON — parsed result
  entityType: text('entity_type'), // lead, itinerary, invoice, contact, follow_up
  entityId: text('entity_id'), // ID of created entity
  status: text('status').default('draft'), // draft, accepted, rejected, applied
  feedback: text('feedback'), // positive, negative, null
  feedbackNotes: text('feedback_notes'),
  modelUsed: text('model_used'),
  inputTokens: integer('input_tokens').default(0),
  outputTokens: integer('output_tokens').default(0),
  costEstimate: real('cost_estimate').default(0),
  durationMs: integer('duration_ms').default(0),
  createdAt: text('created_at').default(timestamp),
  updatedAt: text('updated_at').default(timestamp),
}, (table) => [
  index('ai_generated_content_conversation_id_idx').on(table.conversationId),
  index('ai_generated_content_user_id_idx').on(table.userId),
  index('ai_generated_content_content_type_idx').on(table.contentType),
  index('ai_generated_content_entity_idx').on(table.entityType, table.entityId),
  index('ai_generated_content_status_idx').on(table.status),
  index('ai_generated_content_created_at_idx').on(table.createdAt),
]);

// ============================================================
// AI NL QUERIES
// ============================================================

export const aiNlQueries = sqliteTable('ai_nl_queries', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  conversationId: text('conversation_id'),
  query: text('query').notNull(), // natural language question
  generatedSql: text('generated_sql'), // SQL generated by AI
  queryResult: text('query_result'), // JSON result
  aiNarrative: text('ai_narrative'), // AI's natural language answer
  entityTypes: text('entity_types'), // JSON array of entity types queried
  modelUsed: text('model_used'),
  inputTokens: integer('input_tokens').default(0),
  outputTokens: integer('output_tokens').default(0),
  costEstimate: real('cost_estimate').default(0),
  durationMs: integer('duration_ms').default(0),
  status: text('status').default('completed'), // completed, error, refused
  errorMessage: text('error_message'),
  createdAt: text('created_at').default(timestamp),
}, (table) => [
  index('ai_nl_queries_user_id_idx').on(table.userId),
  index('ai_nl_queries_conversation_id_idx').on(table.conversationId),
  index('ai_nl_queries_created_at_idx').on(table.createdAt),
]);

// ============================================================
// AI INSIGHTS & RECOMMENDATIONS
// ============================================================

export const aiInsights = sqliteTable('ai_insights', {
  id: text('id').primaryKey(),
  userId: text('user_id'), // null = company-wide
  insightType: text('insight_type').notNull(), // customer_summary, trend, anomaly, prediction, briefing
  entityType: text('entity_type'), // lead, contact, destination, team
  entityId: text('entity_id'),
  title: text('title').notNull(),
  summary: text('summary').notNull(),
  data: text('data'), // JSON structured insight data
  confidence: real('confidence'), // 0.0 - 1.0
  priority: text('priority').default('medium'), // low, medium, high, urgent
  actionable: integer('actionable').default(0), // boolean
  actionTaken: integer('action_taken').default(0), // boolean
  dismissedAt: text('dismissed_at'),
  expiresAt: text('expires_at'),
  modelUsed: text('model_used'),
  costEstimate: real('cost_estimate').default(0),
  createdAt: text('created_at').default(timestamp),
  updatedAt: text('updated_at').default(timestamp),
}, (table) => [
  index('ai_insights_user_id_idx').on(table.userId),
  index('ai_insights_insight_type_idx').on(table.insightType),
  index('ai_insights_entity_idx').on(table.entityType, table.entityId),
  index('ai_insights_priority_idx').on(table.priority),
  index('ai_insights_created_at_idx').on(table.createdAt),
]);

export const aiRecommendations = sqliteTable('ai_recommendations', {
  id: text('id').primaryKey(),
  userId: text('user_id'),
  recommendationType: text('recommendation_type').notNull(), // upsell, re_engage, prioritize, pricing, channel, timing
  entityType: text('entity_type'),
  entityId: text('entity_id'),
  title: text('title').notNull(),
  description: text('description').notNull(),
  reasoning: text('reasoning'), // AI reasoning
  impactScore: real('impact_score'), // 0.0-1.0
  confidenceScore: real('confidence_score'), // 0.0-1.0
  actionUrl: text('action_url'), // deep link for action
  status: text('status').default('active'), // active, dismissed, acted_on, expired
  dismissedAt: text('dismissed_at'),
  actedOnAt: text('acted_on_at'),
  expiresAt: text('expires_at'),
  modelUsed: text('model_used'),
  costEstimate: real('cost_estimate').default(0),
  createdAt: text('created_at').default(timestamp),
  updatedAt: text('updated_at').default(timestamp),
}, (table) => [
  index('ai_recommendations_user_id_idx').on(table.userId),
  index('ai_recommendations_type_idx').on(table.recommendationType),
  index('ai_recommendations_entity_idx').on(table.entityType, table.entityId),
  index('ai_recommendations_status_idx').on(table.status),
  index('ai_recommendations_created_at_idx').on(table.createdAt),
]);

// ============================================================
// AI LEAD SCORING
// ============================================================

export const aiLeadScores = sqliteTable('ai_lead_scores', {
  id: text('id').primaryKey(),
  leadId: text('lead_id').notNull(),
  score: integer('score').notNull(), // 0-100
  category: text('category').notNull(), // hot, warm, cold
  signals: text('signals'), // JSON array of signal contributions
  breakdown: text('breakdown'), // JSON { engagement: 25, budget: 20, ... }
  previousScore: integer('previous_score'),
  scoreChange: integer('score_change'),
  triggerEvent: text('trigger_event'), // what caused recalculation
  modelUsed: text('model_used'),
  costEstimate: real('cost_estimate').default(0),
  calculatedAt: text('calculated_at').default(timestamp),
  createdAt: text('created_at').default(timestamp),
}, (table) => [
  index('ai_lead_scores_lead_id_idx').on(table.leadId),
  index('ai_lead_scores_score_idx').on(table.score),
  index('ai_lead_scores_category_idx').on(table.category),
  index('ai_lead_scores_calculated_at_idx').on(table.calculatedAt),
]);

// ============================================================
// AI DOCUMENT OCR
// ============================================================

export const aiDocumentScans = sqliteTable('ai_document_scans', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  documentType: text('document_type').notNull(), // passport, visa_document, supplier_invoice, business_card
  imageUrl: text('image_url'), // R2 URL
  extractedData: text('extracted_data'), // JSON structured extraction
  confidence: real('confidence'), // 0.0-1.0
  entityType: text('entity_type'), // traveller, contact, invoice
  entityId: text('entity_id'), // linked entity if created
  status: text('status').default('pending'), // pending, reviewed, applied, rejected
  modelUsed: text('model_used'),
  inputTokens: integer('input_tokens').default(0),
  outputTokens: integer('output_tokens').default(0),
  costEstimate: real('cost_estimate').default(0),
  createdAt: text('created_at').default(timestamp),
  updatedAt: text('updated_at').default(timestamp),
}, (table) => [
  index('ai_document_scans_user_id_idx').on(table.userId),
  index('ai_document_scans_document_type_idx').on(table.documentType),
  index('ai_document_scans_entity_idx').on(table.entityType, table.entityId),
  index('ai_document_scans_status_idx').on(table.status),
  index('ai_document_scans_created_at_idx').on(table.createdAt),
]);

// ============================================================
// AI SMART FOLLOW-UPS
// ============================================================

export const aiFollowUpSuggestions = sqliteTable('ai_followup_suggestions', {
  id: text('id').primaryKey(),
  userId: text('user_id'),
  leadId: text('lead_id'),
  contactId: text('contact_id'),
  suggestedChannel: text('suggested_channel'), // whatsapp, email, call
  suggestedTiming: text('suggested_timing'), // ISO timestamp
  timingReasoning: text('timing_reasoning'), // why this time
  channelReasoning: text('channel_reasoning'), // why this channel
  messageContent: text('message_content'), // AI-drafted message
  escalationLevel: integer('escalation_level').default(0), // 0=normal, 1=urgent, 2=manager escalation
  isWinBack: integer('is_win_back').default(0), // boolean
  confidenceScore: real('confidence_score'),
  status: text('status').default('pending'), // pending, sent, dismissed, expired
  sentAt: text('sent_at'),
  dismissedAt: text('dismissed_at'),
  modelUsed: text('model_used'),
  costEstimate: real('cost_estimate').default(0),
  createdAt: text('created_at').default(timestamp),
}, (table) => [
  index('ai_followup_suggestions_user_id_idx').on(table.userId),
  index('ai_followup_suggestions_lead_id_idx').on(table.leadId),
  index('ai_followup_suggestions_contact_id_idx').on(table.contactId),
  index('ai_followup_suggestions_status_idx').on(table.status),
  index('ai_followup_suggestions_created_at_idx').on(table.createdAt),
]);

// ============================================================
// CHATBOT (M25)
// ============================================================

export const chatbotConfig = sqliteTable('chatbot_config', {
  id: text('id').primaryKey(),
  channel: text('channel').notNull(), // website, whatsapp
  enabled: integer('enabled').default(1), // boolean
  greeting: text('greeting'),
  businessHoursStart: text('business_hours_start'), // "09:00"
  businessHoursEnd: text('business_hours_end'), // "18:00"
  businessDays: text('business_days'), // JSON array [1,2,3,4,5]
  afterHoursMessage: text('after_hours_message'),
  qualificationQuestions: text('qualification_questions'), // JSON array
  faqEntries: text('faq_entries'), // JSON array of { question, answer }
  brandingColor: text('branding_color'),
  brandingLogo: text('branding_logo'),
  maxAutoReplies: integer('max_auto_replies').default(10),
  handoffThreshold: integer('handoff_threshold').default(5), // after N messages, offer handoff
  systemPrompt: text('system_prompt'), // custom instructions for AI
  allowedOrigins: text('allowed_origins'), // JSON array of website origins allowed to embed the widget
  createdAt: text('created_at').default(timestamp),
  updatedAt: text('updated_at').default(timestamp),
}, (table) => [
  index('chatbot_config_channel_idx').on(table.channel),
]);

export const chatbotConversations = sqliteTable('chatbot_conversations', {
  id: text('id').primaryKey(),
  channel: text('channel').notNull(), // website, whatsapp
  visitorId: text('visitor_id'), // cookie-based or phone number
  visitorName: text('visitor_name'),
  visitorEmail: text('visitor_email'),
  visitorPhone: text('visitor_phone'),
  language: text('language').default('en'),
  messages: text('messages'), // JSON array of { role, content, timestamp }
  status: text('status').default('active'), // active, handed_off, closed, qualified
  assignedUserId: text('assigned_user_id'), // if handed off
  leadId: text('lead_id'), // if lead was created
  contactId: text('contact_id'), // if matched to existing contact
  qualificationData: text('qualification_data'), // JSON extracted intent
  sentiment: text('sentiment'), // positive, neutral, negative
  messageCount: integer('message_count').default(0),
  botMessageCount: integer('bot_message_count').default(0),
  humanMessageCount: integer('human_message_count').default(0),
  totalTokens: integer('total_tokens').default(0),
  totalCost: real('total_cost').default(0),
  lastMessageAt: text('last_message_at'),
  closedAt: text('closed_at'),
  createdAt: text('created_at').default(timestamp),
  updatedAt: text('updated_at').default(timestamp),
}, (table) => [
  index('chatbot_conversations_channel_idx').on(table.channel),
  index('chatbot_conversations_visitor_id_idx').on(table.visitorId),
  index('chatbot_conversations_status_idx').on(table.status),
  index('chatbot_conversations_assigned_user_idx').on(table.assignedUserId),
  index('chatbot_conversations_lead_id_idx').on(table.leadId),
  index('chatbot_conversations_created_at_idx').on(table.createdAt),
]);

// ============================================================
// AI BUSINESS INTELLIGENCE (M26)
// ============================================================

export const aiBriefings = sqliteTable('ai_briefings', {
  id: text('id').primaryKey(),
  userId: text('user_id'), // null = company-wide
  briefingType: text('briefing_type').notNull(), // daily, weekly, monthly
  title: text('title').notNull(),
  content: text('content').notNull(), // JSON: sections array
  metrics: text('metrics'), // JSON: key metric values
  highlights: text('highlights'), // JSON: notable items
  period: text('period').notNull(), // e.g. "2026-02-28" or "2026-W09" or "2026-02"
  delivered: integer('delivered').default(0),
  deliveredVia: text('delivered_via'), // push, email, in_app
  readAt: text('read_at'),
  modelUsed: text('model_used'),
  costEstimate: real('cost_estimate').default(0),
  createdAt: text('created_at').default(timestamp),
}, (table) => [
  index('ai_briefings_user_id_idx').on(table.userId),
  index('ai_briefings_type_idx').on(table.briefingType),
  index('ai_briefings_period_idx').on(table.period),
  index('ai_briefings_created_at_idx').on(table.createdAt),
]);

export const aiBusinessHealthScores = sqliteTable('ai_business_health_scores', {
  id: text('id').primaryKey(),
  overallScore: integer('overall_score').notNull(), // 0-100
  revenueScore: integer('revenue_score'),
  pipelineScore: integer('pipeline_score'),
  customerScore: integer('customer_score'),
  teamScore: integer('team_score'),
  operationsScore: integer('operations_score'),
  breakdown: text('breakdown'), // JSON: detailed scoring
  trends: text('trends'), // JSON: score changes
  alerts: text('alerts'), // JSON: critical items
  recommendations: text('recommendations'), // JSON: top recommendations
  previousScore: integer('previous_score'),
  scoreChange: integer('score_change'),
  modelUsed: text('model_used'),
  costEstimate: real('cost_estimate').default(0),
  calculatedAt: text('calculated_at').default(timestamp),
  createdAt: text('created_at').default(timestamp),
}, (table) => [
  index('ai_health_scores_calculated_at_idx').on(table.calculatedAt),
  index('ai_health_scores_overall_idx').on(table.overallScore),
]);

export const aiCustomerSegments = sqliteTable('ai_customer_segments', {
  id: text('id').primaryKey(),
  contactId: text('contact_id').notNull(),
  segment: text('segment').notNull(), // vip, high_potential, churn_risk, seasonal, dormant, new
  confidence: real('confidence'), // 0.0-1.0
  signals: text('signals'), // JSON: factors contributing
  lifetimeValue: real('lifetime_value'),
  churnRisk: real('churn_risk'), // 0.0-1.0
  nextTripPrediction: text('next_trip_prediction'), // predicted next booking date
  preferredDestinations: text('preferred_destinations'), // JSON: top destinations
  preferredChannel: text('preferred_channel'), // whatsapp, email, call
  lastCalculatedAt: text('last_calculated_at'),
  createdAt: text('created_at').default(timestamp),
  updatedAt: text('updated_at').default(timestamp),
}, (table) => [
  index('ai_customer_segments_contact_id_idx').on(table.contactId),
  index('ai_customer_segments_segment_idx').on(table.segment),
  index('ai_customer_segments_churn_risk_idx').on(table.churnRisk),
]);

// ============================================================
// WHATSAPP CAMPAIGNS (M25)
// ============================================================

export const whatsappCampaigns = sqliteTable('whatsapp_campaigns', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  status: text('status').notNull().default('draft'), // draft, scheduled, sending, sent, paused, cancelled
  templateName: text('template_name'),
  templateContent: text('template_content').notNull(),
  templateVariables: text('template_variables'), // JSON
  audienceFilter: text('audience_filter'), // JSON
  totalRecipients: integer('total_recipients').default(0),
  sentCount: integer('sent_count').default(0),
  deliveredCount: integer('delivered_count').default(0),
  readCount: integer('read_count').default(0),
  failedCount: integer('failed_count').default(0),
  optedOutCount: integer('opted_out_count').default(0),
  scheduledAt: text('scheduled_at'),
  startedAt: text('started_at'),
  completedAt: text('completed_at'),
  createdBy: text('created_by').references(() => users.id),
  createdAt: text('created_at').default(timestamp),
  updatedAt: text('updated_at').default(timestamp),
}, (table) => [
  index('whatsapp_campaigns_status_idx').on(table.status),
  index('whatsapp_campaigns_created_by_idx').on(table.createdBy),
  index('whatsapp_campaigns_created_at_idx').on(table.createdAt),
]);

export const whatsappCampaignRecipients = sqliteTable('whatsapp_campaign_recipients', {
  id: text('id').primaryKey(),
  campaignId: text('campaign_id').notNull().references(() => whatsappCampaigns.id, { onDelete: 'cascade' }),
  contactId: text('contact_id').references(() => contacts.id),
  phone: text('phone').notNull(),
  name: text('name'),
  status: text('status').notNull().default('pending'), // pending, sent, delivered, read, failed, opted_out
  providerMessageId: text('provider_message_id'),
  errorMessage: text('error_message'),
  sentAt: text('sent_at'),
  deliveredAt: text('delivered_at'),
  readAt: text('read_at'),
  createdAt: text('created_at').default(timestamp),
}, (table) => [
  index('wa_recipients_campaign_idx').on(table.campaignId),
  index('wa_recipients_status_idx').on(table.status),
  index('wa_recipients_phone_idx').on(table.phone),
]);

// ============================================================
// AI SOCIAL CONTENT & MARKETING SUGGESTIONS (M26)
// ============================================================

export const aiSocialContent = sqliteTable('ai_social_content', {
  id: text('id').primaryKey(),
  contentType: text('content_type').notNull(), // instagram_post, facebook_post, linkedin_post, twitter_post, blog_outline
  platform: text('platform').notNull(), // instagram, facebook, linkedin, twitter, blog
  topic: text('topic').notNull(),
  prompt: text('prompt'),
  generatedText: text('generated_text').notNull(),
  hashtags: text('hashtags'), // JSON array
  mediaSuggestions: text('media_suggestions'), // JSON array
  cta: text('cta'),
  tone: text('tone').default('professional'),
  language: text('language').default('en'),
  status: text('status').default('draft'), // draft, approved, published, archived
  modelUsed: text('model_used'),
  tokensUsed: integer('tokens_used').default(0),
  costEstimate: real('cost_estimate').default(0),
  createdBy: text('created_by').references(() => users.id),
  createdAt: text('created_at').default(timestamp),
  updatedAt: text('updated_at').default(timestamp),
}, (table) => [
  index('ai_social_content_platform_idx').on(table.platform),
  index('ai_social_content_status_idx').on(table.status),
  index('ai_social_content_created_by_idx').on(table.createdBy),
  index('ai_social_content_created_at_idx').on(table.createdAt),
]);

export const aiMarketingSuggestions = sqliteTable('ai_marketing_suggestions', {
  id: text('id').primaryKey(),
  suggestionType: text('suggestion_type').notNull(), // campaign_idea, content_calendar, trending_topic, seasonal_offer, reengagement
  title: text('title').notNull(),
  description: text('description').notNull(),
  details: text('details'), // JSON
  priority: text('priority').default('medium'), // low, medium, high, urgent
  status: text('status').default('pending'), // pending, accepted, dismissed
  targetSegment: text('target_segment'),
  estimatedImpact: text('estimated_impact'),
  basis: text('basis'),
  modelUsed: text('model_used'),
  tokensUsed: integer('tokens_used').default(0),
  costEstimate: real('cost_estimate').default(0),
  createdBy: text('created_by').references(() => users.id),
  createdAt: text('created_at').default(timestamp),
  updatedAt: text('updated_at').default(timestamp),
}, (table) => [
  index('ai_mkt_suggestions_type_idx').on(table.suggestionType),
  index('ai_mkt_suggestions_status_idx').on(table.status),
  index('ai_mkt_suggestions_priority_idx').on(table.priority),
]);

// ============================================================
// AUTOMATION ENGINE + EMBEDDED ASSISTANT
// ============================================================

export const domainEvents = sqliteTable('domain_events', {
  id: text('id').primaryKey(),
  type: text('type').notNull(), // lead.created, message.received, payment.recorded, ...
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id').notNull(),
  payload: text('payload'), // JSON
  actorId: text('actor_id'), // null for public channels and schedules
  depth: integer('depth').notNull().default(0), // > 0 when caused by an automation
  processedAt: text('processed_at'),
  createdAt: text('created_at').default(timestamp),
}, (table) => [
  index('domain_events_type_idx').on(table.type),
  index('domain_events_entity_idx').on(table.entityType, table.entityId),
  index('domain_events_created_at_idx').on(table.createdAt),
]);

export const automationRules = sqliteTable('automation_rules', {
  id: text('id').primaryKey(),
  recipeKey: text('recipe_key').notNull(),
  mode: text('mode').notNull().default('suggest'), // off, suggest, auto
  settings: text('settings'), // JSON
  trigger: text('trigger'), // custom rules only
  conditions: text('conditions'), // custom rules only (JSON)
  actions: text('actions'), // custom rules only (JSON)
  updatedBy: text('updated_by'),
  createdAt: text('created_at').default(timestamp),
  updatedAt: text('updated_at').default(timestamp),
}, (table) => [
  uniqueIndex('automation_rules_recipe_key_idx').on(table.recipeKey),
]);

export const automationRuns = sqliteTable('automation_runs', {
  id: text('id').primaryKey(),
  ruleKey: text('rule_key').notNull(),
  eventId: text('event_id'),
  eventType: text('event_type'),
  entityType: text('entity_type'),
  entityId: text('entity_id'),
  outcome: text('outcome').notNull(), // suggested, applied, skipped, failed
  detail: text('detail'),
  suggestionId: text('suggestion_id'),
  durationMs: integer('duration_ms').default(0),
  createdAt: text('created_at').default(timestamp),
}, (table) => [
  index('automation_runs_rule_key_idx').on(table.ruleKey),
  index('automation_runs_created_at_idx').on(table.createdAt),
]);

export const assistantSuggestions = sqliteTable('assistant_suggestions', {
  id: text('id').primaryKey(),
  ruleKey: text('rule_key').notNull(),
  origin: text('origin').notNull().default('rule'), // rule, ai
  sourceType: text('source_type'),
  sourceId: text('source_id'),
  entityType: text('entity_type').notNull(), // where the suggestion is shown
  entityId: text('entity_id').notNull(),
  contactId: text('contact_id'),
  leadId: text('lead_id'),
  actionType: text('action_type').notNull(),
  params: text('params').notNull(), // JSON
  title: text('title').notNull(),
  reason: text('reason'),
  confidence: real('confidence'),
  risk: text('risk').notNull().default('medium'), // low, medium, high
  status: text('status').notNull().default('pending'), // pending, applying, applied, auto_applied, dismissed, undone, failed
  dedupeKey: text('dedupe_key').notNull(),
  result: text('result'), // JSON: created entities
  undo: text('undo'), // JSON: what undo needs
  error: text('error'),
  assignedTo: text('assigned_to'),
  appliedBy: text('applied_by'),
  appliedAt: text('applied_at'),
  modelUsed: text('model_used'),
  createdAt: text('created_at').default(timestamp),
  updatedAt: text('updated_at').default(timestamp),
}, (table) => [
  uniqueIndex('assistant_suggestions_dedupe_idx').on(table.dedupeKey),
  index('assistant_suggestions_entity_idx').on(table.entityType, table.entityId),
  index('assistant_suggestions_status_idx').on(table.status),
  index('assistant_suggestions_lead_idx').on(table.leadId),
  index('assistant_suggestions_contact_idx').on(table.contactId),
  index('assistant_suggestions_created_at_idx').on(table.createdAt),
]);

export const assistantMessageAnalysis = sqliteTable('assistant_message_analysis', {
  messageId: text('message_id').primaryKey(),
  intent: text('intent').notNull(), // enquiry, change_request, confirmation, payment, question, complaint, other
  urgency: text('urgency'),
  language: text('language'),
  needsWork: integer('needs_work').default(0),
  entities: text('entities'), // JSON
  draftReply: text('draft_reply'),
  summary: text('summary'),
  source: text('source').notNull().default('rules'), // rules, ai
  modelUsed: text('model_used'),
  costEstimate: real('cost_estimate').default(0),
  createdAt: text('created_at').default(timestamp),
});
