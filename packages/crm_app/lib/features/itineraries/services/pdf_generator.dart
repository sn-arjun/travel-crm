import 'dart:typed_data';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:flutter/services.dart' show rootBundle;
import 'package:shared/shared.dart';

/// Generates professional quotation PDFs from itineraries.
/// Supports multilingual generation (TICKET-097, TICKET-101).
class ItineraryPdfGenerator {
  static const _defaultBrandColor = PdfColor.fromInt(0xFF4F46E5);

  Future<Uint8List> generate(
    ItineraryModel itinerary, {
    Map<String, dynamic>? tenantSettings,
    Map<String, dynamic>? contactInfo,
    String locale = 'en',
    bool showItemizedPricing = true,
  }) async {
    final pdf = pw.Document(
      title: itinerary.title,
      author: tenantSettings?['companyName'] ?? 'TravelCRM Pro',
    );

    final brandColor = _defaultBrandColor;
    final translations = _getTranslations(locale);

    // Load font based on locale
    final font = await _loadFont(locale);
    final boldFont = await _loadBoldFont(locale);

    final theme = pw.ThemeData.withFont(
      base: font,
      bold: boldFont,
    );

    pdf.addPage(
      pw.MultiPage(
        pageFormat: PdfPageFormat.a4,
        theme: theme,
        margin: const pw.EdgeInsets.all(40),
        header: (context) => _buildHeader(
          tenantSettings,
          brandColor,
          context,
        ),
        footer: (context) => _buildFooter(
          itinerary.validityDate,
          context,
        ),
        build: (context) => [
          _buildQuotationTitle(itinerary, translations),
          pw.SizedBox(height: 12),
          if (contactInfo != null) _buildCustomerInfo(contactInfo, translations),
          pw.SizedBox(height: 12),
          _buildTripSummary(itinerary, translations),
          pw.SizedBox(height: 20),
          ...itinerary.days.map(
            (day) => _buildDaySection(
              day,
              itinerary.currency,
              brandColor,
              translations,
              showItemizedPricing,
            ),
          ),
          pw.SizedBox(height: 20),
          _buildPricingTable(itinerary, translations, showItemizedPricing),
          pw.SizedBox(height: 16),
          if (itinerary.inclusions.isNotEmpty)
            _buildInclusions(itinerary.inclusions, translations),
          if (itinerary.exclusions.isNotEmpty)
            _buildExclusions(itinerary.exclusions, translations),
          if (itinerary.termsConditions != null &&
              itinerary.termsConditions!.isNotEmpty)
            _buildTerms(itinerary.termsConditions!, translations),
        ],
      ),
    );

    return pdf.save();
  }

  // ── Header ──

  pw.Widget _buildHeader(
    Map<String, dynamic>? settings,
    PdfColor brandColor,
    pw.Context context,
  ) {
    final companyName = settings?['companyName'] ?? 'TravelCRM Pro';
    final companyAddress = settings?['address'] ?? '';
    final companyPhone = settings?['phone'] ?? '';
    final companyEmail = settings?['email'] ?? '';

    return pw.Container(
      padding: const pw.EdgeInsets.only(bottom: 12),
      decoration: const pw.BoxDecoration(
        border: pw.Border(bottom: pw.BorderSide(width: 2, color: PdfColors.grey300)),
      ),
      child: pw.Row(
        mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
        children: [
          pw.Column(
            crossAxisAlignment: pw.CrossAxisAlignment.start,
            children: [
              pw.Text(
                companyName,
                style: pw.TextStyle(
                  fontSize: 18,
                  fontWeight: pw.FontWeight.bold,
                  color: brandColor,
                ),
              ),
              if (companyAddress.isNotEmpty)
                pw.Text(companyAddress, style: const pw.TextStyle(fontSize: 8, color: PdfColors.grey600)),
              if (companyPhone.isNotEmpty)
                pw.Text(companyPhone, style: const pw.TextStyle(fontSize: 8, color: PdfColors.grey600)),
              if (companyEmail.isNotEmpty)
                pw.Text(companyEmail, style: const pw.TextStyle(fontSize: 8, color: PdfColors.grey600)),
            ],
          ),
        ],
      ),
    );
  }

