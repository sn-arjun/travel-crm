import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../core/widgets/app_scaffold.dart';
import '../features/auth/data/auth_provider.dart';
import '../features/auth/data/auth_state.dart';
import '../features/auth/presentation/forgot_password_screen.dart';
import '../features/auth/presentation/login_screen.dart';
import '../features/auth/presentation/otp_login_screen.dart';
import '../features/auth/presentation/reset_password_screen.dart';
import '../features/auth/presentation/setup_account_screen.dart';
import '../features/auth/presentation/biometric_prompt_screen.dart';
import '../features/auth/presentation/splash_screen.dart';
import '../features/notifications/notifications_screen.dart';
import '../features/notifications/data/notification_provider.dart';
import '../features/notifications/presentation/notification_preferences_screen.dart';
import '../features/notifications/presentation/send_announcement_screen.dart';
import '../features/dashboard/dashboard_screen.dart';
import '../features/onboarding/onboarding_screen.dart';
import '../features/settings/activity_log_screen.dart';
import '../features/settings/company_settings_screen.dart';
import '../features/settings/login_history_screen.dart';
import '../features/settings/profile_screen.dart';
import '../features/settings/sessions_screen.dart';
import '../features/settings/settings_screen.dart';
import '../features/contacts/presentation/contact_detail_screen.dart';
import '../features/contacts/presentation/contact_form_screen.dart';
import '../features/imports/presentation/screens/import_wizard_screen.dart';
import '../features/contacts/presentation/contact_list_screen.dart';
import '../features/contacts/presentation/contact_merge_screen.dart';
import '../features/settings/user_management_screen.dart';
import '../features/leads/presentation/screens/lead_pipeline_screen.dart';
import '../features/leads/presentation/screens/lead_list_screen.dart';
import '../features/leads/presentation/screens/lead_form_screen.dart';
import '../features/leads/presentation/screens/lead_detail_screen.dart';
import '../features/leads/presentation/screens/my_followups_screen.dart';
import '../features/settings/routing_rules_screen.dart';
import '../features/settings/followup_sequences_screen.dart';
import '../features/itineraries/presentation/screens/itinerary_list_screen.dart';
import '../features/itineraries/presentation/screens/itinerary_builder_screen.dart';
import '../features/itineraries/presentation/screens/itinerary_detail_screen.dart';
import '../features/itineraries/presentation/screens/pdf_preview_screen.dart';
import '../features/itineraries/presentation/screens/rate_card_list_screen.dart';
import '../features/itineraries/presentation/screens/rate_card_form_screen.dart';
import '../features/itineraries/presentation/screens/template_browser_screen.dart';
import '../features/invoices/presentation/screens/invoice_list_screen.dart';
import '../features/invoices/presentation/screens/invoice_form_screen.dart';
import '../features/invoices/presentation/screens/invoice_detail_screen.dart';
import '../features/invoices/presentation/screens/payment_list_screen.dart';
import '../features/communications/presentation/screens/communication_hub_screen.dart';
import '../features/communications/presentation/screens/communication_log_screen.dart';
import '../features/communications/presentation/screens/template_list_screen.dart';
import '../features/communications/presentation/screens/template_editor_screen.dart';
import '../features/communications/presentation/screens/bulk_send_screen.dart';
import '../features/communications/presentation/screens/email_compose_screen.dart';
import '../features/communications/presentation/screens/campaign_list_screen.dart';
import '../features/vouchers/presentation/screens/voucher_list_screen.dart';
import '../features/vouchers/presentation/screens/voucher_form_screen.dart';
import '../features/vouchers/presentation/screens/voucher_detail_screen.dart';
import '../features/suppliers/presentation/screens/supplier_list_screen.dart';
import '../features/suppliers/presentation/screens/supplier_form_screen.dart';
import '../features/suppliers/presentation/screens/supplier_detail_screen.dart';
import '../features/suppliers/presentation/screens/rate_comparison_screen.dart';
import '../features/visa/presentation/screens/traveller_list_screen.dart';
import '../features/visa/presentation/screens/traveller_form_screen.dart';
import '../features/visa/presentation/screens/traveller_detail_screen.dart';
import '../features/visa/presentation/screens/visa_list_screen.dart';
import '../features/visa/presentation/screens/visa_form_screen.dart';
import '../features/visa/presentation/screens/visa_detail_screen.dart';
import '../features/visa/presentation/screens/visa_dashboard_screen.dart';
import '../features/planner/presentation/screens/calendar_screen.dart';
import '../features/planner/presentation/screens/event_form_screen.dart';
import '../features/tasks/presentation/screens/task_list_screen.dart';
import '../features/tasks/presentation/screens/task_form_screen.dart';
import '../features/tasks/presentation/screens/task_detail_screen.dart';
import '../features/reports/presentation/screens/reports_dashboard_screen.dart';
import '../features/reports/presentation/screens/sales_summary_report_screen.dart';
import '../features/reports/presentation/screens/win_loss_report_screen.dart';
import '../features/reports/presentation/screens/revenue_summary_report_screen.dart';
import '../features/reports/presentation/screens/collections_report_screen.dart';
import '../features/reports/presentation/screens/tax_report_screen.dart';
import '../features/reports/presentation/screens/pipeline_summary_report_screen.dart';
import '../features/reports/presentation/screens/lead_ageing_report_screen.dart';
import '../features/reports/presentation/screens/lead_velocity_report_screen.dart';
import '../features/reports/presentation/screens/customer_ltv_report_screen.dart';
import '../features/reports/presentation/screens/team_performance_report_screen.dart';
import '../features/reports/presentation/screens/fleet_utilization_report_screen.dart';
import '../features/reports/presentation/screens/supplier_usage_report_screen.dart';
import '../features/reports/presentation/screens/visa_status_report_screen.dart';
import '../features/reports/presentation/screens/campaign_performance_report_screen.dart';
import '../features/imports/presentation/screens/import_history_screen.dart';
import '../features/settings/data_export_screen.dart';
import '../features/marketing/presentation/screens/marketing_dashboard_screen.dart';
import '../features/marketing/presentation/screens/template_gallery_screen.dart';
import '../features/marketing/presentation/screens/segment_list_screen.dart';
import '../features/marketing/presentation/screens/segment_builder_screen.dart';
import '../features/marketing/presentation/screens/campaign_list_screen.dart'
    as mkt;
