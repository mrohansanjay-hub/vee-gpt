/**
 * Utility to detect download requests in chat messages and generate downloadable content
 */

import jsPDF from 'jspdf';
import { Document, Packer, Paragraph, TextRun } from 'docx';
import PptxGenJS from 'pptxgenjs';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';

// Keywords that indicate user wants to download files
const downloadRequestKeywords = [
  'download',
  'save as',
  'export',
  'generate file',
  'create file',
  'pdf',
  'docx',
  'doc',
  'word',
  'txt',
  'csv',
  'json',
  'excel',
  'xlsx',
  'xls',
  'pptx',
  'powerpoint',
  'ppt',
  'zip',
];

/**
 * Check if a message contains a download request
 * @param {string} text - User message text
 * @returns {boolean}
 */
export const isDownloadRequest = (text) => {
  const lowerText = text.toLowerCase();
  return downloadRequestKeywords.some(keyword => lowerText.includes(keyword));
};

// Keywords that indicate user wants download links
const downloadLinkKeywords = [
  'download link',
  'link to download',
  'download url',
  'clickable link',
  'provide link',
  'give me link',
];

/**
 * Check if user is asking for download links
 * @param {string} text - User message text
 * @returns {boolean}
 */
export const isLinkRequest = (text) => {
  const lowerText = text.toLowerCase();
  return downloadLinkKeywords.some(keyword => lowerText.includes(keyword));
};

/**
 * Detect the file format requested by user
 * @param {string} text - User message text
 * @returns {string} Format extension (pdf, docx, xlsx, txt, csv, json, pptx, zip)
 */
export const detectFileFormat = (text) => {
  if (!text) {
    console.log('❌ No user message provided, using default PDF');
    return 'pdf'; // Default if no text provided
  }
  
  const lowerText = text.toLowerCase();
  
  console.log('🔍 Detecting format from user message:', JSON.stringify(text));
  console.log('🔍 Lowercase version:', JSON.stringify(lowerText));
  
  // Check for ZIP (check early since it might contain other keywords)
  if (lowerText.includes('zip') || lowerText.includes('archive') || lowerText.includes('compress')) {
    console.log('✅ Format detected: ZIP');
    return 'zip';
  }
  
  // Check for JSON
  if (lowerText.includes('json')) {
    console.log('✅ Format detected: JSON');
    return 'json';
  }
  
  // Check for CSV
  if (lowerText.includes('csv')) {
    console.log('✅ Format detected: CSV');
    return 'csv';
  }
  
  // Check for Text/TXT
  if (lowerText.includes('txt') || (lowerText.includes('text') && !lowerText.includes('context'))) {
    console.log('✅ Format detected: TXT');
    return 'txt';
  }
  
  // Check for Excel formats (check before word to avoid conflicts)
  if (lowerText.includes('excel') || lowerText.includes('xlsx') || lowerText.includes('.xlsx') || lowerText.includes('xls') || (lowerText.includes('sheet') && !lowerText.includes('word'))) {
    console.log('✅ Format detected: XLSX (Excel)');
    return 'xlsx';
  }
  
  // ⭐ Check for PowerPoint formats FIRST (before Word/Document check)
  // PowerPoint keywords: ppt, pptx, powerpoint, slide, presentation
  if (lowerText.includes('powerpoint') || lowerText.includes('pptx') || lowerText.includes('.pptx') || 
      lowerText.includes('ppt') || lowerText.includes('.ppt') || 
      lowerText.includes('slide') || lowerText.includes('presentation')) {
    console.log('⏳ Format requested: PowerPoint (Coming Soon)');
    return 'coming_soon';
  }
  
  // Check for PDF explicitly BEFORE Word (pdf contains "doc")
  if (lowerText.includes('pdf')) {
    console.log('✅ Format detected: PDF');
    return 'pdf';
  }
  
  // Check for Word/Document formats (ONLY specific keywords - avoid "document" alone)
  if (lowerText.includes('word') || lowerText.includes('docx') || lowerText.includes('.docx') || 
      /\bdoc\b|\.doc/i.test(text)) {
    console.log('✅ Format detected: DOCX (Word)');
    return 'docx';
  }
  
  // Default to PDF
  console.log('✅ Format detected: PDF (default)');
  return 'pdf';
};

/**
 * Generate XLSX (Excel) file from content
 * @param {string} content - Text content
 * @returns {Blob}
 */
