import 'dart:io';

void main() async {
  final baseDir = Directory(r'c:\Users\Admin\Downloads\pro\CRM\packages\crm_app\lib');
  
  final modelsToFix = [
    'Traveller',
    'VisaApplication',
    'VisaChecklistItem',
    'Supplier',
    'SupplierRateCard',
    'LedgerEntry',
    'Voucher',
    'HotelVoucherDetails',
    'TransportVoucherDetails',
    'FlightPassenger',
    'FlightVoucherDetails',
    'ActivityVoucherDetails',
    'VoucherListState',
    'VoucherDetailState',
    'SupplierListState',
    'SupplierDetailState',
  ];

  await for (final file in baseDir.list(recursive: true)) {
    if (file is File && file.path.endsWith('.dart') && !file.path.endsWith('.freezed.dart') && !file.path.endsWith('.g.dart')) {
      var content = await file.readAsString();
      var originalContent = content;
      
      // Fix models
      for (final model in modelsToFix) {
        final regExp = RegExp(r'(?<!abstract\s)class\s+' + model + r'\s+with\s+_\$' + model);
        if (regExp.hasMatch(content)) {
          content = content.replaceAllMapped(regExp, (match) => 'abstract ${match.group(0)!}');
        }
      }
      
      // Fix UI widgets
      if (file.path.contains('features')) {
        content = content.replaceAll(
          "import '../../../../core/widgets/app_text_field.dart';", 
          "import '../../../../core/widgets/forms/app_text_field.dart';"
        );
        content = content.replaceAll(
          "import '../../../../core/widgets/app_dropdown.dart';", 
          "import '../../../../core/widgets/forms/app_dropdown.dart';"
        );
        
        content = content.replaceAll(RegExp(r"import\s+'[^']*app_page_header\.dart';(\r?\n)?"), "");
        content = content.replaceAll(RegExp(r"import\s+'[^']*app_button\.dart';(\r?\n)?"), "");
        content = content.replaceAll(RegExp(r"import\s+'[^']*app_card\.dart';(\r?\n)?"), "import '../../../../core/widgets/layout/app_section_card.dart';\n");
        
        content = content.replaceAllMapped(RegExp(r'AppButton\(\s*label:\s*([^,]+),\s*onPressed:\s*([^,)]+)\s*\)'), 
          (m) => 'ElevatedButton(onPressed: ${m.group(2)}, child: Text(${m.group(1)}))');
          
        content = content.replaceAllMapped(RegExp(r'AppButton\(\s*text:\s*([^,]+),\s*onPressed:\s*([^,)]+)\s*\)'), 
          (m) => 'ElevatedButton(onPressed: ${m.group(2)}, child: Text(${m.group(1)}))');
          
        content = content.replaceAll('AppCard(', 'Card(');
        content = content.replaceAll('EdgeInsets.all(AppTheme.spacingLg)', 'EdgeInsets.all(24.0)');
        content = content.replaceAll('EdgeInsets.all(AppTheme.spacingMd)', 'EdgeInsets.all(16.0)');
        
        content = content.replaceAllMapped(RegExp(r'AppPageHeader\((.*?)\)', dotAll: true), (m) {
          final params = m.group(1)!;
          final titleExp = RegExp(r"title:\s*('([^']+)'|\x22([^\x22]+)\x22)");
          final actionExp = RegExp(r"actionLabel:\s*('([^']+)'|\x22([^\x22]+)\x22)");
          final onActionExp = RegExp(r"onActionPressed:\s*([^,()]+(\(\))?\s*=>\s*[^,)]+|[^,)]+)");
          
          final titleMatch = titleExp.firstMatch(params);
          final actionMatch = actionExp.firstMatch(params);
          final onActionMatch = onActionExp.firstMatch(params);
          
          final title = titleMatch != null ? titleMatch.group(1) : "'Header'";
          final action = actionMatch != null ? actionMatch.group(1) : "'Action'";
          final onAction = onActionMatch != null ? onActionMatch.group(1) : "() {}";
          
          return '''Padding(padding: const EdgeInsets.all(16.0), child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [Text($title, style: Theme.of(context).textTheme.headlineMedium), ElevatedButton(onPressed: $onAction, child: Text($action))],))''';
        });
      }
      
      // Fix Repo paginated issue
      if (file.path.contains('repository')) {
        content = content.replaceAll("import 'models/voucher.dart';", "import '../models/voucher.dart';");
        
        if (!content.contains("import 'package:shared/shared.dart';") && 
             (file.path.contains('traveller_repository.dart') || 
              file.path.contains('visa_repository.dart') || 
              file.path.contains('supplier_repository.dart'))) {
             content = "import 'package:shared/shared.dart';\n$content";
        }
      }
      
      if (content != originalContent) {
        await file.writeAsString(content);
        print('Updated \${file.path}');
      }
    }
  }
}
