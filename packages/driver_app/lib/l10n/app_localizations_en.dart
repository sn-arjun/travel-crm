// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for English (`en`).
class AppLocalizationsEn extends AppLocalizations {
  AppLocalizationsEn([String locale = 'en']) : super(locale);

  @override
  String get appTitle => 'TravelCRM Driver';

  @override
  String get loginTitle => 'Driver Login';

  @override
  String get loginSubtitle => 'Enter your phone number to get started';

  @override
  String get phoneHint => 'Phone number';

  @override
  String get sendOtp => 'Send OTP';

  @override
  String get enterOtp => 'Enter OTP';

  @override
  String otpSentTo(String phone) {
    return 'OTP sent to $phone';
  }

  @override
  String get verify => 'Verify';

  @override
  String get resendOtp => 'Resend OTP';

  @override
  String resendIn(int seconds) {
    return 'Resend in ${seconds}s';
  }

  @override
  String get invalidPhone => 'Please enter a valid phone number';

  @override
  String get invalidOtp => 'Invalid OTP. Please try again.';

  @override
  String get accountInactive =>
      'Your account is inactive. Contact your company.';

  @override
  String get rateLimited => 'Too many attempts. Please wait.';

  @override
  String get myTrips => 'My Trips';

  @override
  String get today => 'Today';

  @override
  String get upcoming => 'Upcoming';

  @override
  String get past => 'Past';

  @override
  String get noTripsToday => 'No trips scheduled for today';

  @override
  String get noUpcomingTrips => 'No upcoming trips';

  @override
  String get noPastTrips => 'No past trips';

  @override
  String get tripDetail => 'Trip Detail';

  @override
  String get pickupLocation => 'Pickup Location';

  @override
  String get dropLocation => 'Drop Location';

  @override
  String get passenger => 'Passenger';

  @override
  String get vehicle => 'Vehicle';

  @override
  String get specialInstructions => 'Special Instructions';

  @override
  String get timeline => 'Timeline';

  @override
  String get accept => 'Accept';

  @override
  String get reject => 'Reject';

  @override
  String get acceptTrip => 'Accept Trip';

  @override
  String get acceptTripConfirm => 'Are you sure you want to accept this trip?';

  @override
  String get rejectTrip => 'Reject Trip';

  @override
  String get enterReason => 'Enter reason for rejection';

  @override
  String get reasonTooShort => 'Reason must be at least 10 characters';

  @override
  String get scheduleConflict => 'Schedule conflict';

  @override
  String get tooFar => 'Too far';

  @override
  String get vehicleIssue => 'Vehicle issue';

  @override
  String get personalEmergency => 'Personal emergency';

  @override
  String get other => 'Other';

  @override
  String get confirmReject => 'Confirm Rejection';

  @override
  String get tripAccepted => 'Trip accepted successfully';

  @override
  String get tripRejected => 'Trip rejected';

  @override
  String get enRoute => 'En Route';

  @override
  String get startTrip => 'Start Trip';

  @override
  String get markPickedUp => 'Mark Picked Up';

  @override
  String get markCompleted => 'Mark Completed';

  @override
  String get navigate => 'Navigate';

  @override
  String get checkIn => 'Check In';

  @override
  String get checkOut => 'Check Out';

  @override
  String get confirmCheckIn => 'Confirm Check-In';

  @override
  String get confirmCheckOut => 'Confirm Check-Out';

  @override
  String get gettingLocation => 'Getting your location...';

  @override
  String get locationError => 'Could not get location';

  @override
  String get retryLocation => 'Retry';

  @override
  String get takePhoto => 'Take Photo';

  @override
  String get retake => 'Retake';

  @override
  String get removePhoto => 'Remove';

  @override
  String get checkInSuccess => 'Checked in successfully';

  @override
  String get checkOutSuccess => 'Checked out successfully';

  @override
  String get alreadyCheckedIn => 'Already checked in';

  @override
  String get alreadyCheckedOut => 'Already checked out';

  @override
  String get openInGoogleMaps => 'Google Maps';

  @override
  String get openInWaze => 'Waze';

  @override
  String get chooseNavApp => 'Choose Navigation App';

  @override
  String get history => 'Trip History';

  @override
  String get filterByDate => 'Filter by date';

  @override
  String get last7Days => 'Last 7 days';

  @override
  String get last30Days => 'Last 30 days';

  @override
  String get thisMonth => 'This month';

  @override
  String get allTime => 'All time';

