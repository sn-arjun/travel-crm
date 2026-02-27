import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';
import 'package:driver_app/l10n/app_localizations.dart';
import '../../../../core/constants/app_colors.dart';
import '../../data/trip_provider.dart';

class CheckInScreen extends ConsumerStatefulWidget {
  final String tripId;

  const CheckInScreen({super.key, required this.tripId});

  @override
  ConsumerState<CheckInScreen> createState() => _CheckInScreenState();
}

class _CheckInScreenState extends ConsumerState<CheckInScreen> {
  Position? _position;
  String? _locationError;
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
      _locationError = null;
    });

    try {
      final permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        final requested = await Geolocator.requestPermission();
        if (requested == LocationPermission.denied ||
            requested == LocationPermission.deniedForever) {
          setState(() {
            _locationError = 'Location permission denied';
            _gettingLocation = false;
          });
          return;
        }
      }

      final position = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.high,
        ),
      );
      setState(() {
        _position = position;
        _gettingLocation = false;
      });
    } catch (e) {
      setState(() {
        _locationError = e.toString();
        _gettingLocation = false;
      });
    }
  }

  Future<void> _takePhoto() async {
    final picker = ImagePicker();
    final photo = await picker.pickImage(
      source: ImageSource.camera,
      maxWidth: 1280,
      maxHeight: 1280,
      imageQuality: 80,
    );
    if (photo != null) {
      setState(() => _photo = photo);
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

    final ok = await ref.read(tripDetailProvider(widget.tripId).notifier).checkIn(
      lat: _position!.latitude,
      lng: _position!.longitude,
      photo: photoBase64,
    );

    if (!mounted) return;

    if (ok) {
      final l10n = AppLocalizations.of(context)!;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(l10n.checkInSuccess),
          backgroundColor: AppColors.success,
        ),
      );
      // Also update the status to 'started'
      await ref
          .read(tripDetailProvider(widget.tripId).notifier)
          .updateStatus('started');
      ref.invalidate(tripListProvider('today'));
      if (mounted) context.pop();
    } else {
      setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;

    return Scaffold(
      appBar: AppBar(title: Text(l10n.checkIn)),
      body: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // GPS section
            Card(
              shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12)),
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  children: [
                    Icon(
                      _position != null
                          ? Icons.location_on
                          : Icons.location_searching,
                      size: 48,
                      color:
                          _position != null ? AppColors.success : Colors.grey,
                    ),
                    const SizedBox(height: 12),
                    if (_gettingLocation)
                      Text(l10n.gettingLocation,
                          style: TextStyle(color: Colors.grey[600]))
                    else if (_locationError != null) ...[
                      Text(l10n.locationError,
                          style: const TextStyle(color: AppColors.error)),
                      const SizedBox(height: 8),
                      TextButton(
                        onPressed: _getLocation,
                        child: Text(l10n.retryLocation),
                      ),
                    ] else if (_position != null)
                      Text(
                        '${_position!.latitude.toStringAsFixed(6)}, ${_position!.longitude.toStringAsFixed(6)}',
                        style: TextStyle(
                            color: Colors.grey[600], fontSize: 13),
                      ),
                  ],
                ),
              ),
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
              onPressed:
                  _position != null && !_submitting ? _submit : null,
              style: FilledButton.styleFrom(
                backgroundColor: AppColors.success,
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
                  : Text(l10n.confirmCheckIn,
                      style: const TextStyle(fontSize: 16)),
            ),
          ],
        ),
      ),
    );
  }
}
