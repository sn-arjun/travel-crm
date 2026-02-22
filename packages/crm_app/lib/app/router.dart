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
import '../features/contacts/presentation/contact_import_screen.dart';
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
import '../features/invoices/presentation/screens/ageing_report_screen.dart';
import '../features/communications/presentation/screens/communication_hub_screen.dart';
import '../features/communications/presentation/screens/communication_log_screen.dart';
import '../features/communications/presentation/screens/template_list_screen.dart';
import '../features/communications/presentation/screens/template_editor_screen.dart';
import '../features/communications/presentation/screens/bulk_send_screen.dart';
import '../features/communications/presentation/screens/email_compose_screen.dart';
import '../features/communications/presentation/screens/campaign_list_screen.dart';

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
                builder: (context, state) => const ContactImportScreen(),
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
            builder: (context, state) => const _PlaceholderScreen(title: 'Reports'),
            routes: [
              GoRoute(
                path: 'ageing',
                builder: (context, state) => const AgeingReportScreen(),
              ),
            ],
          ),
          GoRoute(path: '/vouchers', builder: (context, state) => const _PlaceholderScreen(title: 'Vouchers')),
          GoRoute(path: '/suppliers', builder: (context, state) => const _PlaceholderScreen(title: 'Suppliers')),
          GoRoute(path: '/visa-travellers', builder: (context, state) => const _PlaceholderScreen(title: 'Visa & Travellers')),
          GoRoute(path: '/planner', builder: (context, state) => const _PlaceholderScreen(title: 'Planner')),
          GoRoute(path: '/tasks', builder: (context, state) => const _PlaceholderScreen(title: 'Tasks')),
          GoRoute(path: '/marketing', builder: (context, state) => const _PlaceholderScreen(title: 'Marketing')),
          GoRoute(path: '/fleet', builder: (context, state) => const _PlaceholderScreen(title: 'Fleet')),
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
    final unreadAsync = ref.watch(unreadNotificationCountProvider);

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
    '/visa-travellers': 'Visa & Travellers',
    '/planner': 'Planner',
    '/tasks': 'Tasks',
    '/reports': 'Reports',
    '/marketing': 'Marketing',
    '/fleet': 'Fleet',
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
  };
  final exact = titles[location];
  if (exact != null) return exact;

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

  return 'TravelCRM Pro';
}

class _PlaceholderScreen extends StatelessWidget {
  final String title;
  const _PlaceholderScreen({required this.title});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.construction_outlined, size: 48, color: theme.colorScheme.onSurfaceVariant.withValues(alpha: 0.4)),
          const SizedBox(height: 16),
          Text(title, style: theme.textTheme.headlineMedium),
          const SizedBox(height: 8),
          Text('Coming soon', style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
        ],
      ),
    );
  }
}
