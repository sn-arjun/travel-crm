import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:intl/intl.dart' as intl;

import 'app_localizations_ar.dart';
import 'app_localizations_en.dart';
import 'app_localizations_hi.dart';
import 'app_localizations_nl.dart';

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
    Locale('ar'),
    Locale('en'),
    Locale('hi'),
    Locale('nl'),
  ];

  /// No description provided for @appTitle.
  ///
  /// In en, this message translates to:
  /// **'TravelCRM Driver'**
  String get appTitle;

  /// No description provided for @loginTitle.
  ///
  /// In en, this message translates to:
  /// **'Driver Login'**
  String get loginTitle;

  /// No description provided for @loginSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Enter your phone number to get started'**
  String get loginSubtitle;

  /// No description provided for @phoneHint.
  ///
  /// In en, this message translates to:
  /// **'Phone number'**
  String get phoneHint;

  /// No description provided for @sendOtp.
  ///
  /// In en, this message translates to:
  /// **'Send OTP'**
  String get sendOtp;

  /// No description provided for @enterOtp.
  ///
  /// In en, this message translates to:
  /// **'Enter OTP'**
  String get enterOtp;

  /// No description provided for @otpSentTo.
  ///
  /// In en, this message translates to:
  /// **'OTP sent to {phone}'**
  String otpSentTo(String phone);

  /// No description provided for @verify.
  ///
  /// In en, this message translates to:
  /// **'Verify'**
  String get verify;

  /// No description provided for @resendOtp.
  ///
  /// In en, this message translates to:
  /// **'Resend OTP'**
  String get resendOtp;

  /// No description provided for @resendIn.
  ///
  /// In en, this message translates to:
  /// **'Resend in {seconds}s'**
  String resendIn(int seconds);

  /// No description provided for @invalidPhone.
  ///
  /// In en, this message translates to:
  /// **'Please enter a valid phone number'**
  String get invalidPhone;

  /// No description provided for @invalidOtp.
  ///
  /// In en, this message translates to:
  /// **'Invalid OTP. Please try again.'**
  String get invalidOtp;

  /// No description provided for @accountInactive.
  ///
  /// In en, this message translates to:
  /// **'Your account is inactive. Contact your company.'**
  String get accountInactive;

  /// No description provided for @rateLimited.
  ///
  /// In en, this message translates to:
  /// **'Too many attempts. Please wait.'**
  String get rateLimited;

  /// No description provided for @myTrips.
  ///
  /// In en, this message translates to:
  /// **'My Trips'**
  String get myTrips;

  /// No description provided for @today.
  ///
  /// In en, this message translates to:
  /// **'Today'**
  String get today;

  /// No description provided for @upcoming.
  ///
  /// In en, this message translates to:
  /// **'Upcoming'**
  String get upcoming;

  /// No description provided for @past.
  ///
  /// In en, this message translates to:
  /// **'Past'**
  String get past;

  /// No description provided for @noTripsToday.
  ///
  /// In en, this message translates to:
  /// **'No trips scheduled for today'**
  String get noTripsToday;

  /// No description provided for @noUpcomingTrips.
  ///
  /// In en, this message translates to:
  /// **'No upcoming trips'**
  String get noUpcomingTrips;

  /// No description provided for @noPastTrips.
  ///
  /// In en, this message translates to:
  /// **'No past trips'**
  String get noPastTrips;

  /// No description provided for @tripDetail.
  ///
  /// In en, this message translates to:
  /// **'Trip Detail'**
  String get tripDetail;

  /// No description provided for @pickupLocation.
  ///
  /// In en, this message translates to:
  /// **'Pickup Location'**
  String get pickupLocation;

  /// No description provided for @dropLocation.
  ///
  /// In en, this message translates to:
  /// **'Drop Location'**
  String get dropLocation;

  /// No description provided for @passenger.
  ///
  /// In en, this message translates to:
  /// **'Passenger'**
  String get passenger;

  /// No description provided for @vehicle.
  ///
  /// In en, this message translates to:
  /// **'Vehicle'**
  String get vehicle;

  /// No description provided for @specialInstructions.
  ///
  /// In en, this message translates to:
  /// **'Special Instructions'**
  String get specialInstructions;

  /// No description provided for @timeline.
  ///
  /// In en, this message translates to:
  /// **'Timeline'**
  String get timeline;

  /// No description provided for @accept.
  ///
  /// In en, this message translates to:
  /// **'Accept'**
  String get accept;

  /// No description provided for @reject.
  ///
  /// In en, this message translates to:
  /// **'Reject'**
  String get reject;

  /// No description provided for @acceptTrip.
  ///
  /// In en, this message translates to:
  /// **'Accept Trip'**
  String get acceptTrip;

  /// No description provided for @acceptTripConfirm.
  ///
  /// In en, this message translates to:
  /// **'Are you sure you want to accept this trip?'**
  String get acceptTripConfirm;

  /// No description provided for @rejectTrip.
  ///
  /// In en, this message translates to:
  /// **'Reject Trip'**
  String get rejectTrip;

  /// No description provided for @enterReason.
  ///
  /// In en, this message translates to:
  /// **'Enter reason for rejection'**
  String get enterReason;

  /// No description provided for @reasonTooShort.
  ///
  /// In en, this message translates to:
  /// **'Reason must be at least 10 characters'**
  String get reasonTooShort;

  /// No description provided for @scheduleConflict.
  ///
  /// In en, this message translates to:
  /// **'Schedule conflict'**
  String get scheduleConflict;

  /// No description provided for @tooFar.
  ///
  /// In en, this message translates to:
  /// **'Too far'**
  String get tooFar;

  /// No description provided for @vehicleIssue.
  ///
  /// In en, this message translates to:
  /// **'Vehicle issue'**
  String get vehicleIssue;

  /// No description provided for @personalEmergency.
  ///
  /// In en, this message translates to:
  /// **'Personal emergency'**
  String get personalEmergency;

  /// No description provided for @other.
  ///
  /// In en, this message translates to:
  /// **'Other'**
  String get other;

  /// No description provided for @confirmReject.
  ///
  /// In en, this message translates to:
  /// **'Confirm Rejection'**
  String get confirmReject;

  /// No description provided for @tripAccepted.
  ///
  /// In en, this message translates to:
  /// **'Trip accepted successfully'**
  String get tripAccepted;

  /// No description provided for @tripRejected.
  ///
  /// In en, this message translates to:
  /// **'Trip rejected'**
  String get tripRejected;

  /// No description provided for @enRoute.
  ///
  /// In en, this message translates to:
  /// **'En Route'**
  String get enRoute;

  /// No description provided for @startTrip.
  ///
  /// In en, this message translates to:
  /// **'Start Trip'**
  String get startTrip;

  /// No description provided for @markPickedUp.
  ///
  /// In en, this message translates to:
  /// **'Mark Picked Up'**
  String get markPickedUp;

  /// No description provided for @markCompleted.
  ///
  /// In en, this message translates to:
  /// **'Mark Completed'**
  String get markCompleted;

  /// No description provided for @navigate.
  ///
  /// In en, this message translates to:
  /// **'Navigate'**
  String get navigate;

  /// No description provided for @checkIn.
  ///
  /// In en, this message translates to:
  /// **'Check In'**
  String get checkIn;

  /// No description provided for @checkOut.
  ///
  /// In en, this message translates to:
  /// **'Check Out'**
  String get checkOut;

  /// No description provided for @confirmCheckIn.
  ///
  /// In en, this message translates to:
  /// **'Confirm Check-In'**
  String get confirmCheckIn;

  /// No description provided for @confirmCheckOut.
  ///
  /// In en, this message translates to:
  /// **'Confirm Check-Out'**
  String get confirmCheckOut;

  /// No description provided for @gettingLocation.
  ///
  /// In en, this message translates to:
  /// **'Getting your location...'**
  String get gettingLocation;

  /// No description provided for @locationError.
  ///
  /// In en, this message translates to:
  /// **'Could not get location'**
  String get locationError;

  /// No description provided for @retryLocation.
  ///
  /// In en, this message translates to:
  /// **'Retry'**
  String get retryLocation;

  /// No description provided for @takePhoto.
  ///
  /// In en, this message translates to:
  /// **'Take Photo'**
  String get takePhoto;

  /// No description provided for @retake.
  ///
  /// In en, this message translates to:
  /// **'Retake'**
  String get retake;

  /// No description provided for @removePhoto.
  ///
  /// In en, this message translates to:
  /// **'Remove'**
  String get removePhoto;

  /// No description provided for @checkInSuccess.
  ///
  /// In en, this message translates to:
  /// **'Checked in successfully'**
  String get checkInSuccess;

  /// No description provided for @checkOutSuccess.
  ///
  /// In en, this message translates to:
  /// **'Checked out successfully'**
  String get checkOutSuccess;

  /// No description provided for @alreadyCheckedIn.
  ///
  /// In en, this message translates to:
  /// **'Already checked in'**
  String get alreadyCheckedIn;

  /// No description provided for @alreadyCheckedOut.
  ///
  /// In en, this message translates to:
  /// **'Already checked out'**
  String get alreadyCheckedOut;

  /// No description provided for @openInGoogleMaps.
  ///
  /// In en, this message translates to:
  /// **'Google Maps'**
  String get openInGoogleMaps;

  /// No description provided for @openInWaze.
  ///
  /// In en, this message translates to:
  /// **'Waze'**
  String get openInWaze;

  /// No description provided for @chooseNavApp.
  ///
  /// In en, this message translates to:
  /// **'Choose Navigation App'**
  String get chooseNavApp;

  /// No description provided for @history.
  ///
  /// In en, this message translates to:
  /// **'Trip History'**
  String get history;

  /// No description provided for @filterByDate.
  ///
  /// In en, this message translates to:
  /// **'Filter by date'**
  String get filterByDate;

  /// No description provided for @last7Days.
  ///
  /// In en, this message translates to:
  /// **'Last 7 days'**
  String get last7Days;

  /// No description provided for @last30Days.
  ///
  /// In en, this message translates to:
  /// **'Last 30 days'**
  String get last30Days;

  /// No description provided for @thisMonth.
  ///
  /// In en, this message translates to:
  /// **'This month'**
  String get thisMonth;

  /// No description provided for @allTime.
  ///
  /// In en, this message translates to:
  /// **'All time'**
  String get allTime;

  /// No description provided for @customRange.
  ///
  /// In en, this message translates to:
  /// **'Custom range'**
  String get customRange;

  /// No description provided for @searchTrips.
  ///
  /// In en, this message translates to:
  /// **'Search trips...'**
  String get searchTrips;

  /// No description provided for @tripCount.
  ///
  /// In en, this message translates to:
  /// **'{count} trips'**
  String tripCount(int count);

  /// No description provided for @profile.
  ///
  /// In en, this message translates to:
  /// **'My Profile'**
  String get profile;

  /// No description provided for @editProfile.
  ///
  /// In en, this message translates to:
  /// **'Edit Profile'**
  String get editProfile;

  /// No description provided for @documents.
  ///
  /// In en, this message translates to:
  /// **'Documents'**
  String get documents;

  /// No description provided for @logout.
  ///
  /// In en, this message translates to:
  /// **'Logout'**
  String get logout;

  /// No description provided for @logoutConfirm.
  ///
  /// In en, this message translates to:
  /// **'Are you sure you want to logout?'**
  String get logoutConfirm;

  /// No description provided for @rating.
  ///
  /// In en, this message translates to:
  /// **'Rating'**
  String get rating;

  /// No description provided for @totalTrips.
  ///
  /// In en, this message translates to:
  /// **'Total Trips'**
  String get totalTrips;

  /// No description provided for @memberSince.
  ///
  /// In en, this message translates to:
  /// **'Member since'**
  String get memberSince;

  /// No description provided for @email.
  ///
  /// In en, this message translates to:
  /// **'Email'**
  String get email;

  /// No description provided for @address.
  ///
  /// In en, this message translates to:
  /// **'Address'**
  String get address;

  /// No description provided for @emergencyContact.
  ///
  /// In en, this message translates to:
  /// **'Emergency Contact'**
  String get emergencyContact;

  /// No description provided for @save.
  ///
  /// In en, this message translates to:
  /// **'Save'**
  String get save;

  /// No description provided for @cancel.
  ///
  /// In en, this message translates to:
  /// **'Cancel'**
  String get cancel;

  /// No description provided for @confirm.
  ///
  /// In en, this message translates to:
  /// **'Confirm'**
  String get confirm;

  /// No description provided for @loading.
  ///
  /// In en, this message translates to:
  /// **'Loading...'**
  String get loading;

  /// No description provided for @error.
  ///
  /// In en, this message translates to:
  /// **'Error'**
  String get error;

  /// No description provided for @retry.
  ///
  /// In en, this message translates to:
  /// **'Retry'**
  String get retry;

  /// No description provided for @success.
  ///
  /// In en, this message translates to:
  /// **'Success'**
  String get success;

  /// No description provided for @offline.
  ///
  /// In en, this message translates to:
  /// **'You are offline'**
  String get offline;

  /// No description provided for @syncing.
  ///
  /// In en, this message translates to:
  /// **'Syncing...'**
  String get syncing;

  /// No description provided for @syncComplete.
  ///
  /// In en, this message translates to:
  /// **'Sync complete'**
  String get syncComplete;

  /// No description provided for @noInternet.
  ///
  /// In en, this message translates to:
  /// **'No internet connection'**
  String get noInternet;

  /// No description provided for @licenseExpiring.
  ///
  /// In en, this message translates to:
  /// **'License expires in {days} days'**
  String licenseExpiring(int days);

  /// No description provided for @uploadDocument.
  ///
  /// In en, this message translates to:
  /// **'Upload Document'**
  String get uploadDocument;

  /// No description provided for @license.
  ///
  /// In en, this message translates to:
  /// **'License'**
  String get license;

  /// No description provided for @idProof.
  ///
  /// In en, this message translates to:
  /// **'ID Proof'**
  String get idProof;

  /// No description provided for @policeVerification.
  ///
  /// In en, this message translates to:
  /// **'Police Verification'**
  String get policeVerification;

  /// No description provided for @language.
  ///
  /// In en, this message translates to:
  /// **'Language'**
  String get language;

  /// No description provided for @english.
  ///
  /// In en, this message translates to:
  /// **'English'**
  String get english;

  /// No description provided for @arabic.
  ///
  /// In en, this message translates to:
  /// **'Arabic'**
  String get arabic;

  /// No description provided for @hindi.
  ///
  /// In en, this message translates to:
  /// **'Hindi'**
  String get hindi;

  /// No description provided for @dutch.
  ///
  /// In en, this message translates to:
  /// **'Dutch'**
  String get dutch;

  /// No description provided for @loginTagline.
  ///
  /// In en, this message translates to:
  /// **'Your trips, check-ins and navigation in one place'**
  String get loginTagline;

  /// No description provided for @tripsLoadError.
  ///
  /// In en, this message translates to:
  /// **'Couldn\'t load your trips'**
  String get tripsLoadError;

  /// No description provided for @tripLoadError.
  ///
  /// In en, this message translates to:
  /// **'Couldn\'t load this trip'**
  String get tripLoadError;

  /// No description provided for @refresh.
  ///
  /// In en, this message translates to:
  /// **'Refresh'**
  String get refresh;

  /// No description provided for @emptyTripsHint.
  ///
  /// In en, this message translates to:
  /// **'New assignments from dispatch will appear here.'**
  String get emptyTripsHint;

  /// No description provided for @showingSavedTrips.
  ///
  /// In en, this message translates to:
  /// **'Showing saved trips. Pull down to refresh.'**
  String get showingSavedTrips;

  /// No description provided for @noMatchingTrips.
  ///
  /// In en, this message translates to:
  /// **'No trips match your search'**
  String get noMatchingTrips;

  /// No description provided for @tryDifferentFilter.
  ///
  /// In en, this message translates to:
  /// **'Try a different search or date range.'**
  String get tryDifferentFilter;

  /// No description provided for @route.
  ///
  /// In en, this message translates to:
  /// **'Route'**
  String get route;

  /// No description provided for @openInMaps.
  ///
  /// In en, this message translates to:
  /// **'Open in Maps'**
  String get openInMaps;

  /// No description provided for @callPassenger.
  ///
  /// In en, this message translates to:
  /// **'Call passenger'**
  String get callPassenger;

  /// No description provided for @tripDetails.
  ///
  /// In en, this message translates to:
  /// **'Trip details'**
  String get tripDetails;

  /// No description provided for @dropTime.
  ///
  /// In en, this message translates to:
  /// **'Drop time'**
  String get dropTime;

  /// No description provided for @booking.
  ///
  /// In en, this message translates to:
  /// **'Booking'**
  String get booking;

  /// No description provided for @tripType.
  ///
  /// In en, this message translates to:
  /// **'Trip type'**
  String get tripType;

  /// No description provided for @estimatedCost.
  ///
  /// In en, this message translates to:
  /// **'Estimated cost'**
  String get estimatedCost;

  /// No description provided for @actualCost.
  ///
  /// In en, this message translates to:
  /// **'Actual cost'**
  String get actualCost;

  /// No description provided for @distance.
  ///
  /// In en, this message translates to:
  /// **'Distance'**
  String get distance;

  /// No description provided for @profileLoadError.
  ///
  /// In en, this message translates to:
  /// **'Couldn\'t load your profile'**
  String get profileLoadError;

  /// No description provided for @documentsLoadError.
  ///
  /// In en, this message translates to:
  /// **'Couldn\'t load your documents'**
  String get documentsLoadError;

  /// No description provided for @noDocuments.
  ///
  /// In en, this message translates to:
  /// **'No documents uploaded'**
  String get noDocuments;

  /// No description provided for @noDocumentsHint.
  ///
  /// In en, this message translates to:
  /// **'Upload your licence and ID so dispatch can verify them.'**
  String get noDocumentsHint;

  /// No description provided for @docValid.
  ///
  /// In en, this message translates to:
  /// **'Valid'**
  String get docValid;

  /// No description provided for @docExpiringSoon.
  ///
  /// In en, this message translates to:
  /// **'Expiring soon'**
  String get docExpiringSoon;

  /// No description provided for @docExpired.
  ///
  /// In en, this message translates to:
  /// **'Expired'**
  String get docExpired;

  /// No description provided for @docNoExpiry.
  ///
  /// In en, this message translates to:
  /// **'No expiry'**
  String get docNoExpiry;

  /// No description provided for @expiresOn.
  ///
  /// In en, this message translates to:
  /// **'Expires {date}'**
  String expiresOn(String date);

  /// No description provided for @agencyTitle.
  ///
  /// In en, this message translates to:
  /// **'Find your agency'**
  String get agencyTitle;

  /// No description provided for @agencySubtitle.
  ///
  /// In en, this message translates to:
  /// **'Enter the agency code your company gave you'**
  String get agencySubtitle;

  /// No description provided for @agencyCodeHint.
  ///
  /// In en, this message translates to:
  /// **'Agency code'**
  String get agencyCodeHint;

  /// No description provided for @agencyCodeRequired.
  ///
  /// In en, this message translates to:
  /// **'Enter your agency code'**
  String get agencyCodeRequired;

  /// No description provided for @agencyContinue.
  ///
  /// In en, this message translates to:
  /// **'Continue'**
  String get agencyContinue;

  /// No description provided for @agencyConfirmPrompt.
  ///
  /// In en, this message translates to:
  /// **'Is this your agency?'**
  String get agencyConfirmPrompt;

  /// No description provided for @agencyConfirm.
  ///
  /// In en, this message translates to:
  /// **'Yes, continue'**
  String get agencyConfirm;

  /// No description provided for @agencyNotYours.
  ///
  /// In en, this message translates to:
  /// **'Not your agency?'**
  String get agencyNotYours;

  /// No description provided for @agencyInvalid.
  ///
  /// In en, this message translates to:
  /// **'We could not find that agency code. Check it with your company.'**
  String get agencyInvalid;

  /// No description provided for @changeAgency.
  ///
  /// In en, this message translates to:
  /// **'Change agency'**
  String get changeAgency;

  /// No description provided for @changeAgencyConfirm.
  ///
  /// In en, this message translates to:
  /// **'This signs you out and removes the agency from this phone. You will need the agency code again.'**
  String get changeAgencyConfirm;

  /// No description provided for @agencyLabel.
  ///
  /// In en, this message translates to:
  /// **'Agency'**
  String get agencyLabel;

  /// No description provided for @selectCountry.
  ///
  /// In en, this message translates to:
  /// **'Select country'**
  String get selectCountry;

  /// No description provided for @countrySearchHint.
  ///
  /// In en, this message translates to:
  /// **'Search country or code'**
  String get countrySearchHint;

  /// No description provided for @noCountryFound.
  ///
  /// In en, this message translates to:
  /// **'No country found'**
  String get noCountryFound;
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
      <String>['ar', 'en', 'hi', 'nl'].contains(locale.languageCode);

  @override
  bool shouldReload(_AppLocalizationsDelegate old) => false;
}

AppLocalizations lookupAppLocalizations(Locale locale) {
  // Lookup logic when only language code is specified.
  switch (locale.languageCode) {
    case 'ar':
      return AppLocalizationsAr();
    case 'en':
      return AppLocalizationsEn();
    case 'hi':
      return AppLocalizationsHi();
    case 'nl':
      return AppLocalizationsNl();
  }

  throw FlutterError(
    'AppLocalizations.delegate failed to load unsupported locale "$locale". This is likely '
    'an issue with the localizations generation tool. Please file an issue '
    'on GitHub with a reproducible sample app and the gen-l10n configuration '
    'that was used.',
  );
}
