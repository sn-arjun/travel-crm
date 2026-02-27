export interface VisaChecklistTemplate {
    name: string;
    description: string;
    required: boolean;
}

export function getChecklistTemplate(country: string, visaType: string): VisaChecklistTemplate[] {
    const normalizedCountry = country.toLowerCase();

    // Standard defaults based on common visa requirements
    let templates: VisaChecklistTemplate[] = [
        { name: 'Passport Copy (Front & Back)', description: 'Valid for at least 6 months from travel date', required: true },
        { name: 'Passport-sized Photographs', description: 'Recent photos matching country specifications', required: true },
        { name: 'Visa Application Form', description: 'Duly filled and signed application form', required: true },
        { name: 'Flight Itinerary', description: 'Round-trip flight booking tickets', required: true },
        { name: 'Proof of Accommodation', description: 'Hotel booking or invitation letter', required: true },
        { name: 'Bank Statement', description: 'Last 6 months bank statement with sufficient balance', required: true },
    ];

    const businessExtras: VisaChecklistTemplate[] = [
        { name: 'Cover Letter from Employer', description: 'Stating purpose and duration of visit', required: true },
        { name: 'Invitation Letter', description: 'From the host company in the destination country', required: true },
    ];

    const studentExtras: VisaChecklistTemplate[] = [
        { name: 'Admission Letter', description: 'From the university/college', required: true },
        { name: 'Educational Transcripts', description: 'Previous academic records', required: true },
        { name: 'Proof of Funds', description: 'Education loan or sponsor documents', required: true },
    ];

    // Apply country specific rules
    if (normalizedCountry.includes('schengen') || normalizedCountry === 'europe') {
        templates.push({ name: 'Travel Insurance', description: 'Minimum coverage of EUR 30,000', required: true });
        templates.push({ name: 'Cover Letter', description: 'Personal cover letter explaining the trip', required: true });
        templates.push({ name: 'ITR / Form 16', description: 'Income Tax Returns for last 3 years', required: true });
    } else if (normalizedCountry === 'usa' || normalizedCountry === 'united states') {
        templates.push({ name: 'DS-160 Confirmation', description: 'DS-160 application confirmation page', required: true });
        templates.push({ name: 'Appointment Confirmation', description: 'OFC and Consular interview appointment confirmation', required: true });
    } else if (normalizedCountry === 'uk' || normalizedCountry === 'united kingdom') {
        templates.push({ name: 'VAF1A Form / Online Application', description: 'Completed UK visa application', required: true });
        templates.push({ name: 'Income Proof', description: 'Salary slips, ITR, or alternate income proofs', required: true });
    } else if (normalizedCountry === 'canada') {
        templates.push({ name: 'IMM 5257 Form', description: 'Application for Temporary Resident Visa', required: true });
        templates.push({ name: 'Family Information Form (IMM 5645)', description: 'Details of family members', required: true });
        templates.push({ name: 'Biometrics Confirmation', description: 'If biometrics are already given', required: false });
    } else if (normalizedCountry === 'australia') {
        templates.push({ name: 'Form 1419', description: 'Tourist visa application form', required: true });
        templates.push({ name: 'Certified Copy of Passport', description: 'All used pages of the passport', required: true });
    } else if (normalizedCountry === 'dubai' || normalizedCountry === 'uae') {
        templates = [ // UAE/Dubai usually requires very few docs
            { name: 'Passport Copy', description: 'Format: JPEG/PDF, colorful', required: true },
            { name: 'Passport-sized Photograph', description: 'White background', required: true },
            { name: 'Pan Card Copy', description: 'For Indian citizens', required: true },
            { name: 'Confirmed Flight Tickets', description: 'Round-trip tickets', required: true },
            { name: 'Guarantor Documents', description: 'If applicable', required: false },
        ];
    } else if (normalizedCountry === 'singapore') {
        templates.push({ name: 'Form 14A', description: 'Duly filled and signed', required: true });
        templates.push({ name: 'Covering Letter', description: 'Addressed to The Consulate General of Singapore', required: true });
    } else if (normalizedCountry === 'thailand') {
        templates.push({ name: 'Bank Statement', description: 'Showing minimum balance of THB 10,000 per person', required: true });
        templates.push({ name: 'Confirmed Hotel Booking', description: 'For the entire duration of stay', required: true });
    } else if (normalizedCountry === 'japan') {
        templates.push({ name: 'Day-by-Day Itinerary', description: 'Detailed schedule of the trip', required: true });
        templates.push({ name: 'ITR', description: 'Income Tax Return for the last 3 years', required: true });
    } else if (normalizedCountry === 'new zealand') {
        templates.push({ name: 'INZ 1017 Form', description: 'Visitor Visa Application', required: true });
        templates.push({ name: 'Evidence of Funds', description: 'Minimum NZD 1000 per month of stay', required: true });
    }

    // Apply type specific rules
    if (visaType === 'business') {
        templates.push(...businessExtras);
    } else if (visaType === 'student') {
        templates.push(...studentExtras);
    } else if (visaType === 'medical') {
        templates.push({ name: 'Medical Documents from Home Country', description: 'Diagnosis and referal letters', required: true });
        templates.push({ name: 'Letter from Destination Hospital', description: 'Confirming appointment and treatment', required: true });
    }

    return templates;
}
