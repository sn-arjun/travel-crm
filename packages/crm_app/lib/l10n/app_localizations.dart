import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:intl/intl.dart' as intl;

import 'app_localizations_en.dart';
import 'app_localizations_hi.dart';

// ignore_for_file: type=lint

/// Callers can lookup localized strings with an instance of AppLocalizations
/// returned by `AppLocalizations.of(context)`.
///
/// Applications need to include `AppLocalizations.delegate()` in their app's
/// `localizationDelegates` list, and the locales they support in the app's
/// `supportedLocales` list. For example:
///
/// ```dart
/// import 'l10n/app_localizations.dart';
///
/// return MaterialApp(
///   localizationsDelegates: AppLocalizations.localizationsDelegates,
///   supportedLocales: AppLocalizations.supportedLocales,
///   home: MyApplicationHome(),
/// );
/// ```
///
/// ## Update pubspec.yaml
///
/// Please make sure to update your pubspec.yaml to include the following
/// packages:
///
/// ```yaml
/// dependencies:
///   # Internationalization support.
///   flutter_localizations:
///     sdk: flutter
///   intl: any # Use the pinned version from flutter_localizations
///
///   # Rest of dependencies
/// ```
///
/// ## iOS Applications
///
/// iOS applications define key application metadata, including supported
/// locales, in an Info.plist file that is built into the application bundle.
/// To configure the locales supported by your app, you’ll need to edit this
/// file.
///
/// First, open your project’s ios/Runner.xcworkspace Xcode workspace file.
/// Then, in the Project Navigator, open the Info.plist file under the Runner
/// project’s Runner folder.
///
/// Next, select the Information Property List item, select Add Item from the
/// Editor menu, then select Localizations from the pop-up menu.
///
/// Select and expand the newly-created Localizations item then, for each
/// locale your application supports, add a new item and select the locale
/// you wish to add from the pop-up menu in the Value field. This list should
/// be consistent with the languages listed in the AppLocalizations.supportedLocales
/// property.
abstract class AppLocalizations {
  AppLocalizations(String locale)
    : localeName = intl.Intl.canonicalizedLocale(locale.toString());

  final String localeName;

  static AppLocalizations? of(BuildContext context) {
    return Localizations.of<AppLocalizations>(context, AppLocalizations);
  }

  static const LocalizationsDelegate<AppLocalizations> delegate =
      _AppLocalizationsDelegate();

  /// A list of this localizations delegate along with the default localizations
  /// delegates.
  ///
  /// Returns a list of localizations delegates containing this delegate along with
  /// GlobalMaterialLocalizations.delegate, GlobalCupertinoLocalizations.delegate,
  /// and GlobalWidgetsLocalizations.delegate.
  ///
  /// Additional delegates can be added by appending to this list in
  /// MaterialApp. This list does not have to be used at all if a custom list
  /// of delegates is preferred or required.
  static const List<LocalizationsDelegate<dynamic>> localizationsDelegates =
      <LocalizationsDelegate<dynamic>>[
        delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
      ];

  /// A list of this localizations delegate's supported locales.
  static const List<Locale> supportedLocales = <Locale>[
    Locale('en'),
    Locale('hi'),
  ];

  /// No description provided for @appTitle.
  ///
  /// In en, this message translates to:
  /// **'TravelCRM Pro'**
  String get appTitle;

  /// No description provided for @navDashboard.
  ///
  /// In en, this message translates to:
  /// **'Dashboard'**
  String get navDashboard;

  /// No description provided for @navContacts.
  ///
  /// In en, this message translates to:
  /// **'Contacts'**
  String get navContacts;

  /// No description provided for @navLeads.
  ///
  /// In en, this message translates to:
  /// **'Leads'**
  String get navLeads;

  /// No description provided for @navItineraries.
  ///
  /// In en, this message translates to:
  /// **'Itineraries'**
  String get navItineraries;

  /// No description provided for @navInvoices.
  ///
  /// In en, this message translates to:
  /// **'Invoices'**
  String get navInvoices;

  /// No description provided for @navVouchers.
  ///
  /// In en, this message translates to:
  /// **'Vouchers'**
  String get navVouchers;

  /// No description provided for @navSuppliers.
  ///
  /// In en, this message translates to:
  /// **'Suppliers'**
  String get navSuppliers;

