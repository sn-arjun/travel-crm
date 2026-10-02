# Milestone 7: Invoicing & Payments - API Reference

## Invoices API

### GET /api/v1/invoices
List all invoices with pagination and filtering.

**Query Parameters:**
```
page=1
limit=20
status=draft|sent|paid|partially_paid|overdue|cancelled
type=tax_invoice|proforma|receipt
contactId=uuid
leadId=uuid
dateFrom=2024-01-01
dateTo=2024-12-31
search=INV-2024 or customer name
```

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "invoiceNumber": "INV-2024-0001",
      "type": "tax_invoice",
      "contactId": "uuid",
      "contactName": "John Doe",
      "total": 10620,
      "status": "draft",
      "balanceDue": 10620,
      "dueDate": "2024-03-15",
      "createdAt": "2024-02-15T10:30:00Z"
    }
  ],
  "pagination": {
    "total": 45,
    "page": 1,
    "limit": 20,
    "totalPages": 3,
    "hasMore": true
  }
}
```

---

### POST /api/v1/invoices
Create a new invoice.

**Required Permissions:** admin, sales_manager, accountant

**Request Body:**
```json
{
  "contactId": "uuid",
  "leadId": "uuid (optional)",
  "type": "tax_invoice",
  "items": [
    {
      "description": "Hotel Accommodation",
      "hsnCode": "998551",
      "quantity": 3,
      "rate": 5000,
      "discountPercent": 10,
      "taxRate": 18
    }
  ],
  "discountType": "percentage",
  "discountValue": 5,
  "dueDate": "2024-03-15",
  "notes": "Payment due within 30 days",
  "bankDetails": {
    "bankName": "HDFC",
    "accountNumber": "***1234",
    "ifsc": "HDFC0001234"
  },
  "currency": "INR"
}
```

**Response (201):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "invoiceNumber": "INV-2024-0001",
    "type": "tax_invoice",
    "contactId": "uuid",
    "status": "draft",
    "subtotal": 15000,
    "discountAmount": 1500,
    "taxableAmount": 13500,
    "cgst": 1215,
    "sgst": 1215,
    "totalTax": 2430,
    "total": 15930,
    "balanceDue": 15930,
    "paidAmount": 0
  }
}
```

**Error Cases:**
- 403: Insufficient permissions
- 404: Contact not found
- 422: Validation error (empty items, invalid tax rates)

---

### GET /api/v1/invoices/:id
Get invoice details with line items and payments.

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "invoiceNumber": "INV-2024-0001",
    "type": "tax_invoice",
    "contactId": "uuid",
    "contactName": "John Doe",
    "contactEmail": "john@example.com",
    "subtotal": 15000,
    "discountAmount": 1500,
    "taxableAmount": 13500,
    "cgst": 1215,
    "sgst": 1215,
    "igst": 0,
    "totalTax": 2430,
    "total": 15930,
    "paidAmount": 5000,
    "balanceDue": 10930,
    "status": "partially_paid",
    "dueDate": "2024-03-15",
    "notes": "Payment terms: Net 30",
    "createdAt": "2024-02-15T10:30:00Z",
    "updatedAt": "2024-02-20T14:15:00Z",
    "items": [
      {
        "id": "uuid",
        "description": "Hotel Accommodation",
        "hsnCode": "998551",
        "quantity": 3,
        "rate": 5000,
        "discountPercent": 10,
        "taxableAmount": 13500,
        "taxRate": 18,
        "taxAmount": 2430,
        "amount": 15930
      }
    ],
    "payments": [
      {
        "id": "uuid",
        "amount": 5000,
        "method": "bank_transfer",
        "reference": "TXN123456",
        "date": "2024-02-20",
        "notes": "Partial payment",
        "createdAt": "2024-02-20T14:00:00Z"
      }
    ]
  }
}
```

**Error Cases:**
- 404: Invoice not found

---

### PUT /api/v1/invoices/:id
Update invoice (only draft invoices).

**Required Permissions:** admin, sales_manager, accountant

**Request Body:** (all fields optional)
```json
{
  "items": [...],
  "discountType": "percentage",
  "discountValue": 5,
  "dueDate": "2024-03-15",
  "notes": "Updated notes"
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "status": "draft",
    "total": 15930,
    "updated_at": "2024-02-20T15:00:00Z"
  }
}
```

**Error Cases:**
- 400: Invoice is not in draft status
- 403: Insufficient permissions
- 404: Invoice not found

---

### DELETE /api/v1/invoices/:id
Soft delete invoice (sets status to cancelled).

**Required Permissions:** admin, sales_manager, accountant

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "status": "cancelled"
  }
}
```

