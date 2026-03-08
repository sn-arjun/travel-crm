// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for English (`en`).
class AppLocalizationsEn extends AppLocalizations {
  AppLocalizationsEn([String locale = 'en']) : super(locale);

  @override
  String get appTitle => 'TravelCRM Pro';

  @override
  String get navDashboard => 'Dashboard';

  @override
  String get navLeads => 'Leads';

  @override
  String get navContacts => 'Contacts';

  @override
  String get navItineraries => 'Itineraries';

  @override
  String get navInvoices => 'Invoices';

  @override
  String get navCalendar => 'Calendar';

  @override
  String get navTasks => 'Tasks';

  @override
  String get navReports => 'Reports';

  @override
  String get navSettings => 'Settings';

  @override
  String get navCommunications => 'Communications';

  @override
  String get navVouchers => 'Vouchers';

  @override
  String get navVisa => 'Visa & Travellers';

  @override
  String get navPlanner => 'Planner';

  @override
  String get navFleet => 'Fleet';

  @override
  String get navMarketing => 'Marketing';

  @override
  String get navSuppliers => 'Suppliers';

  @override
  String get navBookmarks => 'Bookmarks';

  @override
  String get navNotifications => 'Notifications';

  @override
  String get leadStatusNew => 'New';

  @override
  String get leadStatusContacted => 'Contacted';

  @override
  String get leadStatusRequirementGathered => 'Requirement Gathered';

  @override
  String get leadStatusProposalSent => 'Proposal Sent';

  @override
  String get leadStatusNegotiation => 'Negotiation';

  @override
  String get leadStatusBookingConfirmed => 'Booking Confirmed';

  @override
  String get leadStatusCompleted => 'Completed';

  @override
  String get leadStatusLost => 'Lost';

  @override
  String get leadPriorityHot => 'Hot';

  @override
  String get leadPriorityWarm => 'Warm';

  @override
  String get leadPriorityCold => 'Cold';

  @override
  String get invoiceStatusDraft => 'Draft';

  @override
  String get invoiceStatusSent => 'Sent';

  @override
  String get invoiceStatusPartiallyPaid => 'Partially Paid';

  @override
  String get invoiceStatusPaid => 'Paid';

  @override
  String get invoiceStatusOverdue => 'Overdue';

  @override
  String get invoiceStatusVoid => 'Void';

  @override
  String get invoiceStatusCancelled => 'Cancelled';

  @override
  String get commonSave => 'Save';

  @override
  String get commonCancel => 'Cancel';

  @override
  String get commonDelete => 'Delete';

  @override
  String get commonEdit => 'Edit';

  @override
  String get commonSearch => 'Search';

  @override
  String get commonFilter => 'Filter';

  @override
  String get commonLoading => 'Loading...';

  @override
  String get commonRetry => 'Retry';

  @override
  String get commonConfirm => 'Confirm';

  @override
  String get commonClose => 'Close';

  @override
  String get commonAdd => 'Add';

  @override
  String get commonCreate => 'Create';

  @override
  String get commonUpdate => 'Update';

  @override
  String get commonSubmit => 'Submit';

  @override
  String get commonBack => 'Back';

  @override
  String get commonNext => 'Next';

  @override
  String get commonDone => 'Done';

  @override
  String get commonClear => 'Clear';

  @override
  String get commonAll => 'All';

  @override
  String get commonNone => 'None';

  @override
  String get commonYes => 'Yes';

  @override
  String get commonNo => 'No';

  @override
  String get commonOk => 'OK';

  @override
  String get commonApply => 'Apply';

  @override
  String get commonReset => 'Reset';

  @override
  String get commonRefresh => 'Refresh';

  @override
  String get commonShare => 'Share';

  @override
  String get commonDownload => 'Download';

  @override
  String get commonUpload => 'Upload';

  @override
  String get commonExport => 'Export';

  @override
  String get commonImport => 'Import';

  @override
  String get commonMore => 'More';

  @override
  String get commonView => 'View';

  @override
  String get commonCopy => 'Copy';

  @override
  String get commonSend => 'Send';

  @override
  String get commonSaved => 'Saved';

  @override
  String get commonDeleted => 'Deleted';

  @override
  String get commonNoData => 'No data found';

