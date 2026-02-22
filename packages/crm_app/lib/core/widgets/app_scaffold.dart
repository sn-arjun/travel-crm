import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../app/theme.dart';

// ---------------------------------------------------------------------------
// Menu item model
// ---------------------------------------------------------------------------

class SidebarMenuItem {
  final String label;
  final IconData icon;
  final String route;

  /// If null, visible to all roles. Otherwise only visible to listed roles.
  final List<String>? roles;

  const SidebarMenuItem({
    required this.label,
    required this.icon,
    required this.route,
    this.roles,
  });
}

// ---------------------------------------------------------------------------
// Default menu items for TravelCRM Pro
// ---------------------------------------------------------------------------

const List<SidebarMenuItem> kMenuItems = [
  SidebarMenuItem(label: 'Dashboard', icon: Icons.dashboard_outlined, route: '/dashboard'),
  SidebarMenuItem(label: 'Contacts', icon: Icons.contacts_outlined, route: '/contacts'),
  SidebarMenuItem(label: 'Leads', icon: Icons.leaderboard_outlined, route: '/leads'),
  SidebarMenuItem(label: 'Itineraries', icon: Icons.map_outlined, route: '/itineraries'),
  SidebarMenuItem(label: 'Rate Cards', icon: Icons.price_change_outlined, route: '/rate-cards', roles: ['admin', 'sales_manager']),
  SidebarMenuItem(label: 'Invoices', icon: Icons.receipt_long_outlined, route: '/invoices', roles: ['admin', 'sales_manager']),
  SidebarMenuItem(label: 'Vouchers', icon: Icons.confirmation_number_outlined, route: '/vouchers', roles: ['admin', 'sales_manager']),
  SidebarMenuItem(label: 'Suppliers', icon: Icons.business_outlined, route: '/suppliers', roles: ['admin', 'sales_manager']),
  SidebarMenuItem(label: 'Visa & Travellers', icon: Icons.card_travel_outlined, route: '/visa-travellers'),
  SidebarMenuItem(label: 'Planner', icon: Icons.calendar_month_outlined, route: '/planner'),
  SidebarMenuItem(label: 'Tasks', icon: Icons.task_alt_outlined, route: '/tasks'),
  SidebarMenuItem(label: 'Reports', icon: Icons.bar_chart_outlined, route: '/reports', roles: ['admin', 'sales_manager']),
  SidebarMenuItem(label: 'Marketing', icon: Icons.campaign_outlined, route: '/marketing', roles: ['admin']),
  SidebarMenuItem(label: 'Fleet', icon: Icons.directions_car_outlined, route: '/fleet', roles: ['admin']),
  SidebarMenuItem(label: 'Settings', icon: Icons.settings_outlined, route: '/settings'),
];

// ---------------------------------------------------------------------------
// Sidebar collapsed state  (shared across the app)
// ---------------------------------------------------------------------------

final ValueNotifier<bool> sidebarCollapsed = ValueNotifier<bool>(false);

// ---------------------------------------------------------------------------
// AppScaffold
// ---------------------------------------------------------------------------

class AppScaffold extends StatelessWidget {
  final Widget child;
  final String title;
  final List<Widget>? breadcrumbs;
  final int notificationCount;
  final VoidCallback? onSearchPressed;
  final VoidCallback? onNotificationPressed;
  final VoidCallback? onProfilePressed;
  final VoidCallback? onLogoutPressed;
  final String? avatarUrl;
  final String? userName;
  final String? userRole;

  const AppScaffold({
    super.key,
    required this.child,
    required this.title,
    this.breadcrumbs,
    this.notificationCount = 0,
    this.onSearchPressed,
    this.onNotificationPressed,
    this.onProfilePressed,
    this.onLogoutPressed,
    this.avatarUrl,
    this.userName,
    this.userRole,
  });

  /// Menu items filtered by the current user's role.
  List<SidebarMenuItem> get _visibleItems {
    final role = userRole;
    if (role == null) return kMenuItems;
    return kMenuItems.where((i) => i.roles == null || i.roles!.contains(role)).toList();
  }

  // Determine the selected index from the current GoRouter location.
  int _selectedIndex(BuildContext context) {
    final items = _visibleItems;
    final location = GoRouterState.of(context).uri.toString();
    for (var i = 0; i < items.length; i++) {
      if (location.startsWith(items[i].route)) return i;
    }
    return 0;
  }

  void _onItemSelected(BuildContext context, int index) {
    context.go(_visibleItems[index].route);
  }

