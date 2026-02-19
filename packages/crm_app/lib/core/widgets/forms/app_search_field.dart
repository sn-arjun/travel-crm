import 'dart:async';

import 'package:flutter/material.dart';

/// A debounced search input field.
///
/// Fires [onChanged] after [debounceDuration] (default 300 ms) of inactivity.
/// Shows a clear button when text is present.
class AppSearchField extends StatefulWidget {
  final ValueChanged<String>? onChanged;
  final Duration debounceDuration;
  final String hint;
  final TextEditingController? controller;

  const AppSearchField({
    super.key,
    this.onChanged,
    this.debounceDuration = const Duration(milliseconds: 300),
    this.hint = 'Search...',
    this.controller,
  });

  @override
  State<AppSearchField> createState() => _AppSearchFieldState();
}

class _AppSearchFieldState extends State<AppSearchField> {
  late final TextEditingController _controller;
  Timer? _debounce;

  @override
  void initState() {
    super.initState();
    _controller = widget.controller ?? TextEditingController();
  }

  @override
  void dispose() {
    _debounce?.cancel();
    if (widget.controller == null) _controller.dispose();
    super.dispose();
  }

  void _onChanged(String value) {
    _debounce?.cancel();
    _debounce = Timer(widget.debounceDuration, () {
      widget.onChanged?.call(value);
    });
    // Trigger rebuild so the clear button shows/hides.
    setState(() {});
  }

  void _clear() {
    _controller.clear();
    _debounce?.cancel();
    widget.onChanged?.call('');
    setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    return TextField(
      controller: _controller,
      onChanged: _onChanged,
      decoration: InputDecoration(
        hintText: widget.hint,
        prefixIcon: const Icon(Icons.search),
        suffixIcon: _controller.text.isNotEmpty
            ? IconButton(
                icon: const Icon(Icons.clear),
                onPressed: _clear,
              )
            : null,
      ),
    );
  }
}
