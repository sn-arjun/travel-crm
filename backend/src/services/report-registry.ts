import { ReportDefinition } from '../types/report';

export class ReportRegistry {
    private reports: Map<string, ReportDefinition> = new Map();

    register(report: ReportDefinition) {
        if (this.reports.has(report.id)) {
            throw new Error(`Report with ID ${report.id} is already registered.`);
        }
        this.reports.set(report.id, report);
    }

    registerMany(reports: ReportDefinition[]) {
        for (const report of reports) {
            this.register(report);
        }
    }

    get(id: string): ReportDefinition | undefined {
        return this.reports.get(id);
    }

    getAll(): ReportDefinition[] {
        return Array.from(this.reports.values());
    }

    getByCategory(category: string): ReportDefinition[] {
        return this.getAll().filter(r => r.category === category);
    }
}

// Global registry instance
export const reportRegistry = new ReportRegistry();
