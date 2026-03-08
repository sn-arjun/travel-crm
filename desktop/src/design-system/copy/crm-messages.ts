/**
 * TravelCRM Pro — UX Copy System
 * Professional, friendly, action-oriented voice.
 * Clear consequences on destructive actions. No jargon.
 */

// ─── Empty States ────────────────────────────────────────
export const emptyStates = {
  leads: {
    title: 'No leads yet',
    description: 'Start building your pipeline by adding your first lead.',
    action: 'Add lead',
  },
  contacts: {
    title: 'No contacts found',
    description: 'Contacts will appear here as you create them or import from your address book.',
    action: 'Create contact',
  },
  activities: {
    title: 'No recent activity',
    description: 'Activities like calls, emails, and meetings will be logged here automatically.',
    action: null,
  },
  trips: {
    title: 'No upcoming trips',
    description: 'Trips will appear here once you create itineraries for your clients.',
    action: 'Create itinerary',
  },
  invoices: {
    title: 'No invoices yet',
    description: 'Generate invoices from confirmed bookings to start tracking payments.',
    action: 'Create invoice',
  },
  searchResults: {
    title: 'No results found',
    description: 'Try adjusting your search terms or removing some filters.',
    action: 'Clear filters',
  },
  notifications: {
    title: 'All caught up',
    description: 'You have no new notifications. Nice work!',
    action: null,
  },
  documents: {
    title: 'No documents',
    description: 'Upload proposals, contracts, or itinerary PDFs to keep everything organized.',
    action: 'Upload document',
  },
  calendar: {
    title: 'Nothing scheduled',
    description: 'Meetings, calls, and trip dates will show up on your calendar.',
    action: 'Schedule meeting',
  },
} as const;

// ─── Validation Messages ─────────────────────────────────
export const validation = {
  required: 'This field is required.',
  email: 'Enter a valid email address.',
  phone: 'Enter a valid phone number.',
  url: 'Enter a valid URL.',
  dateRange: 'End date must be after the start date.',
  pastDate: 'Date cannot be in the past.',
  fileSize: 'File must be smaller than 10 MB.',
  fileType: 'This file type is not supported.',
  minLength: (min: number) => `Must be at least ${min} characters.`,
  maxLength: (max: number) => `Must be ${max} characters or fewer.`,
  positiveNumber: 'Enter a positive number.',
  currency: 'Enter a valid amount.',
  duplicateEmail: 'A contact with this email already exists.',
  duplicatePhone: 'A contact with this phone number already exists.',
} as const;

// ─── Placeholders ────────────────────────────────────────
export const placeholders = {
  searchLeads: 'Search by name, email, or company...',
  searchContacts: 'Find contacts...',
  searchTrips: 'Search trips or destinations...',
  searchGlobal: 'Search leads, trips, contacts...',
  addNote: 'Write a note...',
  addComment: 'Add a comment...',
  filterBy: 'Filter results...',
  emailSubject: 'Subject',
  emailBody: 'Write your message...',
  leadTitle: 'e.g. Maldives Honeymoon Package',
  contactName: 'Full name',
  companyName: 'Company or organization',
  tripDestination: 'e.g. Bali, Switzerland, Japan',
  amount: '0.00',
} as const;

// ─── Confirmation Dialogs ────────────────────────────────
export const confirmations = {
  deleteLead: {
    title: 'Delete this lead?',
    description: 'This will permanently remove the lead and all its activities. This cannot be undone.',
    confirm: 'Delete lead',
    cancel: 'Keep lead',
  },
  deleteContact: {
    title: 'Delete this contact?',
    description: 'This will remove the contact from all associated leads. This cannot be undone.',
    confirm: 'Delete contact',
    cancel: 'Keep contact',
  },
  cancelBooking: {
    title: 'Cancel this booking?',
    description: 'The client will be notified and any pending payments will need to be refunded manually.',
    confirm: 'Cancel booking',
    cancel: 'Keep booking',
  },
  discardChanges: {
    title: 'Discard unsaved changes?',
    description: 'You have unsaved changes that will be lost.',
    confirm: 'Discard',
    cancel: 'Keep editing',
  },
  archiveLead: {
    title: 'Archive this lead?',
    description: 'Archived leads are moved out of your active pipeline but can be restored later.',
    confirm: 'Archive',
    cancel: 'Cancel',
  },
} as const;