export const generateXLSX = async (content) => {
  try {
    // Clean content before XLSX generation
    let cleanedContent = cleanContentForDownload(content);
    cleanedContent = extractMainContent(cleanedContent);
    
    const lines = cleanedContent.split('\n').filter(line => line.trim());
    
    // ==================== DETECT & PARSE STUDENT MARKS DATA ====================
    let studentData = null;
    
    // Look for lines that contain student names and numeric marks
    // Pattern: "Name Number Number Number Number" or "Name    Number    Number    Number"
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const parts = line.split(/\s{2,}|\t+/).map(p => p.trim()).filter(p => p);
      
      // Check if this looks like student data:
      // - First element is a name (text)
      // - Rest are numbers (at least 3-4 numbers)
      if (parts.length >= 4) {
        const firstIsName = isNaN(parts[0]) && /^[A-Z]/.test(parts[0]);
        const restAreNumbers = parts.slice(1).filter(p => !isNaN(p) && p !== '').length >= 3;
        
        if (firstIsName && restAreNumbers) {
          // Found potential student data - parse from here
          const students = [];
          let subjectNames = null;
          
          // First, identify subject names (if the line before first student has them)
          let headerLineIdx = i - 1;
          if (headerLineIdx >= 0) {
            const headerParts = lines[headerLineIdx].split(/\s{2,}|\t+/).map(p => p.trim()).filter(p => p);
            if (headerParts.length >= 4 && headerParts.every(p => isNaN(p))) {
              subjectNames = headerParts.slice(1); // Skip name column
            }
          }
          
          // Parse student rows
          for (let j = i; j < lines.length; j++) {
            const studentLine = lines[j];
            const studentParts = studentLine.split(/\s{2,}|\t+/).map(p => p.trim()).filter(p => p);
            
            // Check if this is a valid student row
            if (studentParts.length >= 4) {
              const isValidStudent = isNaN(studentParts[0]) && 
                                   /^[A-Z]/.test(studentParts[0]) &&
                                   studentParts.slice(1).filter(p => !isNaN(p)).length >= 3;
              
              if (isValidStudent) {
                const name = studentParts[0];
                const marks = studentParts.slice(1).map(m => {
                  const num = parseFloat(m);
                  return isNaN(num) ? 0 : num;
                });
                
                // Calculate total and average
                const total = marks.reduce((a, b) => a + b, 0);
                const average = (total / marks.length).toFixed(2);
                
                students.push({
                  name,
                  marks,
                  total,
                  average
                });
              }
            }
          }
          
          if (students.length >= 2) {
            // We found student data!
            // Default subject names if not found
            if (!subjectNames) {
              const markCount = students[0].marks.length;
              subjectNames = ['Subject 1', 'Subject 2', 'Subject 3', 'Subject 4'].slice(0, markCount);
            }
            
            studentData = { students, subjectNames };
            break;
          }
        }
      }
    }
    
    // ==================== CREATE WORKSHEET ====================
    let ws;
    
    if (studentData) {
      // Format as student marks table
      const { students, subjectNames } = studentData;
      
      // Create header row
      const headerRow = ['Student Name', ...subjectNames, 'Total Marks', 'Average Marks'];
      
      // Create data rows
      const dataRows = students.map(student => [
        student.name,
        ...student.marks,
        student.total,
        student.average
      ]);
      
      // Combine header and data
      const tableData = [headerRow, ...dataRows];
      
      // Create worksheet
      ws = XLSX.utils.aoa_to_sheet(tableData);
      
      // Calculate column widths
      const colWidths = [];
      for (let col = 0; col < headerRow.length; col++) {
        let maxWidth = 15;
        tableData.forEach(row => {
          if (row[col]) {
            maxWidth = Math.max(maxWidth, row[col].toString().length + 2);
          }
        });
        colWidths.push({ wch: Math.min(maxWidth, 25) });
      }
      ws['!cols'] = colWidths;
      
      // Apply header styling (bold white text on dark blue)
      for (let col = 0; col < headerRow.length; col++) {
        const cellAddress = XLSX.utils.encode_col(col) + '1';
        if (ws[cellAddress]) {
          ws[cellAddress].s = {
            font: { bold: true, color: { rgb: 'FFFFFF' }, size: 11 },
            fill: { fgColor: { rgb: '0D47A1' } },
            alignment: { horizontal: 'center', vertical: 'center', wrapText: true }
          };
        }
      }
      
      // Apply row styling (alternating colors, borders, numeric alignment)
      for (let rowIdx = 1; rowIdx < tableData.length; rowIdx++) {
        const row = tableData[rowIdx];
        for (let col = 0; col < row.length; col++) {
          const cellAddress = XLSX.utils.encode_col(col) + (rowIdx + 1);
          if (ws[cellAddress]) {
            const isNumeric = !isNaN(row[col]) && row[col] !== '';
            ws[cellAddress].s = {
              font: { color: { rgb: '374151' }, size: 10 },
              fill: { fgColor: { rgb: rowIdx % 2 === 0 ? 'F9FAFB' : 'FFFFFF' } },
              alignment: { 
                horizontal: isNumeric ? 'center' : 'left', 
                vertical: 'center',
                wrapText: true 
              },
              border: {
                top: { style: 'thin', color: { rgb: 'D1D5DB' } },
                bottom: { style: 'thin', color: { rgb: 'D1D5DB' } },
                left: { style: 'thin', color: { rgb: 'D1D5DB' } },
                right: { style: 'thin', color: { rgb: 'D1D5DB' } }
              }
            };
          }
        }
      }
      
      console.log(`✅ XLSX generated as Student Marks table with ${students.length} students`);
    } else {
      // ==================== DETECT OTHER TABULAR DATA ====================
      // Look for lines that contain multiple columns of data (numbers + text patterns)
      const dataTableLines = [];
      
      // Find potential table data: lines with multiple spaces/tabs separating values
      let tableStartIndex = -1;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Check if this looks like a data row (multiple values separated by spaces)
        const parts = line.split(/\s{2,}|\t+/);
        
        // If we have multiple parts and some are numbers or names
        if (parts.length >= 3) {
          // Check if this line and next few lines look like table data
          let isTableData = false;
          const nextLines = lines.slice(i, Math.min(i + 10, lines.length));
          const numericRows = nextLines.filter(l => {
            const p = l.split(/\s{2,}|\t+/);
            return p.length >= 3 && p.some(v => !isNaN(v) && v.trim() !== '');
          }).length;
          
          if (numericRows >= 2) {
            isTableData = true;
            if (tableStartIndex === -1) tableStartIndex = i;
          }
        }
        
        if (tableStartIndex !== -1 && i >= tableStartIndex) {
          dataTableLines.push({ index: i, line });
        }
      }
      
      if (dataTableLines.length >= 3) {
        // We have table data - format it as a proper table
        const tableData = [];
        
        // Extract all data rows and parse them
        dataTableLines.forEach(({ line }) => {
          const parts = line.split(/\s{2,}|\t+/).map(p => p.trim()).filter(p => p);
          if (parts.length > 0) {
            tableData.push(parts);
          }
        });
        
        // Create worksheet from table data
        ws = XLSX.utils.aoa_to_sheet(tableData);
        
        // Calculate column widths based on content
        const colWidths = [];
        if (tableData.length > 0) {
          for (let col = 0; col < tableData[0].length; col++) {
            let maxWidth = 15;
            tableData.forEach(row => {
              if (row[col]) {
                maxWidth = Math.max(maxWidth, row[col].toString().length + 2);
              }
            });
            colWidths.push({ wch: Math.min(maxWidth, 30) });
          }
        }
        ws['!cols'] = colWidths;
        
        // Apply styling to header row (first row)
        if (tableData.length > 0) {
          for (let col = 0; col < tableData[0].length; col++) {
            const cellAddress = XLSX.utils.encode_col(col) + '1';
            if (ws[cellAddress]) {
              ws[cellAddress].s = {
                font: { bold: true, color: { rgb: 'FFFFFF' }, size: 11 },
                fill: { fgColor: { rgb: '0D47A1' } },
                alignment: { horizontal: 'center', vertical: 'center', wrapText: true }
              };
            }
          }
        }
        
        // Apply styling to data rows
        for (let rowIdx = 1; rowIdx < tableData.length; rowIdx++) {
          const row = tableData[rowIdx];
          for (let col = 0; col < row.length; col++) {
            const cellAddress = XLSX.utils.encode_col(col) + (rowIdx + 1);
            if (ws[cellAddress]) {
              // Check if value is numeric
              const isNumeric = !isNaN(row[col]) && row[col] !== '';
              ws[cellAddress].s = {
                font: { color: { rgb: '374151' }, size: 10 },
                fill: { fgColor: { rgb: rowIdx % 2 === 0 ? 'F9FAFB' : 'FFFFFF' } },
                alignment: { 
                  horizontal: isNumeric ? 'center' : 'left', 
                  vertical: 'center',
                  wrapText: true 
                },
                border: {
                  top: { style: 'thin', color: { rgb: 'D1D5DB' } },
                  bottom: { style: 'thin', color: { rgb: 'D1D5DB' } },
                  left: { style: 'thin', color: { rgb: 'D1D5DB' } },
                  right: { style: 'thin', color: { rgb: 'D1D5DB' } }
                }
              };
            }
          }
        }
        
        console.log('✅ XLSX generated as data table with professional formatting');
      } else {
        // No table data found - use Type/Content format
        const mainHeadingKeywords = [
          'overview', 'introduction', 'main content', 'history', 'background',
          'conclusion', 'summary', 'suggestions', 'explanation', 'definition'
        ];
        
        // Create data rows with categorization
        const dataRows = lines.map((line, index) => {
          const trimmed = line.trim();
          const lowerLine = trimmed.toLowerCase();
          
          // Detect heading type
          const isMainHeading = mainHeadingKeywords.some(keyword => 
            lowerLine === keyword || 
            lowerLine.startsWith(keyword + ' ') ||
            (trimmed.length < 50 && /^[A-Z][a-z\s]*$/.test(trimmed) && trimmed.split(' ').length <= 3)
          );
          
          const isSideHeading = (trimmed.endsWith(':') || 
            (trimmed.length < 40 && /^[A-Z]/.test(trimmed) && (trimmed.match(/[A-Z]/g) || []).length >= 2)) && !isMainHeading;
          
          const type = isMainHeading ? 'MAIN HEADING' : (isSideHeading ? 'SUB HEADING' : 'CONTENT');
          
          return [type, trimmed];
        });
        
        // Create header row
        const headerRow = ['Type', 'Content'];
        const allData = [headerRow, ...dataRows];
        
        // Create worksheet from array data
        ws = XLSX.utils.aoa_to_sheet(allData);
        
        // Add column widths
        ws['!cols'] = [
          { wch: 20 }, // Type
          { wch: 100 } // Content
        ];
        
        // Apply styling to header row (row 1)
        for (let col = 0; col < 2; col++) {
          const cellAddress = XLSX.utils.encode_col(col) + '1';
          if (ws[cellAddress]) {
            ws[cellAddress].s = {
              font: { bold: true, color: { rgb: 'FFFFFF' } },
              fill: { fgColor: { rgb: '0D47A1' } },
              alignment: { horizontal: 'center', vertical: 'center' }
            };
          }
        }
        
        // Apply styling to content rows
        allData.forEach((row, rowIndex) => {
          // Skip header row
          if (rowIndex === 0) return;
          
          if (row[0] === 'MAIN HEADING') {
            // Main heading: bold dark blue text with light blue background
            for (let col = 0; col < 2; col++) {
              const cellAddress = XLSX.utils.encode_col(col) + (rowIndex + 1);
              if (ws[cellAddress]) {
                ws[cellAddress].s = {
                  font: { bold: true, color: { rgb: '0D47A1' }, size: 12 },
                  fill: { fgColor: { rgb: 'E3F2FD' } },
                  alignment: { horizontal: 'left', vertical: 'center', wrapText: true }
                };
              }
            }
          } else if (row[0] === 'SUB HEADING') {
            // Sub heading: bold medium blue text with lighter blue background
            for (let col = 0; col < 2; col++) {
              const cellAddress = XLSX.utils.encode_col(col) + (rowIndex + 1);
              if (ws[cellAddress]) {
                ws[cellAddress].s = {
                  font: { bold: true, color: { rgb: '1E40AF' }, size: 11 },
                  fill: { fgColor: { rgb: 'F0F4FF' } },
                  alignment: { horizontal: 'left', vertical: 'center', wrapText: true }
                };
              }
            }
          } else {
            // Regular content: normal text with no background
            for (let col = 0; col < 2; col++) {
              const cellAddress = XLSX.utils.encode_col(col) + (rowIndex + 1);
              if (ws[cellAddress]) {
                ws[cellAddress].s = {
                  font: { color: { rgb: '374151' }, size: 10 },
                  alignment: { horizontal: 'left', vertical: 'center', wrapText: true }
                };
              }
            }
          }
        });
        
        console.log('✅ XLSX generated with Type/Content format');
      }
    }
    
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Data');
    
    // Generate Excel file
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    return blob;
  } catch (error) {
    console.error('❌ Error generating XLSX:', error);
    throw error;
  }
};

