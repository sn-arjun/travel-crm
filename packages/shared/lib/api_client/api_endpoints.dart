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

  // Settings
  static const String companySettings = '$_base/settings/company';
  static const String companyLogo = '$_base/settings/logo';

  // Contacts
  static const String contacts = '$_base/contacts';
  static String contact(String id) => '$_base/contacts/$id';
  static const String contactsImport = '$_base/contacts/import';

  // Leads
  static const String leads = '$_base/leads';
  static String lead(String id) => '$_base/leads/$id';
  static String leadAssign(String id) => '$_base/leads/$id/assign';
  static String leadFollowUp(String id) => '$_base/leads/$id/follow-up';
  static String leadActivities(String id) => '$_base/leads/$id/activities';
  static const String leadsWebhook = '$_base/leads/webhook';

  // Itineraries
  static const String itineraries = '$_base/itineraries';
  static String itinerary(String id) => '$_base/itineraries/$id';
  static String itineraryPdf(String id) => '$_base/itineraries/$id/pdf';
  static String itinerarySend(String id) => '$_base/itineraries/$id/send';

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

  // Rate Cards
  static const String rateCards = '$_base/rate-cards';
  static String rateCard(String id) => '$_base/rate-cards/$id';

  // Travellers
  static const String travellers = '$_base/travellers';
  static String traveller(String id) => '$_base/travellers/$id';

  // Visa
  static const String visaApplications = '$_base/visa';
  static String visaApplication(String id) => '$_base/visa/$id';

  // Tasks
  static const String tasks = '$_base/tasks';
  static String task(String id) => '$_base/tasks/$id';

  // Planner/Events
  static const String events = '$_base/planner';
  static String event(String id) => '$_base/planner/$id';

  // Fleet
  static const String vehicles = '$_base/fleet/vehicles';
  static String vehicle(String id) => '$_base/fleet/vehicles/$id';
  static const String drivers = '$_base/fleet/drivers';
  static String driver(String id) => '$_base/fleet/drivers/$id';
  static const String tripAssignments = '$_base/fleet/trips';
  static String tripAssignment(String id) => '$_base/fleet/trips/$id';

  // Communications
  static const String sendMessage = '$_base/communications/send';
  static const String bulkSend = '$_base/communications/bulk-send';
  static const String messageTemplates = '$_base/communications/templates';

  // Reports
  static const String reports = '$_base/reports';

  // Files
  static const String files = '$_base/files';
  static const String fileUpload = '$_base/files/upload';

  // Notifications
  static const String notifications = '$_base/notifications';

  // WebSocket
  static const String ws = '$_base/ws';
}
