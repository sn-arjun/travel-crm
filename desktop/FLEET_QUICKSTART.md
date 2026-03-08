# Fleet Management Module - Quick Start Guide

## Files Created

### 1. State Management
```
/src/stores/fleet-store.ts (852 bytes)
```
- Zustand store for fleet UI state
- Manages: activeTab, vehicleView, driverView, tripView
- Persists view preferences

### 2. Mock Data
```
/src/lib/fleet-mock-data.ts (8.7 KB)
```
Complete mock data for development:
- **mockVehicles[]**: 12 fully configured vehicles
- **mockDrivers[]**: 10 drivers with ratings
- **mockTrips[]**: 15 trips with assignments
- **mockRateCards[]**: 8 pricing tiers
- **mockFleetAlerts[]**: 5 alert examples

### 3. Pages Created

#### Fleet Dashboard
```
/src/app/(app)/fleet/page.tsx (192 lines, 11 KB)
```
Main hub with:
- 4 KPI stat cards (Total Vehicles, Total Drivers, Active Trips, MTD Revenue)
- Active Trips section (displays 6 latest trips)
- Upcoming Trips widget (next 5 trips)
- Critical Alerts section (4 highest priority)
- Top Performing Drivers leaderboard (5 drivers)
- Quick action buttons (Add Vehicle, Add Driver, New Trip)

Features:
- Real-time metrics calculation
- Currency formatting (₹K, ₹L notation)
- Color-coded status badges
- Responsive grid layout (2 col mobile, 4 col desktop)

#### Vehicles List
```
/src/app/(app)/fleet/vehicles/page.tsx (164 lines, 9 KB)
```
Complete vehicle management interface:
- **Grid View**: Cards with vehicle summary
- **Table View**: Detailed table with all columns
- **Search**: By registration, make, or model
- **Filters**: By status and vehicle type
- **Cards Include**:
  - Registration number (bold mono)
  - Make, model, year
  - Vehicle type & seating capacity
  - Document expiry indicators
  - Odometer reading
  - Color
  - Status badge

- **Table Columns**:
  - Registration
  - Vehicle details
  - Type
  - Capacity
  - Odometer
  - Insurance expiry
  - Status
  - Actions menu

Features:
- View toggle (grid/table) persists in Zustand
- Advanced filtering with Select dropdowns
- Document expiry color coding:
  - Red: Overdue
  - Amber: 0-7 days remaining
  - Green: 30+ days safe
- Responsive grid (1 col mobile → 4 col desktop)

## Directory Structure

```
src/
├── app/(app)/fleet/
│   ├── page.tsx                    # Dashboard
│   ├── vehicles/
│   │   ├── page.tsx               # Vehicle list
│   │   ├── new/
│   │   │   └── [TODO] page.tsx
│   │   └── [id]/
│   │       └── [TODO] page.tsx
│   ├── drivers/                    # [TODO]
│   ├── trips/                      # [TODO]
│   ├── rate-cards/                 # [TODO]
│   └── alerts/                     # [TODO]
├── lib/
│   └── fleet-mock-data.ts          # Mock data
└── stores/
    └── fleet-store.ts              # Zustand store
```

## Key Features

### 1. Vehicle Management
- [x] Dashboard overview
- [x] Vehicle list with grid/table views
- [x] Search & filtering
- [x] Document tracking
- [ ] Add new vehicle form
- [ ] Edit vehicle details
- [ ] Vehicle timeline/history

### 2. Driver Management
- [ ] Driver list with grid/table
- [ ] Driver profiles
- [ ] Rating & performance metrics
- [ ] License tracking
- [ ] Add/edit driver forms

### 3. Trip Management
- [ ] Trip list (kanban/table)
- [ ] Trip creation workflow
- [ ] Real-time assignment
- [ ] Status tracking
- [ ] Trip analytics

### 4. Rate Cards
- [ ] Rate card list
- [ ] Create/edit rate cards
- [ ] Pricing tiers
- [ ] Trip type-specific rates
- [ ] History & versioning

### 5. Alerts System
- [ ] Document expiry alerts
- [ ] Maintenance reminders
- [ ] Alert management
- [ ] Email/SMS integration

## How to Use

### 1. View Fleet Dashboard
Navigate to `/fleet` to see:
- KPI metrics
- Active trips
- Top drivers
- Alerts

### 2. Manage Vehicles
Navigate to `/fleet/vehicles` to:
- View all vehicles (grid or table)
- Search by registration/make/model
- Filter by status or type
- Toggle between view modes
- Click vehicles for actions

### 3. View Mock Data
The module uses 100% mock data from `fleet-mock-data.ts`:
- No API calls required
- Data persists across page refreshes
- Easily replaceable with real API calls

## TypeScript Compliance

All code follows TypeScript strict mode:
```typescript
// Non-null assertions for array access
arr[i]!

// Safe string splitting
str.split('T')[0]!

// Proper type definitions
const status: VehicleStatus = 'available'
```

## Tailwind & shadcn/ui Usage