  @override
  String get commonError => 'Something went wrong';

  @override
  String get commonSuccess => 'Success';

  @override
  String get commonCopied => 'Copied to clipboard';

  @override
  String get commonRequired => 'Required';

  @override
  String get commonOptional => 'Optional';

  @override
  String get commonActions => 'Actions';

  @override
  String get commonViewAll => 'View All';

  @override
  String get commonShowMore => 'Show More';

  @override
  String get commonShowLess => 'Show Less';

  @override
  String get formFieldRequired => 'This field is required';

  @override
  String get formFieldInvalidEmail => 'Please enter a valid email address';

  @override
  String get formFieldInvalidPhone => 'Please enter a valid phone number';

  @override
  String get formFieldTooLong => 'This field is too long';

  @override
  String formFieldMinLength(int min) {
    return 'Minimum $min characters required';
  }

  @override
  String get errorNetwork => 'Network error. Please check your connection.';

  @override
  String get errorServer => 'Server error. Please try again later.';

  @override
  String get errorUnauthorized => 'Session expired. Please log in again.';

  @override
  String get errorForbidden =>
      'You don\'t have permission to perform this action.';

  @override
  String get errorNotFound => 'The requested item was not found.';

  @override
  String get errorTimeout => 'Request timed out. Please try again.';

  @override
  String get errorGeneric => 'Something went wrong. Please try again.';

  @override
  String get loginTitle => 'Sign In';

  @override
  String get loginEmail => 'Email Address';

  @override
  String get loginPassword => 'Password';

  @override
  String get loginPhone => 'Phone Number';

  @override
  String get loginOtp => 'Enter OTP';

  @override
  String get loginButton => 'Sign In';

  @override
  String get loginForgotPassword => 'Forgot Password?';

  @override
  String get loginWithOtp => 'Sign in with OTP';

  @override
  String get loginWithPassword => 'Sign in with Password';

  @override
  String get authLogin => 'Log In';

  @override
  String get authLogout => 'Log Out';

  @override
  String get authEmail => 'Email';

  @override
  String get authPassword => 'Password';

  @override
  String get authForgotPassword => 'Forgot Password?';

  @override
  String get authRememberMe => 'Remember Me';

  @override
  String get authLoginWithOtp => 'Login with OTP';

  @override
  String get authSendOtp => 'Send OTP';

  @override
  String get authVerifyOtp => 'Verify OTP';

  @override
  String get authResetPassword => 'Reset Password';

  @override
  String get authNewPassword => 'New Password';

  @override
  String get authConfirmPassword => 'Confirm Password';

  @override
  String dashboardWelcome(String name) {
    return 'Welcome back, $name!';
  }

  @override
  String get dashboardTotalLeads => 'Total Leads';

  @override
  String get dashboardActiveLeads => 'Active Leads';

  @override
  String get dashboardRevenue => 'Revenue';

  @override
  String get dashboardConversion => 'Conversion Rate';

  @override
  String get dashboardTodaysFollowups => 'Today\'s Follow-ups';

  @override
  String get dashboardRecentActivity => 'Recent Activity';

  @override
  String get dashboardQuickActions => 'Quick Actions';

  @override
  String get leadTitle => 'Title';

  @override
  String get leadDestination => 'Destination';

  @override
  String get leadTravelDates => 'Travel Dates';

  @override
  String get leadTravelDate => 'Travel Date';

  @override
  String get leadReturnDate => 'Return Date';

  @override
  String get leadPaxAdults => 'Adults';

  @override
  String get leadPaxChildren => 'Children';

  @override
  String get leadPaxInfants => 'Infants';

  @override
  String get leadTripType => 'Trip Type';

  @override
  String get leadBudget => 'Budget';

  @override
  String get leadSource => 'Source';

  @override
  String get leadStatus => 'Status';

  @override
  String get leadPriority => 'Priority';

  @override
  String get leadAssignedTo => 'Assigned To';

  @override
  String get leadNotes => 'Notes';

  @override
  String get leadCreateNew => 'Create New Lead';

  @override
  String get leadEditLead => 'Edit Lead';

  @override
  String get leadDeleteConfirm => 'Are you sure you want to delete this lead?';

  @override
  String get leadNoLeadsFound => 'No leads found';

  @override
  String get leadsTitle => 'Leads';

