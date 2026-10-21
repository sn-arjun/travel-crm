// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for Hindi (`hi`).
class AppLocalizationsHi extends AppLocalizations {
  AppLocalizationsHi([String locale = 'hi']) : super(locale);

  @override
  String get appTitle => 'TravelCRM ड्राइवर';

  @override
  String get loginTitle => 'ड्राइवर लॉगिन';

  @override
  String get loginSubtitle => 'शुरू करने के लिए अपना फ़ोन नंबर दर्ज करें';

  @override
  String get phoneHint => 'फ़ोन नंबर';

  @override
  String get sendOtp => 'OTP भेजें';

  @override
  String get enterOtp => 'OTP दर्ज करें';

  @override
  String otpSentTo(String phone) {
    return '$phone पर OTP भेजा गया';
  }

  @override
  String get verify => 'सत्यापित करें';

  @override
  String get resendOtp => 'OTP पुनः भेजें';

  @override
  String resendIn(int seconds) {
    return '$seconds सेकंड में पुनः भेजें';
  }

  @override
  String get invalidPhone => 'कृपया एक मान्य फ़ोन नंबर दर्ज करें';

  @override
  String get invalidOtp => 'अमान्य OTP। कृपया पुनः प्रयास करें।';

  @override
  String get accountInactive =>
      'आपका खाता निष्क्रिय है। अपनी कंपनी से संपर्क करें।';

  @override
  String get rateLimited => 'बहुत अधिक प्रयास। कृपया प्रतीक्षा करें।';

  @override
  String get myTrips => 'मेरी यात्राएँ';

  @override
  String get today => 'आज';

  @override
  String get upcoming => 'आगामी';

  @override
  String get past => 'पिछली';

  @override
  String get noTripsToday => 'आज कोई यात्रा निर्धारित नहीं';

  @override
  String get noUpcomingTrips => 'कोई आगामी यात्रा नहीं';

  @override
  String get noPastTrips => 'कोई पिछली यात्रा नहीं';

  @override
  String get tripDetail => 'यात्रा विवरण';

  @override
  String get pickupLocation => 'पिकअप स्थान';

  @override
  String get dropLocation => 'ड्रॉप स्थान';

  @override
  String get passenger => 'यात्री';

  @override
  String get vehicle => 'वाहन';

  @override
  String get specialInstructions => 'विशेष निर्देश';

  @override
  String get timeline => 'टाइमलाइन';

  @override
  String get accept => 'स्वीकार';

  @override
  String get reject => 'अस्वीकार';

  @override
  String get acceptTrip => 'यात्रा स्वीकार करें';

  @override
  String get acceptTripConfirm =>
      'क्या आप वाकई इस यात्रा को स्वीकार करना चाहते हैं?';

  @override
  String get rejectTrip => 'यात्रा अस्वीकार करें';

  @override
  String get enterReason => 'अस्वीकृति का कारण दर्ज करें';

  @override
  String get reasonTooShort => 'कारण कम से कम 10 अक्षर का होना चाहिए';

  @override
  String get scheduleConflict => 'शेड्यूल संघर्ष';

  @override
  String get tooFar => 'बहुत दूर';

  @override
  String get vehicleIssue => 'वाहन समस्या';

  @override
  String get personalEmergency => 'व्यक्तिगत आपातकाल';

  @override
  String get other => 'अन्य';

  @override
  String get confirmReject => 'अस्वीकृति की पुष्टि करें';

  @override
  String get tripAccepted => 'यात्रा सफलतापूर्वक स्वीकार की गई';

  @override
  String get tripRejected => 'यात्रा अस्वीकार की गई';

  @override
  String get enRoute => 'रास्ते में';

  @override
  String get startTrip => 'यात्रा शुरू करें';

  @override
  String get markPickedUp => 'पिकअप पूर्ण';

  @override
  String get markCompleted => 'पूर्ण करें';

  @override
  String get navigate => 'नेविगेट';

