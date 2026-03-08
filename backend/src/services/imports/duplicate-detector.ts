import { eq, or, and } from 'drizzle-orm';
import { DrizzleD1Database } from 'drizzle-orm/d1';
import * as schema from '../../db/tenant-schema';

export type DuplicateStrategy = 'skip' | 'merge' | 'create';

export interface DuplicateCheckResult {
    isDuplicate: boolean;
    duplicateId?: string;
    action: DuplicateStrategy;
}

export class DuplicateDetector {
    public async checkDuplicate(
        db: DrizzleD1Database<typeof schema>,
        importType: string,
        data: any,
        strategy: DuplicateStrategy
    ): Promise<DuplicateCheckResult> {

        if (strategy === 'create') {
            return { isDuplicate: false, action: 'create' };
        }

        let isDuplicate = false;
        let duplicateId: string | undefined = undefined;

        switch (importType) {
            case 'contacts':
                // Match on email OR phone per spec
                if (data.email || data.phone) {
                    const normalizedEmail = data.email ? data.email.toLowerCase().trim() : null;
                    const normalizedPhone = data.phone ? data.phone.replace(/[\s\-\(\)\.]/g, '') : null;
                    let existingContact = null;
                    if (normalizedEmail) {
                        existingContact = await db.query.contacts.findFirst({
                            where: eq(schema.contacts.email, normalizedEmail),
                            columns: { id: true }
                        });
                    }
                    if (!existingContact && normalizedPhone) {
                        existingContact = await db.query.contacts.findFirst({
                            where: eq(schema.contacts.phone, normalizedPhone),
                            columns: { id: true }
                        });
                    }
                    if (existingContact) {
                        isDuplicate = true;
                        duplicateId = existingContact.id;
                    }
                }
                break;

            case 'leads':
                // Match on contact_id + destination + travel_date per spec
                // Fall back to title match if those fields not provided
                if (data.contactId && data.destination && data.travelDate) {
                    const existingLead = await db.query.leads.findFirst({
                        where: and(
                            eq(schema.leads.contactId, data.contactId),
                            eq(schema.leads.destination, data.destination),
                            eq(schema.leads.travelDate, data.travelDate)
                        ),
                        columns: { id: true }
                    });
                    if (existingLead) {
                        isDuplicate = true;
                        duplicateId = existingLead.id;
                    }
                } else if (data.title) {
                    const existingLead = await db.query.leads.findFirst({
                        where: eq(schema.leads.title, data.title),
                        columns: { id: true }
                    });
                    if (existingLead) {
                        isDuplicate = true;
                        duplicateId = existingLead.id;
                    }
                }
                break;

            case 'suppliers':
                // Match on company_name + phone per spec
                if (data.name) {
                    let existingSupplier = await db.query.suppliers.findFirst({
                        where: eq(schema.suppliers.companyName, data.name),
                        columns: { id: true }
                    });
                    if (!existingSupplier && data.phone) {
                        const normalizedPhone = data.phone.replace(/[\s\-\(\)\.]/g, '');
                        existingSupplier = await db.query.suppliers.findFirst({
                            where: eq(schema.suppliers.phone, normalizedPhone),
                            columns: { id: true }
                        });
                    }
                    if (existingSupplier) {
                        isDuplicate = true;
                        duplicateId = existingSupplier.id;
                    }
                }
                break;

            case 'travellers':
                // Match on passport_number OR (firstName + dateOfBirth) per spec
                if (data.passportNumber) {
                    const existingByPassport = await db.query.travellers.findFirst({
                        where: eq(schema.travellers.passportNumber, data.passportNumber),
                        columns: { id: true }
                    });
                    if (existingByPassport) {
                        isDuplicate = true;
                        duplicateId = existingByPassport.id;
                    }
                }
                if (!isDuplicate && data.firstName && data.dateOfBirth) {
                    const existingByNameDob = await db.query.travellers.findFirst({
                        where: and(
                            eq(schema.travellers.firstName, data.firstName),
                            eq(schema.travellers.dateOfBirth, data.dateOfBirth)
                        ),
                        columns: { id: true }
                    });
                    if (existingByNameDob) {
                        isDuplicate = true;
                        duplicateId = existingByNameDob.id;
                    }
                }
                break;

            case 'rate_cards':
                // Match on supplier_id + service_type + valid_from per spec
                if (data.supplierName && data.serviceType) {
                    // First resolve the supplier ID
                    const supplier = await db.query.suppliers.findFirst({
                        where: eq(schema.suppliers.companyName, data.supplierName),
                        columns: { id: true }
                    });
                    if (supplier) {
                        const whereClause = data.validFrom
                            ? and(
                                eq(schema.rateCards.supplierId, supplier.id),
                                eq(schema.rateCards.serviceType, data.serviceType),
                                eq(schema.rateCards.validFrom, data.validFrom)
                              )
                            : and(
                                eq(schema.rateCards.supplierId, supplier.id),
                                eq(schema.rateCards.serviceType, data.serviceType)
                              );
                        const existingCard = await db.query.rateCards.findFirst({
                            where: whereClause,
                            columns: { id: true }
                        });
                        if (existingCard) {
                            isDuplicate = true;
                            duplicateId = existingCard.id;
                        }
                    }
                }
                break;

            default:
                isDuplicate = false;
                break;
        }

        return {
            isDuplicate,
            duplicateId,
            action: isDuplicate ? strategy : 'create'
        };
    }
}
