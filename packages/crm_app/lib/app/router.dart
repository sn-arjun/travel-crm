import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../core/widgets/app_scaffold.dart';
import '../features/auth/data/auth_provider.dart';
import '../features/auth/data/auth_state.dart';
import '../features/auth/presentation/forgot_password_screen.dart';
import '../features/auth/presentation/login_screen.dart';
import '../features/auth/presentation/reset_password_screen.dart';
import '../features/auth/presentation/setup_account_screen.dart';
import '../features/auth/presentation/splash_screen.dart';
import '../features/dashboard/dashboard_screen.dart';
import '../features/onboarding/onboarding_screen.dart';
import '../features/settings/activity_log_screen.dart';
import '../features/settings/company_settings_screen.dart';
import '../features/settings/login_history_screen.dart';
import '../features/settings/profile_screen.dart';
import '../features/settings/sessions_screen.dart';
import '../features/settings/settings_screen.dart';
import '../features/settings/user_management_screen.dart';

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
          location == '/onboarding';

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
        path: '/onboarding',
        builder: (context, state) => const OnboardingScreen(),
      ),
      ShellRoute(
        builder: (context, state, child) {
          return AppScaffold(
            title: _titleFromLocation(state.matchedLocation),
            child: child,
          );
        },
        routes: [
          GoRoute(path: '/dashboard', builder: (context, state) => const DashboardScreen()),
          GoRoute(path: '/contacts', builder: (context, state) => const _PlaceholderScreen(title: 'Contacts')),
          GoRoute(path: '/leads', builder: (context, state) => const _PlaceholderScreen(title: 'Leads')),
          GoRoute(path: '/itineraries', builder: (context, state) => const _PlaceholderScreen(title: 'Itineraries')),
          GoRoute(path: '/invoices', builder: (context, state) => const _PlaceholderScreen(title: 'Invoices')),
          GoRoute(path: '/vouchers', builder: (context, state) => const _PlaceholderScreen(title: 'Vouchers')),
          GoRoute(path: '/suppliers', builder: (context, state) => const _PlaceholderScreen(title: 'Suppliers')),
          GoRoute(path: '/visa-travellers', builder: (context, state) => const _PlaceholderScreen(title: 'Visa & Travellers')),
          GoRoute(path: '/planner', builder: (context, state) => const _PlaceholderScreen(title: 'Planner')),
          GoRoute(path: '/tasks', builder: (context, state) => const _PlaceholderScreen(title: 'Tasks')),
          GoRoute(path: '/reports', builder: (context, state) => const _PlaceholderScreen(title: 'Reports')),
          GoRoute(path: '/marketing', builder: (context, state) => const _PlaceholderScreen(title: 'Marketing')),
          GoRoute(path: '/fleet', builder: (context, state) => const _PlaceholderScreen(title: 'Fleet')),
          GoRoute(
            path: '/settings',
            builder: (context, state) => const SettingsScreen(),
            routes: [
              GoRoute(path: 'profile', builder: (context, state) => const ProfileScreen()),
              GoRoute(path: 'sessions', builder: (context, state) => const SessionsScreen()),
              GoRoute(path: 'login-history', builder: (context, state) => const LoginHistoryScreen()),
              GoRoute(path: 'team', builder: (context, state) => const UserManagementScreen()),
              GoRoute(path: 'activity-log', builder: (context, state) => const ActivityLogScreen()),
              GoRoute(path: 'company', builder: (context, state) => const CompanySettingsScreen()),
            ],
          ),
        ],
      ),
    ],
  );
});

String _titleFromLocation(String location) {
  const titles = {
    '/dashboard': 'Dashboard',
    '/contacts': 'Contacts',
    '/leads': 'Leads',
    '/itineraries': 'Itineraries',
    '/invoices': 'Invoices',
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
  };
  return titles[location] ?? 'TravelCRM Pro';
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