  @override
  String get checkIn => 'चेक इन';

  @override
  String get checkOut => 'चेक आउट';

  @override
  String get confirmCheckIn => 'चेक-इन की पुष्टि करें';

  @override
  String get confirmCheckOut => 'चेक-आउट की पुष्टि करें';

  @override
  String get gettingLocation => 'आपकी लोकेशन प्राप्त हो रही है...';

  @override
  String get locationError => 'लोकेशन प्राप्त नहीं हो सकी';

  @override
  String get retryLocation => 'पुनः प्रयास';

  @override
  String get takePhoto => 'फ़ोटो लें';

  @override
  String get retake => 'दोबारा लें';

  @override
  String get removePhoto => 'हटाएँ';

  @override
  String get checkInSuccess => 'चेक इन सफल';

  @override
  String get checkOutSuccess => 'चेक आउट सफल';

  @override
  String get alreadyCheckedIn => 'पहले से चेक इन किया हुआ';

  @override
  String get alreadyCheckedOut => 'पहले से चेक आउट किया हुआ';

  @override
  String get openInGoogleMaps => 'Google Maps';

  @override
  String get openInWaze => 'Waze';

  @override
  String get chooseNavApp => 'नेविगेशन ऐप चुनें';

  @override
  String get history => 'यात्रा इतिहास';

  @override
  String get filterByDate => 'तारीख से फ़िल्टर करें';

  @override
  String get last7Days => 'पिछले 7 दिन';

  @override
  String get last30Days => 'पिछले 30 दिन';

  @override
  String get thisMonth => 'इस महीने';

  @override
  String get allTime => 'सब समय';

  @override
  String get customRange => 'कस्टम रेंज';

  @override
  String get searchTrips => 'यात्राएँ खोजें...';

  @override
  String tripCount(int count) {
    return '$count यात्राएँ';
  }

  @override
  String get profile => 'मेरी प्रोफ़ाइल';

  @override
  String get editProfile => 'प्रोफ़ाइल संपादित करें';

  @override
  String get documents => 'दस्तावेज़';

  @override
  String get logout => 'लॉगआउट';

  @override
  String get logoutConfirm => 'क्या आप वाकई लॉगआउट करना चाहते हैं?';

  @override
  String get rating => 'रेटिंग';

  @override
  String get totalTrips => 'कुल यात्राएँ';

  @override
  String get memberSince => 'सदस्य तब से';

  @override
  String get email => 'ईमेल';

  @override
  String get address => 'पता';

  @override
  String get emergencyContact => 'आपातकालीन संपर्क';

  @override
  String get save => 'सहेजें';

  @override
  String get cancel => 'रद्द करें';

  @override
  String get confirm => 'पुष्टि करें';

  @override
  String get loading => 'लोड हो रहा है...';

  @override
  String get error => 'त्रुटि';

  @override
  String get retry => 'पुनः प्रयास';

  @override
  String get success => 'सफल';

  @override
  String get offline => 'आप ऑफ़लाइन हैं';

  @override
  String get syncing => 'सिंक हो रहा है...';

  @override
  String get syncComplete => 'सिंक पूर्ण';

  @override
  String get noInternet => 'इंटरनेट कनेक्शन नहीं है';

  @override
  String licenseExpiring(int days) {
    return 'लाइसेंस $days दिनों में समाप्त हो रहा है';
  }

  @override
  String get uploadDocument => 'दस्तावेज़ अपलोड करें';

  @override
  String get license => 'लाइसेंस';

  @override
  String get idProof => 'पहचान पत्र';

  @override
  String get policeVerification => 'पुलिस सत्यापन';

  @override
  String get language => 'भाषा';

  @override
  String get english => 'अंग्रेज़ी';

  @override
  String get arabic => 'अरबी';

  @override
  String get hindi => 'हिंदी';

  @override
  String get dutch => 'डच';

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
  String get agencyTitle => 'अपनी एजेंसी खोजें';

