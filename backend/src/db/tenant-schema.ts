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
  leadId: text('lead_id').notNull().references(() => leads.id),
  title: text('title').notNull(),
  version: integer('version').default(1),
  status: text('status').default('draft'), // draft, sent, approved, rejected
  inclusions: text('inclusions'),
  exclusions: text('exclusions'),
  termsAndConditions: text('terms_and_conditions'),
  validUntil: text('valid_until'),
  totalCost: real('total_cost').default(0),
  totalSellingPrice: real('total_selling_price').default(0),
  currency: text('currency').default('INR'),
  markupType: text('markup_type'), // percentage, fixed
  markupValue: real('markup_value'),
  isTemplate: integer('is_template').default(0),
  templateName: text('template_name'),
  createdBy: text('created_by').references(() => users.id),
  createdAt: text('created_at').default(timestamp),
  updatedAt: text('updated_at').default(timestamp),
}, (table) => [
  index('itineraries_lead_id_idx').on(table.leadId),
  index('itineraries_status_idx').on(table.status),
  index('itineraries_is_template_idx').on(table.isTemplate),
]);

export const itineraryDays = sqliteTable('itinerary_days', {
  id: text('id').primaryKey(),
  itineraryId: text('itinerary_id').notNull().references(() => itineraries.id, { onDelete: 'cascade' }),
  dayNumber: integer('day_number').notNull(),
  title: text('title'),
  description: text('description'),
  city: text('city'),
  imageUrl: text('image_url'),
  sortOrder: integer('sort_order').default(0),
}, (table) => [
  index('itinerary_days_itinerary_id_idx').on(table.itineraryId),
]);

export const itineraryItems = sqliteTable('itinerary_items', {
  id: text('id').primaryKey(),
  dayId: text('day_id').notNull().references(() => itineraryDays.id, { onDelete: 'cascade' }),
  type: text('type').notNull(), // hotel, transport, activity, meal, flight, sightseeing
  title: text('title').notNull(),
  description: text('description'),
  supplierId: text('supplier_id').references(() => suppliers.id),
  cost: real('cost').default(0),
  sellingPrice: real('selling_price').default(0),
  currency: text('currency').default('INR'),
  timeStart: text('time_start'),
  timeEnd: text('time_end'),
  imageUrl: text('image_url'),
  sortOrder: integer('sort_order').default(0),
}, (table) => [
  index('itinerary_items_day_id_idx').on(table.dayId),
  index('itinerary_items_type_idx').on(table.type),
  index('itinerary_items_supplier_id_idx').on(table.supplierId),
]);

// ============================================================
// RATE CARDS
// ============================================================

export const rateCards = sqliteTable('rate_cards', {
  id: text('id').primaryKey(),
  supplierId: text('supplier_id').references(() => suppliers.id),
  serviceType: text('service_type').notNull(), // hotel, transport, activity, flight, meal, guide
  destination: text('destination'),
  name: text('name').notNull(),
  description: text('description'),
  season: text('season'), // peak, off_peak, shoulder
  cost: real('cost').notNull(),
  sellingPrice: real('selling_price'),
  currency: text('currency').default('INR'),
  unit: text('unit'), // per_person, per_room, per_vehicle, per_day
  validFrom: text('valid_from'),
  validTo: text('valid_to'),
  childPricePercent: real('child_price_percent'), // e.g., 50 means 50% of adult price
  groupDiscountJson: text('group_discount_json'), // JSON: [{min_pax: 5, discount_percent: 10}]
  createdAt: text('created_at').default(timestamp),
  updatedAt: text('updated_at').default(timestamp),
}, (table) => [
  index('rate_cards_supplier_id_idx').on(table.supplierId),
  index('rate_cards_service_type_idx').on(table.serviceType),
  index('rate_cards_destination_idx').on(table.destination),
  index('rate_cards_season_idx').on(table.season),
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
  leadId: text('lead_id').notNull().references(() => leads.id),
  type: text('type').notNull(), // hotel, transport, flight, activity
  supplierId: text('supplier_id').references(() => suppliers.id),
  detailsJson: text('details_json'), // Type-specific JSON data
  status: text('status').default('draft'), // draft, sent, confirmed
  createdBy: text('created_by').references(() => users.id),
  createdAt: text('created_at').default(timestamp),
  updatedAt: text('updated_at').default(timestamp),
}, (table) => [
  index('vouchers_lead_id_idx').on(table.leadId),
  index('vouchers_type_idx').on(table.type),
  index('vouchers_status_idx').on(table.status),
]);

// ============================================================
// TRAVELLERS
// ============================================================