  /// No description provided for @navVisa.
  ///
  /// In en, this message translates to:
  /// **'Visa & Travellers'**
  String get navVisa;

  /// No description provided for @navPlanner.
  ///
  /// In en, this message translates to:
  /// **'Planner'**
  String get navPlanner;

  /// No description provided for @navTasks.
  ///
  /// In en, this message translates to:
  /// **'Tasks'**
  String get navTasks;

  /// No description provided for @navReports.
  ///
  /// In en, this message translates to:
  /// **'Reports'**
  String get navReports;

  /// No description provided for @navMarketing.
  ///
  /// In en, this message translates to:
  /// **'Marketing'**
  String get navMarketing;

  /// No description provided for @navFleet.
  ///
  /// In en, this message translates to:
  /// **'Fleet'**
  String get navFleet;

  /// No description provided for @navSettings.
  ///
  /// In en, this message translates to:
  /// **'Settings'**
  String get navSettings;

  /// No description provided for @loginTitle.
  ///
  /// In en, this message translates to:
  /// **'Sign In'**
  String get loginTitle;

  /// No description provided for @loginEmail.
  ///
  /// In en, this message translates to:
  /// **'Email Address'**
  String get loginEmail;

  /// No description provided for @loginPassword.
  ///
  /// In en, this message translates to:
  /// **'Password'**
  String get loginPassword;

  /// No description provided for @loginPhone.
  ///
  /// In en, this message translates to:
  /// **'Phone Number'**
  String get loginPhone;

  /// No description provided for @loginOtp.
  ///
  /// In en, this message translates to:
  /// **'Enter OTP'**
  String get loginOtp;

  /// No description provided for @loginButton.
  ///
  /// In en, this message translates to:
  /// **'Sign In'**
  String get loginButton;

  /// No description provided for @loginForgotPassword.
  ///
  /// In en, this message translates to:
  /// **'Forgot Password?'**
  String get loginForgotPassword;

  /// No description provided for @loginWithOtp.
  ///
  /// In en, this message translates to:
  /// **'Sign in with OTP'**
  String get loginWithOtp;

  /// No description provided for @loginWithPassword.
  ///
  /// In en, this message translates to:
  /// **'Sign in with Password'**
  String get loginWithPassword;

  /// No description provided for @commonSave.
  ///
  /// In en, this message translates to:
  /// **'Save'**
  String get commonSave;

  /// No description provided for @commonCancel.
  ///
  /// In en, this message translates to:
  /// **'Cancel'**
  String get commonCancel;

  /// No description provided for @commonDelete.
  ///
  /// In en, this message translates to:
  /// **'Delete'**
  String get commonDelete;

  /// No description provided for @commonEdit.
  ///
  /// In en, this message translates to:
  /// **'Edit'**
  String get commonEdit;

  /// No description provided for @commonCreate.
  ///
  /// In en, this message translates to:
  /// **'Create'**
  String get commonCreate;

  /// No description provided for @commonSearch.
  ///
  /// In en, this message translates to:
  /// **'Search...'**
  String get commonSearch;

  /// No description provided for @commonFilter.
  ///
  /// In en, this message translates to:
  /// **'Filter'**
  String get commonFilter;

  /// No description provided for @commonExport.
  ///
  /// In en, this message translates to:
  /// **'Export'**
  String get commonExport;

  /// No description provided for @commonImport.
  ///
  /// In en, this message translates to:
  /// **'Import'**
  String get commonImport;

  /// No description provided for @commonRefresh.
  ///
  /// In en, this message translates to:
  /// **'Refresh'**
  String get commonRefresh;

  /// No description provided for @commonBack.
  ///
  /// In en, this message translates to:
  /// **'Back'**
  String get commonBack;

  /// No description provided for @commonClose.
  ///
  /// In en, this message translates to:
  /// **'Close'**
  String get commonClose;

  /// No description provided for @commonConfirm.
  ///
  /// In en, this message translates to:
  /// **'Confirm'**
  String get commonConfirm;

  /// No description provided for @commonYes.
  ///
  /// In en, this message translates to:
  /// **'Yes'**
  String get commonYes;

  /// No description provided for @commonNo.
  ///
  /// In en, this message translates to:
  /// **'No'**
  String get commonNo;