import '../features/marketing/presentation/screens/campaign_create_screen.dart';
import '../features/marketing/presentation/screens/campaign_detail_screen.dart';
import '../features/marketing/presentation/screens/branding_settings_screen.dart';
import '../features/marketing/presentation/screens/my_flyers_screen.dart';
import '../features/marketing/presentation/screens/quick_create_screen.dart';
import '../features/marketing/presentation/screens/flyer_editor_screen.dart';
import '../features/fleet/presentation/screens/fleet_dashboard_screen.dart';
import '../features/fleet/presentation/screens/vehicle_list_screen.dart';
import '../features/fleet/presentation/screens/vehicle_form_screen.dart';
import '../features/fleet/presentation/screens/vehicle_detail_screen.dart';
import '../features/fleet/presentation/screens/driver_list_screen.dart';
import '../features/fleet/presentation/screens/driver_form_screen.dart';
import '../features/fleet/presentation/screens/driver_detail_screen.dart';
import '../features/fleet/presentation/screens/trip_list_screen.dart';
import '../features/fleet/presentation/screens/trip_form_screen.dart';
import '../features/fleet/presentation/screens/trip_detail_screen.dart';
import '../features/fleet/presentation/screens/fleet_alerts_screen.dart';
import '../features/fleet/presentation/screens/vehicle_rate_card_list_screen.dart';
import '../features/fleet/presentation/screens/vehicle_rate_card_form_screen.dart';
import '../features/bookmarks/presentation/bookmarks_screen.dart';
import '../features/calls/presentation/screens/call_log_screen.dart';
import '../features/calls/presentation/screens/call_detail_screen.dart';
import '../features/calls/presentation/screens/call_analytics_screen.dart';
import '../features/calls/presentation/screens/dial_pad_screen.dart';
import '../features/calls/presentation/screens/in_call_screen.dart';
import '../features/calls/presentation/screens/number_management_screen.dart';
import '../features/calls/presentation/screens/voip_settings_screen.dart';
import '../features/calls/presentation/screens/transcript_view_screen.dart';
import '../features/calls/presentation/screens/transcript_search_screen.dart';
import '../features/calls/presentation/screens/extraction_list_screen.dart';
import '../features/calls/presentation/screens/extraction_detail_screen.dart';
import '../features/calls/presentation/screens/ai_usage_screen.dart';
import '../features/ai_assistant/presentation/screens/ai_hub_screen.dart';
import '../features/ai_assistant/presentation/screens/ai_lead_creation_screen.dart';
import '../features/ai_assistant/presentation/screens/ai_itinerary_screen.dart';
import '../features/ai_assistant/presentation/screens/ai_compose_screen.dart';
import '../features/ai_assistant/presentation/screens/ai_search_screen.dart';
import '../features/ai_assistant/presentation/screens/ai_insights_screen.dart';
import '../features/ai_assistant/presentation/screens/lead_score_screen.dart';
import '../features/ai_assistant/presentation/screens/document_ocr_screen.dart';
import '../features/ai_assistant/presentation/screens/smart_followups_screen.dart';
import '../features/ai_assistant/presentation/screens/bi_dashboard_screen.dart';
import '../features/ai_assistant/presentation/screens/bi_briefings_screen.dart';
import '../features/ai_assistant/presentation/screens/bi_briefing_detail_screen.dart';
import '../features/ai_assistant/presentation/screens/bi_health_score_screen.dart';
import '../features/ai_assistant/presentation/screens/bi_team_screen.dart';
import '../features/ai_assistant/presentation/screens/bi_segments_screen.dart';
import '../features/ai_assistant/presentation/screens/bi_destinations_screen.dart';
import '../features/ai_assistant/presentation/screens/bi_usage_screen.dart';
import '../features/chatbot/presentation/screens/chatbot_config_screen.dart';
import '../features/chatbot/presentation/screens/chatbot_conversations_screen.dart';
import '../features/chatbot/presentation/screens/chatbot_conversation_detail_screen.dart';
import '../features/chatbot/presentation/screens/chatbot_analytics_screen.dart';

