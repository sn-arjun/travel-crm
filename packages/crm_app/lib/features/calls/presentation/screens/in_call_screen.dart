import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/widgets/feedback/app_snackbar.dart';
import '../../data/voip_repository.dart';

/// TICKET-375: In-Call Controls UI
/// TICKET-376: Call Transfer
class InCallScreen extends ConsumerStatefulWidget {
  final String callLogId;
  final String phoneNumber;
  final String? contactName;
  final bool isInbound;

  const InCallScreen({
    super.key,
    required this.callLogId,
    required this.phoneNumber,
    this.contactName,
    this.isInbound = false,
  });

  @override
  ConsumerState<InCallScreen> createState() => _InCallScreenState();
}

class _InCallScreenState extends ConsumerState<InCallScreen> {
  bool _muted = false;
  bool _onHold = false;
  bool _speakerOn = false;
  bool _showKeypad = false;
  int _seconds = 0;
  Timer? _timer;
  String _dtmfBuffer = '';

  @override
  void initState() {
    super.initState();
    _timer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() => _seconds++);
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  String get _formattedTime {
    final m = _seconds ~/ 60;
    final s = _seconds % 60;
    return '${m.toString().padLeft(2, '0')}:${s.toString().padLeft(2, '0')}';
  }

  Future<void> _endCall() async {
    try {
      await ref.read(voipRepositoryProvider).endCall(widget.callLogId);
    } catch (_) {}
    if (mounted) {
      context.go('/calls/${widget.callLogId}');
    }
  }

  Future<void> _showTransferDialog() async {
    final controller = TextEditingController();
    final number = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Transfer Call'),
        content: TextField(
          controller: controller,
          keyboardType: TextInputType.phone,
          decoration: const InputDecoration(
            labelText: 'Transfer to number',
            hintText: '+91...',
            border: OutlineInputBorder(),
            prefixIcon: Icon(Icons.phone),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, controller.text.trim()),
            child: const Text('Transfer'),
          ),
        ],
      ),
    );

    if (number != null && number.isNotEmpty) {
      try {
        await ref
            .read(voipRepositoryProvider)
            .transferCall(widget.callLogId, number);
        if (mounted) {
          AppSnackbar.success(context, 'Call transferred');
          context.go('/calls/${widget.callLogId}');
        }
      } catch (e) {
        if (mounted) AppSnackbar.error(context, e.toString());
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final displayName = widget.contactName ?? widget.phoneNumber;

    return Scaffold(
      backgroundColor: theme.colorScheme.surface,
      body: SafeArea(
        child: Column(
          children: [
            const Spacer(flex: 2),
            // Contact info
            CircleAvatar(
              radius: 48,
              backgroundColor: theme.colorScheme.primaryContainer,
              child: Icon(
                widget.isInbound ? Icons.phone_callback : Icons.phone,
                size: 36,
                color: theme.colorScheme.primary,
              ),
            ),
            const SizedBox(height: 16),
            Text(
              displayName,
              style: theme.textTheme.headlineMedium,
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 4),
            Text(
              widget.phoneNumber,
              style: theme.textTheme.bodyLarge?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
              ),
            ),
            const SizedBox(height: 12),
            Text(
              _onHold ? 'On Hold' : _formattedTime,
              style: theme.textTheme.titleMedium?.copyWith(
                color: _onHold
                    ? theme.colorScheme.error
                    : theme.colorScheme.primary,
              ),
            ),
            const Spacer(flex: 2),

            // DTMF display
            if (_showKeypad && _dtmfBuffer.isNotEmpty)
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 32),
                child: Text(
                  _dtmfBuffer,
                  style: theme.textTheme.headlineSmall,
                  textAlign: TextAlign.center,
                ),
              ),

            // Keypad or controls
            if (_showKeypad) _buildKeypad(theme) else _buildControls(theme),

            const SizedBox(height: 24),

            // End call button
            GestureDetector(
              onTap: _endCall,
              child: Container(
                width: 72,
                height: 72,
                decoration: const BoxDecoration(
                  color: Colors.red,
                  shape: BoxShape.circle,
                ),
                child: const Icon(Icons.call_end, color: Colors.white, size: 32),
              ),
            ),
            const SizedBox(height: 16),

            // Toggle keypad
            TextButton(
              onPressed: () => setState(() {
                _showKeypad = !_showKeypad;
              }),
              child: Text(_showKeypad ? 'Hide Keypad' : 'Show Keypad'),
            ),
            const Spacer(),
          ],
        ),
      ),
    );
  }

  Widget _buildControls(ThemeData theme) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 40),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceEvenly,
        children: [
          _ControlButton(
            icon: _muted ? Icons.mic_off : Icons.mic,
            label: 'Mute',
            isActive: _muted,
            onTap: () => setState(() => _muted = !_muted),
          ),
          _ControlButton(
            icon: Icons.pause,
            label: 'Hold',
            isActive: _onHold,
            onTap: () => setState(() => _onHold = !_onHold),
          ),
          _ControlButton(
            icon: _speakerOn ? Icons.volume_up : Icons.volume_down,
            label: 'Speaker',
            isActive: _speakerOn,
            onTap: () => setState(() => _speakerOn = !_speakerOn),
          ),
          _ControlButton(
            icon: Icons.swap_calls,
            label: 'Transfer',
            onTap: _showTransferDialog,
          ),
        ],
      ),
    );
  }

  Widget _buildKeypad(ThemeData theme) {
    const keys = [
      ['1', '2', '3'],
      ['4', '5', '6'],
      ['7', '8', '9'],
      ['*', '0', '#'],
    ];

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 48),
      child: Column(
        children: keys
            .map((row) => Row(
                  mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                  children: row.map((key) {
                    return Padding(
                      padding: const EdgeInsets.all(4),
                      child: InkWell(
                        borderRadius: BorderRadius.circular(40),
                        onTap: () {
                          setState(() => _dtmfBuffer += key);
                        },
                        child: Container(
                          width: 56,
                          height: 56,
                          alignment: Alignment.center,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            color: theme.colorScheme.surfaceContainerHighest,
                          ),
                          child: Text(key,
                              style: theme.textTheme.headlineSmall),
                        ),
                      ),
                    );
                  }).toList(),
                ))
            .toList(),
      ),
    );
  }
}

class _ControlButton extends StatelessWidget {
  final IconData icon;
  final String label;
  final bool isActive;
  final VoidCallback onTap;

  const _ControlButton({
    required this.icon,
    required this.label,
    this.isActive = false,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return GestureDetector(
      onTap: onTap,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 56,
            height: 56,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: isActive
                  ? theme.colorScheme.primary
                  : theme.colorScheme.surfaceContainerHighest,
            ),
            child: Icon(
              icon,
              color: isActive
                  ? theme.colorScheme.onPrimary
                  : theme.colorScheme.onSurface,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            label,
            style: theme.textTheme.labelSmall?.copyWith(
              color: isActive
                  ? theme.colorScheme.primary
                  : theme.colorScheme.onSurfaceVariant,
            ),
          ),
        ],
      ),
    );
  }
}
