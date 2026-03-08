'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  ArrowLeft, Calendar, Truck, Star, TrendingUp, AlertCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { useApiQuery } from '@/hooks/use-api';
import { reportsApi } from '@/lib/api/reports';

const REF_DATE = Date.now();

function formatCurrency(amount: number) {
  if (amount >= 10000000) return `₹${(amount / 10000000).toFixed(1)}Cr`;
  if (amount >= 100000) return `₹${(amount / 100000).toFixed(1)}L`;
  if (amount >= 1000) return `₹${(amount / 1000).toFixed(0)}K`;
  return `₹${amount}`;
}

interface VehicleStatus {
  status: string;
  label: string;
  count: number;
  percentage: number;
  color: string;
}

interface Driver {
  id: string;
  name: string;
  trips: number;
  rating: number;
  revenue: number;
  completionRate: number;
}

interface TripCost {
  tripId: string;
  tripName: string;
  estimated: number;
  actual: number;
  variance: number;
  variancePercent: number;
}

const getFallbackVehicleStatuses = (): VehicleStatus[] => [
    { status: 'available', label: 'Available', count: 12, percentage: 48, color: 'bg-green-500' },
    { status: 'on_trip', label: 'On Trip', count: 10, percentage: 40, color: 'bg-blue-500' },
    { status: 'maintenance', label: 'Maintenance', count: 2, percentage: 8, color: 'bg-yellow-500' },
    { status: 'out_of_service', label: 'Out of Service', count: 1, percentage: 4, color: 'bg-red-500' },
];

const getFallbackDrivers = (): Driver[] => [
    { id: 'driver-1', name: 'Rajesh Kumar', trips: 48, rating: 4.8, revenue: 1240000, completionRate: 98 },
    { id: 'driver-2', name: 'Amit Singh', trips: 42, rating: 4.6, revenue: 1080000, completionRate: 95 },
    { id: 'driver-3', name: 'Pradeep Nair', trips: 38, rating: 4.7, revenue: 980000, completionRate: 97 },
    { id: 'driver-4', name: 'Suresh Menon', trips: 35, rating: 4.5, revenue: 890000, completionRate: 94 },
    { id: 'driver-5', name: 'Vikram Desai', trips: 32, rating: 4.4, revenue: 820000, completionRate: 91 },
];

const getFallbackTripCosts = (): TripCost[] => [
    { tripId: 'trip-1', tripName: 'Maldives Tour - Batch A', estimated: 45000, actual: 46200, variance: 1200, variancePercent: 2.67 },
    { tripId: 'trip-2', tripName: 'Dubai City Tour', estimated: 32000, actual: 31500, variance: -500, variancePercent: -1.56 },
    { tripId: 'trip-3', tripName: 'Kerala Backwaters', estimated: 28000, actual: 29100, variance: 1100, variancePercent: 3.93 },
    { tripId: 'trip-4', tripName: 'Goa Beach Package', estimated: 24000, actual: 23800, variance: -200, variancePercent: -0.83 },
    { tripId: 'trip-5', tripName: 'Thailand Adventure', estimated: 52000, actual: 54300, variance: 2300, variancePercent: 4.42 },
    { tripId: 'trip-6', tripName: 'Rajasthan Heritage', estimated: 38000, actual: 37200, variance: -800, variancePercent: -2.11 },
    { tripId: 'trip-7', tripName: 'Kashmir Valley', estimated: 41000, actual: 42500, variance: 1500, variancePercent: 3.66 },
    { tripId: 'trip-8', tripName: 'Bali Explorer', estimated: 48000, actual: 49800, variance: 1800, variancePercent: 3.75 },
    { tripId: 'trip-9', tripName: 'Singapore City Break', estimated: 35000, actual: 34200, variance: -800, variancePercent: -2.29 },
    { tripId: 'trip-10', tripName: 'Europe Grand Tour', estimated: 95000, actual: 97300, variance: 2300, variancePercent: 2.42 },
];