/**
 * Generate DOCX (Word) file from content
 * Main Headings: 18pt (bold, blue)
 * Side Headings: 14pt (bold, dark blue)
 * Content: 12pt (regular, dark gray)
 * @param {string} content - Text content
 * @returns {Promise<Blob>}
 */
export const generateDOCX = async (content) => {
  try {
    const lines = content.split('\n');
    const paragraphs = [];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      
      // Skip completely empty lines but preserve spacing
      if (!trimmed) {
        paragraphs.push(new Paragraph({
          text: '',
          spacing: { line: 240, lineRule: 'auto', after: 0 }
        }));
        continue;
      }
      
      // Detect main headings (Overview, Main Content, etc.)
      // These are usually at the start of a line with minimal content
      const isMainHeading = 
        (trimmed.match(/^(Overview|Introduction|Main Content|History|Background|Conclusion|Summary|Suggestions)/i) && 
         trimmed.length < 100) ||
        /^[A-Z][A-Za-z\s]+:\s*$/.test(trimmed); // "Something:" format
      
      // Detect side headings (bullet/list items with colons, or indented headings)
      const isSideHeading = 
        (/^[\-\.•]\s+[A-Z]/.test(trimmed) || // "- Heading" format
         /^[A-Z][a-z]+[\s\w]+:\s*$/.test(trimmed) || // "Sub heading:" format
         (/^[A-Z]/.test(trimmed) && trimmed.length < 50 && !isMainHeading)) &&
        !isMainHeading;
      
      // Detect list items
      const isListItem = /^[\-\.\•]\s+/.test(trimmed);
      
      // Determine font size and styling
      let fontSize, bold, color, spacing;
      
      if (isMainHeading) {
        // Main headings: 18pt, bold, blue
        fontSize = 36; // 18pt (size is in half-points)
        bold = true;
        color = '0D47A1'; // Dark blue
        spacing = { line: 360, lineRule: 'auto', after: 240, before: 240 };
      } else if (isSideHeading) {
        // Side headings: 14pt, bold, dark blue
        fontSize = 28; // 14pt
        bold = true;
        color = '1E40AF'; // Medium blue
        spacing = { line: 320, lineRule: 'auto', after: 160, before: 120 };
      } else {
        // Content: 12pt, regular, dark gray
        fontSize = 24; // 12pt
        bold = false;
        color = '374151'; // Dark gray
        spacing = { line: 300, lineRule: 'auto', after: 80 };
      }
      
      // Create paragraph with proper indentation for list items
      const paragraph = new Paragraph({
        text: trimmed,
        size: fontSize,
        bold: bold,
        color: color,
        spacing: spacing,
        indent: isListItem ? { left: 720, hanging: 360 } : undefined,
        alignment: isMainHeading ? 'center' : 'left'
      });
      
      paragraphs.push(paragraph);
    }
    
    // Add title page
    const titleParagraphs = [
      new Paragraph({
        text: 'Document Content',
        size: 48, // 24pt
        bold: true,
        color: '0D47A1',
        spacing: { line: 360, lineRule: 'auto', after: 240 },
        alignment: 'center'
      }),
      new Paragraph({
        text: `Generated: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`,
        size: 24, // 12pt
        color: '6B7280',
        spacing: { line: 300, lineRule: 'auto', after: 480 },
        alignment: 'center'
      }),
      new Paragraph({
        text: 'Introduction & Main Content',
        size: 28, // 14pt
        bold: true,
        color: '1E40AF',
        spacing: { line: 320, lineRule: 'auto', after: 360 },
        alignment: 'center'
      }),
      new Paragraph({
        text: '',
        spacing: { line: 240, lineRule: 'auto', after: 240 }
      }),
      ...paragraphs
    ];
    
    const doc = new Document({
      sections: [{
        properties: {},
        children: titleParagraphs
      }]
    });
    
    const blob = await Packer.toBlob(doc);
    console.log('✅ DOCX generated successfully with proper formatting');
    return blob;
  } catch (error) {
    console.error('❌ Error generating DOCX:', error);
    throw error;
  }
};

