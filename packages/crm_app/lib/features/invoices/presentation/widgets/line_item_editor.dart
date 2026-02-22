import 'package:flutter/material.dart';

import '../../../../app/theme.dart';
import '../../../../core/constants/app_colors.dart';

class LineItem {
  String? id;
  String description;
  String? hsnSac;
  double quantity;
  double rate;
  double? discountPercent;
  double? taxRate;

  LineItem({
    this.id,
    required this.description,
    this.hsnSac,
    required this.quantity,
    required this.rate,
    this.discountPercent,
    this.taxRate,
  });

  double get amount => quantity * rate;

  double get discountAmount =>
      (discountPercent ?? 0) > 0 ? amount * (discountPercent! / 100) : 0;

  double get amountAfterDiscount => amount - discountAmount;

  double get taxAmount =>
      (taxRate ?? 0) > 0 ? amountAfterDiscount * (taxRate! / 100) : 0;

  double get total => amountAfterDiscount + taxAmount;

  LineItem copyWith({
    String? id,
    String? description,
    String? hsnSac,
    double? quantity,
    double? rate,
    double? discountPercent,
    double? taxRate,
  }) {
    return LineItem(
      id: id ?? this.id,
      description: description ?? this.description,
      hsnSac: hsnSac ?? this.hsnSac,
      quantity: quantity ?? this.quantity,
      rate: rate ?? this.rate,
      discountPercent: discountPercent ?? this.discountPercent,
      taxRate: taxRate ?? this.taxRate,
    );
  }
}

class LineItemEditor extends StatefulWidget {
  final List<LineItem> items;
  final ValueChanged<List<LineItem>> onItemsChanged;
  final bool readOnly;

  const LineItemEditor({
    super.key,
    required this.items,
    required this.onItemsChanged,
    this.readOnly = false,
  });

  @override
  State<LineItemEditor> createState() => _LineItemEditorState();
}

class _LineItemEditorState extends State<LineItemEditor> {
  late List<LineItem> _items;

  @override
  void initState() {
    super.initState();
    _items = List.from(widget.items);
  }

  void _addItem() {
    setState(() {
      _items.add(LineItem(
        description: '',
        quantity: 1,
        rate: 0,
      ));
      widget.onItemsChanged(_items);
    });
  }

  void _removeItem(int index) {
    setState(() {
      _items.removeAt(index);
      widget.onItemsChanged(_items);
    });
  }

  void _updateItem(int index, LineItem item) {
    setState(() {
      _items[index] = item;
      widget.onItemsChanged(_items);
    });
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Header
        Padding(
          padding: const EdgeInsets.only(bottom: AppTheme.spacingMd),
          child: Text(
            'Line Items',
            style: theme.textTheme.titleMedium?.copyWith(
              fontWeight: FontWeight.w600,
            ),
          ),
        ),

        // Items list
        if (_items.isEmpty)
          Center(
            child: Padding(
              padding: const EdgeInsets.all(AppTheme.spacingLg),
              child: Text(
                'No items added',
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: theme.colorScheme.onSurfaceVariant,
                ),
              ),
            ),
          )
        else
          ListView.builder(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            itemCount: _items.length,
            itemBuilder: (context, index) {
              final item = _items[index];
              return _LineItemCard(
                item: item,
                index: index,
                onUpdate: (updatedItem) => _updateItem(index, updatedItem),
                onRemove: widget.readOnly ? null : () => _removeItem(index),
                readOnly: widget.readOnly,
              );
            },
          ),

        // Add button
        if (!widget.readOnly) ...[
          const SizedBox(height: AppTheme.spacingMd),
          OutlinedButton.icon(
            onPressed: _addItem,
            icon: const Icon(Icons.add),
            label: const Text('Add Item'),
          ),
        ],
      ],
    );
  }
}

class _LineItemCard extends StatefulWidget {
  final LineItem item;
  final int index;
  final ValueChanged<LineItem> onUpdate;
  final VoidCallback? onRemove;
  final bool readOnly;

  const _LineItemCard({
    required this.item,
    required this.index,
    required this.onUpdate,
    this.onRemove,
    required this.readOnly,
  });

  @override
  State<_LineItemCard> createState() => _LineItemCardState();
}

class _LineItemCardState extends State<_LineItemCard> {
  late TextEditingController _descriptionCtrl;
  late TextEditingController _hsnCtrl;
  late TextEditingController _qtyCtrl;
  late TextEditingController _rateCtrl;
  late TextEditingController _discountCtrl;
  late TextEditingController _taxCtrl;

