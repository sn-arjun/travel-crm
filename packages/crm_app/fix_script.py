import os
import re
import glob

base_dir = r"c:\Users\Admin\Downloads\pro\CRM\packages\crm_app\lib"

# 1. Fix missing 'abstract class' for model definitions
models_to_fix = [
    "Traveller",
    "VisaApplication",
    "VisaChecklistItem",
    "Supplier",
    "SupplierRateCard",
    "LedgerEntry",
    "Voucher",
    "HotelVoucherDetails",
    "TransportVoucherDetails",
    "FlightPassenger",
    "FlightVoucherDetails",
    "ActivityVoucherDetails",
    "VoucherListState",
    "VoucherDetailState",
    "SupplierListState",
    "SupplierDetailState",
]

for root, _, files in os.walk(base_dir):
    for f in files:
        if f.endswith(".dart") and not f.endswith(".freezed.dart") and not f.endswith(".g.dart"):
            file_path = os.path.join(root, f)
            with open(file_path, "r", encoding="utf-8") as file:
                content = file.read()
            
            modified = False
            for model in models_to_fix:
                # Find "class MODEL with _$MODEL" and replace with "abstract class MODEL with _$MODEL"
                # But ensure we don't double replace if already abstract
                pattern = r"(?<!abstract\s)class\s+" + re.escape(model) + r"\s+with\s+_\$" + re.escape(model)
                if re.search(pattern, content):
                    content = re.sub(pattern, "abstract class " + model + " with _$" + model, content)
                    modified = True
            
            if modified:
                with open(file_path, "w", encoding="utf-8") as file:
                    file.write(content)
                print(f"Added abstract to Freezed classes in {f}")

# 2. Fix imports and widgets in screens
for root, _, files in os.walk(os.path.join(base_dir, "features")):
    for f in files:
        if f.endswith("_screen.dart"):
            file_path = os.path.join(root, f)
            with open(file_path, "r", encoding="utf-8") as file:
                content = file.read()
            
            original_content = content
            
            # Fix imports
            content = content.replace("import '../../../../core/widgets/app_text_field.dart';", "import '../../../../core/widgets/forms/app_text_field.dart';")
            content = content.replace("import '../../../../core/widgets/app_dropdown.dart';", "import '../../../../core/widgets/forms/app_dropdown.dart';")
            
            # Remove bad imports
            content = re.sub(r"import\s+'[^']*app_page_header\.dart';[ \t]*\n", "", content)
            content = re.sub(r"import\s+'[^']*app_button\.dart';[ \t]*\n", "", content)
            content = re.sub(r"import\s+'[^']*app_card\.dart';[ \t]*\n", "import '../../../../core/widgets/layout/app_section_card.dart';\n", content)
            
            # Replace AppButton -> ElevatedButton
            # AppButton(text: 'Save', onPressed: ...) -> ElevatedButton(onPressed: ..., child: Text('Save'))
            # Let's do a simple regex or just string replacement if possible.
            # Usually AppButton has `label:` or `text:`
            content = re.sub(r"AppButton\(\s*label:\s*([^,]+),\s*onPressed:\s*([^,)]+)\s*\)", r"ElevatedButton(onPressed: \2, child: Text(\1))", content)
            content = re.sub(r"AppButton\(\s*text:\s*([^,]+),\s*onPressed:\s*([^,)]+)\s*\)", r"ElevatedButton(onPressed: \2, child: Text(\1))", content)
            
            # Replace AppCard -> AppSectionCard
            content = content.replace("AppCard(", "Card(")
            content = content.replace("EdgeInsets.all(AppTheme.spacingLg)", "EdgeInsets.all(24.0)")
            content = content.replace("EdgeInsets.all(AppTheme.spacingMd)", "EdgeInsets.all(16.0)")
            
            # Replace AppPageHeader
            # AppPageHeader(title: 'X', actionLabel: 'Y', onActionPressed: () => Z)
            def header_replacer(match):
                params = match.group(1)
                title_m = re.search(r"title:\s*('([^']+)'|\"([^\"]+)\")", params)
                action_m = re.search(r"actionLabel:\s*('([^']+)'|\"([^\"]+)\")", params)
                on_action_m = re.search(r"onActionPressed:\s*([^,)]+)", params)
                
                title = title_m.group(1) if title_m else "'Header'"
                action = action_m.group(1) if action_m else "'Action'"
                on_action = on_action_m.group(1) if on_action_m else "() {}"
                
                return f"""Padding(
            padding: const EdgeInsets.all(16.0),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text({title}, style: Theme.of(context).textTheme.headlineMedium),
                if ({action} != null) ElevatedButton(onPressed: {on_action}, child: Text({action})),
              ],
            ),
          )"""
            
            content = re.sub(r"AppPageHeader\((.*?)\)", header_replacer, content, flags=re.DOTALL)
            
            if content != original_content:
                with open(file_path, "w", encoding="utf-8") as file:
                    file.write(content)
                print(f"Fixed widgets in {f}")

# 3. Fix VoucherRepository import error
voucher_repo_path = os.path.join(base_dir, "features", "vouchers", "data", "repositories", "voucher_repository.dart")
if os.path.exists(voucher_repo_path):
    with open(voucher_repo_path, "r", encoding="utf-8") as file:
        content = file.read()
    content = content.replace("import 'models/voucher.dart';", "import '../models/voucher.dart';")
    content = content.replace(" PaginatedResponse<Voucher>", " dynamic") # Temp fix if PaginatedResponse is not found
    with open(voucher_repo_path, "w", encoding="utf-8") as file:
        file.write(content)
    print("Fixed voucher repo imports")

# 4. Fix other Repositories missing PaginatedResponse
repo_paths = [
    os.path.join(base_dir, "features", "visa", "data", "repositories", "traveller_repository.dart"),
    os.path.join(base_dir, "features", "visa", "data", "repositories", "visa_repository.dart"),
    os.path.join(base_dir, "features", "suppliers", "data", "repositories", "supplier_repository.dart"),
]
for repo_path in repo_paths:
    if os.path.exists(repo_path):
        with open(repo_path, "r", encoding="utf-8") as file:
            content = file.read()
        
        original_content = content
        if "import '../../../../shared/models/" not in content and "import 'package:shared/shared.dart';" not in content:
             content = "import 'package:shared/shared.dart';\n" + content
             
        if content != original_content:
            with open(repo_path, "w", encoding="utf-8") as file:
                file.write(content)
            print(f"Added shared package to {os.path.basename(repo_path)}")

print("Done")
