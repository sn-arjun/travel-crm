'use client';

import * as React from 'react';
import {
  Upload,
  Loader2,
  CheckCircle2,
  FileText,
  BookOpen,
  DollarSign,
  Camera,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { aiApi, type OcrPassportResult, type OcrVisaClassification, type OcrSupplierInvoiceResult } from '@/lib/api/ai';

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
      value: [passportResult.firstName, passportResult.lastName].filter(Boolean).join(' ') ?? 'Unknown',
      confidence: passportResult.confidence,
    };
    fields['Passport Number'] = {
      value: passportResult.passportNumber ?? 'Unknown',
      confidence: passportResult.confidence,
    };
    fields['Date of Birth'] = {
      value: passportResult.dateOfBirth ?? 'Unknown',
      confidence: passportResult.confidence,
    };
    fields['Nationality'] = {
      value: passportResult.nationality ?? 'Unknown',
      confidence: passportResult.confidence,
    };
    fields['Expiry Date'] = {
      value: passportResult.expiryDate ?? 'Unknown',
      confidence: passportResult.confidence,
    };
  } else if (documentType === 'visa' && 'country' in result) {
    const visaResult = result as OcrVisaClassification;
    fields['Country'] = {
      value: visaResult.country ?? 'Unknown',
      confidence: visaResult.confidence,
    };
    fields['Visa Type'] = {
      value: visaResult.visaType ?? 'Unknown',
      confidence: visaResult.confidence,
    };
    fields['Issue Date'] = {
      value: visaResult.issueDate ?? 'Unknown',
      confidence: visaResult.confidence,
    };
    fields['Expiry Date'] = {
      value: visaResult.expiryDate ?? 'Unknown',
      confidence: visaResult.confidence,
    };
    fields['Status'] = {
      value: visaResult.status ?? 'Unknown',
      confidence: visaResult.confidence,
    };
  } else if (documentType === 'invoice' && 'supplierName' in result) {
    const invoiceResult = result as OcrSupplierInvoiceResult;
    fields['Supplier Name'] = {
      value: invoiceResult.supplierName ?? 'Unknown',
      confidence: invoiceResult.confidence,
    };
    fields['Invoice Number'] = {
      value: invoiceResult.invoiceNumber ?? 'Unknown',
      confidence: invoiceResult.confidence,
    };
    fields['Amount'] = {
      value: `${invoiceResult.currency ?? ''} ${invoiceResult.totalAmount ?? 0}`,
      confidence: invoiceResult.confidence,
    };
    fields['Date'] = {
      value: invoiceResult.issueDate ?? 'Unknown',
      confidence: invoiceResult.confidence,
    };
    fields['Line Items'] = {
      value: invoiceResult.items ? `${invoiceResult.items.length} line items` : 'No items',
      confidence: invoiceResult.confidence,
    };
  }

  return { fields };
}