  // ── Footer ──

  pw.Widget _buildFooter(String? validityDate, pw.Context context) {
    return pw.Container(
      padding: const pw.EdgeInsets.only(top: 8),
      decoration: const pw.BoxDecoration(
        border: pw.Border(top: pw.BorderSide(width: 0.5, color: PdfColors.grey300)),
      ),
      child: pw.Row(
        mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
        children: [
          pw.Text(
            validityDate != null
                ? 'This quotation is valid until $validityDate'
                : 'Please confirm availability',
            style: const pw.TextStyle(fontSize: 8, color: PdfColors.grey600),
          ),
          pw.Text(
            'Page ${context.pageNumber} of ${context.pagesCount}',
            style: const pw.TextStyle(fontSize: 8, color: PdfColors.grey600),
          ),
        ],
      ),
    );
  }

  // ── Quotation Title ──

  pw.Widget _buildQuotationTitle(
    ItineraryModel itinerary,
    Map<String, String> translations,
  ) {
    return pw.Container(
      padding: const pw.EdgeInsets.all(12),
      decoration: pw.BoxDecoration(
        color: PdfColors.indigo50,
        borderRadius: pw.BorderRadius.circular(4),
      ),
      child: pw.Row(
        mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
        children: [
          pw.Column(
            crossAxisAlignment: pw.CrossAxisAlignment.start,
            children: [
              pw.Text(
                translations['quotation_title'] ?? 'Travel Quotation',
                style: pw.TextStyle(fontSize: 20, fontWeight: pw.FontWeight.bold),
              ),
              pw.SizedBox(height: 4),
              pw.Text(itinerary.title, style: const pw.TextStyle(fontSize: 12)),
            ],
          ),
          pw.Column(
            crossAxisAlignment: pw.CrossAxisAlignment.end,
            children: [
              pw.Text('${translations['version'] ?? 'Version'}: V${itinerary.version}',
                  style: const pw.TextStyle(fontSize: 10)),
              pw.Text('${translations['date'] ?? 'Date'}: ${itinerary.createdAt?.substring(0, 10) ?? ''}',
                  style: const pw.TextStyle(fontSize: 10)),
              if (itinerary.validityDate != null)
                pw.Text('${translations['valid_until'] ?? 'Valid Until'}: ${itinerary.validityDate}',
                    style: const pw.TextStyle(fontSize: 10)),
            ],
          ),
        ],
      ),
    );
  }

  // ── Customer Info ──

  pw.Widget _buildCustomerInfo(
    Map<String, dynamic> contact,
    Map<String, String> translations,
  ) {
    return pw.Container(
      padding: const pw.EdgeInsets.all(8),
      decoration: pw.BoxDecoration(
        border: pw.Border.all(color: PdfColors.grey300),
        borderRadius: pw.BorderRadius.circular(4),
      ),
      child: pw.Column(
        crossAxisAlignment: pw.CrossAxisAlignment.start,
        children: [
          pw.Text(translations['customer'] ?? 'Customer Details',
              style: pw.TextStyle(fontSize: 12, fontWeight: pw.FontWeight.bold)),
          pw.SizedBox(height: 4),
          if (contact['name'] != null) pw.Text('Name: ${contact['name']}', style: const pw.TextStyle(fontSize: 10)),
          if (contact['email'] != null) pw.Text('Email: ${contact['email']}', style: const pw.TextStyle(fontSize: 10)),
          if (contact['phone'] != null) pw.Text('Phone: ${contact['phone']}', style: const pw.TextStyle(fontSize: 10)),
        ],
      ),
    );
  }

  // ── Trip Summary ──

