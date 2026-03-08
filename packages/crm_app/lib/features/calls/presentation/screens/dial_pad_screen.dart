import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:shared/shared.dart';

import '../../../../core/widgets/feedback/app_snackbar.dart';
import '../../data/voip_repository.dart';

// ── Recent calls provider ─────────────────────────────────

final _recentCallsProvider =
    FutureProvider.autoDispose<List<CallLogModel>>((ref) async {
  final repo = ref.read(voipRepositoryProvider);
  final result = await repo.getCalls(limit: 10);
  return result.data;
});

// ── Screen ────────────────────────────────────────────────

class DialPadScreen extends ConsumerStatefulWidget {
  const DialPadScreen({super.key});

  @override
  ConsumerState<DialPadScreen> createState() => _DialPadScreenState();
}

class _DialPadScreenState extends ConsumerState<DialPadScreen> {
  String _number = '';
  bool _calling = false;

  void _addDigit(String digit) {
    HapticFeedback.lightImpact();
    setState(() => _number += digit);
  }

  void _backspace() {
    if (_number.isNotEmpty) {
      HapticFeedback.selectionClick();
      setState(() => _number = _number.substring(0, _number.length - 1));
    }
  }

  Future<void> _call() async {
    if (_number.isEmpty || _calling) return;

    // Ensure E.164 format
    var dialNumber = _number;
    if (!dialNumber.startsWith('+')) {
      if (dialNumber.length == 10) {
        dialNumber = '+91$dialNumber';
      } else {
        dialNumber = '+$dialNumber';
      }
    }

    setState(() => _calling = true);
    try {
      final result = await ref.read(voipRepositoryProvider).initiateCall(
            toNumber: dialNumber,
          );
      if (mounted) {
        AppSnackbar.success(context, 'Call initiated');
        context.go('/calls/${result.callLogId}');
      }
    } catch (e) {
      if (mounted) {
        AppSnackbar.error(context, e.toString());
      }
    } finally {
      if (mounted) setState(() => _calling = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final recentAsync = ref.watch(_recentCallsProvider);

    return SingleChildScrollView(
      padding: const EdgeInsets.all(24),
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 400),
          child: Column(
            children: [
              // ── Number Display ──────────────────────────
              Container(
                padding: const EdgeInsets.symmetric(
                    horizontal: 24, vertical: 16),
                decoration: BoxDecoration(
                  color: theme.colorScheme.surfaceContainerHighest,
                  borderRadius: BorderRadius.circular(16),
                ),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        _number.isEmpty ? 'Enter number' : _number,
                        style: theme.textTheme.headlineMedium?.copyWith(
                          letterSpacing: 2,
                          color: _number.isEmpty
                              ? theme.colorScheme.onSurfaceVariant
                              : null,
                        ),
                        textAlign: TextAlign.center,
                      ),
                    ),
                    if (_number.isNotEmpty)
                      GestureDetector(
                        onLongPress: () => setState(() => _number = ''),
                        child: IconButton(
                          onPressed: _backspace,
                          icon: const Icon(Icons.backspace_outlined),
                        ),
                      ),
                  ],
                ),
              ),
              const SizedBox(height: 24),

              // ── Dial Pad Grid ──────────────────────────
              _buildDialPad(theme),
              const SizedBox(height: 24),

              // ── Call Button ─────────────────────────────
              SizedBox(
                width: 72,
                height: 72,
                child: FilledButton(
                  onPressed:
                      _number.isNotEmpty && !_calling ? _call : null,
                  style: FilledButton.styleFrom(
                    backgroundColor: Colors.green,
                    shape: const CircleBorder(),
                    padding: EdgeInsets.zero,
                  ),
                  child: _calling
                      ? const SizedBox(
                          width: 24,
                          height: 24,
                          child: CircularProgressIndicator(
                            strokeWidth: 3,
                            color: Colors.white,
                          ),
                        )
                      : const Icon(Icons.phone, size: 32, color: Colors.white),
                ),
              ),
              const SizedBox(height: 32),

              // ── Recent Calls ────────────────────────────
              Align(
                alignment: Alignment.centerLeft,
                child: Text('Recent Calls',
                    style: theme.textTheme.titleMedium),
              ),
              const SizedBox(height: 12),
              recentAsync.when(
                loading: () => const Center(
                    child: CircularProgressIndicator()),
                error: (e, _) => Text('Error: $e'),
                data: (calls) {
                  if (calls.isEmpty) {
                    return Padding(
                      padding: const EdgeInsets.all(24),
                      child: Text(
                        'No recent calls',
                        style: theme.textTheme.bodyMedium?.copyWith(
                          color: theme.colorScheme.onSurfaceVariant,
                        ),
                      ),
                    );
                  }
                  return Column(
                    children: calls.map((call) {
                      final isInbound = call.direction == 'inbound';
                      return ListTile(
                        leading: Icon(
                          isInbound
                              ? Icons.phone_callback
                              : Icons.phone_forwarded,
                          color: isInbound ? Colors.blue : Colors.green,
                        ),
                        title: Text(call.contactName ??
                            (isInbound
                                ? call.fromNumber
                                : call.toNumber)),
                        subtitle: Text(
                          '${call.direction} \u2022 ${_formatDuration(call.durationSeconds)}',
                        ),
                        trailing: IconButton(
                          icon: const Icon(Icons.phone),
                          color: Colors.green,
                          onPressed: () {
                            setState(() {
                              _number = isInbound
                                  ? call.fromNumber
                                  : call.toNumber;
                            });
                          },
                        ),
                        onTap: () => context.go('/calls/${call.id}'),
                      );
                    }).toList(),
                  );
                },
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildDialPad(ThemeData theme) {
    const keys = [
      ['1', '2', '3'],
      ['4', '5', '6'],
      ['7', '8', '9'],
      ['*', '0', '#'],
    ];
    const subtitles = {
      '2': 'ABC',
      '3': 'DEF',
      '4': 'GHI',
      '5': 'JKL',
      '6': 'MNO',
      '7': 'PQRS',
      '8': 'TUV',
      '9': 'WXYZ',
      '0': '+',
    };

    return Column(
      children: keys.map((row) {
        return Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: row.map((key) {
            return Padding(
              padding: const EdgeInsets.all(6),
              child: _DialKey(
                digit: key,
                subtitle: subtitles[key],
                onTap: () => _addDigit(key),
                onLongPress: key == '0'
                    ? () => _addDigit('+')
                    : null,
              ),
            );
          }).toList(),
        );
      }).toList(),
    );
  }

  String _formatDuration(int seconds) {
    if (seconds == 0) return '0:00';
    final m = seconds ~/ 60;
    final s = seconds % 60;
    return '$m:${s.toString().padLeft(2, '0')}';
  }
}

// ── Dial Key Widget ────────────────────────────────────

class _DialKey extends StatelessWidget {
  final String digit;
  final String? subtitle;
  final VoidCallback onTap;
  final VoidCallback? onLongPress;

  const _DialKey({
    required this.digit,
    this.subtitle,
    required this.onTap,
    this.onLongPress,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Material(
      color: theme.colorScheme.surfaceContainerHighest,
      shape: const CircleBorder(),
      child: InkWell(
        onTap: onTap,
        onLongPress: onLongPress,
        customBorder: const CircleBorder(),
        child: SizedBox(
          width: 72,
          height: 72,
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Text(
                digit,
                style: theme.textTheme.headlineSmall?.copyWith(
                  fontWeight: FontWeight.w500,
                ),
              ),
              if (subtitle != null)
                Text(
                  subtitle!,
                  style: theme.textTheme.labelSmall?.copyWith(
                    color: theme.colorScheme.onSurfaceVariant,
                    letterSpacing: 2,
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
