'use client';

import * as React from 'react';
import {
  Upload, Search, Grid, List, FileText, Download, Trash2, Loader2,
  MoreHorizontal, Eye, FileIcon, Image, HardDrive,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { useApiQuery, useApiMutation } from '@/hooks/use-api';
import { documentsApi, type Document } from '@/lib/api/documents';

const REF_DATE = new Date().getTime();

interface DocumentItem {
  id: string;
  name: string;
  description?: string;
  category?: string;
  tags?: string[];
  leadId?: string;
  itineraryId?: string;
  mimeType: string;
  uploadedBy: string;
  uploadedAt: string;
  url?: string;
  createdAt?: string;
  updatedAt?: string;
  type?: string;
  size?: string;
  sizeBytes?: number;
  linkedEntity?: string;
  linkedId?: string;
}

function getFileIcon(mimeType: string) {
  if (mimeType.startsWith('image/')) return <Image className="h-5 w-5 text-green-500" />;
  if (mimeType.includes('pdf')) return <FileIcon className="h-5 w-5 text-red-500" />;
  if (mimeType.includes('spreadsheet') || mimeType.includes('xlsx')) return <FileIcon className="h-5 w-5 text-green-600" />;
  if (mimeType.includes('word') || mimeType.includes('docx')) return <FileIcon className="h-5 w-5 text-blue-500" />;
  return <FileText className="h-5 w-5 text-gray-500" />;
}

function getFileBadgeColor(mimeType: string) {
  if (mimeType.startsWith('image/')) return 'bg-green-100 text-green-900';
  if (mimeType.includes('pdf')) return 'bg-red-100 text-red-900';
  if (mimeType.includes('spreadsheet') || mimeType.includes('xlsx')) return 'bg-emerald-100 text-emerald-900';
  if (mimeType.includes('word') || mimeType.includes('docx')) return 'bg-blue-100 text-blue-900';
  return 'bg-gray-100 text-gray-900';
}

function getFileType(mimeType: string) {
  if (mimeType.includes('pdf')) return 'PDF';
  if (mimeType.includes('spreadsheet') || mimeType.includes('xlsx')) return 'XLSX';
  if (mimeType.includes('word') || mimeType.includes('docx')) return 'DOCX';
  if (mimeType.startsWith('image/')) return mimeType.split('/')[1]?.toUpperCase() ?? 'IMAGE';
  return 'FILE';
}

export default function DocumentsPage() {
  const [search, setSearch] = React.useState('');
  const [categoryFilter, setCategoryFilter] = React.useState('all');
  const [viewMode, setViewMode] = React.useState<'list' | 'grid'>('list');
  const [page, setPage] = React.useState(1);

  const { data: response, loading, error, refetch } = useApiQuery(
    () => documentsApi.list({
      page,
      limit: 50,
      search: search || undefined,
      category: categoryFilter !== 'all' ? categoryFilter : undefined,
    }),
    [page, search, categoryFilter],
  );

  const allDocuments = React.useMemo(() => {
    if (!response || !('data' in response)) return [];
    const data = response.data;
    return Array.isArray(data) ? data : (data?.data ?? []);
  }, [response]);

  const filteredDocuments = React.useMemo(() => {
    return allDocuments;
  }, [allDocuments]);

  const totalSize = React.useMemo(
    () => allDocuments.reduce((sum: any, d: any) => sum + (d.size ?? 0), 0) / (1024 * 1024),
    [allDocuments],
  );

  const recentUploads = React.useMemo(
    () => [...allDocuments].sort((a: any, b: any) => new Date(b.createdAt ?? '').getTime() - new Date(a.createdAt ?? '').getTime()).slice(0, 5),
    [allDocuments],
  );

  const fileTypeStats = React.useMemo(() => {
    const stats: Record<string, number> = {};
    allDocuments.forEach((d) => {
      const fileType = getFileType(d.mimeType ?? '');
      stats[fileType] = (stats[fileType] || 0) + 1;
    });
    return stats;
  }, [allDocuments]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <div>
          <h1 className="text-xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>Documents</h1>
          <p className="text-sm text-muted-foreground">{filteredDocuments.length} documents</p>
        </div>
        <div className="flex items-center gap-2">
          <Dialog>
            <DialogTrigger asChild>
              <Button>
                <Upload className="h-4 w-4 mr-1.5" /> Upload File
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Upload Document</DialogTitle>
                <DialogDescription>
                  Select a file to upload to the document management system.
                </DialogDescription>
              </DialogHeader>
              <input
                type="file"
                id="doc-upload-input"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  try {
                    await documentsApi.upload({ file, name: file.name });
                    toast.success('Document uploaded successfully');
                    window.location.reload();
                  } catch {
                    toast.error('Failed to upload document');
                  }
                }}
              />
              <label htmlFor="doc-upload-input" className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:bg-muted/50 transition-colors block">
                <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm font-medium">Drag and drop your file here</p>
                <p className="text-xs text-muted-foreground mt-1">or click to browse</p>
              </label>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-3 gap-4 px-6 py-4 border-b">
        <Card>
          <CardContent className="p-4 text-center">
            <FileText className="h-5 w-5 mx-auto text-blue-500 mb-1" />
            <p className="text-2xl font-bold">{allDocuments.length}</p>
            <p className="text-xs text-muted-foreground">Total Files</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <HardDrive className="h-5 w-5 mx-auto text-purple-500 mb-1" />
            <p className="text-2xl font-bold">{totalSize.toFixed(1)} MB</p>
            <p className="text-xs text-muted-foreground">Storage Used</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Upload className="h-5 w-5 mx-auto text-green-500 mb-1" />
            <p className="text-2xl font-bold">{recentUploads.length}</p>
            <p className="text-xs text-muted-foreground">Recent (7 days)</p>
          </CardContent>
        </Card>
      </div>

      {error && (
        <div className="px-6 py-3 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800">
          <p className="text-sm text-amber-800 dark:text-amber-200">Using sample data — connect to backend for real data</p>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center gap-3 px-6 py-3 border-b">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search documents..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9" />
        </div>

        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-40 h-9">
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            <SelectItem value="passport">Passport</SelectItem>
            <SelectItem value="visa">Visa</SelectItem>
            <SelectItem value="invoice">Invoice</SelectItem>
            <SelectItem value="contract">Contract</SelectItem>
            <SelectItem value="other">Other</SelectItem>
          </SelectContent>
        </Select>

        <div className="flex items-center gap-1 border rounded-lg p-1">
          <Button
            variant={viewMode === 'list' ? 'default' : 'ghost'}
            size="icon-sm"
            onClick={() => setViewMode('list')}
          >
            <List className="h-4 w-4" />
          </Button>
          <Button
            variant={viewMode === 'grid' ? 'default' : 'ghost'}
            size="icon-sm"
            onClick={() => setViewMode('grid')}
          >
            <Grid className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {loading && (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        )}

        {!loading && viewMode === 'list' ? (
          <div className="max-w-6xl">
            {filteredDocuments.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center text-muted-foreground">
                  <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No documents found</p>
                </CardContent>
              </Card>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>File Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Size</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredDocuments.map((doc: any) => (
                    <TableRow key={doc.id} className="cursor-pointer hover:bg-muted/50">
                      <TableCell>
                        <div className="flex items-center gap-3">
                          {getFileIcon(doc.mimeType ?? '')}
                          <span className="font-medium text-sm">{doc.name}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={cn('text-xs', getFileBadgeColor(doc.mimeType ?? ''))}>{getFileType(doc.mimeType ?? '')}</Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{(doc.size ?? 0) > 1024 * 1024 ? `${((doc.size ?? 0) / (1024 * 1024)).toFixed(1)} MB` : `${((doc.size ?? 0) / 1024).toFixed(1)} KB`}</TableCell>
                      <TableCell className="text-sm">
                        <Badge variant="outline" className="text-xs">{doc.category ?? 'Other'}</Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(doc.createdAt ?? '').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon-sm"><MoreHorizontal className="h-4 w-4" /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem><Eye className="h-4 w-4 mr-2" /> View</DropdownMenuItem>
                            <DropdownMenuItem><Download className="h-4 w-4 mr-2" /> Download</DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="text-destructive"><Trash2 className="h-4 w-4 mr-2" /> Delete</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        ) : !loading && viewMode === 'grid' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredDocuments.length === 0 ? (
              <Card className="col-span-full">
                <CardContent className="p-8 text-center text-muted-foreground">
                  <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No documents found</p>
                </CardContent>
              </Card>
            ) : (
              filteredDocuments.map((doc: any) => (
                <Card key={doc.id} className="cursor-pointer hover:shadow-md transition-shadow overflow-hidden">
                  {/* File Preview */}
                  <div className="h-32 bg-gradient-to-br from-muted to-muted/50 flex items-center justify-center border-b">
                    {getFileIcon(doc.mimeType ?? '')}
                  </div>

                  <CardContent className="p-3">
                    <p className="text-sm font-medium truncate" title={doc.name}>{doc.name}</p>
                    <div className="flex items-center gap-1 mt-2">
                      <Badge className={cn('text-xs', getFileBadgeColor(doc.mimeType ?? ''))}>{getFileType(doc.mimeType ?? '')}</Badge>
                      <Badge variant="outline" className="text-xs">{(doc.size ?? 0) > 1024 * 1024 ? `${((doc.size ?? 0) / (1024 * 1024)).toFixed(1)} MB` : `${((doc.size ?? 0) / 1024).toFixed(1)} KB`}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">{doc.category ?? 'Other'}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {new Date(doc.createdAt ?? '').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </p>
                    <div className="flex gap-1 mt-3">
                      <Button variant="outline" size="sm" className="flex-1 text-xs"><Eye className="h-3 w-3 mr-1" /> View</Button>
                      <Button variant="outline" size="sm" className="flex-1 text-xs"><Download className="h-3 w-3 mr-1" /> Download</Button>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
