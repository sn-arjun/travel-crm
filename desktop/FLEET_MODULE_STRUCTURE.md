# Fleet Management Module - TravelCRM

## Module Overview
The Fleet Management module is the CORE USP feature of TravelCRM, providing comprehensive vehicle, driver, and trip management capabilities.

## Technology Stack
- **Framework**: Next.js 16 with React 19
- **UI Components**: shadcn/ui v4
- **Styling**: Tailwind CSS v4
- **State Management**: Zustand
- **TypeScript**: Strict mode enabled

## File Structure

### 1. State Management
```
/src/stores/
├── fleet-store.ts          # Zustand store for fleet UI state
│   ├── activeTab (dashboard | vehicles | drivers | trips | rate-cards | alerts)
│   ├── vehicleView (grid | table)
│   ├── driverView (grid | table)
│   ├── tripView (kanban | table)
│   └── Actions: setActiveTab, setVehicleView, setDriverView, setTripView
```

### 2. Mock Data & Utils
```
/src/lib/
├── fleet-mock-data.ts      # Complete mock data for development
│   ├── mockVehicles[]       # 12 vehicles with full details
│   ├── mockDrivers[]        # 10 drivers with ratings & stats
│   ├── mockTrips[]          # 15 trips with status tracking
│   ├── mockRateCards[]      # 8 pricing tiers
│   └── mockFleetAlerts[]    # 5 alert examples
```

### 3. Pages & Routes
```
/src/app/(app)/fleet/
├── page.tsx                 # Fleet Dashboard (Main Hub)
│   ├── Stats Card Component (4 KPIs)
│   ├── Active Trips Section (6 latest)
│   ├── Upcoming Trips Card (5 upcoming)
│   ├── Alerts Section (4 critical alerts)
│   └── Top Drivers Leaderboard (5 top performers)
│
├── vehicles/
│   ├── page.tsx            # Vehicles List (Grid/Table View)
│   │   ├── Vehicle Cards (Grid View)
│   │   ├── Table View with all details
│   │   ├── Search by registration/make/model
│   │   ├── Filter by status & vehicle type
│   │   └── Action menu per vehicle
│   │
│   ├── new/                # Add New Vehicle (TODO: Create)
│   │   └── page.tsx        # Vehicle creation form
│   │
│   └── [id]/               # Vehicle Detail View (TODO: Create)
│       └── page.tsx        # Edit/View vehicle details
│
├── drivers/                 # (TODO: Create)
│   ├── page.tsx            # Drivers List
│   ├── new/                # Add New Driver
│   └── [id]/               # Driver Details
│
├── trips/                   # (TODO: Create)
│   ├── page.tsx            # Trips Management
│   ├── new/                # Create New Trip
│   └── [id]/               # Trip Details
│
├── rate-cards/            # (TODO: Create)
│   ├── page.tsx           # Rate Cards List
│   ├── new/               # Create Rate Card
│   └── [id]/              # Rate Card Details
│
└── alerts/                # (TODO: Create)
    └── page.tsx           # All Alerts & Notifications
```

## Core Components Created

### 1. Fleet Dashboard Page (/fleet/page.tsx)
- **Stats Section**: 4 KPI cards (Vehicles, Drivers, Active Trips, MTD Revenue)
- **Active Trips Section**: Real-time trip tracking with status badges
- **Upcoming Trips**: Next 5 trips with quick info
- **Alerts Widget**: Critical document expiry alerts
- **Top Drivers Leaderboard**: Performance metrics & ratings
- **Action Buttons**: Quick add vehicle, driver, or trip

Features:
- Currency formatting helper (₹ in K/L notation)
- Color-coded status badges
- Document expiry warnings
- Real-time metrics calculation

### 2. Vehicles List Page (/fleet/vehicles/page.tsx)
- **Dual View Modes**:
  - Grid View: Card-based layout with vehicle summary
  - Table View: Detailed table with all attributes

Features:
- **Search**: By registration number, make, or model
- **Filters**: By vehicle status & type
- **Cards Display**:
  - Registration (bold mono)
  - Make, Model, Year
  - Vehicle Type & Seating
  - Document expiry indicators
  - Odometer reading & Color
  - Status badge

- **Table Columns**:
  - Registration
  - Vehicle (make/model/year)
  - Type
  - Seating Capacity
  - Odometer
  - Insurance Expiry
  - Status
  - Actions Menu

- **Document Expiry Badges**:
  - Color-coded by urgency (red: overdue, amber: 0-7d, green: 30+d)
  - Shows days remaining or overdue

### 3. Fleet Store (fleet-store.ts)
Manages UI state for the entire fleet module:
- Active tab tracking
- View preference persistence (grid/table)
- Multi-view support (kanban for trips)

## Mock Data Structure

### Vehicles (12)
- Registration numbers (KA, MH, DL, TN plates)
- Types: sedan, suv, muv, tempo_traveller, mini_bus, bus, luxury_coach
- Statuses: available, on_trip, under_maintenance, out_of_service
- Document tracking: insurance, permit, pollution
- Real Indian vehicle brands

