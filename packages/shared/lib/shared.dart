/// TravelCRM Pro — Shared Package
///
/// Models, API client, constants, and utilities shared
/// between crm_app and driver_app.
library;

// Storage
export 'core/storage/token_store.dart';

// API Client
export 'api_client/api_client.dart';
export 'api_client/api_endpoints.dart';
export 'api_client/api_exception.dart';

// Constants
export 'constants/app_constants.dart';
export 'constants/storage_keys.dart';

// Models
export 'models/user_model.dart';
export 'models/auth_response.dart';
export 'models/session_model.dart';
export 'models/contact_model.dart';
export 'models/lead_model.dart';
export 'models/follow_up_model.dart';
export 'models/login_history_model.dart';
export 'models/activity_log_model.dart';
export 'models/itinerary_model.dart';
export 'models/itinerary_template_model.dart';
export 'models/rate_card_model.dart';

// Utils
export 'utils/date_utils.dart';
export 'utils/currency_utils.dart';
export 'utils/validators.dart';
export 'utils/id_utils.dart';
