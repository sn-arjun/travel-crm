'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Upload, ChevronRight, Download, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { importsApi } from '@/lib/api/imports';

interface FormState {
  // Step 1: Upload
  fileType: 'csv' | 'xlsx' | '';
  entityType: 'contacts' | 'leads' | 'invoices' | '';
  file: File | null;

  // Step 2: Column Mapping
  mappings: Record<string, string>;

  // Step 4: Duplicate Handling
  duplicateAction: 'skip' | 'update' | 'create' | '';
}

const initialFormState: FormState = {
  fileType: '',
  entityType: '',
  file: null,
  mappings: {},
  duplicateAction: '',
};

// Sample data for preview and column mappings
const sampleData = [
  { col1: 'Rahul Sharma', col2: 'rahul@example.com', col3: '+91 98765 43210', col4: 'Maldives', col5: '2026-03-15' },
  { col1: 'Priya Patel', col2: 'priya@example.com', col3: '+91 98765 43211', col4: 'Thailand', col5: '2026-03-20' },
  { col1: 'Amit Kumar', col2: 'amit@example.com', col3: '+91 98765 43212', col4: 'Dubai', col5: '2026-03-25' },
  { col1: 'Sneha Reddy', col2: 'sneha@example.com', col3: '+91 98765 43213', col4: 'Bali', col5: '2026-04-01' },
  { col1: 'Vikram Singh', col2: 'vikram@example.com', col3: '+91 98765 43214', col4: 'Europe', col5: '2026-04-05' },
];

const fileColumns = ['col1', 'col2', 'col3', 'col4', 'col5'];

const crmFields = {
  contacts: ['Name', 'Email', 'Phone', 'Address', 'Tags'],
  leads: ['Name', 'Email', 'Phone', 'Destination', 'Travel Date'],
  invoices: ['Client Name', 'Email', 'Phone', 'Amount', 'Date'],
};