  @override
  String get customRange => 'Custom range';

  @override
  String get searchTrips => 'Search trips...';

  @override
  String tripCount(int count) {
    return '$count trips';
  }

  @override
  String get profile => 'My Profile';

  @override
  String get editProfile => 'Edit Profile';

  @override
  String get documents => 'Documents';

  @override
  String get logout => 'Logout';

  @override
  String get logoutConfirm => 'Are you sure you want to logout?';

  @override
  String get rating => 'Rating';

  @override
  String get totalTrips => 'Total Trips';

  @override
  String get memberSince => 'Member since';

  @override
  String get email => 'Email';

  @override
  String get address => 'Address';

  @override
  String get emergencyContact => 'Emergency Contact';

  @override
  String get save => 'Save';

  @override
  String get cancel => 'Cancel';

  @override
  String get confirm => 'Confirm';

  @override
  String get loading => 'Loading...';

  @override
  String get error => 'Error';

  @override
  String get retry => 'Retry';

  @override
  String get success => 'Success';

  @override
  String get offline => 'You are offline';

  @override
  String get syncing => 'Syncing...';

  @override
  String get syncComplete => 'Sync complete';

  @override
  String get noInternet => 'No internet connection';

  @override
  String licenseExpiring(int days) {
    return 'License expires in $days days';
  }

  @override
  String get uploadDocument => 'Upload Document';

  @override
  String get license => 'License';

  @override
  String get idProof => 'ID Proof';

  @override
  String get policeVerification => 'Police Verification';

  @override
  String get language => 'Language';

  @override
  String get english => 'English';

  @override
  String get arabic => 'Arabic';

  @override
  String get hindi => 'Hindi';

  @override
  String get loginTagline =>
      'Your trips, check-ins and navigation in one place';

  @override
  String get tripsLoadError => 'Couldn\'t load your trips';

  @override
  String get tripLoadError => 'Couldn\'t load this trip';

  @override
  String get refresh => 'Refresh';

  @override
  String get emptyTripsHint =>
      'New assignments from dispatch will appear here.';

  @override
  String get showingSavedTrips => 'Showing saved trips. Pull down to refresh.';

  @override
  String get noMatchingTrips => 'No trips match your search';

  @override
  String get tryDifferentFilter => 'Try a different search or date range.';

  @override
  String get route => 'Route';

  @override
  String get openInMaps => 'Open in Maps';

  @override
  String get callPassenger => 'Call passenger';

  @override
  String get tripDetails => 'Trip details';

  @override
  String get dropTime => 'Drop time';

  @override
  String get booking => 'Booking';

  @override
  String get tripType => 'Trip type';

  @override
  String get estimatedCost => 'Estimated cost';

  @override
  String get actualCost => 'Actual cost';

  @override
  String get distance => 'Distance';

  @override
  String get profileLoadError => 'Couldn\'t load your profile';

  @override
  String get documentsLoadError => 'Couldn\'t load your documents';

  @override
  String get noDocuments => 'No documents uploaded';

  @override
  String get noDocumentsHint =>
      'Upload your licence and ID so dispatch can verify them.';

  @override
  String get docValid => 'Valid';

  @override
  String get docExpiringSoon => 'Expiring soon';

  @override
  String get docExpired => 'Expired';

  @override
  String get docNoExpiry => 'No expiry';

  @override
  String expiresOn(String date) {
    return 'Expires $date';
  }

  @override
  String get agencyTitle => 'Find your agency';

  @override
  String get agencySubtitle => 'Enter the agency code your company gave you';

  @override
  String get agencyCodeHint => 'Agency code';

  @override
  String get agencyCodeRequired => 'Enter your agency code';

  @override
  String get agencyContinue => 'Continue';

  @override
  String get agencyConfirmPrompt => 'Is this your agency?';

  @override
  String get agencyConfirm => 'Yes, continue';

  @override
  String get agencyNotYours => 'Not your agency?';

  @override
  String get agencyInvalid =>
      'We could not find that agency code. Check it with your company.';

  @override
  String get changeAgency => 'Change agency';

  @override
  String get changeAgencyConfirm =>
      'This signs you out and removes the agency from this phone. You will need the agency code again.';

  @override
  String get agencyLabel => 'Agency';

  @override
  String get selectCountry => 'Select country';

  @override
  String get countrySearchHint => 'Search country or code';

  @override
  String get noCountryFound => 'No country found';
}