  // --- Top app bar (shared between all breakpoints) ---
  PreferredSizeWidget _buildTopBar(BuildContext context) {
    final theme = Theme.of(context);
    return AppBar(
      title: breadcrumbs != null
          ? Row(children: breadcrumbs!)
          : Text(title, style: theme.textTheme.titleLarge),
      actions: [
        IconButton(
          icon: const Icon(Icons.search),
          tooltip: 'Search',
          onPressed: onSearchPressed,
        ),
        Stack(
          children: [
            IconButton(
              icon: const Icon(Icons.notifications_outlined),
              tooltip: 'Notifications',
              onPressed: onNotificationPressed,
            ),
            if (notificationCount > 0)
              Positioned(
                right: 6,
                top: 6,
                child: Container(
                  padding: const EdgeInsets.all(2),
                  decoration: BoxDecoration(
                    color: AppTheme.errorColor,
                    borderRadius: BorderRadius.circular(10),
                  ),
                  constraints: const BoxConstraints(minWidth: 18, minHeight: 18),
                  child: Text(
                    notificationCount > 99 ? '99+' : '$notificationCount',
                    style: const TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.bold),
                    textAlign: TextAlign.center,
                  ),
                ),
              ),
          ],
        ),
        const SizedBox(width: 4),
        PopupMenuButton<String>(
          offset: const Offset(0, 48),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppTheme.radiusMd)),
          onSelected: (v) {
            if (v == 'profile') onProfilePressed?.call();
            if (v == 'logout') onLogoutPressed?.call();
          },
          itemBuilder: (_) => [
            PopupMenuItem(
              value: 'profile',
              child: Row(
                children: [
                  const Icon(Icons.person_outline_rounded, size: 18),
                  const SizedBox(width: 8),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(userName ?? 'User', style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
                      const Text('My Profile', style: TextStyle(fontSize: 12, color: Color(0xFF64748B))),
                    ],
                  ),
                ],
              ),
            ),
            const PopupMenuDivider(),
            const PopupMenuItem(
              value: 'logout',
              child: Row(
                children: [
                  Icon(Icons.logout_rounded, size: 18, color: Color(0xFFDC2626)),
                  SizedBox(width: 8),
                  Text('Logout', style: TextStyle(color: Color(0xFFDC2626))),
                ],
              ),
            ),
          ],
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: AppTheme.spacingSm),
            child: CircleAvatar(
              radius: 16,
              backgroundImage: avatarUrl != null ? NetworkImage(avatarUrl!) : null,
              child: avatarUrl == null
                  ? Text(
                      (userName ?? 'U')[0].toUpperCase(),
                      style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
                    )
                  : null,
            ),
          ),
        ),
        const SizedBox(width: AppTheme.spacingSm),
      ],
    );
  }

  // --- Full sidebar (desktop) ---
  Widget _buildFullSidebar(BuildContext context, int selected) {
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;

    return ValueListenableBuilder<bool>(
      valueListenable: sidebarCollapsed,
      builder: (context, collapsed, _) {
        return AnimatedContainer(
          duration: const Duration(milliseconds: 200),
          width: collapsed ? 72 : 260,
          clipBehavior: Clip.hardEdge,
          decoration: BoxDecoration(
            color: theme.colorScheme.surface,
            border: Border(right: BorderSide(color: theme.dividerColor)),
          ),
          child: Column(
            children: [
              // Header
              SizedBox(
                height: 64,
                child: Padding(
                  // Use smaller horizontal padding when collapsed so icon + toggle fit in 72px.
                  padding: EdgeInsets.symmetric(
                    horizontal: collapsed ? AppTheme.spacingXs : AppTheme.spacingMd,
                  ),
                  child: Row(
                    children: [
                      Icon(Icons.flight_takeoff, color: colorScheme.primary, size: 28),
                      if (!collapsed) ...[
                        const SizedBox(width: AppTheme.spacingSm),
                        Expanded(
                          child: Text(
                            'TravelCRM Pro',
                            style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold),
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      ],
                      const Spacer(),
                      IconButton(
                        icon: Icon(collapsed ? Icons.chevron_right : Icons.chevron_left, size: 20),
                        onPressed: () => sidebarCollapsed.value = !sidebarCollapsed.value,
                        tooltip: collapsed ? 'Expand sidebar' : 'Collapse sidebar',
                        padding: EdgeInsets.zero,
                        constraints: const BoxConstraints(),
                      ),
                    ],
                  ),
                ),
              ),
              const Divider(height: 1),
              // Menu
              Expanded(
                child: ListView.builder(
                  padding: const EdgeInsets.symmetric(vertical: AppTheme.spacingSm),
                  itemCount: _visibleItems.length,
                  itemBuilder: (context, index) {
                    final item = _visibleItems[index];
                    final isSelected = index == selected;
                    return _SidebarTile(
                      icon: item.icon,
                      label: item.label,
                      isSelected: isSelected,
                      collapsed: collapsed,
                      onTap: () => _onItemSelected(context, index),
                    );
                  },
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  // --- Navigation rail (tablet) ---
  Widget _buildNavRail(BuildContext context, int selected) {
    return NavigationRail(
      selectedIndex: selected,
      onDestinationSelected: (i) => _onItemSelected(context, i),
      labelType: NavigationRailLabelType.all,
      leading: Padding(
        padding: const EdgeInsets.only(bottom: AppTheme.spacingSm),
        child: Icon(Icons.flight_takeoff, color: Theme.of(context).colorScheme.primary, size: 28),
      ),
      destinations: _visibleItems
          .map((m) => NavigationRailDestination(icon: Icon(m.icon), label: Text(m.label, overflow: TextOverflow.ellipsis)))
          .toList(),
    );
  }

  // --- Bottom navigation (mobile, first 5 + more) ---
  Widget _buildBottomNav(BuildContext context, int selected) {
    // Show first 4 items + "More" that opens a drawer.
    const visibleCount = 4;
    final isInMore = selected >= visibleCount;
    return NavigationBar(
      selectedIndex: isInMore ? visibleCount : selected,
      onDestinationSelected: (i) {
        if (i == visibleCount) {
          _showMoreSheet(context, selected);
        } else {
          _onItemSelected(context, i);
        }
      },
      destinations: [
        ..._visibleItems.take(visibleCount).map(
              (m) => NavigationDestination(icon: Icon(m.icon), label: m.label),
            ),
        const NavigationDestination(icon: Icon(Icons.more_horiz), label: 'More'),
      ],
    );
  }

  void _showMoreSheet(BuildContext context, int selected) {
    final items = _visibleItems;
    showModalBottomSheet(
      context: context,
      builder: (_) => SafeArea(
        child: ListView(
          shrinkWrap: true,
          children: [
            for (var i = 4; i < items.length; i++)
              ListTile(
                leading: Icon(items[i].icon),
                title: Text(items[i].label),
                selected: i == selected,
                onTap: () {
                  Navigator.pop(context);
                  _onItemSelected(context, i);
                },
              ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final width = MediaQuery.sizeOf(context).width;
    final selected = _selectedIndex(context);

    // Mobile (<600)
    if (width < 600) {
      return Scaffold(
        appBar: _buildTopBar(context),
        body: child,
        bottomNavigationBar: _buildBottomNav(context, selected),
      );
    }

    // Tablet (600-1200)
    if (width < 1200) {
      return Scaffold(
        appBar: _buildTopBar(context),
        body: Row(
          children: [
            _buildNavRail(context, selected),
            const VerticalDivider(width: 1),
            Expanded(child: child),
          ],
        ),
      );
    }

    // Desktop (>1200)
    return Scaffold(
      appBar: _buildTopBar(context),
      body: Row(
        children: [
          _buildFullSidebar(context, selected),
          Expanded(child: child),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Internal sidebar tile
// ---------------------------------------------------------------------------

class _SidebarTile extends StatelessWidget {
  final IconData icon;
  final String label;
  final bool isSelected;
  final bool collapsed;
  final VoidCallback onTap;

  const _SidebarTile({
    required this.icon,
    required this.label,
    required this.isSelected,
    required this.collapsed,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final selectedBg = colorScheme.primary.withValues(alpha: 0.08);
    final selectedFg = colorScheme.primary;
    final defaultFg = Theme.of(context).textTheme.bodyMedium?.color ?? Colors.grey.shade700;

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: AppTheme.spacingSm, vertical: 2),
      child: Material(
        color: isSelected ? selectedBg : Colors.transparent,
        borderRadius: BorderRadius.circular(AppTheme.radiusSm),
        child: InkWell(
          borderRadius: BorderRadius.circular(AppTheme.radiusSm),
          onTap: onTap,
          child: Padding(
            padding: EdgeInsets.symmetric(
              horizontal: collapsed ? AppTheme.spacingMd : AppTheme.spacingMd,
              vertical: AppTheme.spacingSm + 2,
            ),
            child: Row(
              children: [
                Icon(icon, size: 22, color: isSelected ? selectedFg : defaultFg),
                if (!collapsed) ...[
                  const SizedBox(width: AppTheme.spacingMd),
                  Expanded(
                    child: Text(
                      label,
                      style: TextStyle(
                        fontSize: 14,
                        fontWeight: isSelected ? FontWeight.w600 : FontWeight.w400,
                        color: isSelected ? selectedFg : defaultFg,
                      ),
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}