---

### POST /api/v1/invoices/:id/void
Void an invoice.

**Required Permissions:** admin, sales_manager, accountant

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "status": "cancelled"
  }
}
```

---

### POST /api/v1/invoices/:id/duplicate
Duplicate an invoice as a new draft.

**Required Permissions:** admin, sales_manager, accountant

**Response (201):**
```json
{
  "success": true,
  "data": {
    "id": "new-uuid",
    "invoiceNumber": "INV-2024-0002",
    "status": "draft"
  }
}
```

---

## Payments API

### POST /api/v1/payments
Record a payment against an invoice.

**Required Permissions:** admin, sales_manager, accountant

**Request Body:**
```json
{
  "invoiceId": "uuid",
  "amount": 5000,
  "method": "bank_transfer",
  "reference": "TXN123456",
  "notes": "Partial payment received",
  "date": "2024-02-20",
  "receiptUrl": "https://s3.example.com/receipt.pdf"
}
```

**Response (201):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "invoiceId": "uuid",
    "amount": 5000,
    "method": "bank_transfer",
    "invoiceStatus": "partially_paid",
    "paidAmount": 5000,
    "balanceDue": 10930,
    "createdAt": "2024-02-20T14:00:00Z"
  }
}
```

**Validation:**
- Amount must be ≤ invoice.balanceDue
- Invoice must exist
- Amount must be > 0

**Error Cases:**
- 400: Payment amount exceeds balance due
- 404: Invoice not found
- 403: Insufficient permissions

---

### GET /api/v1/payments
List all payments.

**Query Parameters:**
```
page=1
limit=20
type=incoming|outgoing
contactId=uuid
invoiceId=uuid
method=bank_transfer|upi|cash|card|cheque|online
dateFrom=2024-01-01
dateTo=2024-12-31
```

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "invoiceId": "uuid",
      "invoiceNumber": "INV-2024-0001",
      "contactId": "uuid",
      "contactName": "John Doe",
      "amount": 5000,
      "method": "bank_transfer",
      "reference": "TXN123456",
      "type": "incoming",
      "date": "2024-02-20",
      "createdAt": "2024-02-20T14:00:00Z"
    }
  ],
  "pagination": { ... }
}
```

---

### GET /api/v1/payments/:id
Get payment details.

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "invoiceId": "uuid",
    "invoiceNumber": "INV-2024-0001",
    "contactId": "uuid",
    "contactName": "John Doe",
    "amount": 5000,
    "currency": "INR",
    "method": "bank_transfer",
    "reference": "TXN123456",
    "type": "incoming",
    "date": "2024-02-20",
    "notes": "Partial payment",
    "receiptUrl": "https://...",
    "createdAt": "2024-02-20T14:00:00Z"
  }
}
```

---

### DELETE /api/v1/payments/:id
Delete a payment and reverse invoice amounts.

**Required Permissions:** admin, sales_manager, accountant

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "deleted": true
  }
}
```

**Side Effects:**
- Reduces invoice.paidAmount by payment.amount
- Increases invoice.balanceDue by payment.amount
- Updates invoice.status accordingly

---

### POST /api/v1/payments/:id/link-invoice
Link an advance payment to an invoice.

**Required Permissions:** admin, sales_manager, accountant

**Request Body:**
```json
{
  "invoiceId": "uuid",
  "amount": 2500
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "invoiceId": "uuid",
    "paidAmount": 7500,
    "balanceDue": 8430,
    "status": "partially_paid"
  }
}
```

---

## Credit Notes API

### POST /api/v1/credit-notes
Create a credit note (reduces receivables).

**Required Permissions:** admin, sales_manager, accountant

**Request Body:**
```json
{
  "invoiceId": "uuid",
  "reason": "Partial return - 1 night hotel refund",
  "items": [
    {
      "description": "Hotel refund",
      "quantity": 1,
      "rate": 5000,
      "taxRate": 18
    }
  ],
  "notes": "Return processed on customer request"
}
```

**Response (201):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "invoiceNumber": "CN-2024-0001",
    "type": "credit_note",
    "status": "draft",
    "total": 5900,
    "items": [...]
  }
}
```

**Auto-Numbering:** CN-{YYYY}-{NNNN}

---

### GET /api/v1/credit-notes
List all credit notes.

