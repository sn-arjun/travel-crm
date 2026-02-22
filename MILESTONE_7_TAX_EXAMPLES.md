# Milestone 7: Tax Calculation Examples

## GST System (India)

### Scenario 1: Same State (CGST + SGST)

**Setup:**
- Company State: Maharashtra
- Customer State: Maharashtra
- Item: Hotel stay
  - Quantity: 1
  - Rate: 10,000
  - Tax Rate: 18% (GST)

**Calculation:**
```
Subtotal:          10,000
Discount (0%):          0
Taxable Amount:    10,000
  CGST (9%):         900
  SGST (9%):         900
Total Tax:         1,800
Total Amount:     11,800
```

**Database Storage:**
```json
{
  "subtotal": 10000,
  "discountAmount": 0,
  "taxableAmount": 10000,
  "taxType": "gst",
  "cgst": 900,
  "sgst": 900,
  "igst": 0,
  "totalTax": 1800,
  "total": 11800
}
```

---

### Scenario 2: Different State (IGST)

**Setup:**
- Company State: Maharashtra
- Customer State: Tamil Nadu
- Item: Flight booking
  - Quantity: 2
  - Rate: 5,000
  - Tax Rate: 5% (GST)

**Calculation:**
```
Subtotal:          10,000
Discount (0%):          0
Taxable Amount:    10,000
  IGST (5%):         500
Total Tax:           500
Total Amount:     10,500
```

**Database Storage:**
```json
{
  "subtotal": 10000,
  "discountAmount": 0,
  "taxableAmount": 10000,
  "taxType": "gst",
  "cgst": 0,
  "sgst": 0,
  "igst": 500,
  "totalTax": 500,
  "total": 10500
}
```

---

### Scenario 3: Multiple Items with Invoice-Level Discount

**Setup:**
- Company State: Karnataka
- Customer State: Karnataka
- Items:
  1. Hotel (1 night @ 5,000 @ 18%)
  2. Transport (1 @ 2,000 @ 12%)
  3. Activities (1 @ 1,000 @ 5%)
- Invoice-Level Discount: 10% (Percentage)

**Calculation:**
```
Item 1 (Hotel):
  Subtotal:        5,000
  Tax (18%):         900
  Item Total:      5,900

Item 2 (Transport):
  Subtotal:        2,000
  Tax (12%):         240
  Item Total:      2,240

Item 3 (Activities):
  Subtotal:        1,000
  Tax (5%):          50
  Item Total:      1,050

Sum of Items:      8,000
Invoice Discount:   -800  (10% of 8,000)
Taxable Amount:    7,200

CGST (split proportionally):
  Hotel:   450 (50% of 900)
  Transport: 120 (50% of 240)
  Activities: 25 (50% of 50)
  Total:   595

SGST (split proportionally):
  Hotel:   450
  Transport: 120
  Activities: 25
  Total:   595

Total Tax:        1,190
Total Amount:     8,390
```

**Database Storage:**
```json
{
  "subtotal": 8000,
  "discountType": "percentage",
  "discountValue": 10,
  "discountAmount": 800,
  "taxableAmount": 7200,
  "taxType": "gst",
  "cgst": 595,
  "sgst": 595,
  "igst": 0,
  "totalTax": 1190,
  "total": 8390
}
```

---

### Scenario 4: Line-Item Discount + Tax

**Setup:**
- Single Item
  - Quantity: 2
  - Rate: 5,000 (per unit)
  - Discount: 20%
  - Tax Rate: 18%

**Calculation:**
```
Subtotal:          10,000 (2 × 5,000)
Item Discount:      -2,000 (20% of 10,000)
Taxable Amount:     8,000
  CGST (9%):          360
  SGST (9%):          360
Total Tax:            720
Total Amount:       8,720
```

---

## VAT System (EU/UK)

### Scenario 5: VAT on Service

**Setup:**
- System: VAT
- Item: Consulting Service
  - Quantity: 8
  - Rate: 100 (per hour)
  - Tax Rate: 20% (VAT)

**Calculation:**
```
Subtotal:            800
Discount:              0
Taxable Amount:      800
  VAT (20%):         160
Total Tax:           160
Total Amount:        960
```