  pw.Widget _buildTripSummary(
    ItineraryModel itinerary,
    Map<String, String> translations,
  ) {
    return pw.Table(
      border: pw.TableBorder.all(color: PdfColors.grey300),
      children: [
        pw.TableRow(children: [
          _cell(translations['duration'] ?? 'Duration', bold: true),
          _cell('${itinerary.days.length} ${translations['days'] ?? 'Days'}'),
          _cell(translations['currency_label'] ?? 'Currency', bold: true),
          _cell(itinerary.currency),
        ]),
      ],
    );
  }

  // ── Day Section ──

  pw.Widget _buildDaySection(
    ItineraryDayModel day,
    String currency,
    PdfColor brandColor,
    Map<String, String> translations,
    bool showItemizedPricing,
  ) {
    final dayLabel = translations['day'] ?? 'Day';
    return pw.Container(
      margin: const pw.EdgeInsets.only(bottom: 12),
      child: pw.Column(
        crossAxisAlignment: pw.CrossAxisAlignment.start,
        children: [
          // Day header
          pw.Container(
            width: double.infinity,
            padding: const pw.EdgeInsets.symmetric(horizontal: 8, vertical: 6),
            color: PdfColors.indigo50,
            child: pw.Text(
              '$dayLabel ${day.dayNumber}: ${day.title ?? ''} ${day.city != null ? '— ${day.city}' : ''}',
              style: pw.TextStyle(fontWeight: pw.FontWeight.bold, fontSize: 12),
            ),
          ),
          // Day description
          if (day.description != null && day.description!.isNotEmpty)
            pw.Padding(
              padding: const pw.EdgeInsets.all(8),
              child: pw.Text(
                _stripHtml(day.description!),
                style: const pw.TextStyle(fontSize: 10),
              ),
            ),
          // Items table
          if (day.items.isNotEmpty && !day.isFreeDay)
            pw.TableHelper.fromTextArray(
              headerStyle: pw.TextStyle(fontWeight: pw.FontWeight.bold, fontSize: 9),
              cellStyle: const pw.TextStyle(fontSize: 9),
              headerDecoration: const pw.BoxDecoration(color: PdfColors.grey200),
              cellHeight: 24,
              headers: showItemizedPricing
                  ? [
                      translations['service'] ?? 'Service',
                      translations['details'] ?? 'Details',
                      translations['qty'] ?? 'Qty',
                      translations['price'] ?? 'Price',
                    ]
                  : [
                      translations['service'] ?? 'Service',
                      translations['details'] ?? 'Details',
                    ],
              data: day.items.map((item) {
                final row = [
                  _typeLabel(item.type),
                  '${item.title}${item.description != null ? '\n${item.description}' : ''}',
                ];
                if (showItemizedPricing) {
                  row.add('${item.quantity}');
                  row.add('$currency ${item.sellingPrice.toStringAsFixed(2)}');
                }
                return row;
              }).toList(),
            ),
          if (day.isFreeDay)
            pw.Padding(
              padding: const pw.EdgeInsets.all(8),
              child: pw.Text(
                translations['free_day'] ?? 'Free / Leisure Day',
                style: pw.TextStyle(fontSize: 10, fontStyle: pw.FontStyle.italic, color: PdfColors.grey600),
              ),
            ),
        ],
      ),
    );
  }

  // ── Pricing Table ──

