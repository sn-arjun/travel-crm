import 'package:flutter/material.dart';

import '../../../../core/constants/app_colors.dart';

class InvoiceStatusBadge extends StatelessWidget {
  final String status;
  final String type;

  const InvoiceStatusBadge({
    super.key,
    required this.status,
    required this.type,
  });

  Color _getStatusColor() {
    switch (status.toLowerCase()) {
      case 'draft':
        return const Color(0xFF9E9E9E);
      case 'sent':
        return AppColors.info;
      case 'viewed':
        return const Color(0xFF42A5F5);
      case 'partial':
        return AppColors.warning;
      case 'paid':
        return AppColors.success;
      case 'overdue':
        return AppColors.error;
      case 'void':
        return const Color(0xFF795548);
      default:
        return const Color(0xFF9E9E9E);
    }
  }

  Color _getTypeColor() {
    switch (type.toLowerCase()) {
      case 'invoice':
        return const Color(0xFFE3F2FD);
      case 'credit-note':
        return const Color(0xFFF3E5F5);
      case 'debit-note':
        return const Color(0xFFFFF3E0);
      default:
        return const Color(0xFFF5F5F5);
    }
  }

  @override
  Widget build(BuildContext context) {
    final statusColor = _getStatusColor();
    final typeColor = _getTypeColor();

    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
          decoration: BoxDecoration(
            color: statusColor.withValues(alpha: 0.1),
            border: Border.all(color: statusColor.withValues(alpha: 0.3)),
            borderRadius: BorderRadius.circular(4),
          ),
          child: Text(
            status,
            style: TextStyle(
              color: statusColor,
              fontSize: 12,
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
        const SizedBox(width: 8),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
          decoration: BoxDecoration(
            color: typeColor,
            borderRadius: BorderRadius.circular(4),
          ),
          child: Text(
            type,
            style: const TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w500,
            ),
          ),
        ),
      ],
    );
  }
}