final routerProvider = Provider<GoRouter>((ref) {
  final authState = ref.watch(authProvider);

  return GoRouter(
    initialLocation: '/splash',
    redirect: (context, state) {
      final location = state.matchedLocation;
      final isAuth = authState.status == AuthStatus.authenticated;
      final isLoading = authState.status == AuthStatus.initial ||
          (authState.status == AuthStatus.loading && authState.email == null);
      final isSplash = location == '/splash';
      final isLoginRoute = location == '/login';
      final isPublic = location == '/reset-password' ||
          location == '/setup-account' ||
          location == '/forgot-password' ||
          location == '/otp-login' ||
          location == '/onboarding' ||
          location == '/biometric';

      // Still initializing — show splash
      if (isLoading && !isSplash) return '/splash';

      // Done loading, go to correct place
      if (isSplash && !isLoading) {
        return isAuth ? '/dashboard' : '/login';
      }

      // Not authenticated — redirect to login (unless already there or public)
      if (!isAuth && !isLoginRoute && !isSplash && !isPublic) return '/login';

      // Authenticated but on login — go to dashboard
      if (isAuth && isLoginRoute) return '/dashboard';

      return null;
    },
    routes: [
      GoRoute(
        path: '/splash',
        builder: (context, state) => const SplashScreen(),
      ),
      GoRoute(
        path: '/login',
        builder: (context, state) => const LoginScreen(),
      ),
      GoRoute(
        path: '/otp-login',
        builder: (context, state) => const OtpLoginScreen(),
      ),
      GoRoute(
        path: '/forgot-password',
        builder: (context, state) => const ForgotPasswordScreen(),
      ),
      GoRoute(
        path: '/reset-password',
        builder: (context, state) {
          final token = state.uri.queryParameters['token'] ?? '';
          return ResetPasswordScreen(token: token);
        },
      ),
      GoRoute(
        path: '/setup-account',
        builder: (context, state) {
          final token = state.uri.queryParameters['token'] ?? '';
          return SetupAccountScreen(token: token);
        },
      ),
      GoRoute(
        path: '/biometric',
        builder: (context, state) => const BiometricPromptScreen(),
      ),
      GoRoute(
        path: '/onboarding',
        builder: (context, state) => const OnboardingScreen(),
      ),
      ShellRoute(
        builder: (context, state, child) => _AppShell(
          location: state.matchedLocation,
          child: child,
        ),
        routes: [
          GoRoute(path: '/dashboard', builder: (context, state) => const DashboardScreen()),
          GoRoute(path: '/notifications', builder: (context, state) => const NotificationsScreen()),
          GoRoute(
            path: '/contacts',
            builder: (context, state) => const ContactListScreen(),
            routes: [
              GoRoute(
                path: 'new',
                builder: (context, state) => const ContactFormScreen(),
              ),
              GoRoute(
                path: 'import',
                builder: (context, state) => const ImportWizardScreen(),
              ),
              GoRoute(
                path: 'merge',
                builder: (context, state) => const ContactMergeScreen(),
              ),
              GoRoute(
                path: ':id',
                builder: (context, state) => ContactDetailScreen(
                  contactId: state.pathParameters['id']!,
                ),
                routes: [
                  GoRoute(
                    path: 'edit',
                    builder: (context, state) => ContactFormScreen(
                      contactId: state.pathParameters['id'],
                    ),
                  ),
                ],
              ),
            ],
          ),
          GoRoute(
            path: '/leads',
            builder: (context, state) => const LeadPipelineScreen(),
            routes: [
              GoRoute(
                path: 'new',
                builder: (context, state) => LeadFormScreen(
                  contactId: state.uri.queryParameters['contact_id'],
                ),
              ),
              GoRoute(
                path: 'list',
                builder: (context, state) => const LeadListScreen(),
              ),
              GoRoute(
                path: ':id',
                builder: (context, state) => LeadDetailScreen(
                  leadId: state.pathParameters['id']!,
                ),
                routes: [
                  GoRoute(
                    path: 'edit',
                    builder: (context, state) => LeadFormScreen(
                      leadId: state.pathParameters['id'],
                    ),
                  ),
                ],
              ),
            ],
          ),
          GoRoute(
            path: '/follow-ups',
            builder: (context, state) => const MyFollowUpsScreen(),
          ),
          GoRoute(
            path: '/itineraries',
            builder: (context, state) => const ItineraryListScreen(),
            routes: [
              GoRoute(
                path: 'new',
                builder: (context, state) => ItineraryBuilderScreen(
                  leadId: state.uri.queryParameters['leadId'],
                ),
              ),
              GoRoute(
                path: 'templates',
                builder: (context, state) => const TemplateBrowserScreen(),
              ),
              GoRoute(
                path: ':id',
                builder: (context, state) => ItineraryDetailScreen(
                  itineraryId: state.pathParameters['id']!,
                ),
                routes: [
                  GoRoute(
                    path: 'edit',
                    builder: (context, state) => ItineraryBuilderScreen(
                      itineraryId: state.pathParameters['id'],
                    ),
                  ),
                  GoRoute(
                    path: 'pdf',
                    builder: (context, state) => PdfPreviewScreen(
                      itineraryId: state.pathParameters['id']!,
                    ),
                  ),
                ],
              ),
            ],
          ),
          GoRoute(
            path: '/rate-cards',
            builder: (context, state) => const RateCardListScreen(),
            routes: [
              GoRoute(
                path: 'new',
                builder: (context, state) => const RateCardFormScreen(),
              ),
              GoRoute(
                path: ':id/edit',
                builder: (context, state) => RateCardFormScreen(
                  rateCardId: state.pathParameters['id'],
                ),
              ),
            ],
          ),
          GoRoute(
            path: '/invoices',
            builder: (context, state) => const InvoiceListScreen(),
            routes: [
              GoRoute(
                path: 'new',
                builder: (context, state) => const InvoiceFormScreen(),
              ),
              GoRoute(
                path: ':id',
                builder: (context, state) => InvoiceDetailScreen(
                  invoiceId: state.pathParameters['id']!,
                ),
                routes: [
                  GoRoute(
                    path: 'edit',
                    builder: (context, state) => InvoiceFormScreen(
                      invoiceId: state.pathParameters['id'],
                    ),
                  ),
                ],
              ),
            ],
          ),
          GoRoute(path: '/payments', builder: (context, state) => const PaymentListScreen()),
          GoRoute(
            path: '/communications',
            builder: (context, state) => const CommunicationLogScreen(),
            routes: [
              GoRoute(
                path: ':contactId',
                builder: (context, state) => CommunicationHubScreen(
                  contactId: state.pathParameters['contactId']!,
                  contactName: state.extra as String?,
                ),
              ),
            ],
          ),
          GoRoute(
            path: '/templates',
            builder: (context, state) => const TemplateListScreen(),
            routes: [
              GoRoute(
                path: 'new',
                builder: (context, state) => const TemplateEditorScreen(),
              ),
              GoRoute(
                path: ':id/edit',
                builder: (context, state) => TemplateEditorScreen(
                  templateId: state.pathParameters['id'],
                  template: state.extra as Map<String, dynamic>?,
                ),
              ),
            ],
          ),
          GoRoute(
            path: '/bulk-send',
            builder: (context, state) => const BulkSendScreen(),
          ),
          GoRoute(
            path: '/email/compose',
            builder: (context, state) => EmailComposeScreen(
              recipientEmail: state.uri.queryParameters['email'],
              recipientName: state.uri.queryParameters['name'],
            ),
          ),
          GoRoute(
            path: '/campaigns',
            builder: (context, state) => const CampaignListScreen(),
          ),
          GoRoute(
            path: '/reports',
            builder: (context, state) => const ReportsDashboardScreen(),
            routes: [
              // Phase 3: Sales & Financial
              GoRoute(
                path: 'sales-summary',
                builder: (context, state) => const SalesSummaryReportScreen(),
              ),
              GoRoute(
                path: 'win-loss',
                builder: (context, state) => const WinLossReportScreen(),
              ),
              GoRoute(
                path: 'revenue-summary',
                builder: (context, state) => const RevenueSummaryReportScreen(),
              ),
              GoRoute(
                path: 'collections',
                builder: (context, state) => const CollectionsReportScreen(),
              ),
              GoRoute(
                path: 'tax',
                builder: (context, state) => const TaxReportScreen(),
              ),
              // Phase 4: Leads & Customers
              GoRoute(
                path: 'pipeline-summary',
                builder: (context, state) => const PipelineSummaryReportScreen(),
              ),
              GoRoute(
                path: 'lead-ageing',
                builder: (context, state) => const LeadAgeingReportScreen(),
              ),
              GoRoute(
                path: 'lead-velocity',
                builder: (context, state) => const LeadVelocityReportScreen(),
              ),
              GoRoute(
                path: 'customer-ltv',
                builder: (context, state) => const CustomerLtvReportScreen(),
              ),
              // Phase 5: Operations & Team
              GoRoute(
                path: 'team-performance',
                builder: (context, state) => const TeamPerformanceReportScreen(),
              ),
              GoRoute(
                path: 'fleet-utilization',
                builder: (context, state) => const FleetUtilizationReportScreen(),
              ),
              GoRoute(
                path: 'supplier-usage',
                builder: (context, state) => const SupplierUsageReportScreen(),
              ),
              GoRoute(
                path: 'visa-status',
                builder: (context, state) => const VisaStatusReportScreen(),
              ),
              GoRoute(
                path: 'campaign-performance',
                builder: (context, state) => const CampaignPerformanceReportScreen(),
              ),
            ],
          ),
          GoRoute(
            path: '/vouchers',
            builder: (context, state) => const VoucherListScreen(),
            routes: [
              GoRoute(
                path: 'new',
                builder: (context, state) => VoucherFormScreen(
                  initialType: state.uri.queryParameters['type'],
                ),
              ),
              GoRoute(
                path: ':id',
                builder: (context, state) => VoucherDetailScreen(
                  voucherId: state.pathParameters['id']!,
                ),
                routes: [
                  GoRoute(
                    path: 'edit',
                    builder: (context, state) => VoucherFormScreen(
                      voucherId: state.pathParameters['id'],
                    ),
                  ),
                ],
              ),
            ],
          ),
          GoRoute(
            path: '/suppliers',
            builder: (context, state) => const SupplierListScreen(),
            routes: [
              GoRoute(
                path: 'new',
                builder: (context, state) => const SupplierFormScreen(),
              ),
              GoRoute(
                path: 'compare-rates',
                builder: (context, state) => const RateComparisonScreen(),
              ),
              GoRoute(
                path: ':id',
                builder: (context, state) {
                  if (state.pathParameters['id'] == 'compare-rates') {
                    // Fallback to avoid matching as ID if router evaluates out of order
                    return const RateComparisonScreen();
                  }
                  return SupplierDetailScreen(
                    supplierId: state.pathParameters['id']!,
                  );
                },
                routes: [
                  GoRoute(
                    path: 'edit',
                    builder: (context, state) => SupplierFormScreen(
                      supplierId: state.pathParameters['id'],
                    ),
                  ),
                ],
              ),
            ],
          ),
          GoRoute(
            path: '/travellers',
            builder: (context, state) => const TravellerListScreen(),
            routes: [
              GoRoute(
                path: 'new',
                builder: (context, state) => TravellerFormScreen(
                  initialContactId: state.uri.queryParameters['contactId'],
                ),
              ),
              GoRoute(
                path: ':id',
                builder: (context, state) => TravellerDetailScreen(
                  travellerId: state.pathParameters['id']!,
                ),
                routes: [
                  GoRoute(
                    path: 'edit',
                    builder: (context, state) => TravellerFormScreen(
                      travellerId: state.pathParameters['id'],
                    ),
                  ),
                ],
              ),
            ],
          ),
          GoRoute(
            path: '/visas',
            builder: (context, state) => const VisaListScreen(),
            routes: [
              GoRoute(
                path: 'dashboard',
                builder: (context, state) => const VisaDashboardScreen(),
              ),
              GoRoute(
                path: 'new',
                builder: (context, state) => VisaFormScreen(
                  initialTravellerId: state.uri.queryParameters['travellerId'],
                ),
              ),
              GoRoute(
                path: ':id',
                builder: (context, state) {
                   if (state.pathParameters['id'] == 'dashboard') {
                      return const VisaDashboardScreen();
                   }
                   return VisaDetailScreen(
                    visaId: state.pathParameters['id']!,
                   );
                },
                routes: [
                  GoRoute(
                    path: 'edit',
                    builder: (context, state) => VisaFormScreen(
                      visaId: state.pathParameters['id'],
                    ),
                  ),
                ],
              ),
            ],
          ),
          GoRoute(path: '/visa-travellers', redirect: (_, _) => '/visas'),
          GoRoute(
            path: '/marketing',
            builder: (context, state) => const MarketingDashboardScreen(),
            routes: [
              GoRoute(
                path: 'templates',
                builder: (context, state) => const TemplateGalleryScreen(),
              ),
              GoRoute(
                path: 'segments',
                builder: (context, state) => const SegmentListScreen(),
                routes: [
                  GoRoute(
                    path: 'new',
                    builder: (context, state) => const SegmentBuilderScreen(),
                  ),
                  GoRoute(
                    path: ':id/edit',
                    builder: (context, state) => SegmentBuilderScreen(
                      segmentId: state.pathParameters['id'],
                    ),
                  ),
                ],
              ),
              GoRoute(
                path: 'campaigns',
                builder: (context, state) =>
                    const mkt.MarketingCampaignListScreen(),
                routes: [
                  GoRoute(
                    path: 'new',
                    builder: (context, state) =>
                        const CampaignCreateScreen(),
                  ),
                  GoRoute(
                    path: ':id',
                    builder: (context, state) => CampaignDetailScreen(
                      id: state.pathParameters['id']!,
                    ),
                  ),
                ],
              ),
              GoRoute(
                path: 'branding',
                builder: (context, state) =>
                    const BrandingSettingsScreen(),
              ),
              GoRoute(
                path: 'my-flyers',
                builder: (context, state) => const MyFlyersScreen(),
              ),
              GoRoute(
                path: 'quick-create/:templateId',
                builder: (context, state) => QuickCreateScreen(
                  templateId: state.pathParameters['templateId']!,
                ),
              ),
              GoRoute(
                path: 'editor',
                builder: (context, state) => FlyerEditorScreen(
                  templateId: state.uri.queryParameters['templateId'],
                  draftId: state.uri.queryParameters['draftId'],
                ),
              ),
            ],
          ),
          GoRoute(
            path: '/fleet',
            builder: (context, state) => const FleetDashboardScreen(),
            routes: [
              GoRoute(
                path: 'vehicles',
                builder: (context, state) => const VehicleListScreen(),
                routes: [
                  GoRoute(
                    path: 'new',
                    builder: (context, state) => const VehicleFormScreen(),
                  ),
                  GoRoute(
                    path: ':id',
                    builder: (context, state) => VehicleDetailScreen(
                      vehicleId: state.pathParameters['id']!,
                    ),
                    routes: [
                      GoRoute(
                        path: 'edit',
                        builder: (context, state) => VehicleFormScreen(
                          vehicleId: state.pathParameters['id'],
                        ),
                      ),
                    ],
                  ),
                ],
              ),
              GoRoute(
                path: 'drivers',
                builder: (context, state) => const DriverListScreen(),
                routes: [
                  GoRoute(
                    path: 'new',
                    builder: (context, state) => const DriverFormScreen(),
                  ),
                  GoRoute(
                    path: ':id',
                    builder: (context, state) => DriverDetailScreen(
                      driverId: state.pathParameters['id']!,
                    ),
                    routes: [
                      GoRoute(
                        path: 'edit',
                        builder: (context, state) => DriverFormScreen(
                          driverId: state.pathParameters['id'],
                        ),
                      ),
                    ],
                  ),
                ],
              ),
              GoRoute(
                path: 'trips',
                builder: (context, state) => const TripListScreen(),
                routes: [
                  GoRoute(
                    path: 'new',
                    builder: (context, state) => const TripFormScreen(),
                  ),
                  GoRoute(
                    path: ':id',
                    builder: (context, state) => TripDetailScreen(
                      tripId: state.pathParameters['id']!,
                    ),
                    routes: [
                      GoRoute(
                        path: 'edit',
                        builder: (context, state) => TripFormScreen(
                          tripId: state.pathParameters['id'],
                        ),
                      ),
                    ],
                  ),
                ],
              ),
              GoRoute(
                path: 'rate-cards',
                builder: (context, state) =>
                    const VehicleRateCardListScreen(),
                routes: [
                  GoRoute(
                    path: 'new',
                    builder: (context, state) =>
                        const VehicleRateCardFormScreen(),
                  ),
                  GoRoute(
                    path: ':id/edit',
                    builder: (context, state) => VehicleRateCardFormScreen(
                      rateCardId: state.pathParameters['id'],
                    ),
                  ),
                ],
              ),
              GoRoute(
                path: 'alerts',
                builder: (context, state) => const FleetAlertsScreen(),
              ),
            ],
          ),
          // --- Planner / Calendar ---
          GoRoute(
            path: '/planner',
            builder: (context, state) => const CalendarScreen(),
            routes: [
              GoRoute(
                path: 'events/create',
                builder: (context, state) => EventFormScreen(
                  initialDate: state.extra as DateTime?,
                ),
              ),
              GoRoute(
                path: 'events/:id/edit',
                builder: (context, state) => EventFormScreen(
                  eventId: state.pathParameters['id'],
                ),
              ),
            ],
          ),
          // --- Tasks ---
          GoRoute(
            path: '/tasks',
            builder: (context, state) => const TaskListScreen(),
            routes: [
              GoRoute(
                path: 'create',
                builder: (context, state) => TaskFormScreen(
                  relatedLeadId: state.uri.queryParameters['related_lead_id'],
                ),
              ),
              GoRoute(
                path: ':id',
                builder: (context, state) => TaskDetailScreen(
                  taskId: state.pathParameters['id']!,
                ),
                routes: [
                  GoRoute(
                    path: 'edit',
                    builder: (context, state) => TaskFormScreen(
                      taskId: state.pathParameters['id'],
                    ),
                  ),
                ],
              ),
            ],
          ),
          // --- Calls & VoIP ---
          GoRoute(
            path: '/calls',
            builder: (context, state) => const CallLogScreen(),
            routes: [
              GoRoute(
                path: 'dial',
                builder: (context, state) => const DialPadScreen(),
              ),
              GoRoute(
                path: 'analytics',
                redirect: (context, state) {
                  final role = ref.read(authProvider).user?.role;
                  if (role != 'admin' && role != 'sales_manager') return '/calls';
                  return null;
                },
                builder: (context, state) => const CallAnalyticsScreen(),
              ),
              GoRoute(
                path: 'in-call/:id',
                builder: (context, state) {
                  final extra = state.extra as Map<String, dynamic>? ?? {};
                  return InCallScreen(
                    callLogId: state.pathParameters['id']!,
                    phoneNumber: extra['phoneNumber'] as String? ?? '',
                    contactName: extra['contactName'] as String?,
                    isInbound: extra['isInbound'] as bool? ?? false,
                  );
                },
              ),
              GoRoute(
                path: 'transcript/:callLogId',
                builder: (context, state) => TranscriptViewScreen(
                  callLogId: state.pathParameters['callLogId']!,
                ),
              ),
              GoRoute(
                path: 'transcripts/search',
                builder: (context, state) => const TranscriptSearchScreen(),
              ),
              GoRoute(
                path: 'extractions',
                builder: (context, state) => const ExtractionListScreen(),
              ),
              GoRoute(
                path: 'extractions/:id',
                builder: (context, state) => ExtractionDetailScreen(
                  extractionId: state.pathParameters['id']!,
                ),
              ),
              GoRoute(
                path: ':id',
                builder: (context, state) => CallDetailScreen(
                  callId: state.pathParameters['id']!,
                ),
              ),
            ],
          ),
          // --- AI Assistant ---
          GoRoute(
            path: '/ai',
            builder: (context, state) => const AiHubScreen(),
            routes: [
              GoRoute(
                path: 'lead-creation',
                builder: (context, state) => const AiLeadCreationScreen(),
              ),
              GoRoute(
                path: 'itinerary',
                builder: (context, state) => const AiItineraryScreen(),
              ),
              GoRoute(
                path: 'compose',
                builder: (context, state) => const AiComposeScreen(),
              ),
              GoRoute(
                path: 'search',
                builder: (context, state) => const AiSearchScreen(),
              ),
              GoRoute(
                path: 'insights',
                builder: (context, state) => const AiInsightsScreen(),
              ),
              GoRoute(
                path: 'lead-score/:leadId',
                builder: (context, state) => LeadScoreScreen(leadId: state.pathParameters['leadId']!),
              ),
              GoRoute(
                path: 'document-ocr',
                builder: (context, state) => const DocumentOcrScreen(),
              ),
              GoRoute(
                path: 'smart-followups',
                builder: (context, state) => const SmartFollowupsScreen(),
              ),
              GoRoute(
                path: 'bi',
                builder: (context, state) => const BiDashboardScreen(),
                routes: [
                  GoRoute(
                    path: 'briefings',
                    builder: (context, state) => const BiBriefingsScreen(),
                    routes: [
                      GoRoute(
                        path: ':id',
                        builder: (context, state) => BiBriefingDetailScreen(
                          briefingId: state.pathParameters['id']!,
                        ),
                      ),
                    ],
                  ),
                  GoRoute(
                    path: 'health-score',
                    builder: (context, state) => const BiHealthScoreScreen(),
                  ),
                  GoRoute(
                    path: 'team',
                    builder: (context, state) => const BiTeamScreen(),
                  ),
                  GoRoute(
                    path: 'segments',
                    builder: (context, state) => const BiSegmentsScreen(),
                  ),
                  GoRoute(
                    path: 'destinations',
                    builder: (context, state) => const BiDestinationsScreen(),
                  ),
                  GoRoute(
                    path: 'lead-roi',
                    builder: (context, state) => const BiDestinationsScreen(),
                  ),
                  GoRoute(
                    path: 'usage',
                    builder: (context, state) => const BiUsageScreen(),
                  ),
                ],
              ),
            ],
          ),
          // --- Chatbot ---
          GoRoute(
            path: '/chatbot',
            builder: (context, state) => const ChatbotConversationsScreen(),
            routes: [
              GoRoute(
                path: 'config',
                builder: (context, state) => const ChatbotConfigScreen(),
              ),
              GoRoute(
                path: 'analytics',
                builder: (context, state) => const ChatbotAnalyticsScreen(),
              ),
              GoRoute(
                path: 'conversations/:id',
                builder: (context, state) => ChatbotConversationDetailScreen(
                  conversationId: state.pathParameters['id']!,
                ),
              ),
            ],
          ),
          // --- Bookmarks ---
          GoRoute(
            path: '/bookmarks',
            builder: (context, state) => const BookmarksScreen(),
          ),
          GoRoute(
            path: '/settings',
            builder: (context, state) => const SettingsScreen(),
            routes: [
              GoRoute(path: 'profile', builder: (context, state) => const ProfileScreen()),
              GoRoute(path: 'sessions', builder: (context, state) => const SessionsScreen()),
              GoRoute(path: 'login-history', builder: (context, state) => const LoginHistoryScreen()),
              GoRoute(
                path: 'team',
                redirect: (context, state) {
                  final role = ref.read(authProvider).user?.role;
                  if (role != 'admin' && role != 'sales_manager') return '/dashboard';
                  return null;
                },
                builder: (context, state) => const UserManagementScreen(),
              ),
              GoRoute(path: 'activity-log', builder: (context, state) => const ActivityLogScreen()),
              GoRoute(path: 'company', builder: (context, state) => const CompanySettingsScreen()),
              GoRoute(path: 'routing-rules', builder: (context, state) => const RoutingRulesScreen()),
              GoRoute(path: 'followup-sequences', builder: (context, state) => const FollowUpSequencesScreen()),
              GoRoute(path: 'notifications', builder: (context, state) => const NotificationPreferencesScreen()),
              GoRoute(
                path: 'announcements',
                redirect: (context, state) {
                  final role = ref.read(authProvider).user?.role;
                  if (role != 'admin') return '/dashboard';
                  return null;
                },
                builder: (context, state) => const SendAnnouncementScreen(),
              ),
              GoRoute(
                path: 'import',
                builder: (context, state) => const ImportWizardScreen(),
              ),
              GoRoute(
                path: 'import-history',
                builder: (context, state) => const ImportHistoryScreen(),
              ),
              GoRoute(
                path: 'data-export',
                builder: (context, state) => const DataExportScreen(),
              ),
              GoRoute(
                path: 'export-history',
                builder: (context, state) => const DataExportScreen(),
              ),
              GoRoute(
                path: 'voip',
                redirect: (context, state) {
                  final role = ref.read(authProvider).user?.role;
                  if (role != 'admin') return '/dashboard';
                  return null;
                },
                builder: (context, state) => const VoipSettingsScreen(),
              ),
              GoRoute(
                path: 'phone-numbers',
                redirect: (context, state) {
                  final role = ref.read(authProvider).user?.role;
                  if (role != 'admin') return '/dashboard';
                  return null;
                },
                builder: (context, state) => const NumberManagementScreen(),
              ),
              GoRoute(
                path: 'ai-usage',
                redirect: (context, state) {
                  final role = ref.read(authProvider).user?.role;
                  if (role != 'admin') return '/dashboard';
                  return null;
                },
                builder: (context, state) => const AiUsageScreen(),
              ),
            ],
          ),
        ],
      ),
    ],
  );
});