**Database Storage:**
```json
{
  "subtotal": 800,
  "discountAmount": 0,
  "taxableAmount": 800,
  "taxType": "vat",
  "cgst": 0,
  "sgst": 0,
  "igst": 0,
  "vatAmount": 160,
  "totalTax": 160,
  "total": 960
}
```

---

## No Tax Scenario

### Scenario 6: Exempt Item

**Setup:**
- Item: Travel Advice
  - Quantity: 1
  - Rate: 500
  - Tax Rate: 0% (Exempt)

**Calculation:**
```
Subtotal:            500
Discount:              0
Taxable Amount:      500
  Tax (0%):            0
Total Tax:             0
Total Amount:        500
```

**Database Storage:**
```json
{
  "subtotal": 500,
  "discountAmount": 0,
  "taxableAmount": 500,
  "taxType": "none",
  "cgst": 0,
  "sgst": 0,
  "igst": 0,
  "vatAmount": 0,
  "totalTax": 0,
  "total": 500
}
```

---

## Complex Invoice Example

### Full Scenario: Travel Package with Mixed Taxes

**Invoice Details:**
- Customer: ABC Travel Agency
- Company Location: Delhi (DL)
- Customer Location: Mumbai (MH) - Different State
- Issue Date: 2024-02-15
- Due Date: 2024-03-15

**Line Items:**
```
1. Hotel Stay (Mumbai)
   - Quantity: 3 nights
   - Rate: 4,000 per night
   - Discount: 5% (early booking)
   - Tax Rate: 18%

2. Flight Booking (Domestic)
   - Quantity: 2 passengers
   - Rate: 3,000 per ticket
   - Discount: 0%
   - Tax Rate: 5%

3. Transfer & Activities
   - Quantity: 1
   - Rate: 2,000
   - Discount: 0%
   - Tax Rate: 18%

4. Visa Assistance (Service)
   - Quantity: 1
   - Rate: 1,500
   - Discount: 0%
   - Tax Rate: 0% (Exempt)
```

**Detailed Calculation:**

Item 1 - Hotel:
```
Subtotal:    12,000 (3 × 4,000)
Discount:       600 (5% early booking)
Taxable:    11,400
IGST (18%): 2,052 (different state → IGST)
Item Total: 13,452
```

Item 2 - Flight:
```
Subtotal:     6,000 (2 × 3,000)
Discount:         0
Taxable:      6,000
IGST (5%):      300 (different state → IGST)
Item Total:   6,300
```

Item 3 - Transfer:
```
Subtotal:     2,000
Discount:         0
Taxable:      2,000
IGST (18%):     360 (different state → IGST)
Item Total:   2,360
```

Item 4 - Visa:
```
Subtotal:     1,500
Discount:         0
Taxable:      1,500
Tax (0%):         0
Item Total:   1,500
```

**Invoice Totals:**
```
Subtotal:          21,500
Less: Discount:       -600
Taxable Amount:    20,900

Tax Breakdown (IGST - Different State):
  Hotel IGST:       2,052
  Flight IGST:        300
  Transfer IGST:      360
  Visa Tax:             0
  Total IGST:       2,712

Total Tax:         2,712
Total Amount:     23,612

Payment Terms: Net 30 days
Due Date: 2024-03-15
```

**Database Records:**

Invoice Record:
```json
{
  "id": "inv-789",
  "invoiceNumber": "INV-2024-0089",
  "contactId": "contact-456",
  "type": "tax_invoice",
  "subtotal": 21500,
  "discountType": "fixed",
  "discountValue": 600,
  "discountAmount": 600,
  "taxableAmount": 20900,
  "taxType": "gst",
  "cgst": 0,
  "sgst": 0,
  "igst": 2712,
  "vatAmount": 0,
  "totalTax": 2712,
  "total": 23612,
  "currency": "INR",
  "status": "sent",
  "dueDate": "2024-03-15",
  "paidAmount": 0,
  "balanceDue": 23612,
  "createdAt": "2024-02-15T10:30:00Z"
}
```