  pw.Widget _buildPricingTable(
    ItineraryModel itinerary,
    Map<String, String> translations,
    bool showItemizedPricing,
  ) {
    final cur = itinerary.currency;
    return pw.Container(
      padding: const pw.EdgeInsets.all(12),
      decoration: pw.BoxDecoration(
        color: PdfColors.grey100,
        borderRadius: pw.BorderRadius.circular(4),
      ),
      child: pw.Column(
        crossAxisAlignment: pw.CrossAxisAlignment.end,
        children: [
          pw.Text(translations['pricing_summary'] ?? 'Pricing Summary',
              style: pw.TextStyle(fontSize: 14, fontWeight: pw.FontWeight.bold)),
          pw.SizedBox(height: 8),
          if (showItemizedPricing) ...[
            _pricingRow(translations['subtotal'] ?? 'Subtotal', '$cur ${itinerary.totalSelling.toStringAsFixed(2)}'),
            if (itinerary.markupType != null && itinerary.markupValue != null)
              _pricingRow(
                '${translations['markup'] ?? 'Markup'} (${itinerary.markupType == 'percentage' ? '${itinerary.markupValue}%' : 'Fixed'})',
                '',
              ),
          ],
          _pricingRow(translations['tax'] ?? 'Tax', '$cur ${itinerary.totalTax.toStringAsFixed(2)}'),
          pw.Divider(),
          _pricingRow(
            translations['grand_total'] ?? 'Grand Total',
            '$cur ${itinerary.grandTotal.toStringAsFixed(2)}',
            bold: true,
            fontSize: 14,
          ),
        ],
      ),
    );
  }

  pw.Widget _pricingRow(String label, String value, {bool bold = false, double fontSize = 10}) {
    return pw.Padding(
      padding: const pw.EdgeInsets.symmetric(vertical: 2),
      child: pw.Row(
        mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
        children: [
          pw.Text(label, style: pw.TextStyle(fontSize: fontSize, fontWeight: bold ? pw.FontWeight.bold : pw.FontWeight.normal)),
          pw.Text(value, style: pw.TextStyle(fontSize: fontSize, fontWeight: bold ? pw.FontWeight.bold : pw.FontWeight.normal)),
        ],
      ),
    );
  }

  // ── Inclusions ──

  pw.Widget _buildInclusions(List<String> items, Map<String, String> translations) {
    return pw.Container(
      margin: const pw.EdgeInsets.only(top: 12),
      child: pw.Column(
        crossAxisAlignment: pw.CrossAxisAlignment.start,
        children: [
          pw.Text(translations['inclusions'] ?? 'Inclusions',
              style: pw.TextStyle(fontSize: 12, fontWeight: pw.FontWeight.bold, color: PdfColors.green700)),
          pw.SizedBox(height: 4),
          ...items.map((item) => pw.Padding(
                padding: const pw.EdgeInsets.only(bottom: 2),
                child: pw.Row(children: [
                  pw.Text('✓ ', style: const pw.TextStyle(fontSize: 10, color: PdfColors.green700)),
                  pw.Expanded(child: pw.Text(item, style: const pw.TextStyle(fontSize: 10))),
                ]),
              )),
        ],
      ),
    );
  }

  // ── Exclusions ──

  pw.Widget _buildExclusions(List<String> items, Map<String, String> translations) {
    return pw.Container(
      margin: const pw.EdgeInsets.only(top: 12),
      child: pw.Column(
        crossAxisAlignment: pw.CrossAxisAlignment.start,
        children: [
          pw.Text(translations['exclusions'] ?? 'Exclusions',
              style: pw.TextStyle(fontSize: 12, fontWeight: pw.FontWeight.bold, color: PdfColors.red700)),
          pw.SizedBox(height: 4),
          ...items.map((item) => pw.Padding(
                padding: const pw.EdgeInsets.only(bottom: 2),
                child: pw.Row(children: [
                  pw.Text('✗ ', style: const pw.TextStyle(fontSize: 10, color: PdfColors.red700)),
                  pw.Expanded(child: pw.Text(item, style: const pw.TextStyle(fontSize: 10))),
                ]),
              )),
        ],
      ),
    );
  }

  // ── Terms ──

  pw.Widget _buildTerms(String terms, Map<String, String> translations) {
    return pw.Container(
      margin: const pw.EdgeInsets.only(top: 12),
      child: pw.Column(
        crossAxisAlignment: pw.CrossAxisAlignment.start,
        children: [
          pw.Text(translations['terms'] ?? 'Terms & Conditions',
              style: pw.TextStyle(fontSize: 12, fontWeight: pw.FontWeight.bold)),
          pw.SizedBox(height: 4),
          pw.Text(_stripHtml(terms), style: const pw.TextStyle(fontSize: 9, color: PdfColors.grey700)),
        ],
      ),
    );
  }

