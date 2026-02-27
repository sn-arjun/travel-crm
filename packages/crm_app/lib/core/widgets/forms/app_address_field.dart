import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;

import '../../../core/constants/app_config.dart';

/// A reusable address input field with Google Places autocomplete.
///
/// When `AppConfig.googlePlacesApiKey` is set, real Google Places suggestions
/// are fetched. Otherwise falls back to a plain text field.
///
/// **How to enable:**
/// Run with: `--dart-define=GOOGLE_PLACES_API_KEY=your_api_key_here`
///
/// Usage:
/// ```dart
/// AppAddressField(
///   controller: addressCtrl,
///   label: 'Hotel Address',
///   onAddressSelected: (result) {
///     print(result.formattedAddress);
///     print('${result.city}, ${result.country}');
///   },
/// )
/// ```
class AppAddressField extends StatefulWidget {
  final TextEditingController? controller;
  final String? label;
  final String? hint;
  final String? Function(String?)? validator;
  final ValueChanged<AddressResult>? onAddressSelected;
  final bool enabled;

  const AppAddressField({
    super.key,
    this.controller,
    this.label,
    this.hint,
    this.validator,
    this.onAddressSelected,
    this.enabled = true,
  });

  @override
  State<AppAddressField> createState() => _AppAddressFieldState();
}

class _AppAddressFieldState extends State<AppAddressField> {
  late TextEditingController _controller;
  bool _ownsController = false;
  Timer? _debounce;
  List<_PlacePrediction> _suggestions = [];
  bool _isLoadingSuggestions = false;
  final _layerLink = LayerLink();
  OverlayEntry? _overlayEntry;
  final _focusNode = FocusNode();

  bool get _hasApiKey => AppConfig.hasGooglePlaces;

  @override
  void initState() {
    super.initState();
    if (widget.controller != null) {
      _controller = widget.controller!;
    } else {
      _controller = TextEditingController();
      _ownsController = true;
    }
    _focusNode.addListener(_onFocusChange);
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _focusNode.removeListener(_onFocusChange);
    _focusNode.dispose();
    _removeOverlay();
    if (_ownsController) _controller.dispose();
    super.dispose();
  }

  void _onFocusChange() {
    if (!_focusNode.hasFocus) {
      _removeOverlay();
    }
  }