/**
 * Generate PPTX (PowerPoint) file from content
 * @param {string} content - Text content
 * @returns {Promise<Blob>}
 */
/**
 * Generate PPTX (PowerPoint) file from content
 * @param {string} content - Text content
 * @returns {Promise<Blob>}
 */
export const generatePPTX = async (content) => {
  try {
    console.log('📊 Starting PPTX generation...');
    console.log('📊 Input content length:', content?.length);
    console.log('📊 Input content preview:', content?.substring(0, 200));
    
    // Clean content - but preserve most of the text
    let cleanedContent = cleanContentForDownload(content);
    console.log('📊 After cleanContentForDownload - length:', cleanedContent?.length);
    console.log('📊 After cleanContentForDownload - preview:', cleanedContent?.substring(0, 200));
    
    // Create presentation
    const pres = new PptxGenJS();
    pres.defineLayout({ name: 'BLANK' });
    
    let lines = cleanedContent.split('\n').filter(line => line.trim());
    
    console.log('📊 Total lines to display:', lines.length);
    console.log('📊 First 5 lines:', lines.slice(0, 5));
    
    if (lines.length === 0) {
      console.warn('⚠️ WARNING: No content lines found! Using raw content instead.');
      // Fallback: use raw content
      lines = content.split('\n').filter(line => line.trim());
      console.log('📊 Raw content lines:', lines.length);
      console.log('📊 First 5 raw lines:', lines.slice(0, 5));
    }
    
    // Main heading keywords
    const mainHeadingKeywords = [
      'overview', 'introduction', 'main content', 'history', 'background',
      'conclusion', 'summary', 'suggestions', 'explanation', 'definition'
    ];
    
    // ==================== SLIDE 1: TITLE SLIDE ====================
    const titleSlide = pres.addSlide();
    titleSlide.background = { color: '0D47A1' };
    
    titleSlide.addText('Content Document', {
      x: '0.5in',
      y: '2.2in',
      w: '9in',
      h: '1in',
      fontSize: 54,
      bold: true,
      color: 'FFFFFF',
      align: 'center'
    });
    
    titleSlide.addText('Introduction & Main Content', {
      x: '0.5in',
      y: '3.4in',
      w: '9in',
      h: '0.5in',
      fontSize: 24,
      color: 'E3F2FD',
      align: 'center'
    });
    
    titleSlide.addText(`Generated: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`, {
      x: '0.5in',
      y: '5.5in',
      w: '9in',
      h: '0.4in',
      fontSize: 12,
      color: 'B3E5FC',
      align: 'center'
    });
    
    // ==================== CREATE CONTENT SLIDES ====================
    let currentSlide = null;
    let contentLinesOnSlide = 0;
    const maxLinesPerSlide = 5;
    let slideNum = 1;
    
    for (let idx = 0; idx < lines.length; idx++) {
      const line = lines[idx];
      const trimmed = line.trim();
      const lowerLine = trimmed.toLowerCase();
      
      // Detect heading type
      const isMainHeading = mainHeadingKeywords.some(keyword => 
        lowerLine === keyword || 
        lowerLine.startsWith(keyword + ' ') ||
        (trimmed.length < 50 && /^[A-Z][a-z\s]*$/.test(trimmed) && trimmed.split(' ').length <= 3)
      );
      
      const isSideHeading = (trimmed.endsWith(':') || 
        (trimmed.length < 40 && /^[A-Z]/.test(trimmed) && (trimmed.match(/[A-Z]/g) || []).length >= 2)) && !isMainHeading;
      
      // Create new slide if:
      // - No current slide
      // - Main heading and slide not empty
      // - Too many lines on slide
      if (!currentSlide || 
          (isMainHeading && contentLinesOnSlide > 0) || 
          contentLinesOnSlide >= maxLinesPerSlide) {
        currentSlide = pres.addSlide();
        currentSlide.background = { color: 'FFFFFF' };
        contentLinesOnSlide = 0;
        
        // Add slide header with decoration
        currentSlide.addShape(pres.ShapeType.rect, {
          x: '0in',
          y: '0in',
          w: '10in',
          h: '0.6in',
          fill: { color: '1E40AF' }
        });
        
        currentSlide.addText(`Slide ${slideNum}`, {
          x: '0.5in',
          y: '0.15in',
          w: '9in',
          h: '0.3in',
          fontSize: 18,
          bold: true,
          color: 'FFFFFF'
        });
        
        slideNum++;
      }
      
      // Calculate Y position for content
      const currentYPos = 0.8 + (contentLinesOnSlide * 0.85);
      
      // Add text to slide
      if (isMainHeading) {
        // Main heading: Large bold blue heading
        currentSlide.addText(trimmed, {
          x: '0.5in',
          y: currentYPos + 'in',
          w: '9in',
          h: '0.6in',
          fontSize: 18,
          bold: true,
          color: '1E40AF',
          align: 'left',
          wordWrap: true
        });
      } else if (isSideHeading) {
        // Side heading: Medium bold blue subheading
        currentSlide.addText(trimmed, {
          x: '0.7in',
          y: currentYPos + 'in',
          w: '8.6in',
          h: '0.5in',
          fontSize: 13,
          bold: true,
          color: '2563EB',
          align: 'left',
          wordWrap: true
        });
      } else {
        // Regular content: Normal dark text
        currentSlide.addText(trimmed, {
          x: '0.7in',
          y: currentYPos + 'in',
          w: '8.6in',
          h: '0.5in',
          fontSize: 12,
          color: '1F2937',
          align: 'left',
          wordWrap: true
        });
      }
      
      contentLinesOnSlide++;
    }
    
    console.log(`📊 Created presentation with ${slideNum} slides`);
    
    // Generate the presentation as blob
    const blob = pres.write({ outputType: 'blob' });
    
    console.log('✅ PPTX generated successfully');
    return blob;
    
  } catch (error) {
    console.error('❌ Error in PPTX generation:', error);
    console.error('Error details:', error.message);
    throw error;
  }
};

/**
 * Generate CSV file from content
 * @param {string} content - Text content
 * @returns {Blob}
 */
/**
 * Generate CSV file from content
 * @param {string} content - Text content
 * @returns {Blob}
 */
