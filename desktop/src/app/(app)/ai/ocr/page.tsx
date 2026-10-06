'use client';

import { PageContainer } from '@/components/layout/page-container';
import { AiFeaturePageGate } from '@/components/domain/ai/ai-feature-page-gate';
import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  BookOpen,
  Camera,
  CheckCircle2,
  DollarSign,
  FileText,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  Badge,
  Button,
  Input,
  Label,
  Progress,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui';
import { cn } from '@/lib/utils';
import { aiApi, isAiUnavailableError, type AiUnavailableError, type OcrPassportResult, type OcrVisaClassification, type OcrSupplierInvoiceResult } from '@/lib/api/ai';
import { AiUnavailableNotice } from '@/components/domain/ai/ai-unavailable-notice';
import { useAiAvailability, useNotConfiguredError } from '@/components/domain/ai/use-ai-availability';

type DocumentType = 'passport' | 'visa' | 'invoice';
type OCRStatus = 'idle' | 'uploading' | 'processing' | 'complete' | 'error';

interface ExtractedData {
  fields: Record<string, { value: string; confidence: number }>;
}

const DOCUMENT_CONFIGS: Record<DocumentType, { label: string; fields: string[] }> = {
  passport: {
    label: 'Passport',
    fields: ['Full Name', 'Passport Number', 'Date of Birth', 'Nationality', 'Expiry Date'],
  },
  visa: {
    label: 'Visa Document',
    fields: ['Country', 'Visa Type', 'Issue Date', 'Expiry Date', 'Status'],
  },
  invoice: {
    label: 'Supplier Invoice',
    fields: ['Supplier Name', 'Invoice Number', 'Amount', 'Date', 'Line Items'],
  },
};

function ocrResultToExtractedData(
  result: OcrPassportResult | OcrVisaClassification | OcrSupplierInvoiceResult,
  documentType: DocumentType,
): ExtractedData {
  const fields: Record<string, { value: string; confidence: number }> = {};

  if (documentType === 'passport' && 'firstName' in result) {
    const passportResult = result as OcrPassportResult;
    fields['Full Name'] = {
      value: [passportResult.firstName, passportResult.lastName].filter(Boolean).join(' ') || 'Unknown',
      confidence: passportResult.confidence,
    };
    fields['Passport Number'] = { value: passportResult.passportNumber ?? 'Unknown', confidence: passportResult.confidence };
    fields['Date of Birth'] = { value: passportResult.dateOfBirth ?? 'Unknown', confidence: passportResult.confidence };
    fields['Nationality'] = { value: passportResult.nationality ?? 'Unknown', confidence: passportResult.confidence };
    fields['Expiry Date'] = { value: passportResult.expiryDate ?? 'Unknown', confidence: passportResult.confidence };
  } else if (documentType === 'visa' && 'country' in result) {
    const visaResult = result as OcrVisaClassification;
    fields['Country'] = { value: visaResult.country ?? 'Unknown', confidence: visaResult.confidence };
    fields['Visa Type'] = { value: visaResult.visaType ?? 'Unknown', confidence: visaResult.confidence };
    fields['Issue Date'] = { value: visaResult.issueDate ?? 'Unknown', confidence: visaResult.confidence };
    fields['Expiry Date'] = { value: visaResult.expiryDate ?? 'Unknown', confidence: visaResult.confidence };
    fields['Status'] = { value: visaResult.status ?? 'Unknown', confidence: visaResult.confidence };
  } else if (documentType === 'invoice' && 'supplierName' in result) {
    const invoiceResult = result as OcrSupplierInvoiceResult;
    fields['Supplier Name'] = { value: invoiceResult.supplierName ?? 'Unknown', confidence: invoiceResult.confidence };
    fields['Invoice Number'] = { value: invoiceResult.invoiceNumber ?? 'Unknown', confidence: invoiceResult.confidence };
    fields['Amount'] = {
      value: `${invoiceResult.currency ?? ''} ${invoiceResult.totalAmount ?? 0}`,
      confidence: invoiceResult.confidence,
    };
    fields['Date'] = { value: invoiceResult.issueDate ?? 'Unknown', confidence: invoiceResult.confidence };
    fields['Line Items'] = {
      value: invoiceResult.items ? `${invoiceResult.items.length} line items` : 'No items',
      confidence: invoiceResult.confidence,
    };
  }

  return { fields };
}

