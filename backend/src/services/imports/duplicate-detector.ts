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
                if (data.email) {
                    const existingContact = await db.query.contacts.findFirst({
                        where: eq(schema.contacts.email, data.email),
                        columns: { id: true }
                    });
                    if (existingContact) {
                        isDuplicate = true;
                        duplicateId = existingContact.id;
                    }
                }
                break;

            case 'leads':
                // Leads don't have email/phone directly, they use contactId. 
                // We will consider a lead duplicate if a lead with the exact same Title exists for simplicity.
                if (data.title) {
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
                if (data.email) {
                    const existingSupplier = await db.query.suppliers.findFirst({
                        where: eq(schema.suppliers.email, data.email),
                        columns: { id: true }
                    });
                    if (existingSupplier) {
                        isDuplicate = true;
                        duplicateId = existingSupplier.id;
                    }
                }
                break;

            case 'travellers':
                if (data.passportNumber) {
                    const existingTraveller = await db.query.travellers.findFirst({
                        where: eq(schema.travellers.passportNumber, data.passportNumber),
                        columns: { id: true }
                    });
                    if (existingTraveller) {
                        isDuplicate = true;
                        duplicateId = existingTraveller.id;
                    }
                }
                break;

            case 'rate_cards':
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
