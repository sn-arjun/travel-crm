// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for Dutch Flemish (`nl`).
class AppLocalizationsNl extends AppLocalizations {
  AppLocalizationsNl([String locale = 'nl']) : super(locale);

  @override
  String get appTitle => 'TravelCRM Chauffeur';

  @override
  String get loginTitle => 'Inloggen als chauffeur';

  @override
  String get loginSubtitle => 'Voer uw telefoonnummer in om te beginnen';

  @override
  String get phoneHint => 'Telefoonnummer';

  @override
  String get sendOtp => 'Code verzenden';

  @override
  String get enterOtp => 'Voer de code in';

  @override
  String otpSentTo(String phone) {
    return 'Code verzonden naar $phone';
  }

  @override
  String get verify => 'Verifiëren';

  @override
  String get resendOtp => 'Code opnieuw verzenden';

  @override
  String resendIn(int seconds) {
    return 'Opnieuw verzenden over ${seconds}s';
  }

  @override
  String get invalidPhone => 'Voer een geldig telefoonnummer in';

  @override
  String get invalidOtp => 'Ongeldige code. Probeer het opnieuw.';

  @override
  String get accountInactive =>
      'Uw account is niet actief. Neem contact op met uw bedrijf.';

  @override
  String get rateLimited => 'Te veel pogingen. Even geduld.';

  @override
  String get myTrips => 'Mijn ritten';

  @override
  String get today => 'Vandaag';

  @override
  String get upcoming => 'Gepland';

  @override
  String get past => 'Afgelopen';

  @override
  String get noTripsToday => 'Geen ritten gepland voor vandaag';

  @override
  String get noUpcomingTrips => 'Geen geplande ritten';

  @override
  String get noPastTrips => 'Geen afgelopen ritten';

  @override
  String get tripDetail => 'Ritdetails';

  @override
  String get pickupLocation => 'Ophaalplaats';

  @override
  String get dropLocation => 'Afzetplaats';

  @override
  String get passenger => 'Passagier';

  @override
  String get vehicle => 'Voertuig';

  @override
  String get specialInstructions => 'Bijzondere instructies';

  @override
  String get timeline => 'Verloop';

  @override
  String get accept => 'Accepteren';

  @override
  String get reject => 'Weigeren';

  @override
  String get acceptTrip => 'Rit accepteren';

  @override
  String get acceptTripConfirm =>
      'Weet u zeker dat u deze rit wilt accepteren?';

  @override
  String get rejectTrip => 'Rit weigeren';

  @override
  String get enterReason => 'Geef de reden van weigering op';

  @override
  String get reasonTooShort => 'De reden moet uit minimaal 10 tekens bestaan';

  @override
  String get scheduleConflict => 'Planningsconflict';

  @override
  String get tooFar => 'Te ver weg';

  @override
  String get vehicleIssue => 'Probleem met het voertuig';

  @override
  String get personalEmergency => 'Persoonlijke noodsituatie';

  @override
  String get other => 'Anders';

  @override
  String get confirmReject => 'Weigering bevestigen';

  @override
  String get tripAccepted => 'Rit geaccepteerd';

  @override
  String get tripRejected => 'Rit geweigerd';

  @override
  String get enRoute => 'Onderweg';

  @override
  String get startTrip => 'Rit starten';

  @override
  String get markPickedUp => 'Markeren als opgehaald';

  @override
  String get markCompleted => 'Markeren als voltooid';

  @override
  String get navigate => 'Navigeren';

  @override
  String get checkIn => 'Inchecken';

  @override
  String get checkOut => 'Uitchecken';

  @override
  String get confirmCheckIn => 'Inchecken bevestigen';

  @override
  String get confirmCheckOut => 'Uitchecken bevestigen';

  @override
  String get gettingLocation => 'Uw locatie wordt bepaald...';

  @override
  String get locationError => 'De locatie kon niet worden bepaald';

  @override
  String get retryLocation => 'Opnieuw proberen';

  @override
  String get takePhoto => 'Foto maken';

  @override
  String get retake => 'Opnieuw maken';

  @override
  String get removePhoto => 'Verwijderen';

  @override
  String get checkInSuccess => 'Succesvol ingecheckt';

  @override
  String get checkOutSuccess => 'Succesvol uitgecheckt';

  @override
  String get alreadyCheckedIn => 'U bent al ingecheckt';

