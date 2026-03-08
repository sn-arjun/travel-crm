'use client';

/**
 * Helper function to trigger PDF generation/download.
 * In production, this would call the backend API.
 */
export function openPdf(type: 'invoice' | 'itinerary' | 'voucher', id: string) {
  const url = `/api/${type}s/${id}/pdf`;
  console.log(`Generating PDF: ${url}`);
  // In production, would open in new tab:
  // window.open(url, '_blank');
}

/**
 * Helper function to download PDF with a custom filename.
 * In production, this would call the backend API with download disposition.
 */
export function downloadPdf(type: string, id: string, filename: string) {
  const url = `/api/${type}s/${id}/pdf?download=true`;
  console.log(`Downloading ${filename} for ${type}/${id}`);
  // In production, would trigger download:
  // const a = document.createElement('a');
  // a.href = url;
  // a.download = filename;
  // document.body.appendChild(a);
  // a.click();
  // document.body.removeChild(a);
}

/**
 * Generate a PDF preview URL (for iframes or embeds).
 */
export function getPdfPreviewUrl(type: string, id: string): string {
  return `/api/${type}s/${id}/pdf?preview=true`;
}
