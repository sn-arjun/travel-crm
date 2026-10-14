// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for Arabic (`ar`).
class AppLocalizationsAr extends AppLocalizations {
  AppLocalizationsAr([String locale = 'ar']) : super(locale);

  @override
  String get appTitle => 'ترافل سي آر إم - سائق';

  @override
  String get loginTitle => 'تسجيل دخول السائق';

  @override
  String get loginSubtitle => 'أدخل رقم هاتفك للبدء';

  @override
  String get phoneHint => 'رقم الهاتف';

  @override
  String get sendOtp => 'إرسال رمز التحقق';

  @override
  String get enterOtp => 'أدخل رمز التحقق';

  @override
  String otpSentTo(String phone) {
    return 'تم إرسال الرمز إلى $phone';
  }

  @override
  String get verify => 'تحقق';

  @override
  String get resendOtp => 'إعادة إرسال';

  @override
  String resendIn(int seconds) {
    return 'إعادة الإرسال خلال $seconds ثانية';
  }

  @override
  String get invalidPhone => 'يرجى إدخال رقم هاتف صالح';

  @override
  String get invalidOtp => 'رمز غير صالح';

  @override
  String get accountInactive => 'حسابك غير نشط';

  @override
  String get rateLimited => 'محاولات كثيرة';

  @override
  String get myTrips => 'رحلاتي';

  @override
  String get today => 'اليوم';

  @override
  String get upcoming => 'القادمة';

  @override
  String get past => 'السابقة';

  @override
  String get noTripsToday => 'لا رحلات اليوم';

  @override
  String get noUpcomingTrips => 'لا رحلات قادمة';

  @override
  String get noPastTrips => 'لا رحلات سابقة';

  @override
  String get tripDetail => 'تفاصيل الرحلة';

  @override
  String get pickupLocation => 'موقع الاستلام';

  @override
  String get dropLocation => 'موقع التوصيل';

  @override
  String get passenger => 'الراكب';

  @override
  String get vehicle => 'المركبة';

  @override
  String get specialInstructions => 'تعليمات خاصة';

  @override
  String get timeline => 'الجدول الزمني';

  @override
  String get accept => 'قبول';

  @override
  String get reject => 'رفض';

  @override
  String get acceptTrip => 'قبول الرحلة';

  @override
  String get acceptTripConfirm => 'هل أنت متأكد من قبول هذه الرحلة؟';

  @override
  String get rejectTrip => 'رفض الرحلة';

  @override
  String get enterReason => 'أدخل سبب الرفض';

  @override
  String get reasonTooShort => 'يجب أن يكون السبب 10 أحرف على الأقل';

  @override
  String get scheduleConflict => 'تعارض في المواعيد';

  @override
  String get tooFar => 'بعيد جداً';

  @override
  String get vehicleIssue => 'مشكلة في المركبة';

  @override
  String get personalEmergency => 'طوارئ شخصية';

  @override
  String get other => 'أخرى';

  @override
  String get confirmReject => 'تأكيد الرفض';

  @override
  String get tripAccepted => 'تم قبول الرحلة';

  @override
  String get tripRejected => 'تم رفض الرحلة';

  @override
  String get enRoute => 'في الطريق';

  @override
  String get startTrip => 'بدء الرحلة';

  @override
  String get markPickedUp => 'تم الاستلام';

  @override
  String get markCompleted => 'تم الإكمال';

  @override
  String get navigate => 'توجيه';

  @override
  String get checkIn => 'تسجيل الوصول';

  @override
  String get checkOut => 'تسجيل المغادرة';

  @override
  String get confirmCheckIn => 'تأكيد الوصول';

  @override
  String get confirmCheckOut => 'تأكيد المغادرة';

  @override
  String get gettingLocation => 'جاري تحديد الموقع...';

  @override
  String get locationError => 'تعذر تحديد الموقع';

  @override
  String get retryLocation => 'إعادة المحاولة';

  @override
  String get takePhoto => 'التقاط صورة';

  @override
  String get retake => 'إعادة الالتقاط';

  @override
  String get removePhoto => 'حذف';

  @override
  String get checkInSuccess => 'تم تسجيل الوصول';

