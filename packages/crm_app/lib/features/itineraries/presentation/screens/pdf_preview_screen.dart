import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:printing/printing.dart';

import '../../../../app/theme.dart';
import '../../../../core/widgets/feedback/app_loading.dart';
import '../../../../core/widgets/feedback/app_error_widget.dart';
import '../../../../core/widgets/feedback/app_snackbar.dart';
import '../../data/itinerary_provider.dart';
import '../../data/itinerary_state.dart';
import '../../services/pdf_generator.dart';

/// Preview a generated PDF for an itinerary before downloading or sharing.
///
/// Uses the `printing` package's [PdfPreview] widget to render the PDF.
/// Supports toggling between English and Hindi, and provides actions
/// for downloading, sharing, and printing.
class PdfPreviewScreen extends ConsumerStatefulWidget {
  /// The itinerary to generate a PDF for.
  final String itineraryId;

  const PdfPreviewScreen({
    super.key,
    required this.itineraryId,
  });

  @override
  ConsumerState<PdfPreviewScreen> createState() => _PdfPreviewScreenState();
}

class _PdfPreviewScreenState extends ConsumerState<PdfPreviewScreen> {
  final _pdfGenerator = ItineraryPdfGenerator();

  String _locale = 'en';
  Uint8List? _pdfBytes;
  bool _generating = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _loadAndGenerate();
    });
  }

  /// Loads the itinerary detail (if not already loaded) then generates the PDF.
  Future<void> _loadAndGenerate() async {
    final detailNotifier =
        ref.read(itineraryDetailProvider(widget.itineraryId).notifier);

    // Load the itinerary if not already loaded.
    final currentState =
        ref.read(itineraryDetailProvider(widget.itineraryId));
    if (currentState.itinerary == null) {
      await detailNotifier.load();
    }

    _generatePdf();
  }

  /// Generates the PDF from the loaded itinerary model.
  Future<void> _generatePdf() async {
    final detailState =
        ref.read(itineraryDetailProvider(widget.itineraryId));
    final itinerary = detailState.itinerary;

    if (itinerary == null) {
      setState(() => _error = 'Itinerary data not available');
      return;
    }

    setState(() {
      _generating = true;
      _error = null;
    });

    try {
      final bytes = await _pdfGenerator.generate(
        itinerary,
        locale: _locale,
      );
      if (!mounted) return;
      setState(() {
        _pdfBytes = bytes;
        _generating = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = 'Failed to generate PDF: $e';
        _generating = false;
      });
    }
  }

  void _toggleLocale() {
    setState(() {
      _locale = _locale == 'en' ? 'hi' : 'en';
    });
    _generatePdf();
  }

  Future<void> _downloadPdf() async {
    if (_pdfBytes == null) return;

    try {
      await Printing.sharePdf(
        bytes: _pdfBytes!,
        filename: 'itinerary_${widget.itineraryId}.pdf',
      );
    } catch (e) {
      if (!mounted) return;
      AppSnackbar.error(context, 'Failed to download PDF');
    }
  }

  Future<void> _sharePdf() async {
    if (_pdfBytes == null) return;

    try {
      await Printing.sharePdf(
        bytes: _pdfBytes!,
        filename: 'itinerary_${widget.itineraryId}.pdf',
      );
    } catch (e) {
      if (!mounted) return;
      AppSnackbar.error(context, 'Failed to share PDF');
    }
  }

  Future<void> _printPdf() async {
    if (_pdfBytes == null) return;

    try {
      await Printing.layoutPdf(
        onLayout: (_) async => _pdfBytes!,
        name: 'Itinerary ${widget.itineraryId}',
      );
    } catch (e) {
      if (!mounted) return;
      AppSnackbar.error(context, 'Failed to print PDF');
    }
  }

  @override
  Widget build(BuildContext context) {
    final detailState =
        ref.watch(itineraryDetailProvider(widget.itineraryId));
    final theme = Theme.of(context);

    final isLoading = detailState.status == ItineraryDetailStatus.loading &&
        detailState.itinerary == null;

    final hasError = detailState.status == ItineraryDetailStatus.error &&
        detailState.itinerary == null;

    return Scaffold(
      appBar: AppBar(
        title: const Text('PDF Preview'),
        actions: [
          // Language toggle
          _LanguageToggle(
            locale: _locale,
            onToggle: _toggleLocale,
            isGenerating: _generating,
          ),

          SizedBox(width: 8.w),

          // Download
          IconButton(
            icon: Icon(Icons.download_outlined, size: 22.sp),
            tooltip: 'Download',
            onPressed: _pdfBytes != null ? _downloadPdf : null,
          ),

          // Share
          IconButton(
            icon: Icon(Icons.share_outlined, size: 22.sp),
            tooltip: 'Share',
            onPressed: _pdfBytes != null ? _sharePdf : null,
          ),

          // Print
          IconButton(
            icon: Icon(Icons.print_outlined, size: 22.sp),
            tooltip: 'Print',
            onPressed: _pdfBytes != null ? _printPdf : null,
          ),

          SizedBox(width: 8.w),
        ],
      ),
      body: _buildBody(
        isLoading: isLoading,
        hasError: hasError,
        errorMessage: detailState.error ?? _error,
        theme: theme,
      ),
    );
  }

  Widget _buildBody({
    required bool isLoading,
    required bool hasError,
    String? errorMessage,
    required ThemeData theme,
  }) {
    // Loading itinerary data
    if (isLoading) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const AppLoading(),
            SizedBox(height: 16.h),
            Text(
              'Loading itinerary...',
              style: theme.textTheme.bodyMedium?.copyWith(
                color: theme.colorScheme.onSurface.withValues(alpha: 0.6),
              ),
            ),
          ],
        ),
      );
    }

    // Error loading itinerary
    if (hasError) {
      return AppErrorWidget(
        message: errorMessage ?? 'Failed to load itinerary',
        onRetry: _loadAndGenerate,
      );
    }

    // Generating PDF
    if (_generating && _pdfBytes == null) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const AppLoading(),
            SizedBox(height: 16.h),
            Text(
              'Generating PDF...',
              style: theme.textTheme.bodyMedium?.copyWith(
                color: theme.colorScheme.onSurface.withValues(alpha: 0.6),
              ),
            ),
            SizedBox(height: 4.h),
            Text(
              _locale == 'en' ? 'English' : 'Hindi',
              style: theme.textTheme.labelSmall?.copyWith(
                color: theme.colorScheme.onSurface.withValues(alpha: 0.4),
              ),
            ),
          ],
        ),
      );
    }

    // Error generating PDF
    if (_error != null && _pdfBytes == null) {
      return AppErrorWidget(
        message: _error!,
        onRetry: _generatePdf,
      );
    }

    // PDF ready — show preview
    if (_pdfBytes != null) {
      return Stack(
        children: [
          PdfPreview(
            build: (_) async => _pdfBytes!,
            canChangeOrientation: false,
            canChangePageFormat: false,
            canDebug: false,
            pdfFileName: 'itinerary_${widget.itineraryId}.pdf',
            actions: const [], // Actions are in the AppBar
          ),
          // Overlay a small loading indicator when regenerating
          if (_generating)
            Positioned(
              top: 12.h,
              right: 12.w,
              child: Container(
                padding: EdgeInsets.symmetric(
                  horizontal: 12.w,
                  vertical: 8.h,
                ),
                decoration: BoxDecoration(
                  color: theme.colorScheme.surface,
                  borderRadius: BorderRadius.circular(AppTheme.radiusMd),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withValues(alpha: 0.1),
                      blurRadius: 8,
                      offset: const Offset(0, 2),
                    ),
                  ],
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    SizedBox(
                      width: 16.w,
                      height: 16.h,
                      child: const CircularProgressIndicator(
                        strokeWidth: 2,
                      ),
                    ),
                    SizedBox(width: 8.w),
                    Text(
                      'Regenerating...',
                      style: theme.textTheme.labelSmall,
                    ),
                  ],
                ),
              ),
            ),
        ],
      );
    }

    // Fallback
    return const Center(child: AppLoading());
  }
}

