# Milestone 7: Invoicing & Payments - Backend Implementation

## Overview
Complete backend implementation for invoicing, payments, and credit/debit notes in TravelCRM Pro using Hono.js on Cloudflare Workers with Drizzle ORM and D1 database.

## Files Created

### 1. Services

#### `/backend/src/services/tax-calculator.ts` (186 lines)
Tax calculation engine supporting GST (CGST/SGST/IGST) and VAT systems.

**Key Functions:**
- `detectTaxType(companyState, contactState, taxSystem)` - Determines tax structure based on location
  - Same state → CGST + SGST (50/50 split)
  - Different states → IGST
  - VAT → single vatAmount

- `calculateLineItemTax(rate, quantity, discountPercent, taxRate, taxType)` - Calculates tax for individual line items
  - Applies line-level discounts
  - Splits tax appropriately based on type

- `calculateInvoiceTotals(items, discountType?, discountValue?, taxSystem?)` - Aggregates totals from all items
  - Supports percentage and fixed discounts
  - Returns complete breakdown: subtotal, discounts, taxable amount, all tax components, total

- `isValidTaxRate(rate)` - Validates supported rates: 0, 5, 12, 18, 28

#### `/backend/src/services/numbering.ts` (156 lines)
Auto-incrementing invoice number generation with financial year support.

**Key Features:**
- Atomic counter in settings table (no race conditions)
- Financial year reset (April 1 - March 31)
- Format examples:
  - INV-2024-0001 (tax invoice)
  - PI-2024-0001 (proforma)
  - CN-2024-0001 (credit note)
  - DN-2024-0001 (debit note)

**Key Functions:**
- `generateInvoiceNumber(tenantDb, type, tenantSettings)` - Atomically generates next number
- `getCurrentFinancialYear()` - Returns current FY string
- `getFinancialYearFromDate(dateStr)` - Gets FY for any date
- `resetInvoiceNumber(tenantDb, type)` - Resets counter for new FY

---

### 2. Routes

#### `/backend/src/routes/invoices.ts` (707 lines)
Complete CRUD operations for invoices with support for multiple types.

**Endpoints:**

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | List invoices with pagination, filtering, and search |
| POST | `/` | Create invoice with line items (auto-calculates totals) |
| GET | `/:id` | Get invoice detail with items and payments |
| PUT | `/:id` | Update invoice (draft only) |
| DELETE | `/:id` | Soft delete (set status to cancelled) |
| POST | `/:id/void` | Void invoice |
| POST | `/:id/duplicate` | Duplicate invoice as new draft |

**Query Parameters (GET /):**
- `page` - Pagination page (default: 1)
- `limit` - Items per page (default: 20, max: 100)
- `status` - Filter by status (draft, sent, paid, partially_paid, overdue, cancelled)
- `type` - Filter by type (tax_invoice, proforma, receipt)
- `contactId` - Filter by contact
- `leadId` - Filter by lead
- `dateFrom` - Filter by creation date (from)
- `dateTo` - Filter by creation date (to)
- `search` - Search invoice number or contact name

**Request Body (POST /):**
```json
{
  "contactId": "string",
  "leadId": "string (optional)",
  "type": "tax_invoice|proforma|receipt",
  "items": [
    {
      "description": "string",
      "hsnCode": "string (optional)",
      "quantity": 1,
      "rate": 100.00,
      "discountPercent": 0,
      "taxRate": 18
    }
  ],
  "discountType": "percentage|fixed (optional)",
  "discountValue": 0,
  "dueDate": "2024-02-15 (optional)",
  "notes": "string (optional)",
  "bankDetails": { /* optional */ },
  "currency": "INR"
}
```

