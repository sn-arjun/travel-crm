import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';
import 'package:driver_app/l10n/app_localizations.dart';
import '../../../../core/constants/app_colors.dart';
import '../../../../core/utils/location_capture.dart';
import '../../data/trip_provider.dart';
import '../widgets/location_card.dart';

class CheckOutScreen extends ConsumerStatefulWidget {
  final String tripId;

  const CheckOutScreen({super.key, required this.tripId});

  @override
  ConsumerState<CheckOutScreen> createState() => _CheckOutScreenState();
}

class _CheckOutScreenState extends ConsumerState<CheckOutScreen> {
  Position? _position;
  LocationFailure? _failure;
  bool _gettingLocation = true;
  XFile? _photo;
  bool _submitting = false;

  @override
  void initState() {
    super.initState();
    _getLocation();
  }

  Future<void> _getLocation() async {
    setState(() {
      _gettingLocation = true;
      _failure = null;
    });

    final result = await captureLocation();
    if (!mounted) return;
    setState(() {
      _position = result.position;
      _failure = result.failure;
      _gettingLocation = false;
    });
  }

  Future<void> _takePhoto() async {
    try {
      final picker = ImagePicker();
      final photo = await picker.pickImage(
        source: ImageSource.camera,
        maxWidth: 1280,
        maxHeight: 1280,
        imageQuality: 80,
      );
      if (photo != null && mounted) {
        setState(() => _photo = photo);
      }
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Could not open the camera.')),
      );
    }
  }

  Future<void> _submit() async {
    if (_position == null) return;
    setState(() => _submitting = true);

    String? photoBase64;
    if (_photo != null) {
      final bytes = await File(_photo!.path).readAsBytes();
      photoBase64 = base64Encode(bytes);
    }

    final ok = await ref.read(tripDetailProvider(widget.tripId).notifier).checkOut(
      lat: _position!.latitude,
      lng: _position!.longitude,
      photo: photoBase64,
    );

    if (!mounted) return;

    if (ok) {
      final l10n = AppLocalizations.of(context)!;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(l10n.checkOutSuccess),
          backgroundColor: AppColors.success,
        ),
      );
      ref.invalidate(tripListProvider('today'));
      if (mounted) context.pop();
    } else {
      setState(() => _submitting = false);
      final error = ref.read(tripDetailProvider(widget.tripId)).error;
      if (error != null) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(error),
            backgroundColor: AppColors.error,
          ),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;

    return Scaffold(
      appBar: AppBar(title: Text(l10n.checkOut)),
      body: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // GPS section
            LocationCard(
              position: _position,
              loading: _gettingLocation,
              failure: _failure,
              onRetry: _getLocation,
              coordsKey: const Key('check-out-coords'),
            ),
            const SizedBox(height: 16),

            // Photo section
            Card(
              shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12)),
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  children: [
                    if (_photo != null) ...[
                      ClipRRect(
                        borderRadius: BorderRadius.circular(8),
                        child: Image.file(
                          File(_photo!.path),
                          height: 200,
                          width: double.infinity,
                          fit: BoxFit.cover,
                        ),
                      ),
                      const SizedBox(height: 8),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          TextButton.icon(
                            onPressed: _takePhoto,
                            icon: const Icon(Icons.refresh),
                            label: Text(l10n.retake),
                          ),
                          TextButton.icon(
                            onPressed: () => setState(() => _photo = null),
                            icon: const Icon(Icons.delete_outline),
                            label: Text(l10n.removePhoto),
                          ),
                        ],
                      ),
                    ] else
                      OutlinedButton.icon(
                        onPressed: _takePhoto,
                        icon: const Icon(Icons.camera_alt_outlined),
                        label: Text(l10n.takePhoto),
                        style: OutlinedButton.styleFrom(
                          padding: const EdgeInsets.symmetric(
                              vertical: 16, horizontal: 24),
                        ),
                      ),
                  ],
                ),
              ),
            ),
            const Spacer(),

            // Submit
            FilledButton(
              key: const Key('confirm-check-out'),
              onPressed:
                  _position != null && !_submitting ? _submit : null,
              style: FilledButton.styleFrom(
                backgroundColor: AppColors.primary,
                padding: const EdgeInsets.symmetric(vertical: 16),
                shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12)),
              ),
              child: _submitting
                  ? const SizedBox(
                      height: 20,
                      width: 20,
                      child: CircularProgressIndicator(
                          strokeWidth: 2, color: Colors.white),
                    )
                  : Text(l10n.confirmCheckOut,
                      style: const TextStyle(fontSize: 16)),
            ),
          ],
        ),
      ),
    );
  }
}