  @override
  String get leadsAdd => 'Add Lead';

  @override
  String get leadPipeline => 'Pipeline';

  @override
  String get leadFollowups => 'Follow-ups';

  @override
  String get leadTimeline => 'Timeline';

  @override
  String get contactName => 'Name';

  @override
  String get contactEmail => 'Email';

  @override
  String get contactPhone => 'Phone';

  @override
  String get contactCompany => 'Company';

  @override
  String get contactType => 'Type';

  @override
  String get contactAddress => 'Address';

  @override
  String get contactCity => 'City';

  @override
  String get contactCountry => 'Country';

  @override
  String get contactCreateNew => 'Create New Contact';

  @override
  String get contactEditContact => 'Edit Contact';

  @override
  String get contactDeleteConfirm =>
      'Are you sure you want to delete this contact?';

  @override
  String get contactNoContactsFound => 'No contacts found';

  @override
  String get contactsTitle => 'Contacts';

  @override
  String get contactsAdd => 'Add Contact';

  @override
  String get contactTypeCustomer => 'Customer';

  @override
  String get contactTypeSupplier => 'Supplier';

  @override
  String get contactTypeAgent => 'Agent';

  @override
  String get contactTypePartner => 'Partner';

  @override
  String get contactTags => 'Tags';

  @override
  String get contactSource => 'Source';

  @override
  String get contactNotes => 'Notes';

  @override
  String get contactBirthday => 'Birthday';

  @override
  String get contactAnniversary => 'Anniversary';

  @override
  String get itineraryTitle => 'Title';

  @override
  String itineraryDays(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count days',
      one: '1 day',
    );
    return '$_temp0';
  }

  @override
  String get itineraryCreateNew => 'Create New Itinerary';

  @override
  String get itineraryNoItinerariesFound => 'No itineraries found';

  @override
  String get invoiceNumber => 'Invoice #';

  @override
  String get invoiceDate => 'Invoice Date';

  @override
  String get invoiceDueDate => 'Due Date';

  @override
  String get invoiceAmount => 'Amount';

  @override
  String get invoiceTax => 'Tax';

  @override
  String get invoiceTotal => 'Total';

  @override
  String get invoiceCreateNew => 'Create New Invoice';

  @override
  String get invoiceNoInvoicesFound => 'No invoices found';

  @override
  String get invoiceTitle => 'Invoices';

  @override
  String get invoiceAdd => 'Create Invoice';

  @override
  String get invoiceSubtotal => 'Subtotal';

  @override
  String get invoiceStatus => 'Status';

  @override
  String get invoicePaid => 'Paid';

  @override
  String get invoiceBalance => 'Balance Due';

  @override
  String get settingsProfile => 'Profile';

  @override
  String get settingsTeam => 'Team Management';

  @override
  String get settingsCompany => 'Company Settings';

  @override
  String get settingsLanguage => 'Language';

  @override
  String get settingsNotifications => 'Notification Preferences';

  @override
  String get settingsSecurity => 'Security';

  @override
  String get settingsSessions => 'Active Sessions';

  @override
  String get settingsLoginHistory => 'Login History';

  @override
  String get settingsDataExport => 'Data Export';

  @override
  String get settingsTitle => 'Settings';

  @override
  String get settingsTheme => 'Theme';

  @override
  String get settingsLogout => 'Logout';

  @override
  String get offlineMode => 'You are offline';

  @override
  String get offlineSyncing => 'Syncing changes...';

  @override
  String offlinePendingActions(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count pending actions',
      one: '1 pending action',
    );
    return '$_temp0';
  }

  @override
  String get deleteConfirmTitle => 'Confirm Delete';

  @override
  String get deleteConfirmMessage => 'This action cannot be undone.';

  @override
  String paginationShowing(int start, int end, int total) {
    return 'Showing $start to $end of $total';
  }

  @override
  String itemsCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count items',
      one: '1 item',
      zero: 'No items',
    );
    return '$_temp0';
  }

  @override
  String leadsCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count leads',
      one: '1 lead',
      zero: 'No leads',
    );
    return '$_temp0';
  }

  @override
  String contactsCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count contacts',
      one: '1 contact',
      zero: 'No contacts',
    );
    return '$_temp0';
  }
}
