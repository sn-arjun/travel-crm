import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../core/storage/hive_storage.dart';
import '../core/widgets/bottom_nav_shell.dart';
import '../features/auth/presentation/screens/agency_code_screen.dart';
import '../features/auth/presentation/screens/phone_input_screen.dart';
import '../features/auth/presentation/screens/otp_verification_screen.dart';
import '../features/trips/presentation/screens/my_trips_screen.dart';
import '../features/trips/presentation/screens/trip_detail_screen.dart';
import '../features/trips/presentation/screens/check_in_screen.dart';
import '../features/trips/presentation/screens/check_out_screen.dart';
import '../features/trips/presentation/screens/trip_history_screen.dart';
import '../features/profile/presentation/screens/profile_screen.dart';
import '../features/profile/presentation/screens/edit_profile_screen.dart';
import '../features/profile/presentation/screens/documents_screen.dart';

final _rootNavigatorKey = GlobalKey<NavigatorState>();
final _tripsNavigatorKey = GlobalKey<NavigatorState>(debugLabel: 'trips');
final _historyNavigatorKey = GlobalKey<NavigatorState>(debugLabel: 'history');
final _profileNavigatorKey = GlobalKey<NavigatorState>(debugLabel: 'profile');

final routerProvider = Provider<GoRouter>((ref) {
  return GoRouter(
    navigatorKey: _rootNavigatorKey,
    initialLocation: HiveStorage.isAuthenticated
        ? '/trips'
        : (HiveStorage.hasAgency ? '/login' : '/agency'),
    routes: [
      GoRoute(
        path: '/agency',
        builder: (context, state) => const AgencyCodeScreen(),
      ),
      GoRoute(
        path: '/login',
        builder: (context, state) => const PhoneInputScreen(),
      ),
      GoRoute(
        path: '/login/otp',
        builder: (context, state) {
          final phone = state.extra as String? ?? '';
          return OtpVerificationScreen(phone: phone);
        },
      ),
      StatefulShellRoute.indexedStack(
        builder: (context, state, navigationShell) =>
            BottomNavShell(navigationShell: navigationShell),
        branches: [
          StatefulShellBranch(
            navigatorKey: _tripsNavigatorKey,
            routes: [
              GoRoute(
                path: '/trips',
                builder: (context, state) => const MyTripsScreen(),
                routes: [
                  GoRoute(
                    path: ':id',
                    builder: (context, state) => TripDetailScreen(
                      tripId: state.pathParameters['id']!,
                    ),
                    routes: [
                      GoRoute(
                        path: 'check-in',
                        parentNavigatorKey: _rootNavigatorKey,
                        builder: (context, state) => CheckInScreen(
                          tripId: state.pathParameters['id']!,
                        ),
                      ),
                      GoRoute(
                        path: 'check-out',
                        parentNavigatorKey: _rootNavigatorKey,
                        builder: (context, state) => CheckOutScreen(
                          tripId: state.pathParameters['id']!,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ],
          ),
          StatefulShellBranch(
            navigatorKey: _historyNavigatorKey,
            routes: [
              GoRoute(
                path: '/history',
                builder: (context, state) => const TripHistoryScreen(),
              ),
            ],
          ),
          StatefulShellBranch(
            navigatorKey: _profileNavigatorKey,
            routes: [
              GoRoute(
                path: '/profile',
                builder: (context, state) => const ProfileScreen(),
                routes: [
                  GoRoute(
                    path: 'edit',
                    builder: (context, state) => const EditProfileScreen(),
                  ),
                  GoRoute(
                    path: 'documents',
                    builder: (context, state) => const DocumentsScreen(),
                  ),
                ],
              ),
            ],
          ),
        ],
      ),
    ],
  );
});