  /// No description provided for @commonAll.
  ///
  /// In en, this message translates to:
  /// **'All'**
  String get commonAll;

  /// No description provided for @commonNone.
  ///
  /// In en, this message translates to:
  /// **'None'**
  String get commonNone;

  /// No description provided for @commonLoading.
  ///
  /// In en, this message translates to:
  /// **'Loading...'**
  String get commonLoading;

  /// No description provided for @commonNoData.
  ///
  /// In en, this message translates to:
  /// **'No data found'**
  String get commonNoData;

  /// No description provided for @commonError.
  ///
  /// In en, this message translates to:
  /// **'Something went wrong'**
  String get commonError;

  /// No description provided for @commonRetry.
  ///
  /// In en, this message translates to:
  /// **'Retry'**
  String get commonRetry;

  /// No description provided for @commonSuccess.
  ///
  /// In en, this message translates to:
  /// **'Success'**
  String get commonSuccess;

  /// No description provided for @commonCopied.
  ///
  /// In en, this message translates to:
  /// **'Copied to clipboard'**
  String get commonCopied;

  /// No description provided for @commonRequired.
  ///
  /// In en, this message translates to:
  /// **'Required'**
  String get commonRequired;

  /// No description provided for @commonOptional.
  ///
  /// In en, this message translates to:
  /// **'Optional'**
  String get commonOptional;

  /// No description provided for @commonActions.
  ///
  /// In en, this message translates to:
  /// **'Actions'**
  String get commonActions;

  /// No description provided for @commonViewAll.
  ///
  /// In en, this message translates to:
  /// **'View All'**
  String get commonViewAll;

  /// No description provided for @commonShowMore.
  ///
  /// In en, this message translates to:
  /// **'Show More'**
  String get commonShowMore;

  /// No description provided for @commonShowLess.
  ///
  /// In en, this message translates to:
  /// **'Show Less'**
  String get commonShowLess;

  /// No description provided for @contactsTitle.
  ///
  /// In en, this message translates to:
  /// **'Contacts'**
  String get contactsTitle;

  /// No description provided for @contactsAdd.
  ///
  /// In en, this message translates to:
  /// **'Add Contact'**
  String get contactsAdd;

  /// No description provided for @contactName.
  ///
  /// In en, this message translates to:
  /// **'Name'**
  String get contactName;

  /// No description provided for @contactEmail.
  ///
  /// In en, this message translates to:
  /// **'Email'**
  String get contactEmail;

  /// No description provided for @contactPhone.
  ///
  /// In en, this message translates to:
  /// **'Phone'**
  String get contactPhone;

  /// No description provided for @contactCompany.
  ///
  /// In en, this message translates to:
  /// **'Company'**
  String get contactCompany;

  /// No description provided for @contactType.
  ///
  /// In en, this message translates to:
  /// **'Type'**
  String get contactType;

  /// No description provided for @contactTypeCustomer.
  ///
  /// In en, this message translates to:
  /// **'Customer'**
  String get contactTypeCustomer;

  /// No description provided for @contactTypeSupplier.
  ///
  /// In en, this message translates to:
  /// **'Supplier'**
  String get contactTypeSupplier;

  /// No description provided for @contactTypeAgent.
  ///
  /// In en, this message translates to:
  /// **'Agent'**
  String get contactTypeAgent;

  /// No description provided for @contactTypePartner.
  ///
  /// In en, this message translates to:
  /// **'Partner'**
  String get contactTypePartner;

  /// No description provided for @contactTags.
  ///
  /// In en, this message translates to:
  /// **'Tags'**
  String get contactTags;

  /// No description provided for @contactSource.
  ///
  /// In en, this message translates to:
  /// **'Source'**
  String get contactSource;

  /// No description provided for @contactNotes.
  ///
  /// In en, this message translates to:
  /// **'Notes'**
  String get contactNotes;

  /// No description provided for @contactCity.
  ///
  /// In en, this message translates to:
  /// **'City'**
  String get contactCity;

  /// No description provided for @contactCountry.
  ///
  /// In en, this message translates to:
  /// **'Country'**
  String get contactCountry;

  /// No description provided for @contactBirthday.
  ///
  /// In en, this message translates to:
  /// **'Birthday'**
  String get contactBirthday;

