import 'package:flutter/material.dart';

class SizePresetSelector extends StatelessWidget {
  final String value;
  final ValueChanged<String> onChanged;

  const SizePresetSelector({
    super.key,
    required this.value,
    required this.onChanged,
  });

  static const _presets = {
    'instagram_post': 'Instagram Post (1080x1080)',
    'instagram_story': 'Instagram Story (1080x1920)',
    'facebook_cover': 'Facebook Cover (820x312)',
    'whatsapp_status': 'WhatsApp Status (1080x1920)',
    'custom': 'Custom',
  };

  @override
  Widget build(BuildContext context) {
    return DropdownButton<String>(
      value: _presets.containsKey(value) ? value : 'custom',
      underline: const SizedBox(),
      isDense: true,
      items: _presets.entries
          .map((e) => DropdownMenuItem(value: e.key, child: Text(e.value)))
          .toList(),
      onChanged: (v) {
        if (v != null) onChanged(v);
      },
    );
  }
}