  @override
  String get alreadyCheckedOut => 'U bent al uitgecheckt';

  @override
  String get openInGoogleMaps => 'Google Maps';

  @override
  String get openInWaze => 'Waze';

  @override
  String get chooseNavApp => 'Kies een navigatie-app';

  @override
  String get history => 'Ritgeschiedenis';

  @override
  String get filterByDate => 'Filteren op datum';

  @override
  String get last7Days => 'Laatste 7 dagen';

  @override
  String get last30Days => 'Laatste 30 dagen';

  @override
  String get thisMonth => 'Deze maand';

  @override
  String get allTime => 'Alles';

  @override
  String get customRange => 'Eigen periode';

  @override
  String get searchTrips => 'Ritten zoeken...';

  @override
  String tripCount(int count) {
    return '$count ritten';
  }

  @override
  String get profile => 'Mijn profiel';

  @override
  String get editProfile => 'Profiel bewerken';

  @override
  String get documents => 'Documenten';

  @override
  String get logout => 'Uitloggen';

  @override
  String get logoutConfirm => 'Weet u zeker dat u wilt uitloggen?';

  @override
  String get rating => 'Beoordeling';

  @override
  String get totalTrips => 'Totaal aantal ritten';

  @override
  String get memberSince => 'Lid sinds';

  @override
  String get email => 'E-mail';

  @override
  String get address => 'Adres';

  @override
  String get emergencyContact => 'Noodcontact';

  @override
  String get save => 'Opslaan';

  @override
  String get cancel => 'Annuleren';

  @override
  String get confirm => 'Bevestigen';

  @override
  String get loading => 'Laden...';

  @override
  String get error => 'Fout';

  @override
  String get retry => 'Opnieuw proberen';

  @override
  String get success => 'Gelukt';

  @override
  String get offline => 'U bent offline';

  @override
  String get syncing => 'Synchroniseren...';

  @override
  String get syncComplete => 'Synchronisatie voltooid';

  @override
  String get noInternet => 'Geen internetverbinding';

  @override
  String licenseExpiring(int days) {
    return 'Rijbewijs verloopt over $days dagen';
  }

  @override
  String get uploadDocument => 'Document uploaden';

  @override
  String get license => 'Rijbewijs';

  @override
  String get idProof => 'Identiteitsbewijs';

  @override
  String get policeVerification => 'Verklaring omtrent gedrag';

  @override
  String get language => 'Taal';

  @override
  String get english => 'Engels';

  @override
  String get arabic => 'Arabisch';

  @override
  String get hindi => 'Hindi';

  @override
  String get dutch => 'Nederlands';

  @override
  String get loginTagline => 'Uw ritten, check-ins en navigatie op één plek';

  @override
  String get tripsLoadError => 'Uw ritten konden niet worden geladen';

  @override
  String get tripLoadError => 'Deze rit kon niet worden geladen';

  @override
  String get refresh => 'Vernieuwen';

  @override
  String get emptyTripsHint =>
      'Nieuwe opdrachten van de planning verschijnen hier.';

  @override
  String get showingSavedTrips =>
      'Opgeslagen ritten worden getoond. Trek omlaag om te vernieuwen.';

  @override
  String get noMatchingTrips => 'Geen ritten gevonden voor uw zoekopdracht';

  @override
  String get tryDifferentFilter =>
      'Probeer een andere zoekopdracht of periode.';

  @override
  String get route => 'Route';

  @override
  String get openInMaps => 'Openen in Kaarten';

  @override
  String get callPassenger => 'Passagier bellen';

  @override
  String get tripDetails => 'Ritdetails';

  @override
  String get dropTime => 'Aankomsttijd';

  @override
  String get booking => 'Boeking';

  @override
  String get tripType => 'Soort rit';

  @override
  String get estimatedCost => 'Geschatte kosten';

  @override
  String get actualCost => 'Werkelijke kosten';

  @override
  String get distance => 'Afstand';

  @override
  String get profileLoadError => 'Uw profiel kon niet worden geladen';

  @override
  String get documentsLoadError => 'Uw documenten konden niet worden geladen';

  @override
  String get noDocuments => 'Geen documenten geüpload';

  @override
  String get noDocumentsHint =>
      'Upload uw rijbewijs en identiteitsbewijs zodat de planning ze kan controleren.';

  @override
  String get docValid => 'Geldig';

