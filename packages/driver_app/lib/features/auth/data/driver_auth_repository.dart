import 'package:dio/dio.dart';
import 'package:flutter/widgets.dart' show WidgetsBinding;
import 'package:shared/shared.dart';
import '../../../core/storage/hive_storage.dart';
import '../../../core/constants/country_codes.dart';
import '../../../core/utils/phone.dart';

/// What the public agency-code lookup reveals: the agency id, its display
/// name and an optional logo. Nothing else.
class AgencyInfo {
  final String code;
  final String tenantId;
  final String name;
  final String? logoUrl;

  /// The agency's currency (INR, GBP...), number locale (en-IN), country and the country its phone numbers are
  /// read in. Null when the server did not send them (an older server).
  final String? currency;
  final String? locale;
  final String? country;
  final String? phoneCountry;

  const AgencyInfo({
    required this.code,
    required this.tenantId,
    required this.name,
    this.logoUrl,
    this.currency,
    this.locale,
    this.country,
    this.phoneCountry,
  });
}

/// The calling code (`+31`) numbers typed without one are read in: the agency's phone country saved when the agency
/// code was confirmed, else its country, else the phone's own region, else the launch market.
String agencyDialCode() {
  String? agencyIso;
  try {
    agencyIso = HiveStorage.agencyPhoneCountry ?? HiveStorage.agencyCountry;
  } catch (_) {
    agencyIso = null;
  }
  String? deviceIso;
  try {
    deviceIso = WidgetsBinding.instance.platformDispatcher.locale.countryCode;
  } catch (_) {
    deviceIso = null;
  }
  return resolveDefaultCountry(agencyIso: agencyIso, deviceIso: deviceIso).dial;
}

class DriverAuthRepository {
  final Dio _dio;
  final String? Function() _tenantId;
  final String Function() _dialCode;

  /// [tenantId] returns the stored agency id; it defaults to the value saved
  /// by the agency-code screen. [dialCode] returns the agency's calling code
  /// (see [agencyDialCode]).
  DriverAuthRepository(this._dio, {String? Function()? tenantId, String Function()? dialCode})
      : _tenantId = tenantId ?? (() => HiveStorage.tenantId),
        _dialCode = dialCode ?? agencyDialCode;

  String _requireTenant() {
    final id = _tenantId();
    if (id == null || id.isEmpty) {
      throw 'Choose your agency first.';
    }
    return id;
  }

  /// Resolves an agency code (the agency's short name). Throws a
  /// [DioException] with status 404 for an unknown code and 429 when the
  /// lookup limit is reached.
  Future<AgencyInfo> lookupAgency(String code) async {
    final clean = code.trim().toLowerCase();
    final response = await _dio.get(ApiEndpoints.driverAgency(clean));
    final data = (response.data as Map)['data'] as Map;
    return AgencyInfo(
      code: clean,
      tenantId: data['tenantId'] as String,
      name: data['name'] as String,
      logoUrl: data['logoUrl'] as String?,
      currency: data['currency'] as String?,
      locale: data['locale'] as String?,
      country: data['country'] as String?,
      phoneCountry: data['phoneDefaultCountry'] as String?,
    );
  }

  Future<Map<String, dynamic>> sendOtp(String phone) async {
    final response = await _dio.post(
      ApiEndpoints.driverLogin,
      data: {
        'phone': normalizePhone(phone, defaultCountryCode: _dialCode()),
        'tenantId': _requireTenant(),
      },
    );
    return response.data;
  }

  Future<Map<String, dynamic>> verifyOtp(String phone, String otp) async {
    final response = await _dio.post(
      ApiEndpoints.driverLoginVerify,
      data: {
        'phone': normalizePhone(phone, defaultCountryCode: _dialCode()),
        'tenantId': _requireTenant(),
        'otp': otp,
      },
    );
    return response.data;
  }

  Future<Map<String, dynamic>> refreshToken(String refreshToken) async {
    final response = await _dio.post(
      ApiEndpoints.driverRefreshToken,
      data: {'refreshToken': refreshToken},
    );
    return response.data;
  }

  Future<void> logout() async {
    await _dio.post(ApiEndpoints.driverLogout);
  }
}
