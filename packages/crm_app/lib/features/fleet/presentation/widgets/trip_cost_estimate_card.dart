import 'package:flutter/material.dart';

/// Displays a cost estimate breakdown for a trip.
class TripCostEstimateCard extends StatelessWidget {
  final Map<String, dynamic>? breakdown;
  final bool isFlat;
  final bool loading;
  final String? error;
  final String currency;

  const TripCostEstimateCard({
    super.key,
    this.breakdown,
    this.isFlat = false,
    this.loading = false,
    this.error,
    this.currency = 'INR',
  });

  String get _symbol => currency == 'INR' ? '\u20B9' : '\$';

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    if (loading) {
      return Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(children: [
            const SizedBox(
                width: 20,
                height: 20,
                child: CircularProgressIndicator(strokeWidth: 2)),
            const SizedBox(width: 12),
            Text('Calculating estimate...',
                style: TextStyle(color: Colors.grey[600])),
          ]),
        ),
      );
    }

    if (error != null) {
      return Card(
        color: Colors.red.shade50,
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(children: [
            const Icon(Icons.error_outline, color: Colors.red, size: 20),
            const SizedBox(width: 8),
            Expanded(
                child: Text(error!,
                    style: const TextStyle(color: Colors.red, fontSize: 13))),
          ]),
        ),
      );
    }

    if (breakdown == null) return const SizedBox.shrink();

    final total = (breakdown!['total'] as num?)?.toDouble() ?? 0;
    final flat = breakdown!['isFlat'] == true;

    return Card(
      elevation: 2,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(children: [
              Icon(Icons.calculate_outlined,
                  size: 20, color: theme.colorScheme.primary),
              const SizedBox(width: 8),
              Text('Cost Estimate',
                  style: theme.textTheme.titleSmall
                      ?.copyWith(fontWeight: FontWeight.bold)),
            ]),
            const Divider(height: 20),
            if (flat) ...[
              _infoRow('Flat Rate', total),
            ] else ...[
              if (_val('baseFare') > 0) _infoRow('Base Fare', _val('baseFare')),
              if (_val('kmCharges') > 0)
                _infoRow('Distance Charges', _val('kmCharges')),
              if (_val('timeCharges') > 0)
                _infoRow('Time Charges', _val('timeCharges')),
              if (_val('nightCharge') > 0)
                _infoRow('Night Charge', _val('nightCharge')),
              if (_val('driverAllowance') > 0)
                _infoRow('Driver Allowance', _val('driverAllowance')),
              if (_val('extraKmCharges') > 0)
                _infoRow('Extra KM Charges', _val('extraKmCharges')),
              if (_val('extraHourCharges') > 0)
                _infoRow('Extra Hour Charges', _val('extraHourCharges')),
            ],
            const Divider(height: 16),
            Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
              Text('Total',
                  style: theme.textTheme.titleSmall
                      ?.copyWith(fontWeight: FontWeight.bold)),
              Text('$_symbol ${total.toStringAsFixed(0)}',
                  style: theme.textTheme.titleMedium?.copyWith(
                      fontWeight: FontWeight.bold,
                      color: theme.colorScheme.primary)),
            ]),
          ],
        ),
      ),
    );
  }

  double _val(String key) =>
      (breakdown![key] as num?)?.toDouble() ?? 0;

  Widget _infoRow(String label, double amount) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child:
          Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
        Text(label, style: TextStyle(fontSize: 13, color: Colors.grey[700])),
        Text('$_symbol ${amount.toStringAsFixed(0)}',
            style: const TextStyle(fontSize: 13)),
      ]),
    );
  }
}

/// Compares estimated vs actual cost side by side.
class TripCostComparisonCard extends StatelessWidget {
  final Map<String, dynamic>? estimated;
  final Map<String, dynamic>? actual;
  final double? costOverride;
  final String? overrideReason;
  final String currency;

  const TripCostComparisonCard({
    super.key,
    this.estimated,
    this.actual,
    this.costOverride,
    this.overrideReason,
    this.currency = 'INR',
  });

  String get _symbol => currency == 'INR' ? '\u20B9' : '\$';

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final estTotal = (estimated?['total'] as num?)?.toDouble() ?? 0;
    final actTotal = costOverride ??
        (actual?['total'] as num?)?.toDouble() ??
        0;
    final diff = actTotal - estTotal;
    final diffColor = diff > 0 ? Colors.red : Colors.green;

    return Card(
      elevation: 2,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(children: [
              Icon(Icons.compare_arrows,
                  size: 20, color: theme.colorScheme.primary),
              const SizedBox(width: 8),
              Text('Cost Summary',
                  style: theme.textTheme.titleSmall
                      ?.copyWith(fontWeight: FontWeight.bold)),
            ]),
            const Divider(height: 20),
            Row(children: [
              Expanded(
                  child: Column(children: [
                Text('Estimated',
                    style: TextStyle(fontSize: 12, color: Colors.grey[600])),
                const SizedBox(height: 4),
                Text('$_symbol ${estTotal.toStringAsFixed(0)}',
                    style: const TextStyle(
                        fontSize: 18, fontWeight: FontWeight.bold)),
              ])),
              Container(width: 1, height: 40, color: Colors.grey[300]),
              Expanded(
                  child: Column(children: [
                Text(costOverride != null ? 'Override' : 'Actual',
                    style: TextStyle(fontSize: 12, color: Colors.grey[600])),
                const SizedBox(height: 4),
                Text('$_symbol ${actTotal.toStringAsFixed(0)}',
                    style: const TextStyle(
                        fontSize: 18, fontWeight: FontWeight.bold)),
              ])),
              if (estTotal > 0) ...[
                Container(width: 1, height: 40, color: Colors.grey[300]),
                Expanded(
                    child: Column(children: [
                  Text('Difference',
                      style: TextStyle(fontSize: 12, color: Colors.grey[600])),
                  const SizedBox(height: 4),
                  Text(
                      '${diff >= 0 ? '+' : ''}$_symbol ${diff.toStringAsFixed(0)}',
                      style: TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.bold,
                          color: diffColor)),
                ])),
              ],
            ]),
            if (costOverride != null && overrideReason != null) ...[
              const SizedBox(height: 8),
              Text('Override reason: $overrideReason',
                  style: TextStyle(fontSize: 12, color: Colors.grey[600])),
            ],
          ],
        ),
      ),
    );
  }
}
