import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../data/fleet_provider.dart';

String _vehicleTypeLabel(String type) {
  const labels = {
    'sedan': 'Sedan',
    'suv': 'SUV',
    'muv': 'MUV',
    'tempo_traveller': 'Tempo Traveller',
    'mini_bus': 'Mini Bus',
    'bus': 'Bus',
    'luxury_coach': 'Luxury Coach',
  };
  return labels[type] ?? type;
}

class FleetDashboardScreen extends ConsumerWidget {
  const FleetDashboardScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final dashboard = ref.watch(fleetDashboardProvider);
    final theme = Theme.of(context);
    final width = MediaQuery.sizeOf(context).width;
    final isWide = width > 800;

    return dashboard.when(
      data: (data) => RefreshIndicator(
        onRefresh: () => ref.refresh(fleetDashboardProvider.future),
        child: ListView(padding: const EdgeInsets.all(16), children: [
          // ── Navigation Tiles ──────────────────────────────────
          GridView.count(
            crossAxisCount: isWide ? 4 : 2,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            mainAxisSpacing: 12,
            crossAxisSpacing: 12,
            childAspectRatio: isWide ? 2.5 : 1.8,
            children: [
              _NavTile(
                icon: Icons.directions_car_outlined,
                label: 'Vehicles',
                count: data.vehicleSummary['total'] ?? 0,
                subtitle: '${data.vehicleSummary['available'] ?? 0} available',
                color: Colors.blue,
                onTap: () => context.go('/fleet/vehicles'),
              ),
              _NavTile(
                icon: Icons.people_outlined,
                label: 'Drivers',
                count: data.driverSummary['total'] ?? 0,
                subtitle: '${data.driverSummary['active'] ?? 0} active',
                color: Colors.green,
                onTap: () => context.go('/fleet/drivers'),
              ),
              _NavTile(
                icon: Icons.route_outlined,
                label: 'Trips',
                count: data.activeTrips.length + data.upcomingTrips.length,
                subtitle: '${data.activeTrips.length} active',
                color: Colors.orange,
                onTap: () => context.go('/fleet/trips'),
              ),
              _NavTile(
                icon: Icons.warning_amber_outlined,
                label: 'Alerts',
                count: data.expiringDocuments + data.maintenanceDue,
                subtitle: 'Needs attention',
                color: (data.expiringDocuments + data.maintenanceDue) > 0
                    ? Colors.red
                    : Colors.grey,
                onTap: () => context.go('/fleet/alerts'),
              ),
            ],
          ),

          // ── Alert Banner ──────────────────────────────────────
          if (data.expiringDocuments > 0 || data.maintenanceDue > 0) ...[
            const SizedBox(height: 16),
            Card(
              color: Colors.amber.shade50,
              elevation: 0,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
                side: BorderSide(color: Colors.amber.shade200),
              ),
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                child: Row(
                  children: [
                    Icon(Icons.warning_amber_rounded, color: Colors.amber.shade800, size: 28),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('Attention Required',
                              style: theme.textTheme.titleSmall?.copyWith(
                                  fontWeight: FontWeight.bold,
                                  color: Colors.amber.shade900)),
                          const SizedBox(height: 2),
                          Text(
                            '${data.expiringDocuments} document(s) expiring/expired, ${data.maintenanceDue} maintenance due',
                            style: TextStyle(fontSize: 13, color: Colors.amber.shade900),
                          ),
                        ],
                      ),
                    ),
                    FilledButton.tonal(
                      onPressed: () => context.go('/fleet/alerts'),
                      child: const Text('View'),
                    ),
                  ],
                ),
              ),
            ),
          ],

          // ── Revenue Summary ───────────────────────────────────
          if (data.revenue != null) ...[
            const SizedBox(height: 24),
            _SectionHeader(title: 'Revenue This Month'),
            const SizedBox(height: 8),
            GridView.count(
              crossAxisCount: isWide ? 4 : 2,
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              mainAxisSpacing: 12,
              crossAxisSpacing: 12,
              childAspectRatio: isWide ? 2.5 : 1.8,
              children: [
                _NavTile(
                  icon: Icons.currency_rupee,
                  label: 'Revenue',
                  count: data.revenue!.thisMonth.round(),
                  subtitle: 'This month',
                  color: Colors.teal,
                  onTap: () {},
                ),
                _NavTile(
                  icon: Icons.route_outlined,
                  label: 'Trips',
                  count: data.revenue!.thisMonthTrips,
                  subtitle: 'Completed',
                  color: Colors.indigo,
                  onTap: () {},
                ),
                _NavTile(
                  icon: Icons.trending_up,
                  label: 'Profit',
                  count: (data.revenue!.thisMonth - data.revenue!.thisMonthCosts).round(),
                  subtitle: data.revenue!.thisMonth > 0
                      ? '${((data.revenue!.thisMonth - data.revenue!.thisMonthCosts) / data.revenue!.thisMonth * 100).toStringAsFixed(0)}% margin'
                      : 'N/A',
                  color: (data.revenue!.thisMonth - data.revenue!.thisMonthCosts) >= 0
                      ? Colors.green
                      : Colors.red,
                  onTap: () {},
                ),
                _NavTile(
                  icon: Icons.compare_arrows,
                  label: 'Last Month',
                  count: data.revenue!.lastMonth.round(),
                  subtitle: '${data.revenue!.lastMonthTrips} trips',
                  color: Colors.grey,
                  onTap: () {},
                ),
              ],
            ),
            // Revenue by vehicle type
            if (data.revenue!.byVehicleType.isNotEmpty) ...[
              const SizedBox(height: 16),
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Revenue by Vehicle Type',
                          style: theme.textTheme.titleSmall
                              ?.copyWith(fontWeight: FontWeight.bold)),
                      const SizedBox(height: 12),
                      ...data.revenue!.byVehicleType.map((r) => Padding(
                            padding: const EdgeInsets.symmetric(vertical: 4),
                            child: Row(children: [
                              SizedBox(
                                width: 120,
                                child: Text(
                                  _vehicleTypeLabel(r.vehicleType),
                                  style: TextStyle(
                                      fontSize: 13,
                                      color: Colors.grey[700]),
                                ),
                              ),
                              Expanded(
                                child: LinearProgressIndicator(
                                  value: data.revenue!.thisMonth > 0
                                      ? r.revenue / data.revenue!.thisMonth
                                      : 0,
                                  backgroundColor: Colors.grey.shade200,
                                  color: Colors.teal,
                                ),
                              ),
                              const SizedBox(width: 12),
                              Text(
                                '\u20B9${r.revenue.toStringAsFixed(0)}',
                                style: const TextStyle(
                                    fontWeight: FontWeight.w600,
                                    fontSize: 13),
                              ),
                              const SizedBox(width: 8),
                              Text(
                                '(${r.trips})',
                                style: TextStyle(
                                    fontSize: 12,
                                    color: Colors.grey[600]),
                              ),
                            ]),
                          )),
                    ],
                  ),
                ),
              ),
            ],
            // Driver leaderboard
            if (data.revenue!.byDriver.isNotEmpty) ...[
              const SizedBox(height: 16),
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Driver Revenue Leaderboard',
                          style: theme.textTheme.titleSmall
                              ?.copyWith(fontWeight: FontWeight.bold)),
                      const SizedBox(height: 12),
                      ...data.revenue!.byDriver.asMap().entries.map((entry) {
                        final i = entry.key;
                        final d = entry.value;
                        return ListTile(
                          contentPadding: EdgeInsets.zero,
                          dense: true,
                          leading: CircleAvatar(
                            radius: 16,
                            backgroundColor: i == 0
                                ? Colors.amber.shade100
                                : Colors.grey.shade100,
                            child: i == 0
                                ? Icon(Icons.emoji_events,
                                    size: 16,
                                    color: Colors.amber.shade700)
                                : Text('${i + 1}',
                                    style: TextStyle(
                                        fontWeight: FontWeight.bold,
                                        fontSize: 12,
                                        color: Colors.grey[700])),
                          ),
                          title: Text(d.name,
                              style: const TextStyle(
                                  fontWeight: FontWeight.w600,
                                  fontSize: 14)),
                          subtitle: Text('${d.trips} trips',
                              style: TextStyle(
                                  fontSize: 12,
                                  color: Colors.grey[600])),
                          trailing: Text(
                            '\u20B9${d.revenue.toStringAsFixed(0)}',
                            style: const TextStyle(
                                fontWeight: FontWeight.bold,
                                fontSize: 14,
                                color: Colors.teal),
                          ),
                          onTap: () =>
                              context.go('/fleet/drivers/${d.id}'),
                        );
                      }),
                    ],
                  ),
                ),
              ),
            ],
          ],

          // ── Active Trips ──────────────────────────────────────
          const SizedBox(height: 24),
          _SectionHeader(
            title: 'Active Trips',
            trailing: data.activeTrips.isNotEmpty
                ? TextButton(
                    onPressed: () => context.go('/fleet/trips'),
                    child: const Text('View All'))
                : null,
          ),
          if (data.activeTrips.isEmpty)
            _EmptySection(
              icon: Icons.check_circle_outline,
              message: 'No active trips right now',
            )
          else
            ...data.activeTrips.map((trip) => Card(
                  margin: const EdgeInsets.only(bottom: 8),
                  child: ListTile(
                    leading: CircleAvatar(
                      backgroundColor: Colors.orange.shade50,
                      child: Icon(Icons.route, color: Colors.orange.shade700, size: 20),
                    ),
                    title: Text(trip.passengerName ?? 'Trip',
                        style: const TextStyle(fontWeight: FontWeight.w600)),
                    subtitle: Text(
                      '${trip.vehicleRegistration ?? ''} \u2022 ${trip.driverName ?? ''}',
                      style: TextStyle(fontSize: 13, color: Colors.grey[600]),
                    ),
                    trailing: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                      decoration: BoxDecoration(
                        color: Colors.blue.shade50,
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Text(
                        trip.status.replaceAll('_', ' '),
                        style: TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w600,
                            color: Colors.blue.shade700),
                      ),
                    ),
                    onTap: () => context.go('/fleet/trips/${trip.id}'),
                  ),
                )),

          // ── Upcoming Trips ────────────────────────────────────
          if (data.upcomingTrips.isNotEmpty) ...[
            const SizedBox(height: 24),
            _SectionHeader(title: 'Upcoming (Next 7 Days)'),
            ...data.upcomingTrips.map((trip) => Card(
                  margin: const EdgeInsets.only(bottom: 8),
                  child: ListTile(
                    leading: CircleAvatar(
                      backgroundColor: Colors.purple.shade50,
                      child: Icon(Icons.calendar_today, color: Colors.purple.shade700, size: 18),
                    ),
                    title: Text(trip.passengerName ?? 'Trip',
                        style: const TextStyle(fontWeight: FontWeight.w600)),
                    subtitle: Text(
                      '${trip.pickupDatetime?.substring(0, 10) ?? ''} \u2022 ${trip.vehicleRegistration ?? ''}',
                      style: TextStyle(fontSize: 13, color: Colors.grey[600]),
                    ),
                    onTap: () => context.go('/fleet/trips/${trip.id}'),
                  ),
                )),
          ],

          // ── Top Drivers ───────────────────────────────────────
          if (data.topDrivers.isNotEmpty) ...[
            const SizedBox(height: 24),
            _SectionHeader(title: 'Top Drivers'),
            ...data.topDrivers.asMap().entries.map((entry) {
              final i = entry.key;
              final d = entry.value;
              return Card(
                margin: const EdgeInsets.only(bottom: 8),
                child: ListTile(
                  leading: CircleAvatar(
                    backgroundColor: i == 0
                        ? Colors.amber.shade50
                        : Colors.green.shade50,
                    child: i == 0
                        ? Icon(Icons.emoji_events, color: Colors.amber.shade700, size: 20)
                        : Text(d.name[0].toUpperCase(),
                            style: TextStyle(
                                fontWeight: FontWeight.bold,
                                color: Colors.green.shade700)),
                  ),
                  title: Text(d.name,
                      style: const TextStyle(fontWeight: FontWeight.w600)),
                  subtitle: Row(children: [
                    ...List.generate(
                        5,
                        (j) => Icon(
                            j < d.rating.round()
                                ? Icons.star
                                : Icons.star_border,
                            size: 14,
                            color: Colors.amber)),
                    const SizedBox(width: 6),
                    Text('${d.totalTrips} trips',
                        style: TextStyle(fontSize: 12, color: Colors.grey[600])),
                  ]),
                  onTap: () => context.go('/fleet/drivers/${d.id}'),
                ),
              );
            }),
          ],

          // ── Quick Actions ─────────────────────────────────────
          const SizedBox(height: 24),
          _SectionHeader(title: 'Quick Actions'),
          const SizedBox(height: 8),
          Wrap(spacing: 12, runSpacing: 12, children: [
            _QuickAction(
              icon: Icons.directions_car,
              label: 'Add Vehicle',
              color: Colors.blue,
              onTap: () => context.go('/fleet/vehicles/new'),
            ),
            _QuickAction(
              icon: Icons.person_add,
              label: 'Add Driver',
              color: Colors.green,
              onTap: () => context.go('/fleet/drivers/new'),
            ),
            _QuickAction(
              icon: Icons.add_road,
              label: 'New Trip',
              color: Colors.orange,
              onTap: () => context.go('/fleet/trips/new'),
            ),
            _QuickAction(
              icon: Icons.price_change,
              label: 'Rate Cards',
              color: Colors.teal,
              onTap: () => context.go('/fleet/rate-cards'),
            ),
          ]),
          const SizedBox(height: 32),
        ]),
      ),
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Icon(Icons.error_outline, size: 48, color: Colors.red.shade300),
            const SizedBox(height: 16),
            Text('Failed to load fleet dashboard',
                style: theme.textTheme.titleMedium),
            const SizedBox(height: 8),
            Text('$e',
                style: TextStyle(fontSize: 13, color: Colors.grey[600]),
                textAlign: TextAlign.center),
            const SizedBox(height: 16),
            FilledButton(
              onPressed: () => ref.invalidate(fleetDashboardProvider),
              child: const Text('Retry'),
            ),
          ]),
        ),
      ),
    );
  }
}