**Response (GET /:id):**
```json
{
  "id": "uuid",
  "invoiceNumber": "INV-2024-0001",
  "type": "tax_invoice",
  "contactId": "uuid",
  "contactName": "John Doe",
  "subtotal": 10000,
  "discountAmount": 1000,
  "taxableAmount": 9000,
  "cgst": 810,
  "sgst": 810,
  "igst": 0,
  "totalTax": 1620,
  "total": 10620,
  "status": "draft",
  "balanceDue": 10620,
  "items": [
    {
      "id": "uuid",
      "description": "Hotel Accommodation",
      "quantity": 3,
      "rate": 3000,
      "taxRate": 18,
      "amount": 10620
    }
  ],
  "payments": [
    {
      "id": "uuid",
      "amount": 5000,
      "method": "bank_transfer",
      "date": "2024-02-10"
    }
  ]
}
```

**RBAC:** admin, sales_manager, accountant can manage; salesperson can view own

---

#### `/backend/src/routes/payments.ts` (452 lines)
Complete payment tracking and reconciliation.

**Endpoints:**

| Method | Path | Description |
|--------|------|-------------|
| POST | `/` | Record payment (validates amount <= balance_due) |
| GET | `/` | List payments with filters |
| GET | `/:id` | Get payment detail |
| DELETE | `/:id` | Delete payment (reverses invoice amounts) |
| POST | `/:id/link-invoice` | Link advance payment to invoice |

**Query Parameters (GET /):**
- `page`, `limit` - Pagination
- `type` - incoming, outgoing
- `contactId` - Filter by contact
- `invoiceId` - Filter by invoice
- `method` - Payment method (cash, bank_transfer, upi, card, cheque, online)
- `dateFrom`, `dateTo` - Date range

**Request Body (POST /):**
```json
{
  "invoiceId": "uuid",
  "amount": 5000.00,
  "method": "bank_transfer",
  "reference": "TXN123456",
  "notes": "payment received",
  "date": "2024-02-10",
  "receiptUrl": "https://..."
}
```

**Auto-Updates on Payment:**
- invoice.paid_amount += payment.amount
- invoice.balance_due -= payment.amount
- invoice.status: 'draft' → 'partially_paid' → 'paid'

**RBAC:** admin, sales_manager, accountant only

---

#### `/backend/src/routes/credit-notes.ts` (607 lines)
Credit notes (reduce receivables) and debit notes (increase receivables).

**Endpoints:**

| Method | Path | Description |
|--------|------|-------------|
| POST | `/credit-notes` | Create credit note with auto-numbering |
| GET | `/credit-notes` | List credit notes |
| POST | `/credit-notes/:id/apply` | Apply credit to invoice |
| POST | `/debit-notes` | Create debit note with auto-numbering |
| GET | `/debit-notes` | List debit notes |
| POST | `/debit-notes/:id/apply` | Apply debit to invoice |

**Request Body (POST /credit-notes):**
```json
{
  "invoiceId": "uuid",
  "reason": "Product return",
  "items": [
    {
      "description": "Hotel refund",
      "quantity": 1,
      "rate": 5000,
      "taxRate": 18
    }
  ],
  "notes": "partial return"
}
```

**Request Body (POST /credit-notes/:id/apply):**
```json
{
  "amount": 5000
}
```

**RBAC:** admin, sales_manager, accountant only

---

### 3. Updated Files

#### `/backend/src/index.ts`
Added imports and route registrations:
```typescript
import invoiceRoutes from './routes/invoices';
import paymentRoutes from './routes/payments';
import creditNoteRoutes from './routes/credit-notes';

app.route('/api/v1/invoices', invoiceRoutes);
app.route('/api/v1/payments', paymentRoutes);
app.route('/api/v1/credit-notes', creditNoteRoutes);
```

#### `/backend/src/routes/reports.ts`
Added three financial report endpoints:

**GET /outstanding**
```json
{
  "totalReceivable": 50000,
  "totalPayable": 0,
  "overdue": {
    "amount": 25000,
    "count": 5
  }
}
```