  @override
  void initState() {
    super.initState();
    _descriptionCtrl = TextEditingController(text: widget.item.description);
    _hsnCtrl = TextEditingController(text: widget.item.hsnSac ?? '');
    _qtyCtrl = TextEditingController(text: widget.item.quantity.toString());
    _rateCtrl = TextEditingController(text: widget.item.rate.toString());
    _discountCtrl =
        TextEditingController(text: (widget.item.discountPercent ?? 0).toString());
    _taxCtrl =
        TextEditingController(text: (widget.item.taxRate ?? 0).toString());
  }

  @override
  void dispose() {
    _descriptionCtrl.dispose();
    _hsnCtrl.dispose();
    _qtyCtrl.dispose();
    _rateCtrl.dispose();
    _discountCtrl.dispose();
    _taxCtrl.dispose();
    super.dispose();
  }

  void _updateItem() {
    widget.onUpdate(widget.item.copyWith(
      description: _descriptionCtrl.text,
      hsnSac: _hsnCtrl.text.isEmpty ? null : _hsnCtrl.text,
      quantity: double.tryParse(_qtyCtrl.text) ?? 0,
      rate: double.tryParse(_rateCtrl.text) ?? 0,
      discountPercent:
          double.tryParse(_discountCtrl.text) ?? 0,
      taxRate: double.tryParse(_taxCtrl.text) ?? 0,
    ));
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Card(
      margin: const EdgeInsets.only(bottom: AppTheme.spacingMd),
      child: Padding(
        padding: const EdgeInsets.all(AppTheme.spacingMd),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Item header
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  'Item ${widget.index + 1}',
                  style: theme.textTheme.titleSmall?.copyWith(
                    fontWeight: FontWeight.w600,
                  ),
                ),
                if (widget.onRemove != null)
                  IconButton(
                    icon: const Icon(Icons.close, size: 20),
                    onPressed: widget.onRemove,
                    color: AppColors.error,
                  ),
              ],
            ),

            const SizedBox(height: AppTheme.spacingMd),

            // Description
            TextField(
              controller: _descriptionCtrl,
              enabled: !widget.readOnly,
              decoration: InputDecoration(
                labelText: 'Description',
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8),
                ),
                contentPadding: const EdgeInsets.symmetric(
                  horizontal: AppTheme.spacingMd,
                  vertical: AppTheme.spacingSm,
                ),
              ),
              onChanged: (_) => _updateItem(),
            ),

            const SizedBox(height: AppTheme.spacingMd),

            // HSN/SAC
            TextField(
              controller: _hsnCtrl,
              enabled: !widget.readOnly,
              decoration: InputDecoration(
                labelText: 'HSN/SAC (optional)',
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8),
                ),
                contentPadding: const EdgeInsets.symmetric(
                  horizontal: AppTheme.spacingMd,
                  vertical: AppTheme.spacingSm,
                ),
              ),
              onChanged: (_) => _updateItem(),
            ),

            const SizedBox(height: AppTheme.spacingMd),

            // Qty, Rate, Discount, Tax
            GridView.count(
              crossAxisCount: 4,
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              childAspectRatio: 1.2,
              mainAxisSpacing: AppTheme.spacingSm,
              crossAxisSpacing: AppTheme.spacingSm,
              children: [
                _buildNumberField('Qty', _qtyCtrl),
                _buildNumberField('Rate', _rateCtrl),
                _buildNumberField('Discount %', _discountCtrl),
                _buildNumberField('Tax %', _taxCtrl),
              ],
            ),

            const SizedBox(height: AppTheme.spacingMd),

            // Amount display
            Align(
              alignment: Alignment.centerRight,
              child: Text(
                'Amount: ${widget.item.total.toStringAsFixed(2)}',
                style: theme.textTheme.bodyMedium?.copyWith(
                  fontWeight: FontWeight.w600,
                  color: AppColors.primary,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildNumberField(String label, TextEditingController controller) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w500),
        ),
        const SizedBox(height: 4),
        TextField(
          controller: controller,
          enabled: !widget.readOnly,
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          decoration: InputDecoration(
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(4),
            ),
            contentPadding: const EdgeInsets.symmetric(
              horizontal: 8,
              vertical: 4,
            ),
          ),
          onChanged: (_) => _updateItem(),
        ),
      ],
    );
  }
}