// ─── Navigation Tile ──────────────────────────────────────────────────────

class _NavTile extends StatelessWidget {
  final IconData icon;
  final String label;
  final int count;
  final String subtitle;
  final Color color;
  final VoidCallback onTap;

  const _NavTile({
    required this.icon,
    required this.label,
    required this.count,
    required this.subtitle,
    required this.color,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Card(
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: BorderSide(color: Colors.grey.shade200),
      ),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Row(
                children: [
                  Icon(icon, color: color, size: 22),
                  const Spacer(),
                  Text('$count',
                      style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                          fontWeight: FontWeight.bold, color: color)),
                ],
              ),
              const SizedBox(height: 6),
              Text(label,
                  style: Theme.of(context)
                      .textTheme
                      .titleSmall
                      ?.copyWith(fontWeight: FontWeight.w600)),
              Text(subtitle,
                  style: TextStyle(fontSize: 11, color: Colors.grey[600])),
            ],
          ),
        ),
      ),
    );
  }
}

// ─── Section Header ───────────────────────────────────────────────────────

class _SectionHeader extends StatelessWidget {
  final String title;
  final Widget? trailing;

  const _SectionHeader({required this.title, this.trailing});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        children: [
          Text(title,
              style: Theme.of(context)
                  .textTheme
                  .titleMedium
                  ?.copyWith(fontWeight: FontWeight.bold)),
          const Spacer(),
          ?trailing,
        ],
      ),
    );
  }
}

// ─── Empty Section ────────────────────────────────────────────────────────

class _EmptySection extends StatelessWidget {
  final IconData icon;
  final String message;

  const _EmptySection({required this.icon, required this.message});

  @override
  Widget build(BuildContext context) {
    return Card(
      elevation: 0,
      color: Colors.grey.shade50,
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, size: 20, color: Colors.grey[400]),
            const SizedBox(width: 8),
            Text(message, style: TextStyle(color: Colors.grey[500])),
          ],
        ),
      ),
    );
  }
}

// ─── Quick Action ─────────────────────────────────────────────────────────

class _QuickAction extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color color;
  final VoidCallback onTap;

  const _QuickAction({
    required this.icon,
    required this.label,
    required this.color,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: color.withValues(alpha: 0.08),
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon, size: 18, color: color),
              const SizedBox(width: 8),
              Text(label,
                  style: TextStyle(
                      fontWeight: FontWeight.w600, color: color, fontSize: 13)),
            ],
          ),
        ),
      ),
    );
  }
}
