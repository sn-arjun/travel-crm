import { PDFDocument, PDFPage, StandardFonts, rgb } from 'pdf-lib';
import type { ReportDefinition } from '../../types/report';

/**
 * PDF generator for Cloudflare Workers using pdf-lib.
 * pdf-lib is pure JS with no Node.js dependencies — fully CF-compatible.
 */

const FONT_SIZE = 8;
const HEADER_FONT_SIZE = 14;
const SUB_FONT_SIZE = 9;
const ROW_HEIGHT = 14;
const HEADER_ROW_HEIGHT = 18;
const MARGIN = 40;

export const pdfExportService = {
    async generatePdf(reportDef: ReportDefinition, data: any[]): Promise<ArrayBuffer> {
        const pdfDoc = await PDFDocument.create();
        const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
        const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

        const columns = reportDef.columns;
        const headerLabels = columns.map(c =>
            c.name.toUpperCase().replace(/_/g, ' ')
        );

        // A4 Landscape
        const pageWidth = 842;
        const pageHeight = 595;
        const usableWidth = pageWidth - MARGIN * 2;

        // Calculate column widths proportionally
        const colWidths = headerLabels.map(label => {
            const headerW = boldFont.widthOfTextAtSize(label, FONT_SIZE) + 12;
            // Sample some data to estimate width
            let maxDataW = 0;
            for (let i = 0; i < Math.min(data.length, 20); i++) {
                const val = String(data[i]?.[columns[headerLabels.indexOf(label)]?.name] ?? '');
                const w = font.widthOfTextAtSize(val.substring(0, 30), FONT_SIZE) + 12;
                if (w > maxDataW) maxDataW = w;
            }
            return Math.max(headerW, maxDataW, 50);
        });

        // Scale column widths to fit page
        const totalRawWidth = colWidths.reduce((a, b) => a + b, 0);
        const scale = totalRawWidth > usableWidth ? usableWidth / totalRawWidth : 1;
        const scaledWidths = colWidths.map(w => w * scale);

        // Helper: add a new page
        const addPage = (): PDFPage => {
            return pdfDoc.addPage([pageWidth, pageHeight]);
        };

        // Draw content
        let page = addPage();
        let y = pageHeight - MARGIN;

        // Title
        page.drawText(reportDef.name, {
            x: MARGIN,
            y,
            size: HEADER_FONT_SIZE,
            font: boldFont,
            color: rgb(0.1, 0.1, 0.1),
        });
        y -= 20;

        // Subtitle
        page.drawText(`Generated: ${new Date().toISOString().split('T')[0]}  |  ${data.length} rows`, {
            x: MARGIN,
            y,
            size: SUB_FONT_SIZE,
            font,
            color: rgb(0.4, 0.4, 0.4),
        });
        y -= 24;

        // Draw table header
        const drawTableHeader = (pg: PDFPage, yPos: number): number => {
            // Header background
            pg.drawRectangle({
                x: MARGIN,
                y: yPos - HEADER_ROW_HEIGHT + 4,
                width: usableWidth,
                height: HEADER_ROW_HEIGHT,
                color: rgb(0.15, 0.25, 0.45),
            });

            let x = MARGIN + 4;
            for (let i = 0; i < headerLabels.length; i++) {
                const text = truncateText(headerLabels[i], scaledWidths[i] - 8, boldFont, FONT_SIZE);
                pg.drawText(text, {
                    x,
                    y: yPos - HEADER_ROW_HEIGHT + 8,
                    size: FONT_SIZE,
                    font: boldFont,
                    color: rgb(1, 1, 1),
                });
                x += scaledWidths[i];
            }
            return yPos - HEADER_ROW_HEIGHT;
        };

        y = drawTableHeader(page, y);

        // Draw data rows
        for (let rowIdx = 0; rowIdx < data.length; rowIdx++) {
            if (y - ROW_HEIGHT < MARGIN) {
                // New page
                page = addPage();
                y = pageHeight - MARGIN;
                y = drawTableHeader(page, y);
            }

            const row = data[rowIdx];

            // Alternating row background
            if (rowIdx % 2 === 0) {
                page.drawRectangle({
                    x: MARGIN,
                    y: y - ROW_HEIGHT + 4,
                    width: usableWidth,
                    height: ROW_HEIGHT,
                    color: rgb(0.96, 0.96, 0.98),
                });
            }

            let x = MARGIN + 4;
            for (let colIdx = 0; colIdx < columns.length; colIdx++) {
                const col = columns[colIdx];
                let val = row[col.name] ?? '';

                if (col.type === 'currency' && typeof val === 'number') {
                    val = val.toFixed(2);
                } else if (col.type === 'percentage' && typeof val === 'number') {
                    val = val.toFixed(1) + '%';
                }

                const cellText = truncateText(String(val), scaledWidths[colIdx] - 8, font, FONT_SIZE);

                // Right-align numbers
                const isNumeric = ['number', 'currency', 'percentage'].includes(col.type);
                let textX = x;
                if (isNumeric) {
                    const textWidth = font.widthOfTextAtSize(cellText, FONT_SIZE);
                    textX = x + scaledWidths[colIdx] - 8 - textWidth;
                }

                page.drawText(cellText, {
                    x: textX,
                    y: y - ROW_HEIGHT + 8,
                    size: FONT_SIZE,
                    font,
                    color: rgb(0.15, 0.15, 0.15),
                });
                x += scaledWidths[colIdx];
            }

            y -= ROW_HEIGHT;
        }

        // Footer
        const pageCount = pdfDoc.getPageCount();
        for (let i = 0; i < pageCount; i++) {
            const pg = pdfDoc.getPage(i);
            pg.drawText(`Page ${i + 1} of ${pageCount}`, {
                x: pageWidth - MARGIN - 80,
                y: 20,
                size: 7,
                font,
                color: rgb(0.5, 0.5, 0.5),
            });
            pg.drawText(`Total rows: ${data.length}`, {
                x: MARGIN,
                y: 20,
                size: 7,
                font,
                color: rgb(0.5, 0.5, 0.5),
            });
        }

        const pdfBytes = await pdfDoc.save();
        return pdfBytes.buffer as ArrayBuffer;
    },
};

/** Truncate text to fit within a given pixel width. */
function truncateText(text: string, maxWidth: number, pdfFont: any, size: number): string {
    if (!text) return '';
    if (pdfFont.widthOfTextAtSize(text, size) <= maxWidth) return text;
    let truncated = text;
    while (truncated.length > 1 && pdfFont.widthOfTextAtSize(truncated + '…', size) > maxWidth) {
        truncated = truncated.slice(0, -1);
    }
    return truncated + '…';
}
