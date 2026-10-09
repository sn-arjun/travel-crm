/// TravelCRM Pro — Shared Package
///
/// Models, API client, constants, and utilities shared
/// by driver_app (and formerly the Flutter CRM app).
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
export 'models/paginated_response.dart';
export 'models/import_job_model.dart';
export 'models/export_job_model.dart';
export 'models/flyer_template_model.dart';
export 'models/image_library_model.dart';
export 'models/contact_segment_model.dart';
export 'models/tenant_branding_model.dart';
export 'models/marketing_campaign_model.dart';
export 'models/generated_flyer_model.dart';
export 'models/vehicle_model.dart';
export 'models/driver_model.dart';
export 'models/trip_assignment_model.dart';
export 'models/vehicle_rate_card_model.dart';
export 'models/document_model.dart';
export 'models/bookmark_model.dart';
export 'models/voip_settings_model.dart';
export 'models/call_log_model.dart';
export 'models/call_analytics_model.dart';
export 'models/twilio_number_model.dart';
export 'models/voip_number_model.dart';
export 'models/call_transcript_model.dart';
export 'models/ai_extraction_model.dart';
export 'models/ai_conversation_model.dart';
export 'models/ai_intelligence_model.dart';
export 'models/chatbot_model.dart';
export 'models/business_intelligence_model.dart';
export 'models/whatsapp_campaign_model.dart';
export 'models/social_content_model.dart';
export 'models/marketing_suggestion_model.dart';

// Utils
export 'utils/date_utils.dart';
export 'utils/currency_utils.dart';
export 'utils/validators.dart';
export 'utils/id_utils.dart';