  /// No description provided for @contactAnniversary.
  ///
  /// In en, this message translates to:
  /// **'Anniversary'**
  String get contactAnniversary;

  /// No description provided for @leadsTitle.
  ///
  /// In en, this message translates to:
  /// **'Leads'**
  String get leadsTitle;

  /// No description provided for @leadsAdd.
  ///
  /// In en, this message translates to:
  /// **'Add Lead'**
  String get leadsAdd;

  /// No description provided for @leadTitle.
  ///
  /// In en, this message translates to:
  /// **'Title'**
  String get leadTitle;

  /// No description provided for @leadDestination.
  ///
  /// In en, this message translates to:
  /// **'Destination'**
  String get leadDestination;

  /// No description provided for @leadTravelDate.
  ///
  /// In en, this message translates to:
  /// **'Travel Date'**
  String get leadTravelDate;

  /// No description provided for @leadReturnDate.
  ///
  /// In en, this message translates to:
  /// **'Return Date'**
  String get leadReturnDate;

  /// No description provided for @leadPaxAdults.
  ///
  /// In en, this message translates to:
  /// **'Adults'**
  String get leadPaxAdults;

  /// No description provided for @leadPaxChildren.
  ///
  /// In en, this message translates to:
  /// **'Children'**
  String get leadPaxChildren;

  /// No description provided for @leadPaxInfants.
  ///
  /// In en, this message translates to:
  /// **'Infants'**
  String get leadPaxInfants;

  /// No description provided for @leadBudget.
  ///
  /// In en, this message translates to:
  /// **'Budget'**
  String get leadBudget;

  /// No description provided for @leadTripType.
  ///
  /// In en, this message translates to:
  /// **'Trip Type'**
  String get leadTripType;

  /// No description provided for @leadSource.
  ///
  /// In en, this message translates to:
  /// **'Source'**
  String get leadSource;

  /// No description provided for @leadStatus.
  ///
  /// In en, this message translates to:
  /// **'Status'**
  String get leadStatus;

  /// No description provided for @leadPriority.
  ///
  /// In en, this message translates to:
  /// **'Priority'**
  String get leadPriority;

  /// No description provided for @leadAssignedTo.
  ///
  /// In en, this message translates to:
  /// **'Assigned To'**
  String get leadAssignedTo;

  /// No description provided for @leadNotes.
  ///
  /// In en, this message translates to:
  /// **'Notes'**
  String get leadNotes;

  /// No description provided for @leadStatusNew.
  ///
  /// In en, this message translates to:
  /// **'New'**
  String get leadStatusNew;

  /// No description provided for @leadStatusContacted.
  ///
  /// In en, this message translates to:
  /// **'Contacted'**
  String get leadStatusContacted;

  /// No description provided for @leadStatusRequirementGathered.
  ///
  /// In en, this message translates to:
  /// **'Requirement Gathered'**
  String get leadStatusRequirementGathered;

  /// No description provided for @leadStatusProposalSent.
  ///
  /// In en, this message translates to:
  /// **'Proposal Sent'**
  String get leadStatusProposalSent;

  /// No description provided for @leadStatusNegotiation.
  ///
  /// In en, this message translates to:
  /// **'Negotiation'**
  String get leadStatusNegotiation;

  /// No description provided for @leadStatusBookingConfirmed.
  ///
  /// In en, this message translates to:
  /// **'Booking Confirmed'**
  String get leadStatusBookingConfirmed;

  /// No description provided for @leadStatusCompleted.
  ///
  /// In en, this message translates to:
  /// **'Completed'**
  String get leadStatusCompleted;

  /// No description provided for @leadStatusLost.
  ///
  /// In en, this message translates to:
  /// **'Lost'**
  String get leadStatusLost;

  /// No description provided for @leadPriorityHot.
  ///
  /// In en, this message translates to:
  /// **'Hot'**
  String get leadPriorityHot;

  /// No description provided for @leadPriorityWarm.
  ///
  /// In en, this message translates to:
  /// **'Warm'**
  String get leadPriorityWarm;

  /// No description provided for @leadPriorityCold.
  ///
  /// In en, this message translates to:
  /// **'Cold'**
  String get leadPriorityCold;

  /// No description provided for @invoiceTitle.
  ///
  /// In en, this message translates to:
  /// **'Invoices'**
  String get invoiceTitle;

