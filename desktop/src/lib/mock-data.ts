// Mock data for development — will be replaced with real API calls
// Use a fixed reference date instead of Date.now() to prevent SSR hydration mismatches
import type { Lead, Contact, FollowUp, Invoice, DashboardKPIs, PipelineOverview } from '@travelcrm/shared';

const REF_DATE = Date.now();

const contacts: Contact[] = Array.from({ length: 30 }, (_, i) => ({
  id: `contact-${i + 1}`,
  name: ['Rahul Sharma', 'Priya Patel', 'Amit Kumar', 'Sneha Reddy', 'Vikram Singh', 'Ananya Gupta', 'Kiran Desai', 'Meera Nair', 'Rajesh Joshi', 'Pooja Verma', 'Suresh Menon', 'Deepa Iyer', 'Arjun Rao', 'Kavitha Pillai', 'Nikhil Saxena', 'Ritu Chandra', 'Sanjay Mehta', 'Lakshmi Bhat', 'Arun Krishnan', 'Divya Shetty', 'Manoj Tiwari', 'Swati Kulkarni', 'Ramesh Agarwal', 'Neha Jain', 'Prakash Nambiar', 'Asha Rajan', 'Vivek Malhotra', 'Sunita Hegde', 'Gaurav Kapoor', 'Anita Das'][i]!,
  email: `contact${i + 1}@example.com`,
  phone: `+91 98765 ${String(43210 + i).slice(0, 5)}`,
  type: 'customer' as const,
  tags: [['vip', 'frequent'][i % 3], ['honeymoon', 'family', 'business', 'adventure'][i % 4]].filter(Boolean) as string[],
  createdBy: 'user-1',
  createdAt: new Date(REF_DATE - i * 86400000 * 3).toISOString(),
  updatedAt: new Date(REF_DATE - i * 86400000).toISOString(),
}));

const statuses = ['new', 'contacted', 'qualified', 'proposal_sent', 'negotiation', 'won', 'lost', 'on_hold'] as const;
const priorities = ['hot', 'warm', 'cold'] as const;
const sources = ['manual', 'website', 'facebook', 'google', 'referral', 'walkin'] as const;
const destinations = ['Maldives', 'Bali', 'Dubai', 'Thailand', 'Europe Tour', 'Goa', 'Kashmir', 'Kerala', 'Singapore', 'Japan', 'Swiss Alps', 'New Zealand', 'Ladakh', 'Manali', 'Rajasthan'];

// Deterministic AI scores (no Math.random) to prevent hydration mismatches
const aiScores = [85, 72, 91, 68, 77, 94, 63, 88, 79, 96, 71, 83, 90, 65, 87, 74, 92, 69, 81, 95, 73, 86, 78, 93, 67, 84, 76, 89, 70, 97, 82, 75, 91, 66, 88, 80, 94, 72, 85, 98, 69, 83, 77, 90, 64, 87, 73, 92, 68, 81] as const;

const leads: Lead[] = Array.from({ length: 50 }, (_, i) => ({
  id: `lead-${i + 1}`,
  contactId: contacts[i % contacts.length]!.id,
  contact: contacts[i % contacts.length]!,
  title: `${destinations[i % destinations.length]!} ${(['Trip', 'Package', 'Tour', 'Vacation', 'Honeymoon'] as const)[i % 5]}`,
  destination: destinations[i % destinations.length]!,
  travelDate: new Date(REF_DATE + (i + 10) * 86400000).toISOString().split('T')[0]!,
  returnDate: new Date(REF_DATE + (i + 17) * 86400000).toISOString().split('T')[0]!,
  paxAdults: (i % 4) + 1,
  paxChildren: i % 3,
  paxInfants: i % 2,
  budget: ([50000, 75000, 100000, 150000, 200000, 300000, 500000] as const)[i % 7],
  currency: 'INR' as const,
  tripType: i % 3 === 0 ? 'international' as const : 'domestic' as const,
  source: sources[i % sources.length]!,
  status: statuses[i % statuses.length]!,
  priority: priorities[i % priorities.length]!,
  assignedTo: `user-${(i % 5) + 1}`,
  assignedUser: { id: `user-${(i % 5) + 1}`, name: (['Arjun S', 'Priya M', 'Rahul K', 'Sneha D', 'Vikram P'] as const)[i % 5]!, email: `user${(i % 5) + 1}@travelcrm.io`, role: 'salesperson' as const, language: 'en', isActive: true, createdAt: '', updatedAt: '' },
  aiScore: aiScores[i]!,
  createdBy: 'user-1',
  createdAt: new Date(REF_DATE - i * 86400000 * 2).toISOString(),
  updatedAt: new Date(REF_DATE - i * 86400000).toISOString(),
}));

const followUps: FollowUp[] = Array.from({ length: 20 }, (_, i) => ({
  id: `followup-${i + 1}`,
  leadId: leads[i % leads.length]!.id,
  lead: leads[i % leads.length]!,
  userId: `user-${(i % 5) + 1}`,
  user: leads[i % leads.length]!.assignedUser,
  type: (['call', 'email', 'whatsapp', 'meeting', 'task'] as const)[i % 5]!,
  scheduledAt: new Date(REF_DATE + (i - 5) * 86400000).toISOString(),
  completedAt: i < 8 ? new Date(REF_DATE - (8 - i) * 86400000).toISOString() : undefined,
  notes: `Follow up on ${leads[i % leads.length]!.title}`,
  createdAt: new Date(REF_DATE - i * 86400000 * 2).toISOString(),
}));

export const mockData = {
  contacts,
  leads,
  followUps,
  getLeadsByStatus: (status: string) => leads.filter((l) => l.status === status),
  getLeadById: (id: string) => leads.find((l) => l.id === id),
  getContactById: (id: string) => contacts.find((c) => c.id === id),
  getFollowUpsForLead: (leadId: string) => followUps.filter((f) => f.leadId === leadId),
  dashboardKPIs: {
    newLeads: { count: 24, trend: 12 },
    followUpsToday: { count: 8 },
    revenueThisMonth: { amount: 2450000, currency: 'INR' as const, trend: 8.5 },
    bookingsThisMonth: { count: 18, trend: -3 },
    collectionRate: { percentage: 78 },
  } satisfies DashboardKPIs,
  pipelineOverview: {
    stages: statuses.filter(s => s !== 'won' && s !== 'lost').map((status, i) => ({
      status,
      count: ([12, 8, 6, 4, 3, 2] as const)[i] ?? 2,
      totalValue: ([1200000, 800000, 900000, 600000, 450000, 200000] as const)[i] ?? 100000,
    })),
  } satisfies PipelineOverview,
};