export const generateCSV = (content) => {
  try {
    // Clean content before CSV generation
    let cleanedContent = cleanContentForDownload(content);
    cleanedContent = extractMainContent(cleanedContent);
    
    const lines = cleanedContent.split('\n').filter(line => line.trim());
    const now = new Date().toLocaleString();
    
    // Main heading keywords
    const mainHeadingKeywords = [
      'overview', 'introduction', 'main content', 'history', 'background',
      'conclusion', 'summary', 'suggestions', 'explanation', 'definition'
    ];
    
    // Create CSV rows
    const csvRows = [];
    
    // Add title section
    csvRows.push('DOCUMENT CONTENT');
    csvRows.push(`Generated: ${now}`);
    csvRows.push('INTRODUCTION & MAIN CONTENT');
    csvRows.push(''); // Empty line
    
    // Add header with separator
    csvRows.push('┌' + '─'.repeat(118) + '┐');
    csvRows.push('│ Type               │ Line # │ Content' + ' '.repeat(94) + '│');
    csvRows.push('├' + '─'.repeat(118) + '┤');
    
    // Add data rows
    lines.forEach((line, index) => {
      const trimmed = line.trim();
      const lowerLine = trimmed.toLowerCase();
      
      // Detect heading type
      const isMainHeading = mainHeadingKeywords.some(keyword => 
        lowerLine === keyword || 
        lowerLine.startsWith(keyword + ' ') ||
        (trimmed.length < 50 && /^[A-Z][a-z\s]*$/.test(trimmed) && trimmed.split(' ').length <= 3)
      );
      
      const isSideHeading = (trimmed.endsWith(':') || 
        (trimmed.length < 40 && /^[A-Z]/.test(trimmed) && (trimmed.match(/[A-Z]/g) || []).length >= 2)) && !isMainHeading;
      
      let type = 'CONTENT';
      if (isMainHeading) type = 'MAIN HEADING';
      else if (isSideHeading) type = 'SUB HEADING';
      
      // Format row with proper spacing and padding
      const typeCol = type.padEnd(18);
      const lineCol = (index + 1).toString().padEnd(6);
      const contentCol = trimmed.substring(0, 94).padEnd(94);
      
      const csvRow = `│ ${typeCol} │ ${lineCol} │ ${contentCol}│`;
      csvRows.push(csvRow);
    });
    
    // Add footer
    csvRows.push('└' + '─'.repeat(118) + '┘');
    csvRows.push('END OF DOCUMENT');
    
    const csv = csvRows.join('\n');
    console.log('✅ CSV generated successfully with professional table format');
    return new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  } catch (error) {
    console.error('❌ Error generating CSV:', error);
    throw error;
  }
};

/**
 * Generate JSON file from content
 * @param {string} content - Text content
 * @returns {Blob}
 */
export const generateJSON = (content) => {
  try {
    const lines = content.split('\n').filter(line => line.trim());
    
    // Categorize lines as headings or content
    const items = lines.map((line, index) => {
      const isHeading = line.trim().length < 50 && (
        line.trim().endsWith(':') || 
        /^[A-Z]/.test(line.trim())
      );
      
      return {
        lineNumber: index + 1,
        type: isHeading ? 'heading' : 'content',
        text: line.trim()
      };
    });
    
    const data = {
      metadata: {
        generated: new Date().toISOString(),
        totalLines: lines.length,
        totalHeadings: items.filter(i => i.type === 'heading').length,
        totalContent: items.filter(i => i.type === 'content').length
      },
      content: items
    };
    
    console.log('✅ JSON generated successfully');
    return new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  } catch (error) {
    console.error('❌ Error generating JSON:', error);
    throw error;
  }
};

/**
 * Generate TXT file from content
 * @param {string} content - Text content
 * @returns {Blob}
 */
export const generateTXT = (content) => {
  try {
    // Clean content before TXT generation
    let cleanedContent = cleanContentForDownload(content);
    cleanedContent = extractMainContent(cleanedContent);

    const lines = cleanedContent.split('\n');
    
    // Title page
    const now = new Date().toLocaleString();
    const titlePage = `${'='.repeat(60)}\n DOCUMENT CONTENT\n${'='.repeat(60)}\n\nGenerated: ${now}\n\nINTRODUCTION & MAIN CONTENT\n\n${'='.repeat(60)}\n\n`;
    
    // Main heading keywords
    const mainHeadingKeywords = [
      'overview', 'introduction', 'main content', 'history', 'background',
      'conclusion', 'summary', 'suggestions', 'explanation', 'definition'
    ];

    // Format content with 3-tier heading system
    const formattedLines = lines.map((line, index) => {
      const trimmed = line.trim();
      
      if (!trimmed) return ''; // Keep empty lines
      
      const lowerLine = trimmed.toLowerCase();
      
      // Main heading detection (18pt equivalent)
      const isMainHeading = mainHeadingKeywords.some(keyword => 
        lowerLine === keyword || 
        lowerLine.startsWith(keyword + ' ') ||
        (trimmed.length < 50 && /^[A-Z][a-z\s]*$/.test(trimmed) && trimmed.split(' ').length <= 3 && !lowerLine.includes('but') && !lowerLine.includes('and'))
      );

      // Side heading detection (14pt equivalent)
      const isSideHeading = (
        trimmed.endsWith(':') || 
        (trimmed.length < 40 && /^[A-Z]/.test(trimmed) && (trimmed.match(/[A-Z]/g) || []).length >= 2)
      ) && !isMainHeading;

      // List item detection
      const isListItem = trimmed.startsWith('- ') || trimmed.startsWith('. ');

      if (isMainHeading) {
        // Main headings: 18pt equivalent - large with top/bottom borders
        return `\n${'█'.repeat(60)}\n █ ${trimmed.toUpperCase()}\n${'█'.repeat(60)}`;
      } else if (isSideHeading) {
        // Side headings: 14pt equivalent - medium with underline
        return `\n▶ ${trimmed}\n${'─'.repeat(trimmed.length + 2)}`;
      } else if (isListItem) {
        // List items: indented with bullet
        return `  ${trimmed}`;
      } else {
        // Regular content text: 12pt equivalent
        return trimmed;
      }
    });
    
    const body = formattedLines.join('\n');
    const txt = titlePage + body + `\n\n${'='.repeat(60)}\nEND OF DOCUMENT\n${'='.repeat(60)}\n`;
    
    console.log('✅ TXT generated successfully');
    return new Blob([txt], { type: 'text/plain;charset=utf-8;' });
  } catch (error) {
    console.error('❌ Error generating TXT:', error);
    throw error;
  }
};

/**
 * Generate ZIP file containing multiple files
 * @param {string} content - Text content
 * @returns {Promise<Blob>}
 */