// ── Language toggle button ──────────────────────────────────────

class _LanguageToggle extends StatelessWidget {
  final String locale;
  final VoidCallback onToggle;
  final bool isGenerating;

  const _LanguageToggle({
    required this.locale,
    required this.onToggle,
    required this.isGenerating,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isEnglish = locale == 'en';

    return Tooltip(
      message: isEnglish ? 'Switch to Hindi' : 'Switch to English',
      child: InkWell(
        onTap: isGenerating ? null : onToggle,
        borderRadius: BorderRadius.circular(AppTheme.radiusSm),
        child: Container(
          padding: EdgeInsets.symmetric(horizontal: 10.w, vertical: 6.h),
          decoration: BoxDecoration(
            color: AppTheme.primaryColor.withValues(alpha: 0.08),
            borderRadius: BorderRadius.circular(AppTheme.radiusSm),
            border: Border.all(
              color: AppTheme.primaryColor.withValues(alpha: 0.2),
            ),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                Icons.translate,
                size: 16.sp,
                color: isGenerating
                    ? theme.colorScheme.onSurface.withValues(alpha: 0.3)
                    : AppTheme.primaryColor,
              ),
              SizedBox(width: 4.w),
              Text(
                isEnglish ? 'EN' : 'HI',
                style: theme.textTheme.labelMedium?.copyWith(
                  fontWeight: FontWeight.w700,
                  color: isGenerating
                      ? theme.colorScheme.onSurface.withValues(alpha: 0.3)
                      : AppTheme.primaryColor,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
