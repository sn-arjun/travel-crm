import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:driver_app/l10n/app_localizations.dart';
import '../../../../core/constants/app_config.dart';
import '../../../../core/widgets/app_widgets.dart';
import '../../data/driver_auth_provider.dart';
import '../../data/driver_auth_repository.dart';

/// First screen on a fresh install: the driver types the agency code once.
/// The app looks it up, shows the agency name (and logo) to confirm, then
/// remembers the agency for phone and OTP sign-in.
class AgencyCodeScreen extends ConsumerStatefulWidget {
  const AgencyCodeScreen({super.key});

  @override
  ConsumerState<AgencyCodeScreen> createState() => _AgencyCodeScreenState();
}

class _AgencyCodeScreenState extends ConsumerState<AgencyCodeScreen> {
  final _codeController = TextEditingController();
  bool _looking = false;
  String? _error;
  AgencyInfo? _found;

  @override
  void dispose() {
    _codeController.dispose();
    super.dispose();
  }

  Future<void> _lookup() async {
    final l10n = AppLocalizations.of(context)!;
    final code = _codeController.text.trim();
    if (code.isEmpty) {
      setState(() => _error = l10n.agencyCodeRequired);
      return;
    }
    setState(() {
      _looking = true;
      _error = null;
    });
    try {
      final agency =
          await ref.read(driverAuthRepositoryProvider).lookupAgency(code);
      if (!mounted) return;
      setState(() {
        _found = agency;
        _looking = false;
      });
    } catch (e) {
      if (!mounted) return;
      final notFound = e is DioException && e.response?.statusCode == 404;
      setState(() {
        _looking = false;
        _error = notFound ? l10n.agencyInvalid : extractAuthError(e);
      });
    }
  }

  Future<void> _confirm() async {
    final agency = _found;
    if (agency == null) return;
    await ref.read(driverAuthProvider.notifier).selectAgency(agency);
    if (!mounted) return;
    context.go('/login');
  }

  void _back() => setState(() {
        _found = null;
        _error = null;
      });

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final scheme = Theme.of(context).colorScheme;
    final text = Theme.of(context).textTheme;
    final found = _found;

    return Scaffold(
      body: SafeArea(
        child: LayoutBuilder(
          builder: (context, constraints) => SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 24),
            child: ConstrainedBox(
              constraints: BoxConstraints(minHeight: constraints.maxHeight),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const SizedBox(height: 24),
                  Center(
                    child: Container(
                      key: const Key('brand-mark'),
                      width: 88,
                      height: 88,
                      decoration: BoxDecoration(
                        color: scheme.primaryContainer,
                        borderRadius: BorderRadius.circular(26),
                      ),
                      child: Icon(Icons.directions_car_rounded,
                          size: 46, color: scheme.primary),
                    ),
                  ),
                  const SizedBox(height: 20),
                  Text(l10n.appTitle,
                      style: text.headlineMedium, textAlign: TextAlign.center),
                  const SizedBox(height: 36),
                  if (found == null)
                    ..._codeForm(l10n, scheme, text)
                  else
                    ..._confirmCard(l10n, text, found),
                  const SizedBox(height: 24),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  List<Widget> _codeForm(
      AppLocalizations l10n, ColorScheme scheme, TextTheme text) {
    return [
      Text(l10n.agencyTitle, style: text.titleLarge),
      const SizedBox(height: 4),
      Text(l10n.agencySubtitle,
          style: text.bodyMedium?.copyWith(color: scheme.onSurfaceVariant)),
      const SizedBox(height: 20),
      TextField(
        key: const Key('agency-code-field'),
        controller: _codeController,
        autocorrect: false,
        enableSuggestions: false,
        textInputAction: TextInputAction.go,
        textCapitalization: TextCapitalization.none,
        style: text.titleMedium,
        inputFormatters: [
          FilteringTextInputFormatter.allow(RegExp(r'[A-Za-z0-9-]')),
          LengthLimitingTextInputFormatter(63),
        ],
        decoration: InputDecoration(hintText: l10n.agencyCodeHint),
        onChanged: (_) {
          if (_error != null) setState(() => _error = null);
        },
        onSubmitted: (_) {
          if (!_looking) _lookup();
        },
      ),
      if (_error != null) ...[
        const SizedBox(height: 12),
        Row(
          key: const Key('agency-error'),
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(Icons.error_outline, size: 18, color: scheme.error),
            const SizedBox(width: 6),
            Expanded(
              child: Text(_error!,
                  style: text.bodyMedium?.copyWith(color: scheme.error)),
            ),
          ],
        ),
      ],
      const SizedBox(height: 24),
      FilledButton(
        key: const Key('agency-continue'),
        onPressed: _looking ? null : _lookup,
        child: _looking ? const ButtonSpinner() : Text(l10n.agencyContinue),
      ),
    ];
  }

  List<Widget> _confirmCard(
      AppLocalizations l10n, TextTheme text, AgencyInfo agency) {
    return [
      Text(l10n.agencyConfirmPrompt, style: text.titleLarge),
      const SizedBox(height: 16),
      Card(
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            children: [
              _AgencyLogo(url: agency.logoUrl),
              const SizedBox(height: 12),
              Text(
                agency.name,
                key: const Key('agency-name'),
                style: text.titleLarge,
                textAlign: TextAlign.center,
              ),
            ],
          ),
        ),
      ),
      const SizedBox(height: 24),
      FilledButton(
        key: const Key('agency-confirm'),
        onPressed: _confirm,
        child: Text(l10n.agencyConfirm),
      ),
      const SizedBox(height: 8),
      TextButton(
        key: const Key('agency-not-yours'),
        onPressed: _back,
        child: Text(l10n.agencyNotYours),
      ),
    ];
  }
}

/// The agency logo, or a neutral building icon when there is none or it
/// cannot be loaded.
class _AgencyLogo extends StatelessWidget {
  final String? url;
  const _AgencyLogo({required this.url});

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final fallback = Icon(Icons.business_rounded,
        size: 40, color: scheme.onSecondaryContainer);
    final raw = url;
    Widget child = fallback;
    if (raw != null && raw.isNotEmpty) {
      final full = raw.startsWith('http') ? raw : '${AppConfig.apiBaseUrl}$raw';
      child = ClipRRect(
        borderRadius: BorderRadius.circular(16),
        child: Image.network(full,
            width: 72,
            height: 72,
            fit: BoxFit.cover,
            errorBuilder: (_, _, _) => fallback),
      );
    }
    return Container(
      key: const Key('agency-logo'),
      width: 72,
      height: 72,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: scheme.secondaryContainer,
        borderRadius: BorderRadius.circular(16),
      ),
      child: child,
    );
  }
}