export const generateZIP = async (content) => {
  try {
    const zip = new JSZip();
    const lines = content.split('\n').filter(line => line.trim());
    
    // Add TXT version with better formatting
    const txtHeader = `Generated: ${new Date().toLocaleString()}\n${'='.repeat(50)}\n\n`;
    const txtContent = lines.join('\n');
    zip.file('content.txt', txtHeader + txtContent);
    
    // Add JSON version
    const items = lines.map((line, index) => {
      const isHeading = line.trim().length < 50 && (
        line.trim().endsWith(':') || 
        /^[A-Z]/.test(line.trim())
      );
      
      return {
        lineNumber: index + 1,
        type: isHeading ? 'heading' : 'content',
        text: line.trim()
      };
    });
    
    const jsonData = {
      metadata: {
        generated: new Date().toISOString(),
        totalLines: lines.length,
        totalHeadings: items.filter(i => i.type === 'heading').length
      },
      content: items
    };
    zip.file('content.json', JSON.stringify(jsonData, null, 2));
    
    // Add CSV version with headers
    const header = ['Type', 'Line #', 'Content'];
    const rows = lines.map((line, index) => {
      const isHeading = line.trim().length < 50 && (
        line.trim().endsWith(':') || 
        /^[A-Z]/.test(line.trim())
      );
      
      const type = isHeading ? 'HEADING' : 'CONTENT';
      const escapedContent = `"${line.replace(/"/g, '""')}"`;
      
      return [type, index + 1, escapedContent].join(',');
    });
    
    const csv = [header.join(','), ...rows].join('\n');
    zip.file('content.csv', csv);
    
    // Add README
    const readme = `Downloaded Content Files
========================

This ZIP contains multiple formats of your content:

1. content.txt - Plain text with formatting
2. content.json - Structured JSON data
3. content.csv - CSV spreadsheet format

Generated: ${new Date().toLocaleString()}
Total Lines: ${lines.length}
`;
    zip.file('README.txt', readme);
    
    console.log('✅ ZIP generated successfully');
    return zip.generateAsync({ type: 'blob' });
  } catch (error) {
    console.error('❌ Error generating ZIP:', error);
    throw error;
  }
};

/**
 * Clean and format text content for download
 * - Remove code blocks
 * - Convert markdown headers to bold
 * - Remove ALL markdown symbols except - and . for lists
 * - Extract only main content
 * @param {string} content - Raw content from AI response
 * @returns {string} Cleaned content
 */