// ---------------------------------------------------------------------------
// Shell wrapper — ConsumerWidget so it can read notification count + auth user
// ---------------------------------------------------------------------------

class _AppShell extends ConsumerWidget {
  final String location;
  final Widget child;

  const _AppShell({required this.location, required this.child});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final authState = ref.watch(authProvider);
    final unreadAsync = ref.watch(unreadCountProvider);

    return AppScaffold(
      title: _titleFromLocation(location),
      notificationCount: unreadAsync.valueOrNull ?? 0,
      onNotificationPressed: () => context.go('/notifications'),
      onProfilePressed: () => context.go('/settings/profile'),
      onLogoutPressed: () => ref.read(authProvider.notifier).logout(),
      userName: authState.user?.name,
      avatarUrl: authState.user?.avatarUrl,
      userRole: authState.user?.role,
      child: child,
    );
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

String _titleFromLocation(String location) {
  const titles = {
    '/dashboard': 'Dashboard',
    '/notifications': 'Notifications',
    '/contacts': 'Contacts',
    '/contacts/new': 'New Contact',
    '/leads': 'Leads',
    '/leads/new': 'New Lead',
    '/leads/list': 'Leads',
    '/follow-ups': 'My Follow-Ups',
    '/itineraries': 'Itineraries',
    '/itineraries/new': 'New Itinerary',
    '/itineraries/templates': 'Templates',
    '/rate-cards': 'Rate Cards',
    '/rate-cards/new': 'New Rate Card',
    '/invoices': 'Invoices',
    '/invoices/new': 'Create Invoice',
    '/payments': 'Payments',
    '/communications': 'Communications',
    '/templates': 'Message Templates',
    '/templates/new': 'New Template',
    '/bulk-send': 'Bulk Send',
    '/email/compose': 'Compose Email',
    '/campaigns': 'Email Campaigns',
    '/reports/ageing': 'Ageing Report',
    '/vouchers': 'Vouchers',
    '/suppliers': 'Suppliers',
    '/suppliers/new': 'New Supplier',
    '/suppliers/compare-rates': 'Rate Comparison',
    '/travellers': 'Travellers',
    '/travellers/new': 'New Traveller',
    '/visas': 'Visa Applications',
    '/visas/new': 'New Visa Application',
    '/visas/dashboard': 'Visa Pipeline',
    '/visa-travellers': 'Visa & Travellers',
    '/planner': 'Planner',
    '/tasks': 'Tasks',
    '/reports': 'Reports',
    '/marketing': 'Marketing',
    '/marketing/templates': 'Template Gallery',
    '/marketing/segments': 'Segments',
    '/marketing/segments/new': 'New Segment',
    '/marketing/campaigns': 'Marketing Campaigns',
    '/marketing/campaigns/new': 'New Campaign',
    '/marketing/branding': 'Branding Settings',
    '/marketing/my-flyers': 'My Flyers',
    '/marketing/editor': 'Flyer Editor',
    '/calls': 'Call Logs',
    '/calls/dial': 'Dial Pad',
    '/calls/analytics': 'Call Analytics',
    '/fleet': 'Fleet Dashboard',
    '/fleet/vehicles': 'Vehicles',
    '/fleet/vehicles/new': 'Add Vehicle',
    '/fleet/drivers': 'Drivers',
    '/fleet/drivers/new': 'Add Driver',
    '/fleet/trips': 'Trips',
    '/fleet/trips/new': 'New Trip',
    '/fleet/rate-cards': 'Vehicle Rate Cards',
    '/fleet/rate-cards/new': 'New Rate Card',
    '/fleet/alerts': 'Fleet Alerts',
    '/settings': 'Settings',
    '/settings/profile': 'Profile',
    '/settings/sessions': 'Active Sessions',
    '/settings/login-history': 'Login History',
    '/settings/team': 'Team Management',
    '/settings/activity-log': 'Activity Log',
    '/settings/company': 'Company Settings',
    '/settings/routing-rules': 'Routing Rules',
    '/settings/followup-sequences': 'Follow-Up Sequences',
    '/settings/notifications': 'Notification Preferences',
    '/settings/announcements': 'Send Announcement',
    '/settings/import-history': 'Import History',
    '/settings/data-export': 'Data Export',
    '/settings/export-history': 'Export History',
    '/settings/voip': 'VoIP Settings',
    '/settings/phone-numbers': 'Phone Numbers',
    '/settings/ai-usage': 'AI Usage',
    '/calls/transcripts/search': 'Search Transcripts',
    '/calls/extractions': 'AI Extractions',
    '/ai': 'AI Assistant',
    '/ai/lead-creation': 'AI Lead Creation',
    '/ai/itinerary': 'AI Itinerary Generator',
    '/ai/compose': 'AI Message Composer',
    '/ai/search': 'Ask Your CRM',
    '/ai/insights': 'AI Insights',
    '/ai/document-ocr': 'Document OCR',
    '/ai/smart-followups': 'Smart Follow-ups',
    '/ai/bi': 'Business Intelligence',
    '/ai/bi/briefings': 'AI Briefings',
    '/ai/bi/health-score': 'Business Health',
    '/ai/bi/team': 'Team Intelligence',
    '/ai/bi/segments': 'Customer Segments',
    '/ai/bi/destinations': 'Destinations & Lead ROI',
    '/ai/bi/lead-roi': 'Lead Source ROI',
    '/ai/bi/usage': 'AI Usage & Costs',
    '/chatbot': 'Chatbot Conversations',
    '/chatbot/config': 'Chatbot Settings',
    '/chatbot/analytics': 'Chatbot Analytics',
  };
  final exact = titles[location];
  if (exact != null) return exact;

  // Dynamic route titles — AI
  if (location.startsWith('/ai/lead-score/')) return 'Lead Score';

  // Dynamic route titles — BI
  if (location.startsWith('/ai/bi/briefings/')) return 'Briefing Detail';

  // Dynamic route titles — Chatbot
  if (location.startsWith('/chatbot/conversations/')) return 'Conversation Detail';

  // Dynamic route titles — Calls
  if (location.startsWith('/calls/transcript/')) return 'Call Transcript';
  if (location.startsWith('/calls/extractions/')) return 'Extraction Review';

  // Dynamic route titles
  if (location.startsWith('/itineraries/') && location.endsWith('/edit')) {
    return 'Edit Itinerary';
  }
  if (location.startsWith('/itineraries/') && location.endsWith('/pdf')) {
    return 'PDF Preview';
  }
  if (location.startsWith('/itineraries/')) return 'Itinerary Details';
  if (location.startsWith('/rate-cards/') && location.endsWith('/edit')) {
    return 'Edit Rate Card';
  }
  if (location.startsWith('/contacts/') && location.endsWith('/edit')) {
    return 'Edit Contact';
  }
  if (location.startsWith('/contacts/')) return 'Contact Details';
  if (location.startsWith('/leads/') && location.endsWith('/edit')) {
    return 'Edit Lead';
  }
  if (location.startsWith('/leads/')) return 'Lead Details';
  if (location.startsWith('/invoices/') && location.endsWith('/edit')) {
    return 'Edit Invoice';
  }
  if (location.startsWith('/invoices/')) return 'Invoice Details';
  if (location.startsWith('/communications/')) return 'Chat';
  if (location.startsWith('/templates/') && location.endsWith('/edit')) {
    return 'Edit Template';
  }
  if (location.startsWith('/vouchers/') && location.endsWith('/edit')) {
    return 'Edit Voucher';
  }
  if (location.startsWith('/vouchers/')) return 'Voucher Details';
  if (location.startsWith('/suppliers/') && location.endsWith('/edit')) {
    return 'Edit Supplier';
  }
  if (location.startsWith('/suppliers/')) return 'Supplier Details';
  if (location.startsWith('/travellers/') && location.endsWith('/edit')) {
    return 'Edit Traveller';
  }
  if (location.startsWith('/travellers/')) return 'Traveller Details';
  if (location.startsWith('/visas/') && location.endsWith('/edit')) {
    return 'Edit Visa App';
  }
  if (location.startsWith('/visas/')) return 'Visa Details';
  if (location.startsWith('/marketing/segments/') && location.endsWith('/edit')) {
    return 'Edit Segment';
  }
  if (location.startsWith('/marketing/campaigns/')) return 'Campaign Details';
  if (location.startsWith('/marketing/quick-create/')) return 'Quick Create';
  if (location.startsWith('/fleet/vehicles/') && location.endsWith('/edit')) {
    return 'Edit Vehicle';
  }
  if (location.startsWith('/fleet/vehicles/')) return 'Vehicle Details';
  if (location.startsWith('/fleet/drivers/') && location.endsWith('/edit')) {
    return 'Edit Driver';
  }
  if (location.startsWith('/fleet/drivers/')) return 'Driver Details';
  if (location.startsWith('/fleet/trips/') && location.endsWith('/edit')) {
    return 'Edit Trip';
  }
  if (location.startsWith('/fleet/trips/')) return 'Trip Details';
  if (location.startsWith('/fleet/rate-cards/') && location.endsWith('/edit')) {
    return 'Edit Rate Card';
  }
  if (location.startsWith('/fleet/rate-cards/')) return 'Rate Card Details';
  if (location.startsWith('/calls/')) return 'Call Details';

  return 'TravelCRM Pro';
}

