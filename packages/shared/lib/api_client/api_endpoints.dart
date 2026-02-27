class ApiEndpoints {
  ApiEndpoints._();

  static const String _base = '/api/v1';

  // Health
  static const String health = '$_base/health';

  // Auth
  static const String resolveTenant = '$_base/auth/resolve-tenant';
  static const String login = '$_base/auth/login';
  static const String sendOtp = '$_base/auth/send-otp';
  static const String verifyOtp = '$_base/auth/verify-otp';
  static const String refreshToken = '$_base/auth/refresh-token';
  static const String forgotPassword = '$_base/auth/forgot-password';
  static const String resetPassword = '$_base/auth/reset-password';
  static const String setupAccount = '$_base/auth/setup-account';
  static const String logout = '$_base/auth/logout';
  static const String sessions = '$_base/auth/sessions';
  static String revokeSession(String id) => '$_base/auth/sessions/$id';
  static const String revokeAllSessions = '$_base/auth/sessions';

  // Profile
  static const String profile = '$_base/users/me';
  static const String profileAvatar = '$_base/users/me/avatar';
  static const String profileLoginHistory = '$_base/users/me/login-history';

  // Users
  static const String users = '$_base/users';
  static String user(String id) => '$_base/users/$id';
  static String userDeactivate(String id) => '$_base/users/$id/deactivate';
  static String userActivate(String id) => '$_base/users/$id/activate';
  static String userUnlock(String id) => '$_base/users/$id/unlock';
  static String userLoginHistory(String id) => '$_base/users/$id/login-history';

  // Activity Logs
  static const String activityLogs = '$_base/activity-logs';
  static String activityLogsByUser(String id) =>
      '$_base/activity-logs/user/$id';
  static String activityLogsByEntity(String type, String id) =>
      '$_base/activity-logs/entity/$type/$id';

  // Imports
  static const String imports = '$_base/imports';
  static const String importsUpload = '$_base/imports/upload';
  static String importExecute(String id) => '$_base/imports/$id/execute';
  static String importProgress(String id) => '$_base/imports/$id/progress';
  static String importErrors(String id) => '$_base/imports/$id/errors';
  static String importErrorsDownload(String id) => '$_base/imports/$id/errors/download';
  static String importTemplate(String type) => '$_base/imports/templates/$type';

  // Exports
  static const String exportsContacts = '$_base/exports/contacts';
  static const String exportsLeads = '$_base/exports/leads';
  static const String exportsInvoicesBulkPdf = '$_base/exports/invoices/bulk-pdf';
  static const String exportsFull = '$_base/exports/full';
  static String exportJob(String id) => '$_base/exports/jobs/$id';
  static String exportJobDownload(String id) => '$_base/exports/jobs/$id/download';

  // Settings
  static const String companySettings = '$_base/settings/company';
  static const String companyLogo = '$_base/settings/logo';
  static const String settingsAssignmentRules = '$_base/settings/assignment-rules';
  static const String settingsRoutingRules = '$_base/settings/routing-rules';
  static const String settingsFollowUpSequences = '$_base/settings/follow-up-sequences';
  static String settingsFollowUpSequence(String id) => '$_base/settings/follow-up-sequences/$id';

  // Contacts
  static const String contacts = '$_base/contacts';
  static String contact(String id) => '$_base/contacts/$id';
  static const String contactsImport = '$_base/contacts/import';
  static const String contactsCheckDuplicate = '$_base/contacts/check-duplicate';
  static const String contactsTags = '$_base/contacts/tags';
  static const String contactsBulkTag = '$_base/contacts/bulk-tag';
  static const String contactsExport = '$_base/contacts/export';
  static const String contactsFilterOptions = '$_base/contacts/filter-options';
  static const String contactsUpcomingOccasions = '$_base/contacts/upcoming-occasions';
  static String contactTimeline(String id) => '$_base/contacts/$id/timeline';
  static String contactShare(String id) => '$_base/contacts/$id/share';
  static const String contactsSharedWithMe = '$_base/contacts/shared-with-me';
  static const String contactsMerge = '$_base/contacts/merge';
  static const String contactsMergePreview = '$_base/contacts/merge/preview';
  static const String contactsCustomFields = '$_base/contacts/custom-fields';
  static String contactCustomField(String id) => '$_base/contacts/custom-fields/$id';

  // Leads
  static const String leads = '$_base/leads';
  static String lead(String id) => '$_base/leads/$id';
  static String leadStatus(String id) => '$_base/leads/$id/status';
  static String leadAssign(String id) => '$_base/leads/$id/assign';
  static String leadActivities(String id) => '$_base/leads/$id/activities';
  static String leadNotes(String id) => '$_base/leads/$id/notes';
  static String leadNote(String id, String noteId) => '$_base/leads/$id/notes/$noteId';
  static String leadFollowUps(String id) => '$_base/leads/$id/follow-ups';
  static const String leadsFilterOptions = '$_base/leads/filter-options';
  static const String leadsUnassigned = '$_base/leads/unassigned';
  static const String leadsBulkAssign = '$_base/leads/bulk-assign';
  static const String leadsBulkStatus = '$_base/leads/bulk-status';
  static const String leadsBulkDelete = '$_base/leads/bulk-delete';
  static const String leadsWebhook = '$_base/leads/webhook';

  // Follow-ups
  static const String followUps = '$_base/follow-ups';
  static String followUp(String id) => '$_base/follow-ups/$id';
  static String followUpComplete(String id) => '$_base/follow-ups/$id/complete';

  // Reports
  static const String reportsLeadsDashboard = '$_base/reports/dashboard';

  // Itineraries
  static const String itineraries = '$_base/itineraries';
  static String itinerary(String id) => '$_base/itineraries/$id';
  static String itineraryClone(String id) => '$_base/itineraries/$id/clone';
  static String itineraryNewVersion(String id) =>
      '$_base/itineraries/$id/new-version';
  static String itineraryVersions(String id) =>
      '$_base/itineraries/$id/versions';
  static String itinerarySend(String id) => '$_base/itineraries/$id/send';
  static String itineraryShareLink(String id) =>
      '$_base/itineraries/$id/share-link';

  // Itinerary Templates
  static const String itineraryTemplates = '$_base/itinerary-templates';
  static String itineraryTemplate(String id) =>
      '$_base/itinerary-templates/$id';
  static const String itineraryTemplateFromItinerary =
      '$_base/itinerary-templates/from-itinerary';
  static const String itineraryFromTemplate =
      '$_base/itinerary-templates/create-from';

  // Invoices
  static const String invoices = '$_base/invoices';
  static String invoice(String id) => '$_base/invoices/$id';
  static String invoicePdf(String id) => '$_base/invoices/$id/pdf';
  static String invoiceSend(String id) => '$_base/invoices/$id/send';

  // Payments
  static const String payments = '$_base/payments';
  static String payment(String id) => '$_base/payments/$id';

  // Vouchers
  static const String vouchers = '$_base/vouchers';
  static String voucher(String id) => '$_base/vouchers/$id';
  static String voucherPdf(String id) => '$_base/vouchers/$id/pdf';

  // Suppliers
  static const String suppliers = '$_base/suppliers';
  static String supplier(String id) => '$_base/suppliers/$id';
  static String supplierRateCards(String id) => '$_base/suppliers/$id/rate-cards';
  static String supplierLedger(String id) => '$_base/suppliers/$id/ledger';
  static String supplierPayments(String id) => '$_base/suppliers/$id/payments';

  // Rate Cards
  static const String rateCards = '$_base/rate-cards';
  static const String rateCardsLookup = '$_base/rate-cards/lookup';
  static String rateCard(String id) => '$_base/rate-cards/$id';

  // Exchange Rates
  static const String exchangeRates = '$_base/exchange-rates';

  // Travellers
  static const String travellers = '$_base/travellers';
  static String traveller(String id) => '$_base/travellers/$id';

  // Visa
  static const String visaApplications = '$_base/visa';
  static String visaApplication(String id) => '$_base/visa/$id';
  static String visaChecklistItem(String visaId, String itemId) => '$_base/visa/$visaId/checklist/$itemId';
  static String visaNotes(String id) => '$_base/visa/$id/notes';

  // Tasks
  static const String tasks = '$_base/tasks';
  static String task(String id) => '$_base/tasks/$id';

  // Planner/Events
  static const String events = '$_base/planner';
  static String event(String id) => '$_base/planner/$id';

  // Fleet
  static const String fleetDashboard = '$_base/fleet/dashboard';
  static const String vehicles = '$_base/fleet/vehicles';
  static String vehicle(String id) => '$_base/fleet/vehicles/$id';
  static String vehicleStatus(String id) => '$_base/fleet/vehicles/$id/status';
  static String vehiclePhoto(String id) => '$_base/fleet/vehicles/$id/photo';
  static String vehicleDocuments(String id) => '$_base/fleet/vehicles/$id/documents';
  static String vehicleDocumentDownload(String vehicleId, String docId) =>
      '$_base/fleet/vehicles/$vehicleId/documents/$docId/download';
  static String vehicleTrips(String id) => '$_base/fleet/vehicles/$id/trips';
  static String vehicleMaintenance(String id) =>
      '$_base/fleet/vehicles/$id/maintenance';
  static String vehicleOdometer(String id) =>
      '$_base/fleet/vehicles/$id/odometer';
  static String vehicleAvailability(String id) =>
      '$_base/fleet/vehicles/$id/availability';
  static const String vehiclesAvailability =
      '$_base/fleet/vehicles/availability';
  static const String maintenanceDue = '$_base/fleet/maintenance/due';
  static const String documentsExpiring = '$_base/fleet/documents/expiring';
  static const String drivers = '$_base/fleet/drivers';
  static String driver(String id) => '$_base/fleet/drivers/$id';
  static String driverStatus(String id) => '$_base/fleet/drivers/$id/status';
  static String driverRate(String id) => '$_base/fleet/drivers/$id/rate';
  static String driverDocuments(String id) =>
      '$_base/fleet/drivers/$id/documents';
  static String driverDocumentDownload(String driverId, String docId) =>
      '$_base/fleet/drivers/$driverId/documents/$docId/download';
  static String driverTrips(String id) => '$_base/fleet/drivers/$id/trips';
  static String driverSchedule(String id) =>
      '$_base/fleet/drivers/$id/schedule';
  static const String driversSchedule = '$_base/fleet/drivers/schedule';
  static const String driverDocumentsExpiring =
      '$_base/fleet/documents/drivers/expiring';
  static const String tripAssignments = '$_base/fleet/trips';
  static String tripAssignment(String id) => '$_base/fleet/trips/$id';
  static String tripStatus(String id) => '$_base/fleet/trips/$id/status';
  static String tripTimeline(String id) => '$_base/fleet/trips/$id/timeline';
  static String tripCosts(String id) => '$_base/fleet/trips/$id/costs';
  static String tripCostSummary(String id) =>
      '$_base/fleet/trips/$id/costs/summary';
  static String tripCostDelete(String tripId, String costId) =>
      '$_base/fleet/trips/$tripId/costs/$costId';
  static const String fleetCostsReport = '$_base/fleet/costs/report';
  static const String fleetAlerts = '$_base/fleet/alerts';

  // Vehicle Rate Cards (M20)
  static const String vehicleRateCards = '$_base/fleet/vehicle-rate-cards';
  static String vehicleRateCard(String id) =>
      '$_base/fleet/vehicle-rate-cards/$id';
  static const String vehicleRateCardsLookup =
      '$_base/fleet/vehicle-rate-cards/lookup';
  static const String vehicleRateCardsEstimate =
      '$_base/fleet/vehicle-rate-cards/estimate';
  static const String fleetCalculateDistance =
      '$_base/fleet/calculate-distance';
  static String tripGenerateInvoice(String id) =>
      '$_base/fleet/trips/$id/generate-invoice';
  static String tripGenerateVoucher(String id) =>
      '$_base/fleet/trips/$id/generate-voucher';

  // Communications
  static const String sendMessage = '$_base/communications/send';
  static const String bulkSend = '$_base/communications/bulk-send';
  static const String messageTemplates = '$_base/communications/templates';
  static String messageTemplate(String id) => '$_base/communications/templates/$id';
  static const String communicationHistory = '$_base/communications/history';
  static String contactHistory(String id) => '$_base/communications/history/$id';
  static const String communicationLog = '$_base/communications/log';
  static const String bulkSendStatus = '$_base/communications/bulk-send';
  static String bulkSendStatusDetail(String batchId) =>
      '$_base/communications/bulk-send/$batchId/status';

  // Campaigns
  static const String campaigns = '$_base/campaigns';
  static String campaign(String id) => '$_base/campaigns/$id';
  static String campaignSend(String id) => '$_base/campaigns/$id/send';

  // Email
  static const String emailCompose = '$_base/emails/compose';
  static const String emailSignature = '$_base/emails/signature';

  // Reports
  static const String reports = '$_base/reports';

  // Files
  static const String files = '$_base/files';
  static const String fileUpload = '$_base/files/upload';

  // Notifications
  static const String notifications = '$_base/notifications';
  static const String notificationsReadAll = '$_base/notifications/read-all';
  static String notificationRead(String id) => '$_base/notifications/$id/read';
  static String notification(String id) => '$_base/notifications/$id';
  static const String pushTokens = '$_base/notifications/push-tokens';
  static String pushToken(String token) => '$_base/notifications/push-tokens/$token';
  static const String notificationPreferences = '$_base/notifications/preferences';
  static const String notificationBadgeCounts = '$_base/notifications/badge-counts';
  static const String notificationAnnounce = '$_base/notifications/announce';

  // WebSocket
  static const String ws = '$_base/ws';

  // Marketing: Flyer Templates
  static const String flyerTemplates = '$_base/marketing/flyer-templates';
  static String flyerTemplate(String id) => '$_base/marketing/flyer-templates/$id';
  static String flyerTemplateAssets(String id) => '$_base/marketing/flyer-templates/$id/assets';
  static String flyerTemplateAsset(String templateId, String assetId) =>
      '$_base/marketing/flyer-templates/$templateId/assets/$assetId';

  // Marketing: Image Library
  static const String marketingImages = '$_base/marketing/images';
  static const String marketingImageUpload = '$_base/marketing/images/upload';
  static const String marketingLogoUpload = '$_base/marketing/images/upload-logo';
  static String marketingImage(String id) => '$_base/marketing/images/$id';

  // Marketing: Branding
  static const String marketingBranding = '$_base/marketing/branding';

  // Marketing: Segments
  static const String marketingSegments = '$_base/marketing/segments';
  static String marketingSegment(String id) => '$_base/marketing/segments/$id';
  static String marketingSegmentContacts(String id) => '$_base/marketing/segments/$id/contacts';
  static String marketingSegmentRefresh(String id) => '$_base/marketing/segments/$id/refresh-count';

  // Marketing: Campaigns
  static const String marketingCampaigns = '$_base/marketing/campaigns';
  static String marketingCampaign(String id) => '$_base/marketing/campaigns/$id';
  static String marketingCampaignSend(String id) => '$_base/marketing/campaigns/$id/send';
  static String marketingCampaignCancel(String id) => '$_base/marketing/campaigns/$id/cancel';
  static String marketingCampaignAnalytics(String id) => '$_base/marketing/campaigns/$id/analytics';
  static String marketingCampaignRecipients(String id) => '$_base/marketing/campaigns/$id/recipients';

  // Marketing: Generated Flyers
  static const String marketingFlyers = '$_base/marketing/flyers';
  static String marketingFlyer(String id) => '$_base/marketing/flyers/$id';
  static String marketingFlyerUpload(String id) => '$_base/marketing/flyers/$id/upload';
  static const String marketingFlyerShare = '$_base/marketing/flyers/share';

  // Marketing: Opt-Out
  static const String marketingOptOut = '$_base/marketing/opt-out';
  static String marketingOptOutContact(String contactId) => '$_base/marketing/opt-out/$contactId';
  static String marketingOptInContact(String contactId) => '$_base/marketing/opt-out/$contactId/opt-in';

  // ── Driver App ──────────────────────────────────────────────
  static const String driverLogin = '$_base/driver/login';
  static const String driverLoginVerify = '$_base/driver/login/verify';
  static const String driverRefreshToken = '$_base/driver/refresh';
  static const String driverLogout = '$_base/driver/logout';
  static const String driverProfile = '$_base/driver/profile';
  static const String driverProfilePhoto = '$_base/driver/profile/photo';
  static const String driverProfileDocuments = '$_base/driver/profile/documents';
  static const String driverAppTrips = '$_base/driver/trips';
  static String driverTrip(String id) => '$_base/driver/trips/$id';
  static String driverTripAccept(String id) => '$_base/driver/trips/$id/accept';
  static String driverTripReject(String id) => '$_base/driver/trips/$id/reject';
  static String driverTripStatus(String id) => '$_base/driver/trips/$id/status';
  static String driverTripCheckIn(String id) => '$_base/driver/trips/$id/check-in';
  static String driverTripCheckOut(String id) => '$_base/driver/trips/$id/check-out';
  static const String driverPushTokens = '$_base/driver/push-tokens';
  static String driverPushToken(String token) => '$_base/driver/push-tokens/$token';
}