  /// No description provided for @invoiceAdd.
  ///
  /// In en, this message translates to:
  /// **'Create Invoice'**
  String get invoiceAdd;

  /// No description provided for @invoiceNumber.
  ///
  /// In en, this message translates to:
  /// **'Invoice #'**
  String get invoiceNumber;

  /// No description provided for @invoiceDate.
  ///
  /// In en, this message translates to:
  /// **'Date'**
  String get invoiceDate;

  /// No description provided for @invoiceDueDate.
  ///
  /// In en, this message translates to:
  /// **'Due Date'**
  String get invoiceDueDate;

  /// No description provided for @invoiceSubtotal.
  ///
  /// In en, this message translates to:
  /// **'Subtotal'**
  String get invoiceSubtotal;

  /// No description provided for @invoiceTax.
  ///
  /// In en, this message translates to:
  /// **'Tax'**
  String get invoiceTax;

  /// No description provided for @invoiceTotal.
  ///
  /// In en, this message translates to:
  /// **'Total'**
  String get invoiceTotal;

  /// No description provided for @invoiceStatus.
  ///
  /// In en, this message translates to:
  /// **'Status'**
  String get invoiceStatus;

  /// No description provided for @invoicePaid.
  ///
  /// In en, this message translates to:
  /// **'Paid'**
  String get invoicePaid;

  /// No description provided for @invoiceBalance.
  ///
  /// In en, this message translates to:
  /// **'Balance Due'**
  String get invoiceBalance;

  /// No description provided for @settingsTitle.
  ///
  /// In en, this message translates to:
  /// **'Settings'**
  String get settingsTitle;

  /// No description provided for @settingsProfile.
  ///
  /// In en, this message translates to:
  /// **'Profile'**
  String get settingsProfile;

  /// No description provided for @settingsCompany.
  ///
  /// In en, this message translates to:
  /// **'Company'**
  String get settingsCompany;

  /// No description provided for @settingsLanguage.
  ///
  /// In en, this message translates to:
  /// **'Language'**
  String get settingsLanguage;

  /// No description provided for @settingsTheme.
  ///
  /// In en, this message translates to:
  /// **'Theme'**
  String get settingsTheme;

  /// No description provided for @settingsNotifications.
  ///
  /// In en, this message translates to:
  /// **'Notifications'**
  String get settingsNotifications;

  /// No description provided for @settingsLogout.
  ///
  /// In en, this message translates to:
  /// **'Logout'**
  String get settingsLogout;

  /// No description provided for @deleteConfirmTitle.
  ///
  /// In en, this message translates to:
  /// **'Confirm Delete'**
  String get deleteConfirmTitle;

  /// No description provided for @deleteConfirmMessage.
  ///
  /// In en, this message translates to:
  /// **'Are you sure you want to delete this? This action cannot be undone.'**
  String get deleteConfirmMessage;

  /// No description provided for @paginationShowing.
  ///
  /// In en, this message translates to:
  /// **'Showing {start} to {end} of {total}'**
  String paginationShowing(int start, int end, int total);

  /// No description provided for @itemsCount.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, =0{No items} =1{1 item} other{{count} items}}'**
  String itemsCount(int count);
}

class _AppLocalizationsDelegate
    extends LocalizationsDelegate<AppLocalizations> {
  const _AppLocalizationsDelegate();

  @override
  Future<AppLocalizations> load(Locale locale) {
    return SynchronousFuture<AppLocalizations>(lookupAppLocalizations(locale));
  }

  @override
  bool isSupported(Locale locale) =>
      <String>['en', 'hi'].contains(locale.languageCode);

  @override
  bool shouldReload(_AppLocalizationsDelegate old) => false;
}

AppLocalizations lookupAppLocalizations(Locale locale) {
  // Lookup logic when only language code is specified.
  switch (locale.languageCode) {
    case 'en':
      return AppLocalizationsEn();
    case 'hi':
      return AppLocalizationsHi();
  }

  throw FlutterError(
    'AppLocalizations.delegate failed to load unsupported locale "$locale". This is likely '
    'an issue with the localizations generation tool. Please file an issue '
    'on GitHub with a reproducible sample app and the gen-l10n configuration '
    'that was used.',
  );
}