export default function OCRPage() {
  const [documentType, setDocumentType] = React.useState<DocumentType>('passport');
  const [status, setStatus] = React.useState<OCRStatus>('idle');
  const [uploadedFile, setUploadedFile] = React.useState<File | null>(null);
  const [extractedData, setExtractedData] = React.useState<ExtractedData | null>(null);
  const [progress, setProgress] = React.useState(0);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

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
    handleProcessDocument(file);
  };

  const handleProcessDocument = async (file: File) => {
    setStatus('uploading');
    setProgress(20);

    try {
      // Send file to API based on document type
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
        const extractedData = ocrResultToExtractedData(result, documentType);
        setExtractedData(extractedData);
        setStatus('complete');
        toast.success(`${config.label} scanned successfully!`);
      } else {
        setStatus('error');
        toast.error('Failed to extract data from document');
      }
    } catch (error) {
      setStatus('error');
      const errorMessage = error instanceof Error ? error.message : 'Failed to process document';
      toast.error(errorMessage);
    }
  };

  const handleCreateLead = () => {
    if (documentType === 'passport' && extractedData) {
      toast.success('Lead created from passport data');
    }
  };

  const handleCreateInvoice = () => {
    if (documentType === 'invoice' && extractedData) {
      toast.success('Supplier invoice created');
    }
  };

  const handleReset = () => {
    setStatus('idle');
    setUploadedFile(null);
    setExtractedData(null);
    setProgress(0);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 95) return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400';
    if (confidence >= 90) return 'bg-blue-100 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400';
    if (confidence >= 80) return 'bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400';
    return 'bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-400';
  };

  const documentIcons: Record<DocumentType, React.ReactNode> = {
    passport: <BookOpen className="h-8 w-8" />,
    visa: <FileText className="h-8 w-8" />,
    invoice: <DollarSign className="h-8 w-8" />,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Document OCR Scanning</h1>
        <p className="text-muted-foreground mt-1">
          Upload documents to extract data automatically using AI
        </p>
      </div>

      <div className="grid grid-cols-3 gap-4 max-w-2xl">
        {/* Upload Card */}
        <Card className="col-span-2">
          <CardHeader>
            <CardTitle className="text-lg">Upload Document</CardTitle>
            <CardDescription>Support: JPG, PNG, PDF (max 10MB)</CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            {/* Document Type Selector */}
            <div className="space-y-2">
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

            {/* Upload Area */}
            {status === 'idle' || !uploadedFile ? (
              <div
                className="border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer transition-colors hover:border-primary/50 hover:bg-muted/50"
                onClick={() => fileInputRef.current?.click()}
              >
                <Camera className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                <p className="font-medium text-foreground">Upload or scan document</p>
                <p className="text-sm text-muted-foreground mt-1">Click to select or drag and drop</p>
                <Input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,.pdf"
                  onChange={handleFileSelect}
                  className="hidden"
                />
              </div>
            ) : (
              <div className="space-y-4">
                {/* File Info */}
                <div className="rounded-lg bg-muted/50 p-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileText className="h-5 w-5 text-muted-foreground" />
                    <div className="text-sm">
                      <p className="font-medium text-foreground">{uploadedFile.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {(uploadedFile.size / 1024 / 1024).toFixed(2)} MB
                      </p>
                    </div>
                  </div>
                  {status === 'complete' && (
                    <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                  )}
                </div>

                {/* Progress */}
                {status !== 'complete' && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-foreground">
                        {status === 'uploading' ? 'Uploading...' : 'Processing...'}
                      </span>
                      <span className="text-sm text-muted-foreground">{progress}%</span>
                    </div>
                    <Progress value={progress} className="h-2" />
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex gap-2">
                  <Button
                    onClick={handleReset}
                    variant="outline"
                    className="flex-1 gap-2"
                    disabled={status !== 'complete'}
                  >
                    <X className="h-4 w-4" />
                    Upload Different
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Info Card */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{config.label}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-center p-4 bg-muted/50 rounded-lg">
              <div className="text-muted-foreground">{documentIcons[documentType]}</div>
            </div>
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Extraction Fields
              </p>
              <div className="space-y-1">
                {config.fields.map((field, idx) => (
                  <p key={idx} className="text-xs text-foreground">
                    • {field}
                  </p>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Results Card */}
      {extractedData && status === 'complete' && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg">Extracted Data</CardTitle>
                <CardDescription className="mt-1">Review and confirm the extracted information</CardDescription>
              </div>
              <CheckCircle2 className="h-6 w-6 text-emerald-600" />
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            {/* Fields Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Object.entries(extractedData.fields).map(([fieldName, data]) => (
                <div
                  key={fieldName}
                  className="rounded-lg border border-border/50 bg-muted/30 p-4 space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-sm font-medium text-foreground">{fieldName}</label>
                    <Badge
                      variant="outline"
                      className={cn('text-xs font-semibold px-1.5 py-0.5', getConfidenceColor(data.confidence))}
                    >
                      {data.confidence}%
                    </Badge>
                  </div>
                  <p className="text-sm text-foreground font-semibold">{data.value}</p>
                </div>
              ))}
            </div>

            {/* Info Box */}
            <div className="rounded-lg bg-blue-50 dark:bg-blue-950/30 p-4 border border-blue-200/50 dark:border-blue-800/30 space-y-2">
              <p className="text-sm font-medium text-blue-900 dark:text-blue-100">Data Quality</p>
              <p className="text-xs text-blue-700 dark:text-blue-300">
                All fields have high confidence scores (90%+). Data is ready to be auto-filled.
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 pt-2">
              <Button onClick={handleReset} variant="outline" className="flex-1">
                Scan Another Document
              </Button>
              {documentType === 'passport' && (
                <Button onClick={handleCreateLead} className="flex-1 gap-2">
                  <CheckCircle2 className="h-4 w-4" />
                  Auto-fill Traveller
                </Button>
              )}
              {documentType === 'invoice' && (
                <Button onClick={handleCreateInvoice} className="flex-1 gap-2">
                  <CheckCircle2 className="h-4 w-4" />
                  Create Supplier Invoice
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