export const travellers = sqliteTable('travellers', {
  id: text('id').primaryKey(),
  contactId: text('contact_id').references(() => contacts.id),
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  dateOfBirth: text('date_of_birth'),
  gender: text('gender'), // male, female, other
  nationality: text('nationality'),
  passportNumber: text('passport_number'),
  passportExpiry: text('passport_expiry'),
  passportIssuingCountry: text('passport_issuing_country'),
  frequentFlyerNumber: text('frequent_flyer_number'),
  mealPreference: text('meal_preference'),
  seatPreference: text('seat_preference'),
  medicalNotes: text('medical_notes'),
  emergencyContactName: text('emergency_contact_name'),
  emergencyContactPhone: text('emergency_contact_phone'),
  createdAt: text('created_at').default(timestamp),
  updatedAt: text('updated_at').default(timestamp),
}, (table) => [
  index('travellers_contact_id_idx').on(table.contactId),
  index('travellers_passport_expiry_idx').on(table.passportExpiry),
]);

// ============================================================
// VISA APPLICATIONS
// ============================================================

export const visaApplications = sqliteTable('visa_applications', {
  id: text('id').primaryKey(),
  travellerId: text('traveller_id').notNull().references(() => travellers.id),
  leadId: text('lead_id').references(() => leads.id),
  country: text('country').notNull(),
  visaType: text('visa_type'), // tourist, business, transit, student
  status: text('status').default('not_started'), // not_started, documents_collecting, applied, processing, approved, rejected
  appliedDate: text('applied_date'),
  resultDate: text('result_date'),
  expiryDate: text('expiry_date'),
  notes: text('notes'),
  createdAt: text('created_at').default(timestamp),
  updatedAt: text('updated_at').default(timestamp),
}, (table) => [
  index('visa_apps_traveller_id_idx').on(table.travellerId),
  index('visa_apps_lead_id_idx').on(table.leadId),
  index('visa_apps_status_idx').on(table.status),
  index('visa_apps_country_idx').on(table.country),
]);

export const visaChecklistItems = sqliteTable('visa_checklist_items', {
  id: text('id').primaryKey(),
  visaApplicationId: text('visa_application_id').notNull().references(() => visaApplications.id, { onDelete: 'cascade' }),
  documentName: text('document_name').notNull(),
  isReceived: integer('is_received').default(0),
  receivedDate: text('received_date'),
  notes: text('notes'),
  sortOrder: integer('sort_order').default(0),
}, (table) => [
  index('visa_checklist_visa_app_id_idx').on(table.visaApplicationId),
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
  country: text('country'),
  category: text('category'), // hotel, transport, airline, activity, guide, visa_agent, insurance
  gstNumber: text('gst_number'),
  panNumber: text('pan_number'),
  bankDetails: text('bank_details'), // JSON text
  rating: real('rating'),
  notes: text('notes'),
  isActive: integer('is_active').default(1),
  createdAt: text('created_at').default(timestamp),
  updatedAt: text('updated_at').default(timestamp),
}, (table) => [
  index('suppliers_category_idx').on(table.category),
  index('suppliers_city_idx').on(table.city),
  index('suppliers_is_active_idx').on(table.isActive),
]);

// ============================================================
// TASKS
// ============================================================

export const tasks = sqliteTable('tasks', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description'),
  assignedTo: text('assigned_to').references(() => users.id),
  assignedBy: text('assigned_by').references(() => users.id),
  dueDate: text('due_date'),
  priority: text('priority').default('medium'), // low, medium, high, urgent
  status: text('status').default('todo'), // todo, in_progress, done
  category: text('category'), // follow_up, voucher_creation, payment_collection, document_collection, visa_processing, general
  relatedLeadId: text('related_lead_id').references(() => leads.id),
  parentTaskId: text('parent_task_id'), // for subtasks
  createdAt: text('created_at').default(timestamp),
  updatedAt: text('updated_at').default(timestamp),
}, (table) => [
  index('tasks_assigned_to_idx').on(table.assignedTo),
  index('tasks_status_idx').on(table.status),
  index('tasks_due_date_idx').on(table.dueDate),
  index('tasks_priority_idx').on(table.priority),
  index('tasks_related_lead_id_idx').on(table.relatedLeadId),
]);

// ============================================================
// EVENTS / PLANNER
// ============================================================