function OcrContent() {
  const router = useRouter();
  const [documentType, setDocumentType] = React.useState<DocumentType>('passport');
  const [status, setStatus] = React.useState<OCRStatus>('idle');
  const [uploadedFile, setUploadedFile] = React.useState<File | null>(null);
  const [extractedData, setExtractedData] = React.useState<ExtractedData | null>(null);
  const [progress, setProgress] = React.useState(0);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [unavailable, setUnavailable] = React.useState<AiUnavailableError | null>(null);
  const availability = useAiAvailability();
  const notConfigured = useNotConfiguredError();

  const config = DOCUMENT_CONFIGS[documentType];

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/') && file.type !== 'application/pdf') {
      toast.error('Please upload an image or PDF file');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast.error('File size must be less than 10MB');
      return;
    }

    setUploadedFile(file);
    void handleProcessDocument(file);
  };

  const handleProcessDocument = async (file: File) => {
    setStatus('uploading');
    setProgress(20);
    setUnavailable(null);

    try {
      let result: OcrPassportResult | OcrVisaClassification | OcrSupplierInvoiceResult | null = null;

      if (documentType === 'passport') {
        const response = await aiApi.intelligence.ocrPassport(file);
        result = response.data;
      } else if (documentType === 'visa') {
        const response = await aiApi.intelligence.ocrVisaClassify(file);
        result = response.data;
      } else if (documentType === 'invoice') {
        const response = await aiApi.intelligence.ocrSupplierInvoice(file);
        result = response.data;
      }

      setProgress(100);

      if (result) {
        setExtractedData(ocrResultToExtractedData(result, documentType));
        setStatus('complete');
        toast.success(`${config.label} scanned successfully!`);
      } else {
        setStatus('error');
        toast.error('Failed to extract data from document');
      }
    } catch (error) {
      if (isAiUnavailableError(error)) {
        setUnavailable(error);
        setStatus('idle');
        setUploadedFile(null);
        setProgress(0);
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }
      setStatus('error');
      const errorMessage = error instanceof Error ? error.message : 'Failed to process document';
      toast.error(errorMessage);
    }
  };

  const handleReset = () => {
    setStatus('idle');
    setUploadedFile(null);
    setExtractedData(null);
    setProgress(0);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const documentIcons: Record<DocumentType, React.ReactNode> = {
    passport: <BookOpen className="h-8 w-8" />,
    visa: <FileText className="h-8 w-8" />,
    invoice: <DollarSign className="h-8 w-8" />,
  };

  return (
    <PageContainer>
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-ds-foreground">Document OCR Scanning</h1>
        <p className="mt-ds-1 text-ds-foreground-muted">Upload documents to extract data automatically using AI</p>
        <Link href="/ai/document-scans" className="mt-ds-1 inline-block text-sm text-ds-primary hover:underline">
          View scan history →
        </Link>
      </div>

      {(unavailable || availability.unavailable) && (
        <AiUnavailableNotice
          className="max-w-2xl"
          error={unavailable ?? notConfigured}
          onRetry={() => {
            setUnavailable(null);
            availability.recheck();
          }}
        />
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-ds-4 max-w-2xl">
        <div className="sm:col-span-2 rounded-ds-lg border border-ds-border p-ds-6 flex flex-col gap-ds-4">
          <div>
            <p className="text-lg font-semibold text-ds-foreground">Upload document</p>
            <p className="text-sm text-ds-foreground-muted">Support: JPG, PNG, PDF (max 10MB)</p>
          </div>

          <div className="flex flex-col gap-ds-2">
            <Label htmlFor="doc-type" className="text-sm font-medium">
              Document Type
            </Label>
            <Select
              value={documentType}
              onValueChange={(value) => {
                setDocumentType(value as DocumentType);
                handleReset();
              }}
              disabled={status !== 'idle'}
            >
              <SelectTrigger id="doc-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="passport">Passport</SelectItem>
                <SelectItem value="visa">Visa Document</SelectItem>
                <SelectItem value="invoice">Supplier Invoice</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {status === 'idle' || !uploadedFile ? (
            <div
              className="rounded-ds-lg border-2 border-dashed border-ds-border p-ds-8 text-center cursor-pointer transition-colors hover:border-ds-primary hover:bg-ds-surface-sunken"
              onClick={() => fileInputRef.current?.click()}
            >
              <Camera className="h-10 w-10 text-ds-foreground-muted mx-auto mb-ds-3" />
              <p className="font-medium text-ds-foreground">Upload or scan document</p>
              <p className="text-sm text-ds-foreground-muted mt-ds-1">Click to select or drag and drop</p>
              <Input
                ref={fileInputRef}
                type="file"
                accept="image/*,.pdf"
                onChange={handleFileSelect}
                className="hidden"
              />
            </div>
          ) : (
            <div className="flex flex-col gap-ds-4">
              <div className="rounded-ds-lg bg-ds-surface-sunken p-ds-3 flex items-center justify-between">
                <div className="flex items-center gap-ds-2">
                  <FileText className="h-5 w-5 text-ds-foreground-muted" />
                  <div className="text-sm">
                    <p className="font-medium text-ds-foreground">{uploadedFile.name}</p>
                    <p className="text-xs text-ds-foreground-muted">{(uploadedFile.size / 1024 / 1024).toFixed(2)} MB</p>
                  </div>
                </div>
                {status === 'complete' && <CheckCircle2 className="h-5 w-5 text-ds-success" />}
              </div>

              {status !== 'complete' && (
                <div className="flex flex-col gap-ds-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-ds-foreground">
                      {status === 'uploading' ? 'Uploading...' : 'Processing...'}
                    </span>
                    <span className="text-sm text-ds-foreground-muted">{progress}%</span>
                  </div>
                  <Progress value={progress} className="h-2" />
                </div>
              )}

              <Button onClick={handleReset} variant="outline" className="gap-ds-2" disabled={status !== 'complete'}>
                <X className="h-4 w-4" />
                Upload Different
              </Button>
            </div>
          )}
        </div>

        <div className="rounded-ds-lg border border-ds-border p-ds-4 flex flex-col gap-ds-3">
          <p className="text-base font-semibold text-ds-foreground">{config.label}</p>
          <div className="flex justify-center p-ds-4 bg-ds-surface-sunken rounded-ds-lg">
            <div className="text-ds-foreground-muted">{documentIcons[documentType]}</div>
          </div>
          <div className="flex flex-col gap-ds-2">
            <p className="text-xs font-semibold uppercase tracking-widest text-ds-foreground-muted">Extraction Fields</p>
            <div className="flex flex-col gap-ds-1">
              {config.fields.map((field, idx) => (
                <p key={idx} className="text-xs text-ds-foreground">
                  • {field}
                </p>
              ))}
            </div>
          </div>
        </div>
      </div>

      {extractedData && status === 'complete' && (
        <div className="rounded-ds-lg border border-ds-border p-ds-6 flex flex-col gap-ds-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-lg font-semibold text-ds-foreground">Extracted Data</p>
              <p className="text-sm text-ds-foreground-muted mt-ds-1">Review and confirm the extracted information</p>
            </div>
            <CheckCircle2 className="h-6 w-6 text-ds-success" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-ds-4">
            {Object.entries(extractedData.fields).map(([fieldName, data]) => (
              <div key={fieldName} className="rounded-ds-lg border border-ds-border bg-ds-surface-sunken p-ds-4 flex flex-col gap-ds-2">
                <div className="flex items-center justify-between gap-ds-2">
                  <label className="text-sm font-medium text-ds-foreground">{fieldName}</label>
                  <Badge className={cn('text-xs font-semibold px-ds-1.5 py-0.5')}>{data.confidence}%</Badge>
                </div>
                <p className="text-sm text-ds-foreground font-semibold">{data.value}</p>
              </div>
            ))}
          </div>

          <div className="rounded-ds-lg bg-ds-info-subtle p-ds-4 border border-ds-info-subtle flex flex-col gap-ds-2">
            <p className="text-sm font-medium text-ds-info-on-subtle">Data Quality</p>
            <p className="text-xs text-ds-info-on-subtle">
              Review each field's confidence score before applying. High-confidence fields are ready to auto-fill.
            </p>
          </div>

          <div className="flex gap-ds-3 pt-ds-2">
            <Button onClick={handleReset} variant="outline" className="flex-1">
              Scan Another Document
            </Button>
            <Button onClick={() => router.push('/ai/document-scans')} className="flex-1 gap-ds-2">
              <CheckCircle2 className="h-4 w-4" />
              Review in scan queue
            </Button>
          </div>
        </div>
      )}
    </PageContainer>
  );
}

export default function OCRPage() {
  return (
    <AiFeaturePageGate feature="ai_intelligence" title="Document OCR" featureName="AI Intelligence" benefit="AI-powered document scanning">
      <OcrContent />
    </AiFeaturePageGate>
  );
}