**GET /ageing?contactId=uuid (optional)**
```json
[
  {
    "id": "uuid",
    "name": "Customer Name",
    "current": 10000,
    "days_30_60": 5000,
    "days_60_90": 3000,
    "days_90_plus": 2000,
    "total": 20000
  }
]
```

**GET /dashboard/financial**
```json
{
  "revenueThisMonth": 100000,
  "outstanding": 50000,
  "overdue": {
    "amount": 25000,
    "count": 5
  },
  "collectionsThisMonth": 75000,
  "invoiceStatusCounts": {
    "draft": 3,
    "sent": 2,
    "paid": 10,
    "partially_paid": 2,
    "overdue": 1
  },
  "paymentMethods": {
    "bank_transfer": { "count": 8, "totalAmount": 50000 },
    "upi": { "count": 2, "totalAmount": 20000 }
  }
}
```

---

## Database Schema (Existing Tables)

### invoices
```sql
invoices (
  id TEXT PRIMARY KEY,
  leadId TEXT,
  contactId TEXT NOT NULL,
  invoiceNumber TEXT UNIQUE NOT NULL,
  type TEXT, -- tax_invoice, proforma, receipt, credit_note, debit_note
  subtotal REAL,
  discountType TEXT, -- percentage, fixed
  discountValue REAL,
  discountAmount REAL,
  taxableAmount REAL,
  taxType TEXT, -- gst, vat, none
  cgst REAL, -- Central GST
  sgst REAL, -- State GST
  igst REAL, -- Integrated GST
  vatAmount REAL,
  totalTax REAL,
  total REAL,
  currency TEXT,
  status TEXT, -- draft, sent, paid, partially_paid, overdue, cancelled
  dueDate TEXT,
  paidAmount REAL,
  balanceDue REAL,
  notes TEXT,
  bankDetails TEXT, -- JSON
  paymentLink TEXT,
  createdBy TEXT,
  createdAt TEXT,
  updatedAt TEXT
)
```

### invoiceItems
```sql
invoiceItems (
  id TEXT PRIMARY KEY,
  invoiceId TEXT NOT NULL,
  description TEXT,
  hsnCode TEXT,
  quantity INTEGER,
  rate REAL,
  discountPercent REAL,
  taxableAmount REAL,
  taxRate REAL,
  taxAmount REAL,
  amount REAL,
  sortOrder INTEGER
)
```

### payments
```sql
payments (
  id TEXT PRIMARY KEY,
  invoiceId TEXT,
  contactId TEXT,
  supplierId TEXT,
  amount REAL,
  currency TEXT,
  method TEXT, -- cash, bank_transfer, upi, card, cheque, online
  reference TEXT,
  type TEXT, -- incoming, outgoing
  date TEXT,
  notes TEXT,
  receiptUrl TEXT,
  createdBy TEXT,
  createdAt TEXT
)
```

### settings
```sql
settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  updatedBy TEXT,
  updatedAt TEXT
)
```

**Special Keys:**
- `last_invoice_number_2024-25` - Last tax invoice number
- `last_proforma_number_2024-25` - Last proforma number
- `last_credit_note_number_2024-25` - Last credit note number
- `last_debit_note_number_2024-25` - Last debit note number
- `company_state` - Company state (for GST calculation)

---

## Implementation Patterns

### Raw SQL with Prepared Statements
All database access uses prepared statements with parameter binding:
```typescript
const result = await tenantDb
  .prepare('SELECT * FROM invoices WHERE id = ?1 AND status = ?2')
  .bind(invoiceId, 'paid')
  .first<InvoiceRow>();
```

### RBAC Enforcement
```typescript
function checkInvoicePermission(role: string): boolean {
  return ['admin', 'sales_manager', 'accountant'].includes(role);
}

if (!checkInvoicePermission(role)) {
  return forbidden(c, 'Only admin, sales_manager, or accountant can create invoices');
}
```