export const events = sqliteTable('events', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description'),
  startDate: text('start_date').notNull(),
  endDate: text('end_date'),
  allDay: integer('all_day').default(0),
  type: text('type'), // trip, meeting, follow_up, deadline, reminder, holiday
  color: text('color'),
  relatedId: text('related_id'), // can be lead_id, task_id, etc.
  relatedType: text('related_type'), // lead, task, contact
  assignedTo: text('assigned_to').references(() => users.id),
  isRecurring: integer('is_recurring').default(0),
  recurrenceRule: text('recurrence_rule'), // RRULE format
  createdBy: text('created_by').references(() => users.id),
  createdAt: text('created_at').default(timestamp),
}, (table) => [
  index('events_start_date_idx').on(table.startDate),
  index('events_type_idx').on(table.type),
  index('events_assigned_to_idx').on(table.assignedTo),
]);

// ============================================================
// FLEET - VEHICLES
// ============================================================

export const vehicles = sqliteTable('vehicles', {
  id: text('id').primaryKey(),
  registrationNo: text('registration_no').notNull(),
  type: text('type').notNull(), // sedan, suv, muv, tempo_traveller, mini_bus, bus, luxury_coach
  make: text('make'),
  model: text('model'),
  year: integer('year'),
  capacity: integer('capacity'),
  color: text('color'),
  photoUrl: text('photo_url'),
  status: text('status').default('available'), // available, on_trip, maintenance, out_of_service
  insuranceExpiry: text('insurance_expiry'),
  permitExpiry: text('permit_expiry'),
  pollutionExpiry: text('pollution_expiry'),
  fitnessExpiry: text('fitness_expiry'),
  notes: text('notes'),
  createdAt: text('created_at').default(timestamp),
  updatedAt: text('updated_at').default(timestamp),
}, (table) => [
  uniqueIndex('vehicles_reg_no_idx').on(table.registrationNo),
  index('vehicles_type_idx').on(table.type),
  index('vehicles_status_idx').on(table.status),
]);

// ============================================================
// FLEET - DRIVERS
// ============================================================

export const drivers = sqliteTable('drivers', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  phone: text('phone').notNull(),
  email: text('email'),
  photoUrl: text('photo_url'),
  licenseNumber: text('license_number'),
  licenseExpiry: text('license_expiry'),
  address: text('address'),
  status: text('status').default('active'), // active, on_trip, off_duty, on_leave
  rating: real('rating'),
  totalTrips: integer('total_trips').default(0),
  passwordHash: text('password_hash'), // for driver app login
  currentLocationLat: real('current_location_lat'),
  currentLocationLng: real('current_location_lng'),
  createdAt: text('created_at').default(timestamp),
  updatedAt: text('updated_at').default(timestamp),
}, (table) => [
  index('drivers_status_idx').on(table.status),
  index('drivers_phone_idx').on(table.phone),
]);

// ============================================================
// FLEET - TRIP ASSIGNMENTS
// ============================================================

export const tripAssignments = sqliteTable('trip_assignments', {
  id: text('id').primaryKey(),
  leadId: text('lead_id').references(() => leads.id),
  vehicleId: text('vehicle_id').references(() => vehicles.id),
  driverId: text('driver_id').references(() => drivers.id),
  pickupLocation: text('pickup_location'),
  pickupLat: real('pickup_lat'),
  pickupLng: real('pickup_lng'),
  dropLocation: text('drop_location'),
  dropLat: real('drop_lat'),
  dropLng: real('drop_lng'),
  startTime: text('start_time'),
  endTime: text('end_time'),
  status: text('status').default('assigned'), // assigned, accepted, rejected, en_route, started, completed, cancelled
  checkInTime: text('check_in_time'),
  checkInLat: real('check_in_lat'),
  checkInLng: real('check_in_lng'),
  checkInPhotoUrl: text('check_in_photo_url'),
  checkOutTime: text('check_out_time'),
  checkOutLat: real('check_out_lat'),
  checkOutLng: real('check_out_lng'),
  checkOutPhotoUrl: text('check_out_photo_url'),
  rejectReason: text('reject_reason'),
  fuelCost: real('fuel_cost'),
  tollCost: real('toll_cost'),
  driverAllowance: real('driver_allowance'),
  parkingCost: real('parking_cost'),
  specialInstructions: text('special_instructions'),
  customerName: text('customer_name'),
  customerPhone: text('customer_phone'),
  createdBy: text('created_by').references(() => users.id),
  createdAt: text('created_at').default(timestamp),
  updatedAt: text('updated_at').default(timestamp),
}, (table) => [
  index('trip_assignments_lead_id_idx').on(table.leadId),
  index('trip_assignments_vehicle_id_idx').on(table.vehicleId),
  index('trip_assignments_driver_id_idx').on(table.driverId),
  index('trip_assignments_status_idx').on(table.status),
  index('trip_assignments_start_time_idx').on(table.startTime),
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