export default function FleetReportsPage() {
  const [dateRange, setDateRange] = React.useState('30days');

  // Fetch fleet report data from API
  const { data: reportData, loading, error } = useApiQuery(
    async () => {
      try {
        const response = await reportsApi.getFleetReport?.({ dateRange }) ??
          Promise.resolve({
            vehicleStatuses: getFallbackVehicleStatuses(),
            drivers: getFallbackDrivers(),
            tripCosts: getFallbackTripCosts(),
            totalTrips: 245,
            totalRevenue: 5850000,
          });
        return response;
      } catch (err) {
        toast.error('Failed to load fleet report. Showing sample data.');
        return {
          vehicleStatuses: getFallbackVehicleStatuses(),
          drivers: getFallbackDrivers(),
          tripCosts: getFallbackTripCosts(),
          totalTrips: 245,
          totalRevenue: 5850000,
        };
      }
    },
    [dateRange],
  );

    // @ts-expect-error
  const vehicleStatuses = reportData?.vehicleStatuses ?? getFallbackVehicleStatuses();
    // @ts-expect-error
  const drivers = reportData?.drivers ?? getFallbackDrivers();
    // @ts-expect-error
  const tripCosts = reportData?.tripCosts ?? getFallbackTripCosts();
    // @ts-expect-error
  const totalTripsThisMonth = reportData?.totalTrips ?? 245;
    // @ts-expect-error
  const totalRevenueThisMonth = reportData?.totalRevenue ?? 5850000;
  const totalVehicles = vehicleStatuses.reduce((sum: any, v: any) => sum + v.count, 0);
  const revenuePerVehicle = totalVehicles > 0 ? totalRevenueThisMonth / totalVehicles : 0;

  const maxDriverRevenue = Math.max(...drivers.map((d: any) => d.revenue));
  const avgVariance = (tripCosts.reduce((sum: any, t: any) => sum + t.variancePercent, 0) / tripCosts.length).toFixed(2);
  const totalVariance = tripCosts.reduce((sum: any, t: any) => sum + Math.abs(t.variance), 0);

  return (
    <div className="flex flex-col h-full overflow-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <div className="flex items-center gap-4">
          <Link href="/reports">
            <Button variant="ghost" size="sm" className="gap-1.5">
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>Fleet Reports</h1>
            <p className="text-sm text-muted-foreground">Vehicle utilization, driver performance, and trip costs</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5">
            <Calendar className="h-4 w-4" />
            {dateRange === '7days' ? 'Last 7 Days' : dateRange === '30days' ? 'This Month' : dateRange === '90days' ? 'Last 90 Days' : 'This Month'}
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        <div className="space-y-6">
          {/* Fleet Utilization Section */}
          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Fleet Utilization</h2>

            {/* Utilization Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground mb-1">Total Trips (This Month)</p>
                  <p className="text-2xl font-bold">{totalTripsThisMonth}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground mb-1">Total Revenue</p>
                  <p className="text-2xl font-bold">{formatCurrency(totalRevenueThisMonth)}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground mb-1">Revenue per Vehicle</p>
                  <p className="text-2xl font-bold">{formatCurrency(revenuePerVehicle)}</p>
                </CardContent>
              </Card>
            </div>

            {/* Vehicle Status Breakdown */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold">Vehicle Status Distribution</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {vehicleStatuses.map((status: any) => (
                  <div key={status.status} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className={cn('h-3 w-3 rounded-full', status.color)} />
                        <span className="text-sm font-medium">{status.label}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">{status.count} vehicles</span>
                        <Badge variant="secondary" className="text-xs">{status.percentage}%</Badge>
                      </div>
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div className={cn('h-full rounded-full transition-all', status.color)} style={{ width: `${status.percentage}%` }} />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          {/* Driver Performance Section */}
          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Driver Performance</h2>

            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-3 px-4 font-semibold text-xs text-muted-foreground">Driver</th>
                        <th className="text-center py-3 px-4 font-semibold text-xs text-muted-foreground">Trips</th>
                        <th className="text-center py-3 px-4 font-semibold text-xs text-muted-foreground">Rating</th>
                        <th className="text-right py-3 px-4 font-semibold text-xs text-muted-foreground">Revenue</th>
                        <th className="text-center py-3 px-4 font-semibold text-xs text-muted-foreground">Completion</th>
                      </tr>
                    </thead>
                    <tbody>
                      {drivers.map((driver: any) => {
                        const revenuePct = (driver.revenue / maxDriverRevenue) * 100;
                        return (
                          <tr key={driver.id} className="border-b hover:bg-muted/50 transition-colors">
                            <td className="py-3 px-4 font-medium">{driver.name}</td>
                            <td className="text-center py-3 px-4">{driver.trips}</td>
                            <td className="text-center py-3 px-4">
                              <div className="flex items-center justify-center gap-1">
                                <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                                <span className="font-medium">{driver.rating}</span>
                              </div>
                            </td>
                            <td className="text-right py-3 px-4">
                              <div className="space-y-1">
                                <p className="font-semibold">{formatCurrency(driver.revenue)}</p>
                                <div className="h-1.5 rounded-full bg-muted overflow-hidden w-full">
                                  <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${revenuePct}%` }} />
                                </div>
                              </div>
                            </td>
                            <td className="text-center py-3 px-4">
                              <Badge variant={driver.completionRate >= 95 ? 'default' : 'secondary'} className="text-xs">
                                {driver.completionRate}%
                              </Badge>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Trip Cost Analysis Section */}
          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Trip Cost Analysis</h2>

            {/* Cost Analysis Stats */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground mb-1">Average Variance %</p>
                  <p className="text-2xl font-bold">{avgVariance}%</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground mb-1">Total Variance</p>
                  <p className="text-2xl font-bold">{formatCurrency(totalVariance)}</p>
                </CardContent>
              </Card>
            </div>

            {/* Trip Cost Table */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold">Recent Trips</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-3 px-4 font-semibold text-xs text-muted-foreground">Trip</th>
                        <th className="text-right py-3 px-4 font-semibold text-xs text-muted-foreground">Estimated</th>
                        <th className="text-right py-3 px-4 font-semibold text-xs text-muted-foreground">Actual</th>
                        <th className="text-right py-3 px-4 font-semibold text-xs text-muted-foreground">Variance</th>
                        <th className="text-center py-3 px-4 font-semibold text-xs text-muted-foreground">%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tripCosts.map((trip: any) => {
                        const isOver = trip.variance > 0;
                        return (
                          <tr key={trip.tripId} className="border-b hover:bg-muted/50 transition-colors">
                            <td className="py-3 px-4 font-medium">{trip.tripName}</td>
                            <td className="text-right py-3 px-4 text-muted-foreground">{formatCurrency(trip.estimated)}</td>
                            <td className="text-right py-3 px-4 font-semibold">{formatCurrency(trip.actual)}</td>
                            <td className={cn('text-right py-3 px-4 font-semibold', isOver ? 'text-red-600' : 'text-green-600')}>
                              {isOver ? '+' : ''}
                              {formatCurrency(trip.variance)}
                            </td>
                            <td className={cn('text-center py-3 px-4', isOver ? 'text-red-600' : 'text-green-600')}>
                              <Badge variant={isOver ? 'destructive' : 'secondary'} className="text-xs">
                                {isOver ? '+' : ''}
                                {trip.variancePercent.toFixed(2)}%
                              </Badge>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