// ─── Toast / Notification Messages ───────────────────────
export const toasts = {
  leadCreated: 'Lead created successfully.',
  leadUpdated: 'Lead updated.',
  leadDeleted: 'Lead deleted.',
  leadArchived: 'Lead archived.',
  contactCreated: 'Contact created.',
  contactUpdated: 'Contact updated.',
  contactDeleted: 'Contact deleted.',
  tripCreated: 'Itinerary created.',
  tripUpdated: 'Itinerary updated.',
  invoiceSent: 'Invoice sent to client.',
  paymentReceived: 'Payment recorded.',
  noteSaved: 'Note saved.',
  fileSaved: 'File uploaded.',
  changesSaved: 'Changes saved.',
  copied: 'Copied to clipboard.',
  error: 'Something went wrong. Please try again.',
  networkError: 'Unable to connect. Check your internet connection.',
  sessionExpired: 'Your session has expired. Please sign in again.',
  permissionDenied: 'You don\'t have permission to do that.',
} as const;

// ─── Tooltips & Hints ────────────────────────────────────
export const tooltips = {
  leadPriority: {
    hot: 'High intent — needs immediate follow-up',
    warm: 'Interested — follow up within a few days',
    cold: 'Early stage — nurture over time',
  },
  pipelineStages: {
    inquiry: 'New lead, initial contact needed',
    proposal: 'Quote or proposal has been sent',
    negotiation: 'Discussing terms, dates, or pricing',
    won: 'Deal closed, booking confirmed',
    lost: 'Lead did not convert',
  },
  tripStatus: {
    draft: 'Itinerary is being planned',
    pending: 'Waiting for client confirmation',
    confirmed: 'Client has confirmed the trip',
    completed: 'Trip has been completed',
    cancelled: 'Trip was cancelled',
  },
  keyboardShortcuts: {
    search: 'Search (Ctrl+K)',
    newLead: 'New lead (Ctrl+N)',
    save: 'Save (Ctrl+S)',
    escape: 'Close (Esc)',
  },
} as const;

// ─── Button Labels ───────────────────────────────────────
export const actions = {
  save: 'Save',
  saveChanges: 'Save changes',
  cancel: 'Cancel',
  create: 'Create',
  delete: 'Delete',
  edit: 'Edit',
  archive: 'Archive',
  export: 'Export',
  import: 'Import',
  filter: 'Filter',
  clearFilters: 'Clear filters',
  viewAll: 'View all',
  loadMore: 'Load more',
  retry: 'Try again',
  signIn: 'Sign in',
  signOut: 'Sign out',
  addNote: 'Add note',
  sendQuote: 'Send quote',
  logCall: 'Log call',
  scheduleFollow: 'Schedule follow-up',
  markAsDone: 'Mark as done',
  assignTo: 'Assign to',
  moveTo: 'Move to',
} as const;

// ─── Section Labels ──────────────────────────────────────
export const sectionLabels = {
  overview: 'Overview',
  recentActivity: 'Recent Activity',
  salesPipeline: 'Sales Pipeline',
  upcomingTrips: 'Upcoming Trips',
  monthlyTarget: 'Monthly Target',
  quickActions: 'Quick Actions',
  teamPerformance: 'Team Performance',
  leadDetails: 'Lead Details',
  contactInfo: 'Contact Information',
  timeline: 'Timeline',
  documents: 'Documents',
  notes: 'Notes',
  tasks: 'Tasks',
} as const;
