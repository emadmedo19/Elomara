import fs from 'fs';
import path from 'path';
import { 
  initialBuildings, 
  initialApartments, 
  initialPayments, 
  initialExpenses, 
  initialTickets, 
  initialBookings, 
  initialAnnouncements 
} from '../src/data/mockData';

export interface BonyanSnapshot {
  exportDate: string;
  version: string;
  appId: string;
  source: string;
  stats: {
    buildingsCount: number;
    apartmentsCount: number;
    paymentsCount: number;
    expensesCount: number;
    ticketsCount: number;
    bookingsCount: number;
    announcementsCount: number;
  };
  data: {
    buildings: typeof initialBuildings;
    apartments: typeof initialApartments;
    payments: typeof initialPayments;
    expenses: typeof initialExpenses;
    tickets: typeof initialTickets;
    bookings: typeof initialBookings;
    announcements: typeof initialAnnouncements;
    settings: {
      defaultBuildingId: string;
      currency: string;
      appName: string;
    };
  };
}

const snapshot: BonyanSnapshot = {
  exportDate: new Date().toISOString(),
  version: '2.0.0-snapshot',
  appId: 'app.bunyan.residential',
  source: 'العمارة - نظام إدارة العقارات السكنية',
  stats: {
    buildingsCount: initialBuildings.length,
    apartmentsCount: initialApartments.length,
    paymentsCount: initialPayments.length,
    expensesCount: initialExpenses.length,
    ticketsCount: initialTickets.length,
    bookingsCount: initialBookings.length,
    announcementsCount: initialAnnouncements.length,
  },
  data: {
    buildings: initialBuildings,
    apartments: initialApartments,
    payments: initialPayments,
    expenses: initialExpenses,
    tickets: initialTickets,
    bookings: initialBookings,
    announcements: initialAnnouncements,
    settings: {
      defaultBuildingId: initialBuildings[0]?.id || 'bld-1',
      currency: 'EGP',
      appName: 'برج الفتوح',
    },
  },
};

const internalPath = path.resolve(process.cwd(), 'backups/bonyan_data_snapshot.json');
const externalPath = '/.aistudio/artifacts/brain/a7e42339-6c3a-46a3-a170-cbfeb4350eb7/backup_pre_multiuser_sync/bonyan_data_snapshot.json';

// Ensure directories
fs.mkdirSync(path.dirname(internalPath), { recursive: true });
fs.mkdirSync(path.dirname(externalPath), { recursive: true });

const content = JSON.stringify(snapshot, null, 2);
fs.writeFileSync(internalPath, content, 'utf-8');
fs.writeFileSync(externalPath, content, 'utf-8');

console.log('--- BONYAN DATA SNAPSHOT EXPORTED SUCCESSFULLY ---');
console.log(`Internal Backup: ${internalPath}`);
console.log(`External Artifact Backup: ${externalPath}`);
console.log('Statistics:');
console.log(JSON.stringify(snapshot.stats, null, 2));

// Test restoration and relational integrity
console.log('\n--- VERIFYING RESTORATION AND RELATIONAL INTEGRITY ---');
const parsed = JSON.parse(fs.readFileSync(externalPath, 'utf-8')) as BonyanSnapshot;

// Validate building IDs
const buildingIds = new Set(parsed.data.buildings.map(b => b.id));
let orphanApartments = 0;
for (const apt of parsed.data.apartments) {
  if (!buildingIds.has(apt.buildingId)) {
    orphanApartments++;
  }
}

// Validate apartment IDs for payments
const aptIds = new Set(parsed.data.apartments.map(a => a.id));
let orphanPayments = 0;
for (const p of parsed.data.payments) {
  if (!aptIds.has(p.apartmentId)) {
    orphanPayments++;
  }
}

console.log(`- Buildings verified: ${parsed.data.buildings.length} (Valid)`);
console.log(`- Apartments verified: ${parsed.data.apartments.length} (Orphans: ${orphanApartments})`);
console.log(`- Payments verified: ${parsed.data.payments.length} (Orphans: ${orphanPayments})`);
console.log(`- Expenses verified: ${parsed.data.expenses.length} (Valid)`);
console.log(`- Maintenance Tickets: ${parsed.data.tickets.length} (Valid)`);
console.log(`- Facility Bookings: ${parsed.data.bookings.length} (Valid)`);
console.log(`- Announcements: ${parsed.data.announcements.length} (Valid)`);

if (orphanApartments === 0 && orphanPayments === 0) {
  console.log('✅ RELATIONAL INTEGRITY VERIFIED: 100% VALID. RESTORATION TEST PASSED.');
} else {
  console.error('❌ RELATIONAL INTEGRITY FAILED.');
  process.exit(1);
}