  @override
  String get agencySubtitle =>
      'अपनी कंपनी द्वारा दिया गया एजेंसी कोड दर्ज करें';

  @override
  String get agencyCodeHint => 'एजेंसी कोड';

  @override
  String get agencyCodeRequired => 'अपना एजेंसी कोड दर्ज करें';

  @override
  String get agencyContinue => 'आगे बढ़ें';

  @override
  String get agencyConfirmPrompt => 'क्या यह आपकी एजेंसी है?';

  @override
  String get agencyConfirm => 'हाँ, आगे बढ़ें';

  @override
  String get agencyNotYours => 'यह आपकी एजेंसी नहीं है?';

  @override
  String get agencyInvalid =>
      'यह एजेंसी कोड नहीं मिला। अपनी कंपनी से जाँच लें।';

  @override
  String get changeAgency => 'एजेंसी बदलें';

  @override
  String get changeAgencyConfirm =>
      'इससे आप साइन आउट हो जाएँगे और एजेंसी इस फ़ोन से हट जाएगी। आपको एजेंसी कोड फिर से चाहिए होगा।';

  @override
  String get agencyLabel => 'एजेंसी';

  @override
  String get selectCountry => 'देश चुनें';

  @override
  String get countrySearchHint => 'देश या कोड खोजें';

  @override
  String get noCountryFound => 'कोई देश नहीं मिला';

  @override
  String get stopsTitle => 'Stops';

  @override
  String coachSummary(int stops, int passengers) {
    String _temp0 = intl.Intl.pluralLogic(
      stops,
      locale: localeName,
      other: '$stops stops',
      one: '1 stop',
    );
    String _temp1 = intl.Intl.pluralLogic(
      passengers,
      locale: localeName,
      other: '$passengers passengers',
      one: '1 passenger',
    );
    return '$_temp0, $_temp1';
  }

  @override
  String nextStopAt(String name, String time) {
    return 'Next: $name at $time';
  }

  @override
  String nextStopOnly(String name) {
    return 'Next: $name';
  }

  @override
  String get crewTourLeader => 'Tour leader';

  @override
  String get stopStatusPending => 'Pending';

  @override
  String get stopStatusArrived => 'Arrived';

  @override
  String get stopStatusDeparted => 'Departed';

  @override
  String get stopStatusSkipped => 'Skipped';

  @override
  String get stopArrived => 'Arrived';

  @override
  String get stopDepart => 'Depart';

  @override
  String get documentsCheckBadge => 'Documents check';

  @override
  String get documentsChecked => 'Documents checked';

  @override
  String get markDocumentsChecked => 'Mark documents checked';

  @override
  String get passengerBoarded => 'Boarded';

  @override
  String get passengerNoShow => 'No-show';

  @override
  String get passengerMore => 'More';

  @override
  String passengerSeats(int count) {
    return '$count seats';
  }

  @override
  String get completeStop => 'Complete stop';

  @override
  String get completeStopPendingTitle => 'Passengers not ticked';

  @override
  String completeStopPendingBody(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count passengers have',
      one: '1 passenger has',
    );
    return '$_temp0 not been ticked yet. Complete the stop anyway?';
  }

  @override
  String get headcountThisStop => 'This stop';

  @override
  String get headcountOverall => 'Overall';

  @override
  String headcountBoarded(int boarded, int expected) {
    return '$boarded of $expected boarded';
  }

  @override
  String headcountNoShow(int count) {
    return '$count no-show';
  }

  @override
  String get passengersAtStop => 'Passengers boarding here';

  @override
  String get noPassengersAtStop => 'No passengers board here';

  @override
  String changesWaiting(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count changes waiting to be sent',
      one: '1 change waiting to be sent',
    );
    return '$_temp0';
  }

  @override
  String get savedTripNoSignal => 'No signal. Showing the saved trip.';

  @override
  String get stopGone => 'This stop is no longer on the trip.';
}