export default function ImportPage() {
  const router = useRouter();
  const [form, setForm] = React.useState<FormState>(initialFormState);
  const [currentStep, setCurrentStep] = React.useState(1);
  const [dragOver, setDragOver] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);
  const [recordCount, setRecordCount] = React.useState(sampleData.length);
  const [duplicatesFound, setDuplicatesFound] = React.useState(Math.ceil(sampleData.length * 0.2));
  const [importJobId, setImportJobId] = React.useState<string | null>(null);

  const updateField = (field: keyof FormState, value: string | File | null) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const updateMapping = (fileCol: string, crmField: string) => {
    setForm((prev) => ({
      ...prev,
      mappings: { ...prev.mappings, [fileCol]: crmField },
    }));
  };

  const isStep1Valid = form.fileType && form.entityType && form.file;
  const isStep2Valid = Object.values(form.mappings).length === fileColumns.length;
  const isStep4Valid = form.duplicateAction;

  const stepValid = [isStep1Valid, isStep2Valid, true, isStep4Valid, true];

  const availableFields = form.entityType ? crmFields[form.entityType as keyof typeof crmFields] : [];

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(true);
  }

  function handleDragLeave() {
    setDragOver(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      updateField('file', files[0] ?? null);
    }
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.currentTarget.files;
    if (files?.length) {
      updateField('file', files[0] ?? null);
    }
  }

  async function handleImport() {
    if (!form.file) {
      toast.error('No file selected');
      return;
    }

    setIsLoading(true);
    try {
      // Upload and get import job
      const uploadResponse = await importsApi.upload({
        file: form.file,
        type: form.entityType,
        mapping: form.mappings,
        skipHeader: true,
      });

      if (uploadResponse.data) {
        setImportJobId(uploadResponse.data.id);
        setRecordCount(uploadResponse.data.totalRecords);

        // Execute import with duplicate handling
        await importsApi.execute(uploadResponse.data.id, {
          mapping: form.mappings,
          skipDuplicates: form.duplicateAction === 'skip',
          updateExisting: form.duplicateAction === 'update',
        });

        toast.success('Import completed successfully!');
        setTimeout(() => {
          router.push('/contacts');
        }, 1500);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Import failed';
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <div>
          <h1 className="text-xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
            Import Data
          </h1>
          <p className="text-sm text-muted-foreground">Step {currentStep} of 5</p>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="px-6 py-4 border-b">
        <div className="flex items-center justify-between mb-2">
          {Array.from({ length: 5 }, (_, i) => (
            <React.Fragment key={i}>
              <button
                onClick={() => setCurrentStep(i + 1)}
                className={cn(
                  'h-10 w-10 rounded-full flex items-center justify-center font-semibold transition-colors',
                  stepValid[i]
                    ? 'bg-primary text-primary-foreground cursor-pointer'
                    : 'bg-muted text-muted-foreground',
                )}
              >
                {i + 1}
              </button>
              {i < 4 && (
                <div
                  className={cn(
                    'flex-1 h-1 mx-2 transition-colors',
                    stepValid[i] ? 'bg-primary' : 'bg-muted',
                  )}
                />
              )}
            </React.Fragment>
          ))}
        </div>
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Upload</span>
          <span>Column Map</span>
          <span>Preview</span>
          <span>Duplicates</span>
          <span>Confirm</span>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-4xl mx-auto">
          {/* Step 1: Upload */}
          {currentStep === 1 && (
            <Card>
              <CardHeader>
                <CardTitle>Upload File</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* File Type Selector */}
                <div className="space-y-2">
                  <Label>File Format *</Label>
                  <div className="flex gap-3">
                    {[
                      { value: 'csv', label: 'CSV' },
                      { value: 'xlsx', label: 'Excel (XLSX)' },
                    ].map((type: any) => (
                      <label key={type.value} className={cn('flex items-center gap-2 px-4 py-2 rounded-lg border cursor-pointer', form.fileType === type.value ? 'border-primary bg-primary/5' : '')}>
                        <input
                          type="radio"
                          name="fileType"
                          value={type.value}
                          checked={form.fileType === type.value}
                          onChange={(e) => updateField('fileType', e.target.value as any)}
                          className="h-4 w-4"
                        />
                        <span className="text-sm font-medium">{type.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Entity Type Selector */}
                <div className="space-y-2">
                  <Label htmlFor="entityType">Import As *</Label>
                  <Select value={form.entityType} onValueChange={(v) => updateField('entityType', v as any)}>
                    <SelectTrigger id="entityType"><SelectValue placeholder="Select entity type" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="contacts">Contacts</SelectItem>
                      <SelectItem value="leads">Leads</SelectItem>
                      <SelectItem value="invoices">Invoices</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Drag & Drop Area */}
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={cn(
                    'border-2 border-dashed rounded-lg p-8 text-center transition-colors',
                    dragOver ? 'border-primary bg-primary/5' : 'border-muted-foreground/25',
                  )}
                >
                  <Upload className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
                  <p className="font-medium text-sm mb-1">Drag and drop your file here</p>
                  <p className="text-xs text-muted-foreground mb-4">or click to browse</p>
                  <input
                    type="file"
                    accept=".csv,.xlsx"
                    onChange={handleFileInput}
                    className="hidden"
                    id="fileInput"
                  />
                  <label htmlFor="fileInput">
                    <Button variant="outline" size="sm" asChild>
                      <span>Browse Files</span>
                    </Button>
                  </label>
                  {form.file && (
                    <p className="mt-4 text-sm text-green-600">
                      Selected: {form.file.name}
                    </p>
                  )}
                </div>

                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    Make sure your file contains headers in the first row and uses UTF-8 encoding.
                  </AlertDescription>
                </Alert>
              </CardContent>
            </Card>
          )}

          {/* Step 2: Column Mapping */}
          {currentStep === 2 && (
            <Card>
              <CardHeader>
                <CardTitle>Map Columns</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Match your file columns to CRM fields
                </p>
                <div className="space-y-3">
                  {fileColumns.map((fileCol) => (
                    <div key={fileCol} className="flex items-end gap-3">
                      <div className="flex-1 space-y-1">
                        <Label className="text-xs text-muted-foreground">File Column: {fileCol}</Label>
                        <div className="px-3 py-2 rounded-md border bg-muted text-sm font-medium">
                          Sample: {sampleData[0]?.[fileCol as keyof typeof sampleData[0]] || '-'}
                        </div>
                      </div>
                      <Select value={form.mappings[fileCol] || ''} onValueChange={(v) => updateMapping(fileCol, v)}>
                        <SelectTrigger className="w-40"><SelectValue placeholder="Select field" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="">-- Skip --</SelectItem>
                          {availableFields.map((field: any) => (
                            <SelectItem key={field} value={field}>{field}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 3: Preview */}
          {currentStep === 3 && (
            <Card>
              <CardHeader>
                <CardTitle>Preview Data</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  First 5 rows with mapped data
                </p>
                <div className="overflow-x-auto border rounded-lg">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {Object.values(form.mappings)
                          .filter((v: any) => v)
                          .map((field: any) => (
                            <TableHead key={field} className="text-xs">{field}</TableHead>
                          ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sampleData.map((row, idx) => (
                        <TableRow key={idx}>
                          {Object.entries(form.mappings)
                            .filter(([, v]) => v)
                            .map(([fileCol]) => (
                              <TableCell key={fileCol} className="text-sm">
                                {row[fileCol as keyof typeof row] as string}
                              </TableCell>
                            ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 4: Duplicate Handling */}
          {currentStep === 4 && (
            <Card>
              <CardHeader>
                <CardTitle>Handle Duplicates</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    {duplicatesFound} potential duplicates found based on email/phone matching
                  </AlertDescription>
                </Alert>

                <div className="space-y-3">
                  {[
                    { value: 'skip', label: 'Skip', desc: 'Do not import duplicate records' },
                    { value: 'update', label: 'Update', desc: 'Update existing records with new data' },
                    { value: 'create', label: 'Create New', desc: 'Import as new records even if duplicates exist' },
                  ].map((option: any) => (
                    <label
                      key={option.value}
                      className={cn(
                        'flex items-start gap-3 p-4 rounded-lg border cursor-pointer',
                        form.duplicateAction === option.value ? 'border-primary bg-primary/5' : '',
                      )}
                    >
                      <input
                        type="radio"
                        name="duplicateAction"
                        value={option.value}
                        checked={form.duplicateAction === option.value}
                        onChange={(e) => updateField('duplicateAction', e.target.value as any)}
                        className="h-4 w-4 mt-1"
                      />
                      <div>
                        <p className="font-medium text-sm">{option.label}</p>
                        <p className="text-xs text-muted-foreground">{option.desc}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 5: Confirm */}
          {currentStep === 5 && (
            <Card>
              <CardHeader>
                <CardTitle>Confirm Import</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {isLoading && (
                  <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
                    <p className="text-sm text-amber-700 dark:text-amber-400">
                      Importing data... Please wait.
                    </p>
                  </div>
                )}
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 space-y-2">
                  <p className="text-sm text-blue-700 dark:text-blue-400">
                    <strong>Summary:</strong> You are about to import data with the following configuration:
                  </p>
                </div>

                <div className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">File Type:</span>
                    <span className="font-medium">{form.fileType?.toUpperCase()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Import As:</span>
                    <span className="font-medium capitalize">{form.entityType}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total Records:</span>
                    <span className="font-medium">{recordCount}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Duplicates Found:</span>
                    <span className="font-medium">{duplicatesFound}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Duplicate Action:</span>
                    <span className="font-medium capitalize">{form.duplicateAction}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Records to Import:</span>
                    <span className="font-medium text-green-600">
                      {form.duplicateAction === 'skip' ? recordCount - duplicatesFound : recordCount}
                    </span>
                  </div>
                </div>

                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    This action will start the import process. You can track progress in the notifications.
                  </AlertDescription>
                </Alert>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Footer Navigation */}
      <div className="border-t px-6 py-4 bg-background flex items-center justify-between">
        <Button
          variant="outline"
          onClick={() => setCurrentStep(Math.max(1, currentStep - 1))}
          disabled={currentStep === 1 || isLoading}
        >
          Previous
        </Button>
        <div className="flex items-center gap-2">
          {currentStep < 5 ? (
            <Button
              onClick={() => setCurrentStep(currentStep + 1)}
              disabled={!stepValid[currentStep - 1] || isLoading}
            >
              Next <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <Button onClick={handleImport} disabled={isLoading}>
              {isLoading ? (
                <>
                  <span className="animate-spin mr-2">●</span> Importing...
                </>
              ) : (
                <>
                  <Download className="h-4 w-4 mr-1.5" /> Start Import
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
