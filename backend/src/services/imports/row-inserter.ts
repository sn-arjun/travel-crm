import { eq } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import * as schema from '../../db/tenant-schema';
import { generateId } from '../../utils/uuid';

export class RowInserter {
    public async insertRow(
        db: DrizzleD1Database<typeof schema>,
        importType: string,
        validData: any,
        duplicateAction: 'create' | 'merge' | 'skip',
        duplicateId?: string,
        userId?: string,
        tenantId?: string
    ): Promise<boolean> {
        if (duplicateAction === 'skip' && duplicateId) {
            return false; // Skipped
        }

        try {
            const now = new Date().toISOString();
            const createdBy = userId || 'system';

            switch (importType) {
                case 'contacts': {
                    // `name` (already resolved by the validator: single name column wins, else first + last)
                    const contactName = validData.name || [validData.firstName, validData.lastName].filter(Boolean).join(' ');
                    // Normalize: lowercase email, strip phone formatting
                    const normalizedEmail = validData.email ? validData.email.toLowerCase().trim() : null;
                    const normalizedPhone = validData.phone ? validData.phone.replace(/[\s\-\(\)\.]/g, '') : null;
                    if (duplicateAction === 'merge' && duplicateId) {
                        await db.update(schema.contacts)
                            .set({
                                name: contactName,
                                phone: normalizedPhone,
                                company: validData.company || null,
                                tags: validData.tags || null,
                                updatedAt: now
                            })
                            .where(eq(schema.contacts.id, duplicateId));
                    } else {
                        await db.insert(schema.contacts).values({
                            id: generateId(),
                            name: contactName,
                            email: normalizedEmail,
                            phone: normalizedPhone,
                            company: validData.company || null,
                            type: 'customer',
                            source: 'import',
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
                                status: validData.status || 'new',
                                updatedAt: now
                            })
                            .where(eq(schema.leads.id, duplicateId));
                    } else {
                        // Try to resolve existing contact by email or phone before creating new one
                        const normalizedEmail = validData.email ? validData.email.toLowerCase().trim() : null;
                        const normalizedPhone = validData.phone ? validData.phone.replace(/[\s\-\(\)\.]/g, '') : null;
                        let contactId: string | null = null;

                        if (normalizedEmail || normalizedPhone) {
                            const existing = await db.query.contacts.findFirst({
                                where: normalizedEmail
                                    ? eq(schema.contacts.email, normalizedEmail)
                                    : eq(schema.contacts.phone, normalizedPhone!),
                                columns: { id: true }
                            });
                            contactId = existing?.id ?? null;
                        }

                        if (!contactId) {
                            const contactName = [validData.firstName, validData.lastName].filter(Boolean).join(' ');
                            contactId = generateId();
                            await db.insert(schema.contacts).values({
                                id: contactId,
                                name: contactName,
                                email: normalizedEmail,
                                phone: normalizedPhone,
                                type: 'customer',
                                source: 'import',
                                createdBy,
                                createdAt: now,
                                updatedAt: now
                            });
                        }

                        await db.insert(schema.leads).values({
                            id: generateId(),
                            contactId,
                            title: validData.title,
                            budget: validData.value ? Number(validData.value) : null,
                            status: 'new',
                            source: 'import',
                            createdBy,
                            createdAt: now,
                            updatedAt: now
                        });
                    }
                    break;
                }

                case 'suppliers': {
                    const normalizedEmail = validData.email ? validData.email.toLowerCase().trim() : null;
                    const normalizedPhone = validData.phone ? validData.phone.replace(/[\s\-\(\)\.]/g, '') : null;
                    if (duplicateAction === 'merge' && duplicateId) {
                        await db.update(schema.suppliers)
                            .set({
                                companyName: validData.name,
                                category: validData.category,
                                phone: normalizedPhone,
                                country: validData.country || null,
                                city: validData.city || null,
                                updatedAt: now
                            })
                            .where(eq(schema.suppliers.id, duplicateId));
                    } else {
                        await db.insert(schema.suppliers).values({
                            id: generateId(),
                            companyName: validData.name,
                            category: validData.category,
                            email: normalizedEmail,
                            phone: normalizedPhone,
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
                    // Resolve supplier by company_name to get the actual supplier ID
                    let supplierId: string | null = null;
                    if (validData.supplierName) {
                        const supplier = await db.query.suppliers.findFirst({
                            where: eq(schema.suppliers.companyName, validData.supplierName),
                            columns: { id: true }
                        });
                        supplierId = supplier?.id ?? null;
                    }

                    if (!supplierId) {
                        throw new Error(`Supplier not found: "${validData.supplierName}". Please ensure the supplier exists before importing rate cards.`);
                    }

                    if (duplicateAction === 'merge' && duplicateId) {
                        await db.update(schema.rateCards)
                            .set({
                                serviceType: validData.serviceType,
                                costPrice: Number(validData.costPrice),
                                sellingPrice: (validData.sellingPrice || validData.sellPrice) ? Number(validData.sellingPrice || validData.sellPrice) : null,
                                currency: validData.currency || 'INR',
                                validFrom: validData.seasonStart || validData.validFrom || null,
                                validTo: validData.seasonEnd || validData.validTo || null,
                                updatedAt: now
                            })
                            .where(eq(schema.rateCards.id, duplicateId));
                    } else {
                        await db.insert(schema.rateCards).values({
                            id: generateId(),
                            supplierId,
                            serviceType: validData.serviceType,
                            name: validData.name || `${validData.serviceType} Rate`,
                            costPrice: Number(validData.costPrice),
                            sellingPrice: (validData.sellingPrice || validData.sellPrice) ? Number(validData.sellingPrice || validData.sellPrice) : null,
                            currency: validData.currency || 'INR',
                            validFrom: validData.seasonStart || validData.validFrom || null,
                            validTo: validData.seasonEnd || validData.validTo || null,
                            createdBy,
                            createdAt: now,
                            updatedAt: now,
                            isActive: 1
                        });
                    }
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
                        // Try to link to existing contact by passport or name+DOB
                        let contactId: string | null = null;
                        if (validData.email || validData.phone) {
                            const normalizedEmail = validData.email ? validData.email.toLowerCase().trim() : null;
                            const normalizedPhone = validData.phone ? validData.phone.replace(/[\s\-\(\)\.]/g, '') : null;
                            const existingContact = await db.query.contacts.findFirst({
                                where: normalizedEmail
                                    ? eq(schema.contacts.email, normalizedEmail)
                                    : eq(schema.contacts.phone, normalizedPhone!),
                                columns: { id: true }
                            });
                            contactId = existingContact?.id ?? null;
                        }

                        await db.insert(schema.travellers).values({
                            id: generateId(),
                            tenantId: tenantId || 'default',
                            contactId: contactId || null,
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