### Atomic Operations
- Invoice number generation uses INSERT OR CONFLICT to avoid race conditions
- Payment recording atomically updates invoice amounts
- Deletion of payments reverses amounts in original invoice

### Validation
- Amount validation: payment amount ≤ invoice balance_due
- Tax rate validation: only 0, 5, 12, 18, 28 allowed
- Invoice status checks before updates

### Logging
All financial operations logged to activity_logs:
```typescript
await logActivity(tenantDb, userId, 'invoice_created', `Invoice ${invoiceNumber} created`, {
  invoiceId,
  invoiceNumber,
  contactId: data.contactId,
});
```

---

## API Examples

### Create Invoice with Tax Calculation
```bash
curl -X POST http://localhost/api/v1/invoices \
  -H "Authorization: Bearer token" \
  -H "Content-Type: application/json" \
  -d '{
    "contactId": "contact-123",
    "type": "tax_invoice",
    "items": [
      {
        "description": "Hotel Stay - 3 nights",
        "hsnCode": "998551",
        "quantity": 3,
        "rate": 5000,
        "discountPercent": 10,
        "taxRate": 18
      }
    ],
    "dueDate": "2024-03-15"
  }'
```

Response:
```json
{
  "success": true,
  "data": {
    "id": "inv-001",
    "invoiceNumber": "INV-2024-0001",
    "status": "draft",
    "subtotal": 15000,
    "discountAmount": 1500,
    "taxableAmount": 13500,
    "cgst": 1215,
    "sgst": 1215,
    "totalTax": 2430,
    "total": 15930,
    "balanceDue": 15930
  }
}
```

### Record Payment
```bash
curl -X POST http://localhost/api/v1/payments \
  -H "Authorization: Bearer token" \
  -H "Content-Type: application/json" \
  -d '{
    "invoiceId": "inv-001",
    "amount": 10000,
    "method": "bank_transfer",
    "reference": "TXN123456",
    "date": "2024-02-10"
  }'
```

### Apply Credit Note
```bash
curl -X POST http://localhost/api/v1/credit-notes/cn-001/apply \
  -H "Authorization: Bearer token" \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 5000
  }'
```

### Get Financial Dashboard
```bash
curl -X GET http://localhost/api/v1/reports/dashboard/financial \
  -H "Authorization: Bearer token"
```

---

## Key Features

1. **Multi-Tax Support**
   - GST (CGST/SGST/IGST) for India
   - VAT for other regions
   - Automatic state-based detection

2. **Atomic Invoice Numbering**
   - No duplicate numbers
   - Financial year based
   - Configurable format

3. **Complete Payment Lifecycle**
   - Record payments
   - Link advance payments
   - Auto-status updates
   - Reversal on deletion

4. **Financial Reporting**
   - Outstanding amounts
   - Ageing breakdown
   - Monthly revenue/collections
   - Payment method distribution

5. **Audit Trail**
   - All operations logged
   - User attribution
   - Timestamp tracking

6. **Soft Deletes**
   - Invoices marked as cancelled
   - Payments fully reversible
   - No data loss

---

## Testing Checklist

- [ ] Create invoice with CGST/SGST (same state)
- [ ] Create invoice with IGST (different state)
- [ ] Create invoice with VAT
- [ ] Verify auto-numbering across years
- [ ] Record payment and verify balance_due reduces
- [ ] Create credit note and apply to invoice
- [ ] Create debit note and apply to invoice
- [ ] Duplicate invoice preserves line items
- [ ] Payment deletion reverses amounts
- [ ] Verify financial dashboard calculations
- [ ] Check ageing report grouping
- [ ] Verify RBAC permissions

---

## Notes

- All timestamps in ISO 8601 format (Z timezone)
- All amounts in decimal format (REAL)
- Financial year: April 1 - March 31
- Tax calculations use 2 decimal precision
- Settings table stores counter state atomically