  @override
  String get docExpiringSoon => 'Verloopt binnenkort';

  @override
  String get docExpired => 'Verlopen';

  @override
  String get docNoExpiry => 'Geen vervaldatum';

  @override
  String expiresOn(String date) {
    return 'Verloopt op $date';
  }

  @override
  String get agencyTitle => 'Zoek uw bureau';

  @override
  String get agencySubtitle =>
      'Voer de bureaucode in die uw bedrijf u heeft gegeven';

  @override
  String get agencyCodeHint => 'Bureaucode';

  @override
  String get agencyCodeRequired => 'Voer uw bureaucode in';

  @override
  String get agencyContinue => 'Doorgaan';

  @override
  String get agencyConfirmPrompt => 'Is dit uw bureau?';

  @override
  String get agencyConfirm => 'Ja, doorgaan';

  @override
  String get agencyNotYours => 'Niet uw bureau?';

  @override
  String get agencyInvalid =>
      'We konden die bureaucode niet vinden. Controleer de code bij uw bedrijf.';

  @override
  String get changeAgency => 'Bureau wijzigen';

  @override
  String get changeAgencyConfirm =>
      'U wordt hiermee uitgelogd en het bureau wordt van deze telefoon verwijderd. U hebt de bureaucode dan opnieuw nodig.';

  @override
  String get agencyLabel => 'Bureau';

  @override
  String get selectCountry => 'Land kiezen';

  @override
  String get countrySearchHint => 'Zoek land of landcode';

  @override
  String get noCountryFound => 'Geen land gevonden';

  @override
  String get stopsTitle => 'Haltes';

  @override
  String coachSummary(int stops, int passengers) {
    String _temp0 = intl.Intl.pluralLogic(
      stops,
      locale: localeName,
      other: '$stops haltes',
      one: '1 halte',
    );
    String _temp1 = intl.Intl.pluralLogic(
      passengers,
      locale: localeName,
      other: '$passengers passagiers',
      one: '1 passagier',
    );
    return '$_temp0, $_temp1';
  }

  @override
  String nextStopAt(String name, String time) {
    return 'Volgende: $name om $time';
  }

  @override
  String nextStopOnly(String name) {
    return 'Volgende: $name';
  }

  @override
  String get crewTourLeader => 'Reisleider';

  @override
  String get stopStatusPending => 'Gepland';

  @override
  String get stopStatusArrived => 'Aangekomen';

  @override
  String get stopStatusDeparted => 'Vertrokken';

  @override
  String get stopStatusSkipped => 'Overgeslagen';

  @override
  String get stopArrived => 'Aangekomen';

  @override
  String get stopDepart => 'Vertrek';

  @override
  String get documentsCheckBadge => 'Documentcontrole';

  @override
  String get documentsChecked => 'Documenten gecontroleerd';

  @override
  String get markDocumentsChecked => 'Documenten als gecontroleerd markeren';

  @override
  String get passengerBoarded => 'Aan boord';

  @override
  String get passengerNoShow => 'Niet verschenen';

  @override
  String get passengerMore => 'Meer';

  @override
  String passengerSeats(int count) {
    return '$count plaatsen';
  }

  @override
  String get completeStop => 'Halte afronden';

  @override
  String get completeStopPendingTitle => 'Passagiers niet afgevinkt';

  @override
  String completeStopPendingBody(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count passagiers zijn',
      one: '1 passagier is',
    );
    return '$_temp0 nog niet afgevinkt. De halte toch afronden?';
  }

  @override
  String get headcountThisStop => 'Deze halte';

  @override
  String get headcountOverall => 'Totaal';

  @override
  String headcountBoarded(int boarded, int expected) {
    return '$boarded van $expected aan boord';
  }

  @override
  String headcountNoShow(int count) {
    return '$count niet verschenen';
  }

  @override
  String get passengersAtStop => 'Passagiers die hier instappen';

  @override
  String get noPassengersAtStop => 'Hier stapt niemand in';

  @override
  String changesWaiting(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count wijzigingen wachten om verzonden te worden',
      one: '1 wijziging wacht om verzonden te worden',
    );
    return '$_temp0';
  }

  @override
  String get savedTripNoSignal =>
      'Geen verbinding. De opgeslagen rit wordt getoond.';

  @override
  String get stopGone => 'Deze halte staat niet meer op de rit.';
}
