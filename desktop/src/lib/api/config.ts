export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8787/api/v1';

export const API_ENDPOINTS = {
  // Auth
  auth: {
    login: '/auth/login',
    logout: '/auth/logout',
    refreshToken: '/auth/refresh-token',
    forgotPassword: '/auth/forgot-password',
    resetPassword: '/auth/reset-password',
    resolveTenant: '/auth/resolve-tenant',
    sendOtp: '/auth/send-otp',
    verifyOtp: '/auth/verify-otp',
    sessions: '/auth/sessions',
  },
  // Users
  users: {
    list: '/users',
    me: '/users/me',
    byId: (id: string) => `/users/${id}`,
  },
  // Contacts
  contacts: {
    list: '/contacts',
    create: '/contacts',
    byId: (id: string) => `/contacts/${id}`,
    timeline: (id: string) => `/contacts/${id}/timeline`,
    tags: '/contacts/tags',
    filterOptions: '/contacts/filter-options',
    checkDuplicate: '/contacts/check-duplicate',
    merge: '/contacts/merge',
    mergePreview: '/contacts/merge/preview',
    import: '/contacts/import',
    export: '/contacts/export',
    share: (id: string) => `/contacts/${id}/share`,
    upcomingOccasions: '/contacts/upcoming-occasions',
    customFields: '/contacts/custom-fields',
    customFieldById: (id: string) => `/contacts/custom-fields/${id}`,
    sharedWithMe: '/contacts/shared-with-me',
    bulkTag: '/contacts/bulk-tag',
  },
  // Leads
  leads: {
    list: '/leads',
    create: '/leads',
    byId: (id: string) => `/leads/${id}`,
    status: (id: string) => `/leads/${id}/status`,
    assign: (id: string) => `/leads/${id}/assign`,
    activities: (id: string) => `/leads/${id}/activities`,
    notes: (id: string) => `/leads/${id}/notes`,
    followUps: (id: string) => `/leads/${id}/follow-ups`,
    filterOptions: '/leads/filter-options',
    bulkAssign: '/leads/bulk-assign',
    bulkStatus: '/leads/bulk-status',
    bulkDelete: '/leads/bulk-delete',
    unassigned: '/leads/unassigned',
  },
  // Itineraries
  itineraries: {
    list: '/itineraries',
    create: '/itineraries',
    byId: (id: string) => `/itineraries/${id}`,
    clone: (id: string) => `/itineraries/${id}/clone`,
    newVersion: (id: string) => `/itineraries/${id}/new-version`,
    versions: (id: string) => `/itineraries/${id}/versions`,
    send: (id: string) => `/itineraries/${id}/send`,
    shareLink: (id: string) => `/itineraries/${id}/share-link`,
  },
  // Itinerary Templates
  itineraryTemplates: {
    list: '/itinerary-templates',
    byId: (id: string) => `/itinerary-templates/${id}`,
    create: '/itinerary-templates',
    fromItinerary: '/itinerary-templates/from-itinerary',
    createFrom: '/itinerary-templates/create-from',
  },
  // Invoices
  invoices: {
    list: '/invoices',
    create: '/invoices',
    byId: (id: string) => `/invoices/${id}`,
    payments: (id: string) => `/invoices/${id}/payments`,
    void: (id: string) => `/invoices/${id}/void`,
    duplicate: (id: string) => `/invoices/${id}/duplicate`,
    send: (id: string) => `/invoices/${id}/send`,
    summary: '/invoices/summary',
    fromItinerary: '/invoices/from-itinerary',
  },
  // Payments
  payments: {
    list: '/payments',
    create: '/payments',
    byId: (id: string) => `/payments/${id}`,
    linkInvoice: (id: string) => `/payments/${id}/link-invoice`,
  },
  // Credit Notes
  creditNotes: {
    list: '/credit-notes',
    create: '/credit-notes',
    apply: (id: string) => `/credit-notes/${id}/apply`,
  },
  // Debit Notes
  debitNotes: {
    list: '/debit-notes',
    create: '/debit-notes',
    apply: (id: string) => `/debit-notes/${id}/apply`,
  },
  // HSN Codes
  hsnCodes: {
    list: '/hsn-codes',
    create: '/hsn-codes',
  },
  // Suppliers
  suppliers: {
    list: '/suppliers',
    create: '/suppliers',
    byId: (id: string) => `/suppliers/${id}`,
    rateCards: (id: string) => `/suppliers/${id}/rate-cards`,
    payments: (id: string) => `/suppliers/${id}/payments`,
    ledger: (id: string) => `/suppliers/${id}/ledger`,
    togglePreferred: (id: string) => `/suppliers/${id}/toggle-preferred`,
    rate: (id: string) => `/suppliers/${id}/rate`,
    categorySummary: '/suppliers/categories/summary',
    compareRates: '/suppliers/compare-rates',
  },
  // Rate Cards
  rateCards: {
    list: '/rate-cards',
    create: '/rate-cards',
    byId: (id: string) => `/rate-cards/${id}`,
    lookup: '/rate-cards/lookup',
  },
  // Tasks
  tasks: {
    list: '/tasks',
    create: '/tasks',
    byId: (id: string) => `/tasks/${id}`,
    status: (id: string) => `/tasks/${id}/status`,
    subtasks: (id: string) => `/tasks/${id}/subtasks`,
    comments: (id: string) => `/tasks/${id}/comments`,
    dashboardSummary: '/tasks/dashboard/summary',
    byLead: (leadId: string) => `/tasks/leads/${leadId}/tasks`,
  },
  // Events/Planner
  events: {
    list: '/events',
    create: '/events',
    byId: (id: string) => `/events/${id}`,
    reschedule: (id: string) => `/events/${id}/reschedule`,
  },
  // Follow-ups
  followUps: {
    list: '/follow-ups',
    create: '/follow-ups',
    byId: (id: string) => `/follow-ups/${id}`,
    complete: (id: string) => `/follow-ups/${id}/complete`,
  },
  // Documents
  documents: {
    list: '/documents',
    upload: '/documents/upload',
    byId: (id: string) => `/documents/${id}`,
    download: (id: string) => `/documents/${id}/download`,
  },
  // Vouchers
  vouchers: {
    list: '/vouchers',
    create: '/vouchers',
    byId: (id: string) => `/vouchers/${id}`,
    send: (id: string) => `/vouchers/${id}/send`,
    pdf: (id: string) => `/vouchers/${id}/pdf`,
    status: (id: string) => `/vouchers/${id}/status`,
    byLead: (leadId: string) => `/vouchers/by-lead/${leadId}`,
    bulkSend: '/vouchers/bulk-send',
    fromItineraryItem: '/vouchers/from-itinerary-item',
  },
  // Visa & Travellers
  visa: {
    list: '/visa',
    create: '/visa',
    byId: (id: string) => `/visa/${id}`,
    checklist: (id: string, itemId: string) => `/visa/${id}/checklist/${itemId}`,
    notes: (id: string) => `/visa/${id}/notes`,
    documents: (id: string) => `/visa/${id}/documents`,
    documentDownload: (id: string, docId: string) => `/visa/${id}/documents/${docId}/download`,
    documentDelete: (id: string, docId: string) => `/visa/${id}/documents/${docId}`,
  },
  travellers: {
    list: '/travellers',
    create: '/travellers',
    byId: (id: string) => `/travellers/${id}`,
  },
  // Fleet
  fleet: {
    vehicles: {
      list: '/fleet/vehicles',
      create: '/fleet/vehicles',
      byId: (id: string) => `/fleet/vehicles/${id}`,
    },
    drivers: {
      list: '/fleet/drivers',
      create: '/fleet/drivers',
      byId: (id: string) => `/fleet/drivers/${id}`,
    },
    trips: {
      list: '/fleet/trips',
      create: '/fleet/trips',
      byId: (id: string) => `/fleet/trips/${id}`,
    },
    rateCards: {
      list: '/fleet/rate-cards',
      create: '/fleet/rate-cards',
      byId: (id: string) => `/fleet/rate-cards/${id}`,
    },
  },
  // Communications
  communications: {
    send: '/communications/send',
    sendTemplate: '/communications/send-template',
    sendDocument: '/communications/send-document',
    bulkSend: '/communications/bulk-send',
    history: '/communications/history',
    log: '/communications/log',
  },
  // Message Templates
  templates: {
    list: '/templates',
    create: '/templates',
    byId: (id: string) => `/templates/${id}`,
    update: (id: string) => `/templates/${id}`,
    delete: (id: string) => `/templates/${id}`,
    duplicate: (id: string) => `/templates/${id}/duplicate`,
  },
  // Quick Replies
  quickReplies: {
    list: '/settings/quick-replies',
    create: '/settings/quick-replies',
    byId: (id: string) => `/settings/quick-replies/${id}`,
    delete: (id: string) => `/settings/quick-replies/${id}`,
  },
  // Campaigns
  campaigns: {
    list: '/campaigns',
    create: '/campaigns',
    byId: (id: string) => `/campaigns/${id}`,
    send: (id: string) => `/campaigns/${id}/send`,
    schedule: (id: string) => `/campaigns/${id}/schedule`,
    cancel: (id: string) => `/campaigns/${id}/cancel`,
    recipients: (id: string) => `/campaigns/${id}/recipients`,
  },
  // Marketing
  marketing: {
    segments: '/marketing/segments',
    branding: '/marketing/branding',
    flyerTemplates: '/marketing/flyer-templates',
    flyers: '/marketing/flyers',
    images: '/marketing/images',
    socialContent: '/marketing/social-content',
    optOut: '/marketing/opt-out',
    festivals: '/marketing/festivals',
  },
  // Notifications
  notifications: {
    list: '/notifications',
    unreadCount: '/notifications/unread-count',
    readAll: '/notifications/read-all',
    read: (id: string) => `/notifications/${id}/read`,
    delete: (id: string) => `/notifications/${id}`,
    badgeCounts: '/notifications/badge-counts',
    announce: '/notifications/announce',
  },
  // Imports/Exports
  imports: {
    list: '/imports',
    upload: '/imports/upload',
    execute: (id: string) => `/imports/${id}/execute`,
    progress: (id: string) => `/imports/${id}/progress`,
    errors: (id: string) => `/imports/${id}/errors`,
    errorsDownload: (id: string) => `/imports/${id}/errors/download`,
    templates: (type: string) => `/imports/templates/${type}`,
    cancel: (id: string) => `/imports/${id}/cancel`,
  },
  exports: {
    contacts: '/exports/contacts',
    leads: '/exports/leads',
    invoicesBulkPdf: '/exports/invoices/bulk-pdf',
    full: '/exports/full',
    jobStatus: (id: string) => `/exports/jobs/${id}`,
    jobDownload: (id: string) => `/exports/jobs/${id}/download`,
  },
  // Files (R2 storage)
  files: {
    upload: '/files/upload',
    get: (key: string) => `/files/${encodeURIComponent(key)}`,
    delete: (key: string) => `/files/${encodeURIComponent(key)}`,
  },
  // Reports
  reports: {
    list: '/reports',
    dashboard: '/reports/dashboard',
    byId: (id: string) => `/reports/${id}`,
    export: (id: string) => `/reports/${id}/export`,
    outstanding: '/reports/outstanding',
    ageing: '/reports/ageing',
  },
  // AI
  ai: {
    conversations: '/ai/conversations',
    extractLead: '/ai/extract-lead',
    generateItinerary: '/ai/generate-itinerary',
    composeMessage: '/ai/compose-message',
    suggestReplies: '/ai/suggest-replies',
    extractions: '/ai/extractions',
    intelligence: {
      nlQuery: '/ai/intelligence/nl-query',
      insights: '/ai/intelligence/insights',
      recommendations: '/ai/intelligence/recommendations',
      leadScore: (id: string) => `/ai/intelligence/lead-score/${id}`,
      ocrPassport: '/ai/intelligence/ocr/passport',
      ocrVisaClassify: '/ai/intelligence/ocr/visa-classify',
      ocrSupplierInvoice: '/ai/intelligence/ocr/supplier-invoice',
      smartFollowup: (id: string) => `/ai/intelligence/smart-followup/${id}`,
    },
    bi: {
      briefings: '/ai/bi/briefings',
      healthScore: '/ai/bi/health-score',
      destinationProfitability: '/ai/bi/destination-profitability',
      seasonalDemand: '/ai/bi/seasonal-demand',
      cashFlowForecast: '/ai/bi/cash-flow-forecast',
      teamPerformance: '/ai/bi/team-performance',
      trendingDestinations: '/ai/bi/trending-destinations',
      lostDealAnalysis: '/ai/bi/lost-deal-analysis',
      leadSourceRoi: '/ai/bi/lead-source-roi',
      revenuePulse: '/ai/bi/revenue-pulse',
    },
    settings: {
      root: '/ai/settings',
      features: '/ai/settings/features',
      usage: '/ai/settings/usage',
      provider: '/ai/settings/provider',
      featureCheck: (key: string) => `/ai/settings/features/check/${key}`,
    },
  },
  // VoIP
  voip: {
    settings: '/voip/settings',
    testConnection: '/voip/test-connection',
    token: '/voip/token',
    numbers: '/voip/numbers',
    calls: '/calls',
    callById: (id: string) => `/calls/${id}`,
    outbound: '/calls/outbound',
    analytics: '/calls/analytics',
    missed: '/calls/missed',
    transcripts: '/transcripts',
  },
  // Chatbot
  chatbot: {
    config: '/chatbot/config',
    configChannel: (channel: string) => `/chatbot/config/${channel}`,
    conversations: '/chatbot/conversations',
    conversationById: (id: string) => `/chatbot/conversations/${id}`,
    reply: (id: string) => `/chatbot/conversations/${id}/reply`,
    handoff: (id: string) => `/chatbot/conversations/${id}/handoff`,
    analytics: '/chatbot/analytics',
  },
  // Settings
  settings: {
    company: '/settings/company',
    logo: '/settings/logo',
    assignmentRules: '/settings/assignment-rules',
    routingRules: '/settings/routing-rules',
    followUpSequences: '/settings/follow-up-sequences',
    invoiceDefaults: '/settings/invoice-defaults',
    itineraryDefaults: '/settings/itinerary-defaults',
    numbering: '/settings/numbering',
  },
  // Bookmarks & Notes
  bookmarks: {
    list: '/bookmarks',
    create: '/bookmarks',
    check: '/bookmarks/check',
    delete: (id: string) => `/bookmarks/${id}`,
  },
  stickyNotes: {
    list: '/sticky-notes',
    create: '/sticky-notes',
    byId: (id: string) => `/sticky-notes/${id}`,
  },
  // Activity Logs
  activityLogs: {
    list: '/activity-logs',
    byUser: (id: string) => `/activity-logs/user/${id}`,
    byEntity: (type: string, id: string) => `/activity-logs/entity/${type}/${id}`,
  },
  // Notification Preferences
  notificationPreferences: {
    me: '/notification-preferences/me',
    quietHours: '/notification-preferences/me/quiet-hours',
  },
  // Admin & Super Admin
  admin: {
    // Dashboard
    dashboard: '/admin/dashboard',
    stats: '/admin/stats',
    platformHealth: '/admin/platform/health',
    // Tenants
    tenants: '/admin/tenants',
    tenantById: (id: string) => `/admin/tenants/${id}`,
    tenantActivate: (id: string) => `/admin/tenants/${id}/activate`,
    tenantSuspend: (id: string) => `/admin/tenants/${id}/suspend`,
    tenantUpdate: (id: string) => `/admin/tenants/${id}`,
    tenantCreate: '/admin/tenants',
    // Users (across all tenants)
    allUsers: '/admin/users',
    userById: (id: string) => `/admin/users/${id}`,
    userUpdate: (id: string) => `/admin/users/${id}`,
    userDelete: (id: string) => `/admin/users/${id}`,
    userActivate: (id: string) => `/admin/users/${id}/activate`,
    userSuspend: (id: string) => `/admin/users/${id}/suspend`,
    // Plans
    plans: '/admin/plans',
    planById: (id: string) => `/admin/plans/${id}`,
    planCreate: '/admin/plans',
    planUpdate: (id: string) => `/admin/plans/${id}`,
    planDelete: (id: string) => `/admin/plans/${id}`,
    // Billing & Revenue
    billing: '/admin/billing',
    billingStats: '/admin/billing/stats',
    invoices: '/admin/billing/invoices',
    payments: '/admin/billing/payments',
    revenue: '/admin/billing/revenue',
    // System
    systemHealth: '/admin/system/health',
    systemLogs: '/admin/system/logs',
    systemMetrics: '/admin/system/metrics',
    // Configuration
    globalConfig: '/admin/config',
    configUpdate: '/admin/config',
    // Audit Logs
    auditLogs: '/admin/audit-logs',
  },
} as const;