Invoice Items:
```json
[
  {
    "id": "item-1",
    "invoiceId": "inv-789",
    "description": "Hotel Stay - 3 nights @ Mumbai",
    "quantity": 3,
    "rate": 4000,
    "discountPercent": 5,
    "taxableAmount": 11400,
    "taxRate": 18,
    "taxAmount": 2052,
    "amount": 13452,
    "sortOrder": 0
  },
  {
    "id": "item-2",
    "invoiceId": "inv-789",
    "description": "Flight Booking - 2 Passengers",
    "quantity": 2,
    "rate": 3000,
    "discountPercent": 0,
    "taxableAmount": 6000,
    "taxRate": 5,
    "taxAmount": 300,
    "amount": 6300,
    "sortOrder": 1
  },
  {
    "id": "item-3",
    "invoiceId": "inv-789",
    "description": "Airport Transfer & City Activities",
    "quantity": 1,
    "rate": 2000,
    "discountPercent": 0,
    "taxableAmount": 2000,
    "taxRate": 18,
    "taxAmount": 360,
    "amount": 2360,
    "sortOrder": 2
  },
  {
    "id": "item-4",
    "invoiceId": "inv-789",
    "description": "Visa Assistance (Exempt)",
    "quantity": 1,
    "rate": 1500,
    "discountPercent": 0,
    "taxableAmount": 1500,
    "taxRate": 0,
    "taxAmount": 0,
    "amount": 1500,
    "sortOrder": 3
  }
]
```

---

## Payment Tracking Example

**Timeline:**

1. **2024-02-15:** Invoice created (due date: 2024-03-15)
   ```json
   {
     "status": "sent",
     "total": 23612,
     "paidAmount": 0,
     "balanceDue": 23612
   }
   ```

2. **2024-02-25:** Partial payment of 10,000
   ```json
   {
     "status": "partially_paid",
     "total": 23612,
     "paidAmount": 10000,
     "balanceDue": 13612
   }
   ```

3. **2024-03-10:** Payment of 8,000
   ```json
   {
     "status": "partially_paid",
     "total": 23612,
     "paidAmount": 18000,
     "balanceDue": 5612
   }
   ```

4. **2024-03-15:** Payment of 5,612 (Full payment)
   ```json
   {
     "status": "paid",
     "total": 23612,
     "paidAmount": 23612,
     "balanceDue": 0
   }
   ```

---

## Credit Note Example

**Original Invoice:** INV-2024-0089 (Total: 23,612)
**Credit Reason:** Customer cancelled 1 hotel night

**Credit Note:** CN-2024-0001
```
Item: Hotel refund - 1 night @ 4,000
Subtotal:      4,000
Less Discount:   -200 (5% early booking applied)
Taxable:       3,800
IGST (18%):      684
Total Credit:  4,484
```

**Journal Entry:**
```
Before Credit:
  Balance Due: 5,612

Apply Credit: -4,484
  New Balance Due: 1,128
  Status: partially_paid → partially_paid
```

---

## Tax Rate Validation

**Supported Tax Rates:**
```
Rate  | Use Case
------|---------------------------
  0%  | Exempt services, certain items
  5%  | Transport, Essential goods
 12%  | Hotel rooms in some regions
 18%  | Standard (Hotel, Restaurant, Most services)
 28%  | High-value items, Luxury goods
```

Invalid rates will fail validation:
```
POST /api/v1/invoices
{
  "items": [
    {
      "taxRate": 15  // ❌ INVALID - not in [0, 5, 12, 18, 28]
    }
  ]
}

Response: 422 Validation failed
```

---

## Edge Cases

### 1. Rounding
All amounts rounded to 2 decimal places:
```
Subtotal: 10,000.00
Tax (18%): 1,800.00 (not 1,800.001)
Total: 11,800.00
```

### 2. Zero Tax
```
Taxable Amount: 5,000
Tax Rate: 0%
Tax Amount: 0
Total: 5,000
```

### 3. Very Small Discount
```
Subtotal: 10,000
Discount: 0.5% (fixed amount, not percent)
Discounted: 9,999.50
```

### 4. Multiple Discounts
Only one discount per invoice (invoice-level) + one per item (item-level)
```
Subtotal: 10,000
Item Discount: -1,000 (10%)
Subtotal After Item: 9,000
Invoice Discount: -900 (10% of 9,000)
Taxable: 8,100
```