### Components Used
- Card, CardContent, CardHeader, CardTitle
- Button (variants: primary, secondary, outline, ghost)
- Badge (variants: default, destructive, outline)
- Select with SelectTrigger, SelectContent, SelectItem
- Input
- DropdownMenu
- Table, TableHeader, TableBody, TableRow, TableCell
- Avatar with AvatarFallback

### Styling Patterns
- Responsive grids: `grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4`
- Color system: Using Tailwind v4 with semantic colors
- Custom inline styles for dynamic colors (status badges)
- Dark mode support: `dark:bg-*` classes

## Mock Data Examples

### Vehicle
```typescript
{
  id: 'vehicle-1',
  registrationNumber: 'KA01AB1234',
  type: 'suv',
  make: 'Toyota',
  model: 'Innova Crysta',
  year: 2020,
  seatingCapacity: 7,
  status: 'available',
  odometerReading: 25000,
  insuranceExpiry: '2026-03-15',
  permitExpiry: '2026-05-12',
  pollutionExpiry: '2026-04-18'
}
```

### Driver
```typescript
{
  id: 'driver-1',
  name: 'Rajesh Kumar',
  phone: '+91 98765 43210',
  licenseNumber: 'DL-0001-2024',
  licenseExpiry: '2026-06-10',
  status: 'active',
  rating: 4.8,
  totalTrips: 62,
  totalRevenue: 2170000
}
```

### Trip
```typescript
{
  id: 'trip-1',
  vehicleId: 'vehicle-1',
  driverId: 'driver-1',
  passengerName: 'Rahul Sharma',
  pickupLocation: 'Mumbai Airport',
  dropLocation: 'Hotel Grand Hyatt',
  tripType: 'one_way',
  status: 'started',
  startDate: '2026-03-05',
  estimatedCost: 3000,
  actualCost: 3200
}
```

### Rate Card
```typescript
{
  id: 'rc-1',
  name: 'Sedan Local',
  vehicleType: 'sedan',
  tripType: 'local_8h80km',
  baseFare: 1500,
  perKmRate: 12,
  perHourRate: 100,
  minimumKm: 80,
  minimumHours: 8,
  nightCharge: 250,
  driverAllowance: 200
}
```

## Shared Constants
All constants imported from `@travelcrm/shared`:

```typescript
VEHICLE_TYPE_LABELS = {
  sedan: 'Sedan',
  suv: 'SUV',
  muv: 'MUV',
  tempo_traveller: 'Tempo Traveller',
  mini_bus: 'Mini Bus',
  bus: 'Bus',
  luxury_coach: 'Luxury Coach'
}

VEHICLE_STATUS_LABELS = {
  available: 'Available',
  on_trip: 'On Trip',
  under_maintenance: 'Maintenance',
  out_of_service: 'Out of Service'
}

VEHICLE_STATUS_COLORS = {
  available: '#22c55e',
  on_trip: '#3b82f6',
  under_maintenance: '#f59e0b',
  out_of_service: '#ef4444'
}

TRIP_STATUS_LABELS = {
  assigned: 'Assigned',
  accepted: 'Accepted',
  en_route: 'En Route',
  started: 'Started',
  completed: 'Completed',
  cancelled: 'Cancelled'
}

TRIP_STATUS_COLORS = {
  assigned: '#f59e0b',
  accepted: '#3b82f6',
  en_route: '#06b6d4',
  started: '#8b5cf6',
  completed: '#22c55e',
  cancelled: '#ef4444'
}

FLEET_TRIP_TYPE_LABELS = {
  one_way: 'One Way',
  round_trip: 'Round Trip',
  airport_pickup: 'Airport Pickup',
  airport_drop: 'Airport Drop',
  local_8h80km: 'Local 8H/80KM',
  local_12h120km: 'Local 12H/120KM',
  outstation: 'Outstation'
}
```

## Next Steps

1. **Create Vehicle Form** (`/fleet/vehicles/new/page.tsx`)
   - Form fields for vehicle details
   - Document upload
   - Submit handler

2. **Create Driver Form** (`/fleet/drivers/new/page.tsx`)
   - Driver information fields
   - License upload
   - Emergency contact

3. **Implement Trips Management** (`/fleet/trips/page.tsx`)
   - Kanban board view
   - Trip assignment workflow
   - Real-time updates

4. **Add Rate Cards** (`/fleet/rate-cards/page.tsx`)
   - Rate card creation
   - Pricing logic
   - Version control

5. **Alerts Dashboard** (`/fleet/alerts/page.tsx`)
   - Full alert list
   - Bulk actions
   - Alert filtering

## Performance Notes
- Dashboard loads 15 trips, 10 drivers, 12 vehicles
- Vehicle list filters use useMemo for optimal performance
- View preferences persist in Zustand
- No external API calls (development ready)
- Responsive images via next/image ready
- Ready for pagination on large datasets

## Browser Support
- Modern browsers (Chrome, Firefox, Safari, Edge)
- Dark mode support
- Mobile responsive (mobile-first design)
- Touch-friendly buttons & controls
- Accessible keyboard navigation
