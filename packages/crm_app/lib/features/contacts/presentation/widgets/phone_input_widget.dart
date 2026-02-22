import 'package:flutter/material.dart';

import '../../../../app/theme.dart';

class PhoneInputWidget extends StatefulWidget {
  final String? initialValue;
  final ValueChanged<String>? onChanged;
  final String? Function(String?)? validator;

  const PhoneInputWidget({
    super.key,
    this.initialValue,
    this.onChanged,
    this.validator,
  });

  @override
  State<PhoneInputWidget> createState() => _PhoneInputWidgetState();
}

class _PhoneInputWidgetState extends State<PhoneInputWidget> {
  String _countryCode = '+91';
  late final TextEditingController _controller;

  static const _countryCodes = [
    ('+91', 'IN', 'India'),
    ('+1', 'US', 'United States'),
    ('+44', 'UK', 'United Kingdom'),
    ('+971', 'AE', 'UAE'),
    ('+65', 'SG', 'Singapore'),
    ('+61', 'AU', 'Australia'),
    ('+81', 'JP', 'Japan'),
    ('+86', 'CN', 'China'),
    ('+49', 'DE', 'Germany'),
    ('+33', 'FR', 'France'),
    ('+39', 'IT', 'Italy'),
    ('+34', 'ES', 'Spain'),
    ('+7', 'RU', 'Russia'),
    ('+55', 'BR', 'Brazil'),
    ('+27', 'ZA', 'South Africa'),
    ('+966', 'SA', 'Saudi Arabia'),
    ('+974', 'QA', 'Qatar'),
    ('+968', 'OM', 'Oman'),
    ('+60', 'MY', 'Malaysia'),
    ('+66', 'TH', 'Thailand'),
  ];

  @override
  void initState() {
    super.initState();
    final initial = widget.initialValue ?? '';
    for (final (code, _, _) in _countryCodes) {
      if (initial.startsWith(code)) {
        _countryCode = code;
        _controller = TextEditingController(text: initial.substring(code.length).trim());
        return;
      }
    }
    _controller = TextEditingController(text: initial);
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _onChanged() {
    final phone = _controller.text.trim();
    widget.onChanged?.call(phone.isNotEmpty ? '$_countryCode $phone' : '');
  }

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(
          width: 100,
          child: DropdownButtonFormField<String>(
            initialValue: _countryCode,
            isExpanded: true,
            decoration: const InputDecoration(labelText: 'Code'),
            items: _countryCodes.map((entry) {
              final (code, iso, _) = entry;
              return DropdownMenuItem(value: code, child: Text('$iso $code'));
            }).toList(),
            onChanged: (code) {
              if (code != null) {
                setState(() => _countryCode = code);
                _onChanged();
              }
            },
          ),
        ),
        const SizedBox(width: AppTheme.spacingSm),
        Expanded(
          child: TextFormField(
            controller: _controller,
            keyboardType: TextInputType.phone,
            decoration: const InputDecoration(
              labelText: 'Phone Number',
              prefixIcon: Icon(Icons.phone_outlined),
            ),
            validator: widget.validator,
            onChanged: (_) => _onChanged(),
          ),
        ),
      ],
    );
  }
}
