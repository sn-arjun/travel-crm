import { sqliteTable, text, real, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
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
  inviteStatus: text('invite_status').default('active'), // pending, active
  invitedAt: text('invited_at'),
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
  tags: text('tags'), // JSON array as text
  notes: text('notes'),
  source: text('source'), // manual, website, referral, ad, facebook, google
  birthday: text('birthday'),
  anniversary: text('anniversary'),
  preferredLanguage: text('preferred_language').default('en'),
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
  taxType: text('tax_type'), // gst, vat, none
  cgst: real('cgst').default(0),
  sgst: real('sgst').default(0),
  igst: real('igst').default(0),
  vatAmount: real('vat_amount').default(0),
  totalTax: real('total_tax').default(0),
  total: real('total').notNull().default(0),
  currency: text('currency').default('INR'),
  status: text('status').default('draft'), // draft, sent, paid, partially_paid, overdue, cancelled
  dueDate: text('due_date'),
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
  status: text('status').default('queued'), // queued, sent, delivered, read, failed
  externalId: text('external_id'), // Twilio SID or SendGrid message ID
  errorMessage: text('error_message'),
  sentBy: text('sent_by').references(() => users.id),
  sentAt: text('sent_at'),
  deliveredAt: text('delivered_at'),
  readAt: text('read_at'),
  createdAt: text('created_at').default(timestamp),
}, (table) => [
  index('msg_log_contact_id_idx').on(table.contactId),
  index('msg_log_lead_id_idx').on(table.leadId),
  index('msg_log_channel_idx').on(table.channel),
  index('msg_log_status_idx').on(table.status),
  index('msg_log_sent_at_idx').on(table.sentAt),
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
  type: text('type').notNull(), // lead, contact, invoice, itinerary
  referenceId: text('reference_id').notNull(),
  title: text('title'),
  createdAt: text('created_at').default(timestamp),
}, (table) => [
  index('bookmarks_user_id_idx').on(table.userId),
]);

export const stickyNotes = sqliteTable('sticky_notes', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  content: text('content'),
  color: text('color').default('#FFFDE7'),
  positionX: real('position_x').default(0),
  positionY: real('position_y').default(0),
  createdAt: text('created_at').default(timestamp),
  updatedAt: text('updated_at').default(timestamp),
}, (table) => [
  index('sticky_notes_user_id_idx').on(table.userId),
]);

export const documents = sqliteTable('documents', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  fileUrl: text('file_url').notNull(),
  fileSize: integer('file_size'),
  mimeType: text('mime_type'),
  type: text('type'), // passport, visa, id, contract, invoice, voucher, photo, other
  relatedTo: text('related_to'), // contact, lead, traveller, supplier, visa_application
  relatedId: text('related_id'),
  uploadedBy: text('uploaded_by').references(() => users.id),
  createdAt: text('created_at').default(timestamp),
}, (table) => [
  index('documents_related_idx').on(table.relatedTo, table.relatedId),
  index('documents_type_idx').on(table.type),
  index('documents_uploaded_by_idx').on(table.uploadedBy),
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
// DATA IMPORT & EXPORT
// ============================================================

export const importJobs = sqliteTable('import_jobs', {
  id: text('id').primaryKey(),
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
  layoutJson: text('layout_json'),  // Full canvas JSON definition
  width: integer('width').notNull(),
  height: integer('height').notNull(),
  sizePreset: text('size_preset').notNull(),  // instagram_post, instagram_story, facebook_cover, whatsapp_status, custom
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
  name: text('name').notNull(),
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
  sharedBy: text('shared_by').references(() => users.id),
  sharedAt: text('shared_at').default(timestamp),
}, (table) => [
  index('flyer_shares_flyer_id_idx').on(table.flyerId),
  index('flyer_shares_channel_idx').on(table.channel),
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