  @override
  String get checkOutSuccess => 'تم تسجيل المغادرة';

  @override
  String get alreadyCheckedIn => 'تم التسجيل مسبقاً';

  @override
  String get alreadyCheckedOut => 'تم التسجيل مسبقاً';

  @override
  String get openInGoogleMaps => 'خرائط جوجل';

  @override
  String get openInWaze => 'ويز';

  @override
  String get chooseNavApp => 'اختر تطبيق الملاحة';

  @override
  String get history => 'سجل الرحلات';

  @override
  String get filterByDate => 'تصفية حسب التاريخ';

  @override
  String get last7Days => 'آخر 7 أيام';

  @override
  String get last30Days => 'آخر 30 يوم';

  @override
  String get thisMonth => 'هذا الشهر';

  @override
  String get allTime => 'الكل';

  @override
  String get customRange => 'نطاق مخصص';

  @override
  String get searchTrips => 'بحث...';

  @override
  String tripCount(int count) {
    return '$count رحلة';
  }

  @override
  String get profile => 'ملفي الشخصي';

  @override
  String get editProfile => 'تعديل الملف';

  @override
  String get documents => 'المستندات';

  @override
  String get logout => 'تسجيل الخروج';

  @override
  String get logoutConfirm => 'هل أنت متأكد؟';

  @override
  String get rating => 'التقييم';

  @override
  String get totalTrips => 'إجمالي الرحلات';

  @override
  String get memberSince => 'عضو منذ';

  @override
  String get email => 'البريد الإلكتروني';

  @override
  String get address => 'العنوان';

  @override
  String get emergencyContact => 'جهة اتصال الطوارئ';

  @override
  String get save => 'حفظ';

  @override
  String get cancel => 'إلغاء';

  @override
  String get confirm => 'تأكيد';

  @override
  String get loading => 'جاري التحميل...';

  @override
  String get error => 'خطأ';

  @override
  String get retry => 'إعادة المحاولة';

  @override
  String get success => 'نجاح';

  @override
  String get offline => 'أنت غير متصل';

  @override
  String get syncing => 'جاري المزامنة...';

  @override
  String get syncComplete => 'اكتملت المزامنة';

  @override
  String get noInternet => 'لا يوجد اتصال';

  @override
  String licenseExpiring(int days) {
    return 'تنتهي الرخصة خلال $days يوم';
  }

  @override
  String get uploadDocument => 'رفع مستند';

  @override
  String get license => 'رخصة القيادة';

  @override
  String get idProof => 'إثبات الهوية';

  @override
  String get policeVerification => 'التحقق الأمني';

  @override
  String get language => 'اللغة';

  @override
  String get english => 'الإنجليزية';

  @override
  String get arabic => 'العربية';

  @override
  String get hindi => 'الهندية';

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
  String get agencyTitle => 'ابحث عن وكالتك';

  @override
  String get agencySubtitle => 'أدخل رمز الوكالة الذي أعطته لك شركتك';

  @override
  String get agencyCodeHint => 'رمز الوكالة';

  @override
  String get agencyCodeRequired => 'أدخل رمز الوكالة';

  @override
  String get agencyContinue => 'متابعة';

  @override
  String get agencyConfirmPrompt => 'هل هذه وكالتك؟';

  @override
  String get agencyConfirm => 'نعم، متابعة';

  @override
  String get agencyNotYours => 'ليست وكالتك؟';

  @override
  String get agencyInvalid =>
      'لم نتمكن من العثور على رمز الوكالة هذا. تحقق منه مع شركتك.';

  @override
  String get changeAgency => 'تغيير الوكالة';

  @override
  String get changeAgencyConfirm =>
      'سيتم تسجيل خروجك وإزالة الوكالة من هذا الهاتف. ستحتاج إلى رمز الوكالة مرة أخرى.';

  @override
  String get agencyLabel => 'الوكالة';

  @override
  String get selectCountry => 'اختر الدولة';

  @override
  String get countrySearchHint => 'ابحث عن دولة أو رمز';

  @override
  String get noCountryFound => 'لم يتم العثور على دولة';
}
