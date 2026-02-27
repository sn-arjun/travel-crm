import { eq } from 'drizzle-orm';
import { DrizzleD1Database } from 'drizzle-orm/d1';
import * as schema from '../../db/tenant-schema';

export class RowInserter {
    public async insertRow(
        db: DrizzleD1Database<typeof schema>,
        importType: string,
        validData: any,
        duplicateAction: 'create' | 'merge' | 'skip',
        duplicateId?: string,
        userId?: string
    ): Promise<boolean> {
        if (duplicateAction === 'skip' && duplicateId) {
            return false; // Skipped
        }

        try {
            const now = new Date().toISOString();
            const createdBy = userId || 'system';

            switch (importType) {
                case 'contacts': {
                    const contactName = [validData.firstName, validData.lastName].filter(Boolean).join(' ');
                    if (duplicateAction === 'merge' && duplicateId) {
                        await db.update(schema.contacts)
                            .set({
                                name: contactName,
                                phone: validData.phone || null,
                                company: validData.company || null,
                                tags: validData.tags || null,
                                updatedAt: now
                            })
                            .where(eq(schema.contacts.id, duplicateId));
                    } else {
                        await db.insert(schema.contacts).values({
                            id: crypto.randomUUID(),
                            name: contactName,
                            email: validData.email || null,
                            phone: validData.phone || null,
                            company: validData.company || null,
                            type: 'customer',
                            tags: validData.tags || null,
                            createdBy,
                            createdAt: now,
                            updatedAt: now
                        });
                    }
                    break;
                }

                case 'leads': {
                    if (duplicateAction === 'merge' && duplicateId) {
                        await db.update(schema.leads)
                            .set({
                                title: validData.title,
                                budget: validData.value ? Number(validData.value) : null,
                                status: validData.status,
                                updatedAt: now
                            })
                            .where(eq(schema.leads.id, duplicateId));
                    } else {
                        const contactName = [validData.firstName, validData.lastName].filter(Boolean).join(' ');
                        const contactId = crypto.randomUUID();
                        await db.insert(schema.contacts).values({
                            id: contactId,
                            name: contactName,
                            email: validData.email || null,
                            phone: validData.phone || null,
                            type: 'customer',
                            createdBy,
                            createdAt: now,
                            updatedAt: now
                        });

                        await db.insert(schema.leads).values({
                            id: crypto.randomUUID(),
                            contactId,
                            title: validData.title,
                            budget: validData.value ? Number(validData.value) : null,
                            status: validData.status,
                            createdBy,
                            createdAt: now,
                            updatedAt: now
                        });
                    }
                    break;
                }

                case 'suppliers': {
                    if (duplicateAction === 'merge' && duplicateId) {
                        await db.update(schema.suppliers)
                            .set({
                                companyName: validData.name,
                                category: validData.category,
                                phone: validData.phone || null,
                                country: validData.country || null,
                                city: validData.city || null,
                                updatedAt: now
                            })
                            .where(eq(schema.suppliers.id, duplicateId));
                    } else {
                        await db.insert(schema.suppliers).values({
                            id: crypto.randomUUID(),
                            companyName: validData.name,
                            category: validData.category,
                            email: validData.email || null,
                            phone: validData.phone || null,
                            country: validData.country || null,
                            city: validData.city || null,
                            createdBy,
                            createdAt: now,
                            updatedAt: now,
                            status: 'active'
                        });
                    }
                    break;
                }

                case 'rate_cards': {
                    await db.insert(schema.rateCards).values({
                        id: crypto.randomUUID(),
                        supplierId: validData.supplierName, // The UI/mapping should ensure this maps to a valid supplier ID ideally
                        serviceType: validData.serviceType,
                        name: `${validData.serviceType} Rate`, // Fallback name since required
                        costPrice: Number(validData.costPrice),
                        currency: validData.currency,
                        createdBy,
                        createdAt: now,
                        updatedAt: now,
                        isActive: 1
                    });
                    break;
                }

                case 'travellers': {
                    if (duplicateAction === 'merge' && duplicateId) {
                        await db.update(schema.travellers)
                            .set({
                                firstName: validData.firstName,
                                lastName: validData.lastName || null,
                                dateOfBirth: validData.dateOfBirth || null,
                                updatedAt: now
                            })
                            .where(eq(schema.travellers.id, duplicateId));
                    } else {
                        await db.insert(schema.travellers).values({
                            id: crypto.randomUUID(),
                            tenantId: 'default', // Fallback for script context
                            firstName: validData.firstName,
                            lastName: validData.lastName || 'Unknown',
                            fullNamePassport: `${validData.firstName} ${validData.lastName || ''}`.trim(),
                            dateOfBirth: validData.dateOfBirth || null,
                            passportNumber: validData.passportNumber || null,
                            createdBy,
                            createdAt: now,
                            updatedAt: now
                        });
                    }
                    break;
                }

                default:
                    throw new Error(`Unsupported type for insertion: ${importType}`);
            }

            return true;
        } catch (e) {
            console.error(`Error inserting row for ${importType}:`, e);
            throw e; // Let the queue processor handle the failure
        }
    }
}
