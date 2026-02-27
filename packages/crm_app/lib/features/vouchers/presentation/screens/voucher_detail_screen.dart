import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../../app/theme.dart';
import '../../../../core/widgets/feedback/app_error_widget.dart';
import '../../../../core/widgets/feedback/app_loading.dart';
import '../../../../core/widgets/feedback/app_snackbar.dart';
import '../../../../core/widgets/layout/app_section_card.dart';
import '../../data/models/voucher.dart';
import '../../data/voucher_provider.dart';
import '../../data/voucher_state.dart';

class VoucherDetailScreen extends ConsumerStatefulWidget {
  final String voucherId;

  const VoucherDetailScreen({super.key, required this.voucherId});

  @override
  ConsumerState<VoucherDetailScreen> createState() => _VoucherDetailScreenState();
}

class _VoucherDetailScreenState extends ConsumerState<VoucherDetailScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(voucherDetailProvider(widget.voucherId).notifier).load();
    });
  }

  Future<void> _updateStatus(String status) async {
    await ref.read(voucherDetailProvider(widget.voucherId).notifier).updateStatus(status);
    if (!mounted) return;
    final state = ref.read(voucherDetailProvider(widget.voucherId));
    if (state.error != null) {
      AppSnackbar.error(context, state.error!);
    } else {
      AppSnackbar.success(context, 'Status updated to $status');
      ref.read(voucherListProvider.notifier).load(refresh: true);
    }
  }

  Future<void> _deleteVoucher() async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete Voucher'),
        content: const Text('Are you sure you want to delete this voucher? This cannot be undone.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: FilledButton.styleFrom(backgroundColor: AppTheme.errorColor),
            child: const Text('Delete'),
          ),
        ],
      ),
    );

    if (confirm != true) return;

    try {
      await ref.read(voucherRepositoryProvider).deleteVoucher(widget.voucherId);
      if (!mounted) return;
      AppSnackbar.success(context, 'Voucher deleted');
      ref.read(voucherListProvider.notifier).load(refresh: true);
      context.pop();
    } catch (e) {
      if (!mounted) return;
      AppSnackbar.error(context, 'Failed to delete voucher');
    }
  }

  void _showSendDialog(dynamic voucher) {
    String channel = 'email';
    final recipientCtrl = TextEditingController();
    bool isSending = false;

    showDialog(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDialogState) => AlertDialog(
          title: const Text('Send Voucher'),
          content: SizedBox(
            width: 360,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Send "${voucher.title}" to the customer via:',
                    style: Theme.of(context).textTheme.bodyMedium),
                const SizedBox(height: 16),
                Wrap(
                  spacing: 8,
                  children: [
                    ChoiceChip(
                      label: const Row(mainAxisSize: MainAxisSize.min, children: [
                        Icon(Icons.email_outlined, size: 16),
                        SizedBox(width: 4),
                        Text('Email'),
                      ]),
                      selected: channel == 'email',
                      onSelected: (_) => setDialogState(() => channel = 'email'),
                    ),
                    ChoiceChip(
                      label: const Row(mainAxisSize: MainAxisSize.min, children: [
                        Icon(Icons.chat_outlined, size: 16),
                        SizedBox(width: 4),
                        Text('WhatsApp'),
                      ]),
                      selected: channel == 'whatsapp',
                      onSelected: (_) => setDialogState(() => channel = 'whatsapp'),
                    ),
                    ChoiceChip(
                      label: const Row(mainAxisSize: MainAxisSize.min, children: [
                        Icon(Icons.sms_outlined, size: 16),
                        SizedBox(width: 4),
                        Text('SMS'),
                      ]),
                      selected: channel == 'sms',
                      onSelected: (_) => setDialogState(() => channel = 'sms'),
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                TextField(
                  controller: recipientCtrl,
                  decoration: InputDecoration(
                    labelText: channel == 'email' ? 'Email Address' : 'Phone Number',
                    hintText: channel == 'email' ? 'customer@example.com' : '+91 9876543210',
                    border: const OutlineInputBorder(),
                    prefixIcon: Icon(channel == 'email' ? Icons.email : Icons.phone),
                  ),
                  keyboardType: channel == 'email'
                      ? TextInputType.emailAddress
                      : TextInputType.phone,
                ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(ctx).pop(),
              child: const Text('Cancel'),
            ),
            FilledButton.icon(
              onPressed: isSending
                  ? null
                  : () async {
                      if (recipientCtrl.text.trim().isEmpty) return;
                      setDialogState(() => isSending = true);
                      try {
                        await ref.read(voucherRepositoryProvider).sendVoucher(
                              widget.voucherId,
                              channel: channel,
                              to: recipientCtrl.text.trim(),
                            );
                        if (!ctx.mounted) return;
                        Navigator.of(ctx).pop();
                        if (!mounted) return;
                        AppSnackbar.success(context, 'Voucher sent via $channel');
                        ref.read(voucherDetailProvider(widget.voucherId).notifier).load();
                        ref.read(voucherListProvider.notifier).load(refresh: true);
                      } catch (e) {
                        setDialogState(() => isSending = false);
                        if (mounted) AppSnackbar.error(context, 'Failed to send voucher');
                      }
                    },
              icon: isSending
                  ? const SizedBox(height: 16, width: 16, child: CircularProgressIndicator(strokeWidth: 2))
                  : const Icon(Icons.send, size: 16),
              label: const Text('Send'),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(voucherDetailProvider(widget.voucherId));

    if (state.status == VoucherDetailStatus.loading && state.voucher == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Loading...')),
        body: const AppLoading(),
      );
    }

    if (state.status == VoucherDetailStatus.error && state.voucher == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Error')),
        body: AppErrorWidget(
          message: state.error ?? 'Failed to load voucher',
          onRetry: () => ref.read(voucherDetailProvider(widget.voucherId).notifier).load(),
        ),
      );
    }

    final voucher = state.voucher;
    if (voucher == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Not Found')),
        body: const Center(child: Text('Voucher not found')),
      );
    }

    return Scaffold(
      appBar: AppBar(
        title: Text(voucher.title),
        actions: [
          if (voucher.status == 'draft')
            IconButton(
              icon: const Icon(Icons.edit_outlined),
              tooltip: 'Edit',
              onPressed: () => context.push('/vouchers/${voucher.id}/edit'),
            ),
          IconButton(
            icon: const Icon(Icons.send_outlined),
            tooltip: 'Send Voucher',
            onPressed: () => _showSendDialog(voucher),
          ),
          PopupMenuButton<String>(
            onSelected: (value) {
              switch (value) {
                case 'mark_sent':
                  _updateStatus('sent');
                  break;
                case 'mark_confirmed':
                  _updateStatus('confirmed');
                  break;
                case 'delete':
                  _deleteVoucher();
                  break;
              }
            },
            itemBuilder: (ctx) => [
              if (voucher.status == 'draft')
                const PopupMenuItem(value: 'mark_sent', child: Text('Mark as Sent')),
              if (voucher.status == 'sent' || voucher.status == 'draft')
                const PopupMenuItem(value: 'mark_confirmed', child: Text('Mark as Confirmed')),
              const PopupMenuDivider(),
              const PopupMenuItem(
                value: 'delete',
                child: Text('Delete', style: TextStyle(color: AppTheme.errorColor)),
              ),
            ],
          ),
        ],
      ),
      body: SingleChildScrollView(
        child: Padding(
          padding: const EdgeInsets.all(16.0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              _buildHeaderSection(voucher),
              const SizedBox(height: AppTheme.spacingLg),
              AppSectionCard(
                title: 'Details',
                child: _buildDetailsSection(voucher),
              ),
              if (voucher.notes != null && voucher.notes!.isNotEmpty) ...[
                const SizedBox(height: AppTheme.spacingLg),
                AppSectionCard(
                  title: 'Notes',
                  child: Text(voucher.notes!),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildHeaderSection(Voucher voucher) {
    return AppSectionCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                voucher.type.toUpperCase(),
                style: const TextStyle(fontWeight: FontWeight.bold, color: Colors.grey),
              ),
              _buildStatusBadge(voucher.status),
            ],
          ),
          const SizedBox(height: AppTheme.spacingMd),
          Text('Lead: ${voucher.leadName ?? ''}', style: const TextStyle(fontSize: 16)),
          if (voucher.supplierName != null) ...[
            const SizedBox(height: AppTheme.spacingSm),
            Text('Supplier: ${voucher.supplierName}', style: const TextStyle(fontSize: 16)),
          ],
          const SizedBox(height: AppTheme.spacingMd),
          Text(
            'Created on: ${voucher.createdAt?.split('T')[0] ?? '-'}',
            style: const TextStyle(color: Colors.grey, fontSize: 13),
          ),
        ],
      ),
    );
  }

  Widget _buildDetailsSection(Voucher voucher) {
    final Map<String, dynamic> details = voucher.details;
    if (details.isEmpty) return const Text('No details provided.');

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: details.entries.map((e) {
        final key = _formatKeyToLabel(e.key);
        final val = e.value?.toString() ?? '';
        return Padding(
          padding: const EdgeInsets.only(bottom: AppTheme.spacingSm),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              SizedBox(
                width: 140,
                child: Text('$key:', style: const TextStyle(fontWeight: FontWeight.w600)),
              ),
              Expanded(
                child: val.startsWith('http')
                    ? InkWell(
                        onTap: () => launchUrl(Uri.parse(val)),
                        child: Text(val, style: const TextStyle(color: Colors.blue)),
                      )
                    : Text(val),
              ),
            ],
          ),
        );
      }).toList(),
    );
  }

  Widget _buildStatusBadge(String status) {
    Color color;
    switch (status) {
      case 'sent': color = Colors.blue; break;
      case 'confirmed': color = Colors.green; break;
      default: color = Colors.grey; break;
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        border: Border.all(color: color.withValues(alpha: 0.5)),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Text(
        status.toUpperCase(),
        style: TextStyle(color: color, fontSize: 12, fontWeight: bold),
      ),
    );
  }

  String _formatKeyToLabel(String key) {
    return key.replaceAllMapped(
      RegExp(r'[A-Z]'),
      (m) => ' ${m.group(0)}',
    ).replaceFirstMapped(
      RegExp(r'^[a-z]'),
      (m) => m.group(0)!.toUpperCase(),
    );
  }

  FontWeight get bold => FontWeight.w700;
}