**Query Parameters:**
```
page=1
limit=20
contactId=uuid
```

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "invoiceNumber": "CN-2024-0001",
      "type": "credit_note",
      "contactName": "John Doe",
      "total": 5900,
      "status": "draft",
      "createdAt": "2024-02-20T14:00:00Z"
    }
  ],
  "pagination": { ... }
}
```

---

### POST /api/v1/credit-notes/:id/apply
Apply credit note to invoice.

**Required Permissions:** admin, sales_manager, accountant

**Request Body:**
```json
{
  "amount": 5900
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "appliedAmount": 5900,
    "invoiceStatus": "partially_paid",
    "balanceDue": 5030
  }
}
```

**Side Effects:**
- Reduces invoice.balanceDue by credit amount
- Updates invoice.status
- Sets credit note status to 'applied'

---

## Debit Notes API

### POST /api/v1/debit-notes
Create a debit note (increases receivables).

**Required Permissions:** admin, sales_manager, accountant

**Request Body:**
```json
{
  "invoiceId": "uuid",
  "reason": "Additional charges - service tax",
  "items": [
    {
      "description": "Service tax addition",
      "quantity": 1,
      "rate": 500,
      "taxRate": 18
    }
  ],
  "notes": "Additional charges per amendment"
}
```

**Response (201):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "invoiceNumber": "DN-2024-0001",
    "type": "debit_note",
    "status": "draft",
    "total": 590
  }
}
```

**Auto-Numbering:** DN-{YYYY}-{NNNN}

---

### GET /api/v1/debit-notes
List all debit notes.

**Query Parameters:**
```
page=1
limit=20
contactId=uuid
```

---

### POST /api/v1/debit-notes/:id/apply
Apply debit note to invoice.

**Required Permissions:** admin, sales_manager, accountant

**Request Body:**
```json
{
  "amount": 590
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "appliedAmount": 590,
    "balanceDue": 11520
  }
}
```

**Side Effects:**
- Increases invoice.balanceDue by debit amount
- Sets debit note status to 'applied'

---

## Financial Reports API

### GET /api/v1/reports/outstanding
Get outstanding amounts summary.

**Response (200):**
```json
{
  "success": true,
  "data": {
    "totalReceivable": 50000,
    "totalPayable": 0,
    "overdue": {
      "amount": 25000,
      "count": 5
    }
  }
}
```

---

### GET /api/v1/reports/ageing
Get invoice ageing breakdown per contact.

**Query Parameters:**
```
contactId=uuid (optional - filter to single contact)
```

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "John Doe",
      "current": 10000,
      "days_30_60": 5000,
      "days_60_90": 3000,
      "days_90_plus": 2000,
      "total": 20000
    }
  ]
}
```

**Ageing Buckets:**
- `current` - Due date in future (0 days)
- `days_30_60` - Overdue 0-30 days
- `days_60_90` - Overdue 30-60 days
- `days_90_plus` - Overdue 90+ days
- `total` - Sum of all buckets

---

### GET /api/v1/reports/dashboard/financial
Get comprehensive financial dashboard.

**Response (200):**
```json
{
  "success": true,
  "data": {
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
      "bank_transfer": {
        "count": 8,
        "totalAmount": 50000
      },
      "upi": {
        "count": 2,
        "totalAmount": 20000
      }
    }
  }
}
```

---

## Status Flow Diagram

```
INVOICE STATUSES:
draft → sent → paid
   ↘         ↙
     partially_paid
          ↓
       overdue
          ↓
      cancelled

PAYMENT RULES:
- Draft invoice: paid_amount = 0, balance_due = total
- Payment recorded: paid_amount += amount
- balance_due = total - paid_amount
- balance_due ≤ 0.01 → status = 'paid'
- balance_due > 0 && paid_amount > 0 → status = 'partially_paid'
- balance_due = total && paid_amount = 0 → status unchanged
```

---

## Common Error Responses

### 400 Bad Request
```json
{
  "success": false,
  "error": {
    "message": "Payment amount exceeds balance due (10930)"
  }
}
```

### 403 Forbidden
```json
{
  "success": false,
  "error": {
    "message": "Only admin, sales_manager, or accountant can create invoices"
  }
}
```

### 404 Not Found
```json
{
  "success": false,
  "error": {
    "message": "Invoice not found"
  }
}
```

### 422 Validation Failed
```json
{
  "success": false,
  "error": {
    "message": "Validation failed",
    "details": {
      "items": ["At least one item is required"],
      "discountValue": ["Discount value must be >= 0"]
    }
  }
}
```

### 500 Internal Server Error
```json
{
  "success": false,
  "error": {
    "message": "Internal server error"
  }
}
```