  void _onChanged(String value) {
    if (!_hasApiKey || value.length < 3) {
      _removeOverlay();
      return;
    }

    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 400), () {
      _fetchSuggestions(value);
    });
  }

  Future<void> _fetchSuggestions(String input) async {
    setState(() => _isLoadingSuggestions = true);

    try {
      final url = Uri.parse(
        'https://maps.googleapis.com/maps/api/place/autocomplete/json'
        '?input=${Uri.encodeComponent(input)}'
        '&types=address'
        '&key=${AppConfig.googlePlacesApiKey}',
      );

      final response = await http.get(url);
      if (response.statusCode == 200) {
        final data = json.decode(response.body);
        final predictions = (data['predictions'] as List?) ?? [];
        _suggestions = predictions
            .map((p) => _PlacePrediction(
                  placeId: p['place_id'] ?? '',
                  description: p['description'] ?? '',
                ))
            .toList();
        _showOverlay();
      }
    } catch (_) {
      // Silently fail — user can still type manually
    } finally {
      if (mounted) setState(() => _isLoadingSuggestions = false);
    }
  }

  Future<void> _selectPrediction(_PlacePrediction prediction) async {
    _controller.text = prediction.description;
    _removeOverlay();

    if (!_hasApiKey) return;

    // Fetch place details for structured address
    try {
      final url = Uri.parse(
        'https://maps.googleapis.com/maps/api/place/details/json'
        '?place_id=${prediction.placeId}'
        '&fields=formatted_address,address_components,geometry'
        '&key=${AppConfig.googlePlacesApiKey}',
      );

      final response = await http.get(url);
      if (response.statusCode == 200) {
        final data = json.decode(response.body);
        final result = data['result'];
        if (result != null) {
          final components = (result['address_components'] as List?) ?? [];
          final address = AddressResult(
            formattedAddress: result['formatted_address'] ?? prediction.description,
            street: _getComponent(components, 'route'),
            city: _getComponent(components, 'locality') ??
                _getComponent(components, 'administrative_area_level_2'),
            state: _getComponent(components, 'administrative_area_level_1'),
            country: _getComponent(components, 'country'),
            postalCode: _getComponent(components, 'postal_code'),
            lat: result['geometry']?['location']?['lat']?.toDouble(),
            lng: result['geometry']?['location']?['lng']?.toDouble(),
          );
          _controller.text = address.formattedAddress;
          widget.onAddressSelected?.call(address);
        }
      }
    } catch (_) {
      // Fall back to using the prediction description
      widget.onAddressSelected?.call(AddressResult(
        formattedAddress: prediction.description,
      ));
    }
  }

  String? _getComponent(List components, String type) {
    for (final c in components) {
      final types = (c['types'] as List?)?.cast<String>() ?? [];
      if (types.contains(type)) {
        return c['long_name'] as String?;
      }
    }
    return null;
  }

  void _showOverlay() {
    _removeOverlay();
    if (_suggestions.isEmpty) return;

    final overlay = Overlay.of(context);
    final renderBox = context.findRenderObject() as RenderBox;
    final size = renderBox.size;

    _overlayEntry = OverlayEntry(
      builder: (ctx) => Positioned(
        width: size.width,
        child: CompositedTransformFollower(
          link: _layerLink,
          showWhenUnlinked: false,
          offset: Offset(0, size.height + 4),
          child: Material(
            elevation: 8,
            borderRadius: BorderRadius.circular(8),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxHeight: 250),
              child: ListView.builder(
                padding: EdgeInsets.zero,
                shrinkWrap: true,
                itemCount: _suggestions.length,
                itemBuilder: (_, i) {
                  final s = _suggestions[i];
                  return ListTile(
                    dense: true,
                    leading: const Icon(Icons.location_on_outlined, size: 18),
                    title: Text(s.description, maxLines: 2, overflow: TextOverflow.ellipsis),
                    onTap: () => _selectPrediction(s),
                  );
                },
              ),
            ),
          ),
        ),
      ),
    );
    overlay.insert(_overlayEntry!);
  }

  void _removeOverlay() {
    _overlayEntry?.remove();
    _overlayEntry = null;
  }

  @override
  Widget build(BuildContext context) {
    return CompositedTransformTarget(
      link: _layerLink,
      child: TextFormField(
        controller: _controller,
        focusNode: _focusNode,
        enabled: widget.enabled,
        validator: widget.validator,
        onChanged: _onChanged,
        decoration: InputDecoration(
          labelText: widget.label ?? 'Address',
          hintText: widget.hint ??
              (_hasApiKey ? 'Start typing to search...' : 'Enter address...'),
          border: const OutlineInputBorder(),
          prefixIcon: const Icon(Icons.location_on_outlined),
          suffixIcon: _isLoadingSuggestions
              ? const Padding(
                  padding: EdgeInsets.all(12),
                  child: SizedBox(
                    height: 20,
                    width: 20,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  ),
                )
              : _hasApiKey
                  ? const Icon(Icons.search)
                  : null,
        ),
        maxLines: 1,
      ),
    );
  }
}

/// A prediction from Google Places Autocomplete.
class _PlacePrediction {
  final String placeId;
  final String description;
  const _PlacePrediction({required this.placeId, required this.description});
}

/// Structured address result from address autocomplete.
class AddressResult {
  final String formattedAddress;
  final String? street;
  final String? city;
  final String? state;
  final String? country;
  final String? postalCode;
  final double? lat;
  final double? lng;

  const AddressResult({
    required this.formattedAddress,
    this.street,
    this.city,
    this.state,
    this.country,
    this.postalCode,
    this.lat,
    this.lng,
  });

  @override
  String toString() => formattedAddress;
}