### Drivers (10)
- Rating: 3.5-5.0 scale
- Status: active, on_trip, off_duty, on_leave
- Revenue metrics
- License tracking with expiry

### Trips (15)
- Types: one_way, round_trip, airport_pickup, airport_drop, local_8h80km, local_12h120km, outstation
- Status: assigned, accepted, en_route, started, completed, cancelled
- Full pricing: base fare + distance + hourly rates
- Vehicle & driver assignment

### Rate Cards (8)
- Vehicle type-specific pricing
- Trip type-specific rates
- Components:
  - Base fare
  - Per km & per hour rates
  - Minimum distance/hours
  - Night charges
  - Driver allowance
  - Extra km/hour rates
  - Toll & parking options

### Alerts (5)
- Document expiry alerts
- Maintenance due notices
- Urgency levels: critical, warning, overdue
- Days remaining tracking

## Key Features Implemented

1. **Dashboard Analytics**
   - KPI cards with real-time calculations
   - Revenue tracking (MTD)
   - Vehicle availability percentage
   - Active driver count

2. **Vehicle Management**
   - Grid & table view toggle
   - Advanced search & filtering
   - Document expiry tracking
   - Odometer & maintenance tracking
   - Color-coded status indicators

3. **Status Management**
   - Vehicle status colors
   - Driver status indicators
   - Trip status badges
   - Alert urgency levels

4. **UI/UX Standards**
   - Consistent badge styling with custom colors
   - Responsive grid layouts
   - Accessible dropdown menus
   - Loading & empty states
   - Truncation for long text

## TypeScript Strict Mode Compliance
All files use TypeScript strict mode with:
- Non-null assertions for array access: `arr[i]!`
- Safe string splitting: `str.split('T')[0]!`
- Proper type definitions for all data structures
- Type-safe enums for statuses and labels

## Shared Constants Used
Imported from @travelcrm/shared:
- `VEHICLE_TYPE_LABELS`
- `VEHICLE_STATUS_LABELS`
- `VEHICLE_STATUS_COLORS`
- `DRIVER_STATUS_LABELS`
- `TRIP_STATUS_LABELS`
- `TRIP_STATUS_COLORS`
- `FLEET_TRIP_TYPE_LABELS`

## Next Steps - TODO Items

### Phase 2: Complete Vehicle Management
- [ ] Create: /fleet/vehicles/new/page.tsx (Vehicle creation form)
- [ ] Detail: /fleet/vehicles/[id]/page.tsx (Edit vehicle)

### Phase 3: Driver Management
- [ ] Create: /fleet/drivers/page.tsx (Driver list)
- [ ] Create: /fleet/drivers/new/page.tsx (Driver form)
- [ ] Create: /fleet/drivers/[id]/page.tsx (Driver details)

### Phase 4: Trip Management
- [ ] Create: /fleet/trips/page.tsx (Trips Kanban/Table)
- [ ] Create: /fleet/trips/new/page.tsx (Trip creation)
- [ ] Create: /fleet/trips/[id]/page.tsx (Trip tracking)

### Phase 5: Rate Cards Management
- [ ] Create: /fleet/rate-cards/page.tsx (Rate cards list)
- [ ] Create: /fleet/rate-cards/new/page.tsx (Create rate card)
- [ ] Create: /fleet/rate-cards/[id]/page.tsx (Edit rate card)

### Phase 6: Alerts & Notifications
- [ ] Create: /fleet/alerts/page.tsx (All alerts)
- [ ] Document expiry workflows
- [ ] Maintenance alert system

### Phase 7: Advanced Features
- [ ] Real-time GPS tracking map
- [ ] Trip assignment workflow
- [ ] Driver performance analytics
- [ ] Revenue analytics & reports
- [ ] Document expiry automation
- [ ] Maintenance schedule management
- [ ] Insurance & permit renewal reminders
- [ ] Rate card versioning & history

## Data Relationships
```
Vehicle ──> Driver (1:N via assignments)
Vehicle ──> Trip (1:N)
Driver ──> Trip (1:N)
Vehicle Type ──> Rate Card (1:N)
Trip ──> RateCard (N:1)
Trip ──> Alert (1:N via document tracking)
```

## Document Expiry Calculation
```javascript
daysRemaining = Math.ceil((expiryDate - now) / 86400000)
// Negative = overdue
// 0-7 days = critical
// 7-30 days = warning
// 30+ days = normal
```

## Color Coding System
- **Vehicle Status**: Blue (available), Green (on_trip), Amber (maintenance), Red (out_of_service)
- **Trip Status**: Green (completed), Blue (in progress), Amber (assigned), Red (cancelled)
- **Alert Urgency**: Red (overdue), Amber (critical), Blue (warning)
- **Document Expiry**: Red (overdue), Amber (0-7d), Green (safe)

## Performance Considerations
- Mock data uses Array.from() for efficient generation
- Filtered lists use useMemo for optimal re-renders
- View toggle persists in Zustand store
- No external API calls (mock data only)
- Optimized grid layouts with responsive columns

## Accessibility
- Semantic HTML structure
- ARIA labels on badge components
- Keyboard navigation support
- Color not sole indicator (icons + text)
- Proper heading hierarchy