export const cleanContentForDownload = (content) => {
  let cleaned = content;

  // 1. Remove code blocks entirely (triple backticks and fenced code)
  cleaned = cleaned.replace(/```[\s\S]*?```/g, '');
  cleaned = cleaned.replace(/~~~[\s\S]*?~~~/g, '');

  // 2. Remove inline code but keep the text (backticks)
  cleaned = cleaned.replace(/`([^`]*)`/g, '$1');

  // 3. Remove markdown headers but keep the text
  // # Text → Text
  // ## Text → Text
  // etc.
  cleaned = cleaned.replace(/^#+\s+/gm, '');

  // 4. Remove markdown link syntax but keep readable text
  // [text](url) → text
  cleaned = cleaned.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');
  // Remove standalone URLs in parentheses
  cleaned = cleaned.replace(/\([hf]t?t?p?s?:?\/\/[^\)]+\)/g, '');

  // 5. Remove image markdown syntax
  // ![alt](url) → (removed)
  cleaned = cleaned.replace(/!\[([^\]]*)\]\([^)]*\)/g, '');

  // 6. Remove bold markers but keep text
  // **text** → text
  cleaned = cleaned.replace(/\*\*([^*]+)\*\*/g, '$1');
  // __text__ → text
  cleaned = cleaned.replace(/__([^_]+)__/g, '$1');

  // 7. Remove italic markers but keep text
  // *text* → text (be careful with * in lists)
  cleaned = cleaned.replace(/(?<!\n)\*([^*\n]+)\*/g, '$1');
  // _text_ → text
  cleaned = cleaned.replace(/_([^_]+)_/g, '$1');

  // 8. Remove strikethrough
  // ~~text~~ → text
  cleaned = cleaned.replace(/~~([^~]+)~~/g, '$1');

  // 9. Clean list formatting - convert to consistent format
  // Convert * items to . (dots) at line start
  cleaned = cleaned.replace(/^\s*\*\s+/gm, '. ');
  // Convert numbered lists to - (dashes) at line start
  cleaned = cleaned.replace(/^\s*\d+\.\s+/gm, '- ');
  // Keep - items as is (already good format)
  // Remove leading spaces from list items
  cleaned = cleaned.replace(/^\s+([\-\.])\s+/gm, '$1 ');

  // 10. Remove ALL special symbols except - and . (keep only alphanumeric, space, dash, dot, newline)
  // This prevents weird character artifacts like Ø=ÜÜ
  cleaned = cleaned.replace(/[^\w\s\-\.\n]/g, (match) => {
    // Preserve newlines
    if (match === '\n') return '\n';
    // Remove everything else
    return '';
  });

  // 11. Clean up excessive whitespace
  // Remove multiple spaces
  cleaned = cleaned.replace(/  +/g, ' ');
  // Remove trailing spaces from lines
  cleaned = cleaned.replace(/ +$/gm, '');
  // Remove leading spaces from lines
  cleaned = cleaned.replace(/^ +/gm, '');
  // Reduce multiple blank lines to single blank line
  cleaned = cleaned.replace(/\n\n+/g, '\n');

  // 12. Filter out lines that are just symbols/artifacts
  const lines = cleaned.split('\n');
  const filteredLines = lines
    .map(line => line.trim())
    .filter(line => {
      // Keep non-empty lines and lines with actual content
      if (!line) return true; // Keep blank lines for spacing
      // Remove lines that are only symbols
      if (/^[\-\.=|~*]+$/.test(line)) return false;
      // Remove lines that are too short and weird (artifacts)
      if (line.length < 2) return false;
      return true;
    });

  cleaned = filteredLines.join('\n').trim();

  return cleaned;
};

/**
 * Extract main content paragraphs (skip intro/outro)
 * @param {string} content - Full content
 * @returns {string} Main content only
 */
/**
 * Extract introduction and main content from GPT response
 * Includes: Overview/Introduction + Main Content
 * Excludes: Next Steps, Suggestions, Conclusion
 * @param {string} content - Full response content
 * @returns {string} Introduction + Main content only
 */
export const extractMainContent = (content) => {
  const lines = content.split('\n');
  
  let overviewStart = -1;
  let overviewEnd = -1;
  let mainContentStart = -1;
  let mainContentEnd = lines.length;
  
  // Find Overview/Introduction section
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim().toLowerCase();
    
    if (line.includes('overview') || line.includes('introduction') || (line.includes('1.') && i < 10)) {
      overviewStart = i;
      console.log(`✅ Found Overview/Introduction at line ${i}`);
      
      // Find where overview ends (next numbered section or blank)
      for (let j = i + 1; j < lines.length; j++) {
        const nextLine = lines[j].trim().toLowerCase();
        
        // Overview ends when we hit next section (2., 3., etc) or "main content"
        if ((nextLine.match(/^\d+\./) && !nextLine.includes('1.')) || 
            nextLine.includes('main content') || 
            nextLine.includes('history') ||
            nextLine.includes('background')) {
          overviewEnd = j;
          console.log(`✅ Overview ends at line ${j}`);
          break;
        }
      }
      break;
    }
  }
  
  // Find "Main Content" section
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim().toLowerCase();
    
    if (line.includes('main content') || (line.includes('3.') && line.includes('main'))) {
      mainContentStart = i + 1;
      console.log(`✅ Found "Main Content" section at line ${i}`);
      
      // Find where main content ends - look for next major section
      for (let j = mainContentStart; j < lines.length; j++) {
        const line = lines[j].trim().toLowerCase();
        
        // Stop at: Conclusion, Summary, Suggestions, Next Steps, or numbered section 4+
        if ((line.includes('conclusion') || 
             line.includes('summary') || 
             line.includes('suggestions') ||
             line.includes('next step') ||
             line.includes('further') ||
             (line.match(/^[4-9]\./) && line.trim().length > 5)) &&
            lines[j].trim().length > 0) {
          mainContentEnd = j;
          console.log(`✅ Main Content ends at line ${j}`);
          break;
        }
      }
      break;
    }
  }
  
  // Build the final content: Overview + Main Content
  let finalContent = [];
  
  // Add overview if found
  if (overviewStart !== -1) {
    const overviewEndLine = overviewEnd !== -1 ? overviewEnd : mainContentStart;
    const overview = lines.slice(overviewStart, overviewEndLine).join('\n');
    finalContent.push(overview);
  }
  
  // Add main content if found
  if (mainContentStart !== -1) {
    const mainContent = lines.slice(mainContentStart, mainContentEnd).join('\n');
    finalContent.push(mainContent);
  }
  
  // If we found both sections, combine them
  if (finalContent.length > 0) {
    const combined = finalContent.join('\n').trim();
    
    if (combined.length > 100) {
      console.log('✅ Using extracted Introduction + Main Content sections');
      return combined;
    }
  }
  
  // Fallback: extract content between intro and conclusion
  console.log('⚠️ Using fallback extraction method');
  
  let contentStarted = false;
  let fallbackContent = [];
  let emptyLineCount = 0;
  
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim().toLowerCase();
    
    // Start from first real content
    if (!contentStarted && trimmed && trimmed.length > 10) {
      contentStarted = true;
    }
    
    // Stop before "next steps", "conclusion", "suggestions"
    if (contentStarted && (trimmed.includes('next step') || 
                           trimmed.includes('conclusion') ||
                           trimmed.includes('summary') ||
                           trimmed.includes('suggestions') ||
                           trimmed.match(/^[5-9]\./) ||
                           trimmed.includes('further reading'))) {
      break;
    }
    
    if (contentStarted) {
      fallbackContent.push(lines[i]);
      
      if (!trimmed) {
        emptyLineCount++;
      } else {
        emptyLineCount = 0;
      }
    }
  }
  
  // Remove trailing empty lines
  while (fallbackContent.length && !fallbackContent[fallbackContent.length - 1].trim()) {
    fallbackContent.pop();
  }
  
  const result = fallbackContent.join('\n').trim();
  
  if (result.length > 0) {
    console.log('✅ Using fallback content extraction');
    return result;
  }
  
  // Last resort: return all content excluding next steps/conclusion
  console.log('⚠️ Using full content with exclusions');
  return lines
    .filter(line => {
      const lower = line.trim().toLowerCase();
      return !lower.includes('next step') && 
             !lower.includes('conclusion') &&
             !lower.includes('suggestions') &&
             !lower.match(/^[5-9]\./) &&
             line.trim().length > 0;
    })
    .join('\n')
    .trim();
};

/**
 * Generate a downloadable PDF from text content
 * @param {string} content - Text content to convert to PDF
 * @param {string} filename - Name of the file (without extension)
 * @returns {Blob}
 */
export const generatePDF = (content, filename = 'document') => {
  try {
    // Clean content before PDF generation
    let cleanedContent = cleanContentForDownload(content);
    cleanedContent = extractMainContent(cleanedContent);

    const doc = new jsPDF();
    const pageHeight = doc.internal.pageSize.getHeight();
    const pageWidth = doc.internal.pageSize.getWidth();
    const margins = 15;
    const maxWidth = pageWidth - 2 * margins;

    // Split text into lines for processing
    const contentLines = cleanedContent.split('\n');
    let yPosition = margins + 10; // Start lower to leave title space
    const lineHeight = 5;

    // Add title page
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(13, 71, 161); // Dark blue
    doc.text('Document Content', margins, yPosition);
    yPosition += 10;
    
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0, 0, 0);
    const now = new Date().toLocaleString();
    doc.text(`Generated: ${now}`, margins, yPosition);
    yPosition += 15;

    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 64, 175); // Medium blue
    doc.text('Introduction & Main Content', margins, yPosition);
    yPosition += 15;

    // Reset to regular font for content
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(55, 65, 81); // Dark gray

    // Main heading keywords
    const mainHeadingKeywords = [
      'overview', 'introduction', 'main content', 'history', 'background',
      'conclusion', 'summary', 'suggestions', 'explanation', 'definition'
    ];

    contentLines.forEach((line, index) => {
      const trimmed = line.trim();

      // Skip empty lines
      if (!trimmed) {
        yPosition += 2;
        return;
      }

      // Detect heading type
      const lowerLine = trimmed.toLowerCase();
      
      // Main heading detection (18pt, bold, dark blue)
      const isMainHeading = mainHeadingKeywords.some(keyword => 
        lowerLine === keyword || 
        lowerLine.startsWith(keyword + ' ') ||
        (trimmed.length < 50 && /^[A-Z][a-z\s]*$/.test(trimmed) && trimmed.split(' ').length <= 3 && !lowerLine.includes('but') && !lowerLine.includes('and'))
      );

      // Side heading detection (14pt, bold, medium blue)
      const isSideHeading = (
        trimmed.endsWith(':') || 
        (trimmed.length < 40 && /^[A-Z]/.test(trimmed) && (trimmed.match(/[A-Z]/g) || []).length >= 2)
      ) && !isMainHeading;

      // List item detection
      const isListItem = trimmed.startsWith('- ') || trimmed.startsWith('. ');

      // Set font based on heading type
      if (isMainHeading) {
        doc.setFontSize(18);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(13, 71, 161); // Dark blue
      } else if (isSideHeading) {
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(30, 64, 175); // Medium blue
      } else {
        doc.setFontSize(12);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(55, 65, 81); // Dark gray
      }

      // Handle page breaks
      if (yPosition > pageHeight - margins) {
        doc.addPage();
        yPosition = margins;
      }

      // Split long lines to fit page width
      const splitLines = doc.splitTextToSize(trimmed, maxWidth);
      splitLines.forEach((splitLine) => {
        if (yPosition > pageHeight - margins) {
          doc.addPage();
          yPosition = margins;
        }
        doc.text(splitLine, isListItem ? margins + 5 : margins, yPosition);
        yPosition += lineHeight + 2;
      });

      // Extra spacing after headings
      if (isMainHeading) {
        yPosition += 4;
      } else if (isSideHeading) {
        yPosition += 3;
      }
    });

    // Generate PDF blob
    return doc.output('blob');
  } catch (error) {
    console.error('❌ Error generating PDF:', error);
    throw error;
  }
};

/**
 * Create a downloadable link for content
 * @param {string} content - Content to create link for
 * @param {string} filename - Filename with extension
 * @returns {string} Download URL (blob URL)
 */
export const createDownloadLink = (content, filename = 'file.txt') => {
  try {
    let blob;
    
    if (filename.endsWith('.pdf')) {
      blob = generatePDF(content, filename.replace('.pdf', ''));
    } else {
      blob = new Blob([content], { type: 'text/plain' });
    }
    
    // Create object URL for download
    const url = URL.createObjectURL(blob);
    return url;
  } catch (error) {
    console.error('❌ Error creating download link:', error);
    throw error;
  }
};

/**
 * Trigger a file download with multi-format support
 * @param {string} content - File content
 * @param {string} filename - Filename with extension (e.g., 'document.pdf', 'data.xlsx')
 * @param {string} userMessage - Original user message for format detection
 */
export const triggerDownload = async (content, filename = 'file.txt', userMessage = '') => {
  try {
    console.log('📥 ========== DOWNLOAD PROCESS START ==========');
    console.log('📥 Content length:', content.length);
    console.log('📥 Filename:', filename);
    console.log('📥 User message:', userMessage);
    
    // Clean and extract main content first
    let cleanedContent = cleanContentForDownload(content);
    console.log('✅ Content cleaned, length:', cleanedContent.length);
    
    cleanedContent = extractMainContent(cleanedContent);
    console.log('✅ Main content extracted, length:', cleanedContent.length);
    
    // Detect format: prefer userMessage detection over filename
    let format = 'pdf'; // default
    
    // First try to detect from user message if provided
    if (userMessage && userMessage.trim().length > 0) {
      console.log('🔍 Detecting format from user message:', userMessage);
      format = detectFileFormat(userMessage);
      console.log('✅ Format detected:', format);
    } else {
      // Fall back to detecting from filename
      const fileExt = filename.split('.').pop().toLowerCase();
      if (['pdf', 'docx', 'xlsx', 'txt', 'csv', 'json', 'pptx', 'zip'].indexOf(fileExt) !== -1) {
        format = fileExt;
        console.log('✅ Format detected from filename:', format);
      }
    }

    console.log(`📥 Downloading as ${format.toUpperCase()}: ${filename}`);

    let blob;

    // Generate blob based on format
    switch (format) {
      case 'pdf':
        console.log('📄 Generating PDF...');
        blob = generatePDF(cleanedContent, filename.replace('.pdf', ''));
        filename = filename.replace(/\..*$/, '') + '.pdf';
        console.log('✅ PDF generated, blob size:', blob.size, 'bytes');
        break;
      
      case 'docx':
      case 'doc':
        console.log('📝 Generating DOCX...');
        blob = await generateDOCX(cleanedContent);
        filename = filename.replace(/\..*$/, '') + '.docx';
        console.log('✅ DOCX generated, blob size:', blob.size, 'bytes');
        break;
      
      case 'xlsx':
      case 'xls':
        console.log('📊 Generating XLSX...');
        blob = await generateXLSX(cleanedContent);
        filename = filename.replace(/\..*$/, '') + '.xlsx';
        console.log('✅ XLSX generated, blob size:', blob.size, 'bytes');
        break;
      
      case 'coming_soon':
        console.log('⏳ Feature coming soon');
        throw new Error('COMING_SOON');
      
      case 'csv':
        console.log('📋 Generating CSV...');
        blob = generateCSV(cleanedContent);
        filename = filename.replace(/\..*$/, '') + '.csv';
        console.log('✅ CSV generated, blob size:', blob.size, 'bytes');
        break;
      
      case 'json':
        console.log('🔗 Generating JSON...');
        blob = generateJSON(cleanedContent);
        filename = filename.replace(/\..*$/, '') + '.json';
        console.log('✅ JSON generated, blob size:', blob.size, 'bytes');
        break;
      
      case 'zip':
        console.log('🗜️ Generating ZIP...');
        blob = await generateZIP(cleanedContent);
        filename = filename.replace(/\..*$/, '') + '.zip';
        console.log('✅ ZIP generated, blob size:', blob.size, 'bytes');
        break;
      
      case 'txt':
      default:
        console.log('📄 Generating TXT...');
        blob = generateTXT(cleanedContent);
        filename = filename.replace(/\..*$/, '') + '.txt';
        console.log('✅ TXT generated, blob size:', blob.size, 'bytes');
        break;
    }

    // Create download link and trigger download
    console.log('🔗 Creating download link...');
    const url = URL.createObjectURL(blob);
    console.log('🔗 Blob URL created:', url, 'Blob size:', blob.size);
    
    // Use a small delay to ensure the browser is ready
    await new Promise(resolve => setTimeout(resolve, 50));
    
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none'; // Make sure it's hidden
    
    console.log('🔗 Appending link to document body...');
    document.body.appendChild(a);
    
    console.log('🔗 Triggering click on link to download:', filename);
    a.click();
    
    console.log('🔗 Removing link from document body...');
    document.body.removeChild(a);

    // Clean up URL object with a longer delay for PPTX
    setTimeout(() => {
      URL.revokeObjectURL(url);
      console.log('✅ Blob URL revoked');
    }, 200); // Increased from 100 to 200ms for PPTX files
    
    console.log(`✅ Downloaded successfully: ${filename}`);
    console.log('📥 ========== DOWNLOAD PROCESS END ==========');
  } catch (error) {
    console.error('❌ Error triggering download:', error);
    console.error('❌ Error details:', error.message);
    console.error('❌ Error stack:', error.stack);
    throw error;
  }
};

/**
 * Extract code blocks from markdown text
 * @param {string} text - Markdown text
 * @returns {Array} Array of code blocks with language
 */
export const extractCodeBlocks = (text) => {
  const codeBlockRegex = /```([\s\S]*?)```/g;
  const matches = [...text.matchAll(codeBlockRegex)];
  
  return matches.map((match, index) => {
    let content = match[1];
    const firstLineEnd = content.indexOf('\n');
    let language = 'text';
    
    if (firstLineEnd !== -1) {
      const firstLine = content.substring(0, firstLineEnd).trim();
      if (firstLine && !firstLine.includes(' ') && /^[a-zA-Z0-9+-]+$/.test(firstLine)) {
        language = firstLine;
        content = content.substring(firstLineEnd + 1);
      }
    }
    
    return {
      language,
      content: content.trim(),
      filename: `code-${index + 1}.${language === 'text' ? 'txt' : language}`
    };
  });
};

/**
 * Create markdown download link for display in chat
 * @param {string} content - File content
 * @param {string} filename - Filename
 * @param {string} label - Display label
 * @returns {string} Markdown link
 */
export const createMarkdownDownloadLink = (content, filename, label) => {
  try {
    const url = createDownloadLink(content, filename);
    // Create clickable link that triggers download
    return `[📥 ${label}](${url})`;
  } catch (error) {
    console.error('❌ Error creating markdown link:', error);
    return '';
  }
};
