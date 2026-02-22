import 'package:flutter/material.dart';

class LanguageBadge extends StatelessWidget {
  final String languageCode;
  const LanguageBadge({super.key, required this.languageCode});

  static const _languageNames = {
    'en': 'English', 'hi': 'Hindi', 'mr': 'Marathi', 'gu': 'Gujarati',
    'ta': 'Tamil', 'te': 'Telugu', 'kn': 'Kannada', 'ml': 'Malayalam',
    'bn': 'Bengali', 'pa': 'Punjabi', 'ur': 'Urdu', 'ar': 'Arabic',
    'fr': 'French', 'de': 'German', 'es': 'Spanish', 'zh': 'Chinese',
    'ja': 'Japanese', 'ko': 'Korean', 'ru': 'Russian', 'pt': 'Portuguese',
  };

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final name = _languageNames[languageCode] ?? languageCode.toUpperCase();

    return Chip(
      label: Text(name),
      labelStyle: theme.textTheme.labelSmall,
      visualDensity: VisualDensity.compact,
      padding: EdgeInsets.zero,
      materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
    );
  }
}