  // ── Helpers ──

  pw.Widget _cell(String text, {bool bold = false}) {
    return pw.Padding(
      padding: const pw.EdgeInsets.all(6),
      child: pw.Text(text,
          style: pw.TextStyle(fontSize: 10, fontWeight: bold ? pw.FontWeight.bold : pw.FontWeight.normal)),
    );
  }

  String _typeLabel(String type) {
    switch (type) {
      case 'hotel':
        return 'Hotel';
      case 'transport':
        return 'Transport';
      case 'activity':
        return 'Activity';
      case 'meal':
        return 'Meal';
      case 'flight':
        return 'Flight';
      default:
        return type;
    }
  }

  String _stripHtml(String html) {
    return html.replaceAll(RegExp(r'<[^>]*>'), '').replaceAll('&nbsp;', ' ').trim();
  }

  // ── Font loading ──

  Future<pw.Font> _loadFont(String locale) async {
    try {
      switch (locale) {
        case 'hi':
          return pw.Font.ttf(
              await rootBundle.load('assets/fonts/NotoSansDevanagari-Regular.ttf'));
        case 'ar':
          return pw.Font.ttf(
              await rootBundle.load('assets/fonts/NotoSansArabic-Regular.ttf'));
        default:
          return pw.Font.ttf(
              await rootBundle.load('assets/fonts/NotoSans-Regular.ttf'));
      }
    } catch (_) {
      return pw.Font.helvetica();
    }
  }

  Future<pw.Font> _loadBoldFont(String locale) async {
    try {
      switch (locale) {
        case 'hi':
          return pw.Font.ttf(
              await rootBundle.load('assets/fonts/NotoSansDevanagari-Bold.ttf'));
        default:
          return pw.Font.ttf(
              await rootBundle.load('assets/fonts/NotoSans-Bold.ttf'));
      }
    } catch (_) {
      return pw.Font.helveticaBold();
    }
  }

  // ── Translations (TICKET-101) ──

  Map<String, String> _getTranslations(String locale) {
    switch (locale) {
      case 'hi':
        return _hindiTranslations;
      default:
        return _englishTranslations;
    }
  }

  static const _englishTranslations = {
    'quotation_title': 'Travel Quotation',
    'version': 'Version',
    'date': 'Date',
    'valid_until': 'Valid Until',
    'customer': 'Customer Details',
    'duration': 'Duration',
    'days': 'Days',
    'currency_label': 'Currency',
    'day': 'Day',
    'service': 'Service',
    'details': 'Details',
    'qty': 'Qty',
    'price': 'Price',
    'free_day': 'Free / Leisure Day',
    'pricing_summary': 'Pricing Summary',
    'subtotal': 'Subtotal',
    'markup': 'Markup',
    'tax': 'Tax',
    'grand_total': 'Grand Total',
    'inclusions': 'Inclusions',
    'exclusions': 'Exclusions',
    'terms': 'Terms & Conditions',
  };

  static const _hindiTranslations = {
    'quotation_title': 'यात्रा कोटेशन',
    'version': 'संस्करण',
    'date': 'दिनांक',
    'valid_until': 'तक वैध',
    'customer': 'ग्राहक विवरण',
    'duration': 'अवधि',
    'days': 'दिन',
    'currency_label': 'मुद्रा',
    'day': 'दिन',
    'service': 'सेवा',
    'details': 'विवरण',
    'qty': 'मात्रा',
    'price': 'कीमत',
    'free_day': 'मुक्त / अवकाश दिवस',
    'pricing_summary': 'मूल्य सारांश',
    'subtotal': 'उप-कुल',
    'markup': 'मार्कअप',
    'tax': 'कर',
    'grand_total': 'कुल योग',
    'inclusions': 'शामिल',
    'exclusions': 'शामिल नहीं',
    'terms': 'नियम और शर्तें',
  };
}
