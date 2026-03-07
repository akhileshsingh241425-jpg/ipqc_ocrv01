/**
 * PDF Summary Report Generator
 * =============================
 * Generates compact summary PDFs for:
 *   1. IQC Verification Reports
 *   2. IPQC Checksheet Reports
 * 
 * Uses PDFKit for professional PDF generation.
 */

const PDFDocument = require('pdfkit');

// ===== Color constants =====
const COLORS = {
  primary: '#1e3a5f',
  secondary: '#3b82f6',
  success: '#059669',
  danger: '#dc2626',
  warning: '#d97706',
  lightGray: '#f1f5f9',
  darkText: '#1e293b',
  mediumText: '#475569',
  lightText: '#94a3b8',
  white: '#ffffff',
  black: '#000000',
  passBg: '#dcfce7',
  failBg: '#fee2e2',
  warnBg: '#fef9c3',
};

// ===== Helper Functions =====
function getResultColor(result) {
  if (!result) return COLORS.mediumText;
  const r = result.toUpperCase();
  if (r === 'PASS' || r === 'MATCH' || r === 'GENUINE' || r === 'EXACT_MATCH') return COLORS.success;
  if (r === 'FAIL' || r === 'MISMATCH' || r === 'LIKELY_FAKE') return COLORS.danger;
  return COLORS.warning;
}

function drawLine(doc, y, x1, x2, color = '#d1d5db', width = 0.5) {
  doc.strokeColor(color).lineWidth(width).moveTo(x1, y).lineTo(x2, y).stroke();
}

function drawRect(doc, x, y, w, h, fillColor) {
  doc.save().rect(x, y, w, h).fill(fillColor).restore();
}

function addCompanyHeader(doc, title, subtitle) {
  const pageW = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const startX = doc.page.margins.left;

  // Dark blue header bar
  drawRect(doc, 0, 0, doc.page.width, 60, COLORS.primary);
  doc.fontSize(18).font('Helvetica-Bold').fillColor(COLORS.white)
    .text('GAUTAM SOLAR PRIVATE LIMITED', startX, 12, { width: pageW, align: 'center' });
  doc.fontSize(9).font('Helvetica').fillColor('#94b8db')
    .text('Quality Assurance Department', startX, 34, { width: pageW, align: 'center' });

  // Subtitle bar
  drawRect(doc, 0, 60, doc.page.width, 28, COLORS.secondary);
  doc.fontSize(11).font('Helvetica-Bold').fillColor(COLORS.white)
    .text(title, startX, 66, { width: pageW, align: 'center' });

  // Date/subtitle
  if (subtitle) {
    doc.fontSize(8).font('Helvetica').fillColor(COLORS.mediumText)
      .text(subtitle, startX, 95, { width: pageW, align: 'center' });
  }

  doc.y = 108;
}

function addSectionHeader(doc, text, color = COLORS.primary) {
  const y = doc.y;
  const pageW = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const startX = doc.page.margins.left;

  drawRect(doc, startX, y, pageW, 20, color);
  doc.fontSize(10).font('Helvetica-Bold').fillColor(COLORS.white)
    .text(text, startX + 8, y + 5, { width: pageW - 16 });
  doc.y = y + 24;
}

function addKeyValue(doc, key, value, options = {}) {
  const { keyWidth = 150, fontSize = 9, bold = false } = options;
  const startX = doc.page.margins.left;
  const pageW = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const y = doc.y;

  doc.fontSize(fontSize).font('Helvetica-Bold').fillColor(COLORS.mediumText)
    .text(key, startX + 4, y, { width: keyWidth, continued: false });

  const valFont = bold ? 'Helvetica-Bold' : 'Helvetica';
  const valColor = options.color || COLORS.darkText;
  doc.fontSize(fontSize).font(valFont).fillColor(valColor)
    .text(String(value || '—'), startX + keyWidth + 4, y, { width: pageW - keyWidth - 8 });

  const lineH = Math.max(
    doc.heightOfString(key, { width: keyWidth }),
    doc.heightOfString(String(value || '—'), { width: pageW - keyWidth - 8 })
  );
  doc.y = y + lineH + 4;
}

function addTableRow(doc, cells, widths, options = {}) {
  const { header = false, bgColor = null, fontSize = 8 } = options;
  const startX = doc.page.margins.left;
  const y = doc.y;
  const rowH = 16;

  if (bgColor) drawRect(doc, startX, y, widths.reduce((a, b) => a + b, 0), rowH, bgColor);

  let x = startX;
  cells.forEach((cell, i) => {
    const font = header ? 'Helvetica-Bold' : 'Helvetica';
    const color = header ? COLORS.white : (options.colors?.[i] || COLORS.darkText);
    doc.fontSize(fontSize).font(font).fillColor(color)
      .text(String(cell || '—'), x + 3, y + 3, { width: widths[i] - 6, align: 'left' });
    x += widths[i];
  });

  doc.y = y + rowH;
}

function checkPageBreak(doc, neededSpace = 60) {
  if (doc.y + neededSpace > doc.page.height - doc.page.margins.bottom) {
    doc.addPage();
    doc.y = doc.page.margins.top;
    return true;
  }
  return false;
}

// ============================
// IQC SUMMARY PDF
// ============================
function generateIQCSummaryPDF(data) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 40, bottom: 40, left: 40, right: 40 },
        info: {
          Title: 'IQC Verification Summary Report',
          Author: 'Gautam Solar — Quality Assurance',
          Subject: 'IQC Bus Bar Verification',
        }
      });

      const buffers = [];
      doc.on('data', chunk => buffers.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      const v = data.verification || {};
      const iqc = data.iqcData || {};
      const coc = data.cocData || {};
      const summary = v.summary || {};
      const overallResult = v.overallResult || 'N/A';
      const pageW = doc.page.width - 80;

      // ===== HEADER =====
      addCompanyHeader(doc,
        `IQC Verification Summary — ${(iqc.materialName || data.materialType || 'Bus Bar').toUpperCase()}`,
        `Generated: ${new Date().toLocaleString('en-IN')} | Report ID: ${data.materialType}_${Date.now()}`
      );

      // ===== OVERALL RESULT BOX =====
      const resultColor = getResultColor(overallResult);
      const resultBg = overallResult === 'PASS' ? '#dcfce7' : overallResult === 'FAIL' ? '#fee2e2' : '#fef9c3';
      drawRect(doc, 40, doc.y, pageW, 35, resultBg);
      doc.fontSize(16).font('Helvetica-Bold').fillColor(resultColor)
        .text(`RESULT: ${overallResult}`, 40, doc.y + 5, { width: pageW, align: 'center' });
      doc.y += 22;
      doc.fontSize(8).font('Helvetica').fillColor(COLORS.mediumText)
        .text(v.overallMessage || '', 44, doc.y, { width: pageW - 8, align: 'center' });
      doc.y += 18;

      // ===== SUMMARY STATS ROW =====
      const statBoxW = pageW / 5;
      const statsY = doc.y;
      const stats = [
        { label: 'Total Checks', value: summary.totalChecks || 0, color: COLORS.secondary },
        { label: 'Passed', value: summary.passed || 0, color: COLORS.success },
        { label: 'Failed', value: summary.failed || 0, color: COLORS.danger },
        { label: 'Warnings', value: summary.warnings || 0, color: COLORS.warning },
        { label: 'Authenticity', value: `${100 - (summary.fraudScore || 0)}%`, color: summary.fraudScore > 30 ? COLORS.danger : COLORS.success },
      ];

      stats.forEach((st, i) => {
        const x = 40 + i * statBoxW;
        drawRect(doc, x, statsY, statBoxW - 4, 36, COLORS.lightGray);
        doc.fontSize(16).font('Helvetica-Bold').fillColor(st.color)
          .text(String(st.value), x, statsY + 4, { width: statBoxW - 4, align: 'center' });
        doc.fontSize(7).font('Helvetica').fillColor(COLORS.lightText)
          .text(st.label, x, statsY + 24, { width: statBoxW - 4, align: 'center' });
      });
      doc.y = statsY + 42;

      // ===== DOCUMENT DETAILS =====
      addSectionHeader(doc, 'DOCUMENT & INSPECTION DETAILS');

      const details = [
        ['Material', iqc.materialName || data.materialType || '—'],
        ['Supplier (IQC)', iqc.supplierName || '—'],
        ['Supplier (COC)', coc.supplierName || '—'],
        ['Invoice No. (IQC)', iqc.invoiceNo || '—'],
        ['Invoice No. (COC)', coc.invoiceNo || '—'],
        ['Receipt Date', iqc.receiptDate || '—'],
        ['MFG Date', iqc.mfgDate || '—'],
        ['Checked By', iqc.checkedBy || '—'],
        ['Sample Count', iqc.sampleCount || '—'],
        ['Document No.', iqc.documentNo || '—'],
      ];

      details.forEach(([k, v2]) => addKeyValue(doc, k, v2));
      doc.y += 4;

      // ===== VERIFICATION CHECKS TABLE =====
      checkPageBreak(doc, 80);
      addSectionHeader(doc, 'VERIFICATION CHECKS');

      const colWidths = [25, 140, 55, 140, 155];
      addTableRow(doc, ['#', 'Check Name', 'Status', 'IQC Values', 'Details'], colWidths, { header: true, bgColor: COLORS.primary });

      const checks = v.checks || [];
      checks.forEach((check, i) => {
        checkPageBreak(doc, 20);
        const iqcVals = Array.isArray(check.values) ? check.values.slice(0, 3).join(', ') + (check.values.length > 3 ? '...' : '') : (check.values || '—');
        const statusColor = getResultColor(check.status);
        const bg = i % 2 === 0 ? COLORS.lightGray : COLORS.white;
        addTableRow(doc, [i + 1, check.name, check.status, iqcVals, (check.details || '—').substring(0, 80)], colWidths, {
          bgColor: bg,
          colors: [COLORS.darkText, COLORS.darkText, statusColor, COLORS.darkText, COLORS.mediumText]
        });
      });

      // ===== COC CROSS-CHECK =====
      const cocChecks = v.cocCrossCheck || [];
      if (cocChecks.length > 0) {
        doc.y += 8;
        checkPageBreak(doc, 80);
        addSectionHeader(doc, 'COC CROSS-CHECK SUMMARY');

        const cocColW = [25, 120, 130, 130, 55, 55];
        addTableRow(doc, ['#', 'Field', 'IQC Value', 'COC Value', 'Match', 'Status'], cocColW, { header: true, bgColor: COLORS.secondary });

        cocChecks.forEach((cc, i) => {
          checkPageBreak(doc, 20);
          const iqcVal = typeof cc.iqcValue === 'string' ? cc.iqcValue : JSON.stringify(cc.iqcValue);
          const cocVal = typeof cc.cocValue === 'string' ? cc.cocValue : JSON.stringify(cc.cocValue);
          const bg = i % 2 === 0 ? COLORS.lightGray : COLORS.white;
          addTableRow(doc, [
            i + 1,
            cc.field || '—',
            (iqcVal || '—').substring(0, 35),
            (cocVal || '—').substring(0, 35),
            cc.match ? 'Yes' : 'No',
            cc.status
          ], cocColW, {
            bgColor: bg,
            colors: [COLORS.darkText, COLORS.darkText, COLORS.darkText, COLORS.darkText, cc.match ? COLORS.success : COLORS.danger, getResultColor(cc.status)],
          });
        });
      }

      // ===== FRAUD DETECTION SUMMARY =====
      const fraud = v.fraudDetection;
      if (fraud) {
        doc.y += 8;
        checkPageBreak(doc, 80);
        addSectionHeader(doc, 'FRAUD DETECTION SUMMARY', fraud.overallVerdict === 'GENUINE' ? COLORS.success : fraud.overallVerdict === 'LIKELY_FAKE' ? COLORS.danger : COLORS.warning);

        addKeyValue(doc, 'Overall Score', `${fraud.overallScore || 0}/100`, { color: fraud.overallScore > 30 ? COLORS.danger : COLORS.success, bold: true });
        addKeyValue(doc, 'Verdict', fraud.overallVerdict || '—', { color: getResultColor(fraud.overallVerdict), bold: true });
        addKeyValue(doc, 'Inspector Tested', fraud.inspectorTested ? 'YES ✓' : 'NO ✗', { color: fraud.inspectorTested ? COLORS.success : COLORS.danger, bold: true });
        addKeyValue(doc, 'Summary', fraud.summary || '—');
      }

      // ===== AQL VERIFICATION =====
      const aql = v.aqlVerification;
      if (aql) {
        doc.y += 8;
        checkPageBreak(doc, 60);
        addSectionHeader(doc, 'AQL SAMPLING PLAN');
        addKeyValue(doc, 'Status', aql.status, { color: getResultColor(aql.status), bold: true });
        addKeyValue(doc, 'Lot Size', aql.lotSize || '—');
        addKeyValue(doc, 'Required (S3)', aql.requiredSamplesS3 || '—');
        addKeyValue(doc, 'Required (S4)', aql.requiredSamplesS4 || '—');
        addKeyValue(doc, 'Actual Samples', aql.actualSamples || '—');
        addKeyValue(doc, 'Details', aql.details || '—');
      }

      // ===== FOOTER =====
      const footerY = doc.page.height - 30;
      drawLine(doc, footerY - 5, 40, doc.page.width - 40, '#e2e8f0', 0.5);
      doc.fontSize(7).font('Helvetica').fillColor(COLORS.lightText)
        .text('This is an auto-generated summary report. For detailed data, refer to the full Excel report.', 40, footerY, { width: pageW, align: 'center' });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

// ============================
// IPQC SUMMARY PDF
// ============================
function generateIPQCSummaryPDF(data) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 40, bottom: 40, left: 40, right: 40 },
        info: {
          Title: 'IPQC Checksheet Summary Report',
          Author: 'Gautam Solar — Quality Assurance',
          Subject: 'IPQC Inspection Summary',
        }
      });

      const buffers = [];
      doc.on('data', chunk => buffers.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      const pageW = doc.page.width - 80;

      // ===== HEADER =====
      addCompanyHeader(doc,
        `IPQC Checksheet Summary Report`,
        `Date: ${data.date || '—'} | Line: ${data.line || '—'} | Shift: ${data.shift || '—'} | Generated: ${new Date().toLocaleString('en-IN')}`
      );

      // ===== FRAUD RESULT BOX (if available) =====
      const fraud = data.fraudAnalysis || data.fraud_analysis;
      if (fraud) {
        const verdict = fraud.overallVerdict || fraud.verdict || 'N/A';
        const genuineScore = fraud.genuineScore || (100 - (fraud.overallScore || fraud.fraudScore || 0));
        const verdictColor = getResultColor(verdict);
        const verdictBg = verdict === 'GENUINE' ? '#dcfce7' : verdict === 'LIKELY_DUMMY' ? '#fee2e2' : '#fef9c3';

        drawRect(doc, 40, doc.y, pageW, 30, verdictBg);
        doc.fontSize(14).font('Helvetica-Bold').fillColor(verdictColor)
          .text(`Fraud Check: ${verdict.replace('_', ' ')} — Genuine Score: ${genuineScore}%`, 40, doc.y + 7, { width: pageW, align: 'center' });
        doc.y += 36;
      }

      // ===== GENERAL INFO =====
      addSectionHeader(doc, 'INSPECTION DETAILS');

      const info = [
        ['Date', data.date || '—'],
        ['Shift', data.shift || '—'],
        ['Line', data.line || '—'],
        ['PO Number', data.po_number || '—'],
        ['Inspector', data.inspector_name || '—'],
        ['Source', data.source || '—'],
      ];
      info.forEach(([k, v2]) => addKeyValue(doc, k, v2));
      doc.y += 4;

      // ===== PAGE 1: SHOP FLOOR & STRINGER =====
      checkPageBreak(doc, 80);
      addSectionHeader(doc, 'PAGE 1: SHOP FLOOR & STRINGER');

      const page1 = [
        ['Shop Floor Temp', data.shop_floor_temp ? `${data.shop_floor_temp}°C` : '—'],
        ['Humidity', data.shop_floor_humidity ? `${data.shop_floor_humidity}%` : '—'],
        ['Glass Dimension', data.glass_dimension || '—'],
        ['Glass Visual', data.glass_visual || 'OK'],
        ['EVA/EPE Type', data.eva_epe_type || '—'],
        ['EVA/EPE Dimension', data.eva_epe_dimension || '—'],
        ['Soldering Temp', data.soldering_temp ? `${data.soldering_temp}°C` : '—'],
        ['Cell Manufacturer', data.cell_manufacturer || '—'],
        ['Cell Efficiency', data.cell_efficiency ? `${data.cell_efficiency}%` : '—'],
        ['Cell Size', data.cell_size || '—'],
        ['Cell Condition', data.cell_condition || 'OK'],
        ['Stringer Spec', data.stringer_specification || 'OK'],
        ['Cutting Equal', data.cutting_equal || 'Equal'],
        ['TS Visual', data.ts_visual || 'OK'],
        ['TS EL Image', data.ts_el_image || 'OK'],
        ['String Length', data.string_length || '—'],
      ];
      page1.forEach(([k, v2]) => addKeyValue(doc, k, v2, { fontSize: 8 }));

      // Cell Gap Table
      const cellGaps = [
        ['TS01A', data.cell_gap_ts01a], ['TS01B', data.cell_gap_ts01b],
        ['TS02A', data.cell_gap_ts02a], ['TS02B', data.cell_gap_ts02b],
        ['TS03A', data.cell_gap_ts03a], ['TS03B', data.cell_gap_ts03b],
        ['TS04A', data.cell_gap_ts04a], ['TS04B', data.cell_gap_ts04b],
      ].filter(([, v2]) => v2 != null);

      if (cellGaps.length > 0) {
        doc.y += 2;
        addKeyValue(doc, 'Cell Gaps', cellGaps.map(([k, v2]) => `${k}: ${v2}mm`).join(' | '), { fontSize: 8 });
      }

      // ===== PAGE 2: SOLDERING & LAYOUT =====
      doc.y += 4;
      checkPageBreak(doc, 80);
      addSectionHeader(doc, 'PAGE 2: SOLDERING & LAYOUT');

      const page2 = [
        ['Peel Strength (Ribbon-Cell)', data.peel_strength_ribbon_cell ? `${data.peel_strength_ribbon_cell}N` : '—'],
        ['Peel Strength (Ribbon-Busbar)', data.peel_strength_ribbon_busbar ? `${data.peel_strength_ribbon_busbar}N` : '—'],
        ['String-to-String Gap', data.string_to_string_gap ? `${data.string_to_string_gap}mm` : '—'],
        ['Cell Edge (Top)', data.cell_edge_glass_top ? `${data.cell_edge_glass_top}mm` : '—'],
        ['Cell Edge (Bottom)', data.cell_edge_glass_bottom ? `${data.cell_edge_glass_bottom}mm` : '—'],
        ['Cell Edge (Sides)', data.cell_edge_glass_sides ? `${data.cell_edge_glass_sides}mm` : '—'],
        ['Soldering Quality', data.soldering_quality || 'OK'],
        ['Creepage (Top)', data.creepage_top ? `${data.creepage_top}mm` : '—'],
        ['Creepage (Bottom)', data.creepage_bottom ? `${data.creepage_bottom}mm` : '—'],
        ['Creepage (Left)', data.creepage_left ? `${data.creepage_left}mm` : '—'],
        ['Creepage (Right)', data.creepage_right ? `${data.creepage_right}mm` : '—'],
        ['Auto Taping', data.auto_taping || 'OK'],
        ['Back EVA Type', data.back_eva_type || '—'],
        ['Back Glass Dimension', data.back_glass_dimension || '—'],
      ];
      page2.forEach(([k, v2]) => addKeyValue(doc, k, v2, { fontSize: 8 }));

      // ===== PAGE 3: PRE-LAMINATION =====
      doc.y += 4;
      checkPageBreak(doc, 80);
      addSectionHeader(doc, 'PAGE 3: PRE-LAMINATION');

      const page3 = [
        ['Holes Count', data.holes_count || 3],
        ['Hole 1 Dim', data.hole1_dimension ? `${data.hole1_dimension}mm` : '—'],
        ['Hole 2 Dim', data.hole2_dimension ? `${data.hole2_dimension}mm` : '—'],
        ['Hole 3 Dim', data.hole3_dimension ? `${data.hole3_dimension}mm` : '—'],
        ['Busbar Flatten', data.busbar_flatten || 'OK'],
        ['Pre-Lam Visual', data.pre_lam_visual || 'OK'],
        ['Rework Station', data.rework_station_clean || 'Clean'],
        ['Soldering Iron Temp 1', data.soldering_iron_temp1 ? `${data.soldering_iron_temp1}°C` : '—'],
        ['Soldering Iron Temp 2', data.soldering_iron_temp2 ? `${data.soldering_iron_temp2}°C` : '—'],
        ['Rework Method', data.rework_method || 'Manual'],
      ];
      page3.forEach(([k, v2]) => addKeyValue(doc, k, v2, { fontSize: 8 }));

      // ===== PAGE 4: POST-LAMINATION =====
      doc.y += 4;
      checkPageBreak(doc, 80);
      addSectionHeader(doc, 'PAGE 4: POST-LAMINATION');

      const page4 = [
        ['Peel Test (EVA-Glass)', data.peel_test_eva_glass || '—'],
        ['Peel Test (EVA-Backsheet)', data.peel_test_eva_backsheet || '—'],
        ['Gel Content', data.gel_content || '—'],
        ['Trimming Quality', data.trimming_quality || 'OK'],
        ['Post-Lam Visual', data.post_lam_visual || 'OK'],
        ['Short Side Glue Weight', data.short_side_glue_weight ? `${data.short_side_glue_weight}g` : '—'],
        ['Long Side Glue Weight', data.long_side_glue_weight ? `${data.long_side_glue_weight}g` : '—'],
        ['Anodizing Thickness', data.anodizing_thickness ? `${data.anodizing_thickness}µm` : '—'],
      ];
      page4.forEach(([k, v2]) => addKeyValue(doc, k, v2, { fontSize: 8 }));

      // ===== PAGE 5: JB ASSEMBLY =====
      doc.y += 4;
      checkPageBreak(doc, 80);
      addSectionHeader(doc, 'PAGE 5: JB ASSEMBLY & CURING');

      const page5 = [
        ['JB Appearance', data.jb_appearance || 'OK'],
        ['JB Cable Length', data.jb_cable_length ? `${data.jb_cable_length}mm` : '—'],
        ['Silicon Glue Weight', data.silicon_glue_weight ? `${data.silicon_glue_weight}g` : '—'],
        ['Welding Current', data.welding_current ? `${data.welding_current}A` : '—'],
        ['Potting Weight', data.potting_weight ? `${data.potting_weight}g` : '—'],
        ['Curing Temp', data.curing_temp ? `${data.curing_temp}°C` : '—'],
        ['Curing Humidity', data.curing_humidity ? `${data.curing_humidity}%` : '—'],
        ['Curing Time', data.curing_time || '—'],
      ];
      page5.forEach(([k, v2]) => addKeyValue(doc, k, v2, { fontSize: 8 }));

      // ===== PAGE 6: FLASH TESTER & EL =====
      doc.y += 4;
      checkPageBreak(doc, 80);
      addSectionHeader(doc, 'PAGE 6: FLASH TESTER & EL');

      const page6 = [
        ['Ambient Temp', data.ambient_temp ? `${data.ambient_temp}°C` : '—'],
        ['Module Temp', data.module_temp ? `${data.module_temp}°C` : '—'],
        ['Simulator Calibration', data.simulator_calibration || 'OK'],
        ['EL Check', data.el_check || 'OK'],
        ['DCW Values', [data.dcw_value1, data.dcw_value2, data.dcw_value3, data.dcw_value4].filter(v2 => v2 != null).join(', ') || '—'],
        ['IR Values', [data.ir_value1, data.ir_value2, data.ir_value3, data.ir_value4].filter(v2 => v2 != null).join(', ') || '—'],
        ['Ground Continuity', data.ground_continuity || '—'],
        ['Post EL Visual', data.post_el_visual || 'OK'],
      ];
      page6.forEach(([k, v2]) => addKeyValue(doc, k, v2, { fontSize: 8 }));

      // ===== PAGE 7: FINAL & PACKAGING =====
      doc.y += 4;
      checkPageBreak(doc, 80);
      addSectionHeader(doc, 'PAGE 7: FINAL & PACKAGING');

      const page7 = [
        ['Final Visual', data.final_visual || 'OK'],
        ['Module Dimension', data.module_dimension || '—'],
        ['Diagonal Difference', data.diagonal_difference ? `${data.diagonal_difference}mm` : '—'],
        ['Cable Length', data.cable_length_final ? `${data.cable_length_final}mm` : '—'],
        ['Box Condition', data.box_condition || 'OK'],
        ['Packaging Label', data.packaging_label || 'OK'],
      ];
      page7.forEach(([k, v2]) => addKeyValue(doc, k, v2, { fontSize: 8 }));

      // ===== SERIAL NUMBERS (if any) =====
      const serials = data.serials || [];
      if (serials.length > 0) {
        doc.y += 4;
        checkPageBreak(doc, 60);
        addSectionHeader(doc, `SERIAL NUMBERS (${serials.length})`);

        // Group serials by page
        const byPage = {};
        serials.forEach(s => {
          const pg = s.page_number || s.pageNumber || 0;
          if (!byPage[pg]) byPage[pg] = [];
          byPage[pg].push(s.serial_number || s);
        });

        Object.entries(byPage).forEach(([pg, sns]) => {
          checkPageBreak(doc, 20);
          doc.fontSize(8).font('Helvetica-Bold').fillColor(COLORS.mediumText)
            .text(`Page ${pg}: `, 44, doc.y, { continued: true });
          doc.font('Helvetica').fillColor(COLORS.darkText)
            .text(sns.join(', '));
          doc.y += 4;
        });
      }

      // ===== FRAUD DETAILS (if any) =====
      if (fraud) {
        doc.y += 4;
        checkPageBreak(doc, 80);
        const fVerdict = fraud.overallVerdict || fraud.verdict || 'N/A';
        addSectionHeader(doc, 'FRAUD DETECTION SUMMARY', fVerdict === 'GENUINE' ? COLORS.success : fVerdict === 'LIKELY_DUMMY' ? COLORS.danger : COLORS.warning);

        addKeyValue(doc, 'Genuine Score', `${fraud.genuineScore || (100 - (fraud.overallScore || 0))}%`, {
          color: (fraud.genuineScore || (100 - (fraud.overallScore || 0))) >= 80 ? COLORS.success : COLORS.danger,
          bold: true
        });
        addKeyValue(doc, 'Fraud Score', `${fraud.overallScore || fraud.fraudScore || 0}/100`, { bold: true });
        addKeyValue(doc, 'Verdict', fVerdict, { color: getResultColor(fVerdict), bold: true });
        if (fraud.overallSummary) addKeyValue(doc, 'Summary', fraud.overallSummary);

        // Statistical flags
        const flags = fraud.statisticalAnalysis?.flags || [];
        if (flags.length > 0) {
          doc.y += 4;
          checkPageBreak(doc, 20);
          doc.fontSize(8).font('Helvetica-Bold').fillColor(COLORS.danger)
            .text(`Statistical Flags (${flags.length}):`, 44, doc.y);
          doc.y += 4;
          flags.slice(0, 5).forEach(flag => {
            checkPageBreak(doc, 16);
            doc.fontSize(7).font('Helvetica').fillColor(COLORS.mediumText)
              .text(`[${flag.severity}] ${flag.parameter}: ${flag.message}`, 52, doc.y, { width: pageW - 20 });
            doc.y += 4;
          });
        }
      }

      // ===== FOOTER =====
      const footerY = doc.page.height - 30;
      drawLine(doc, footerY - 5, 40, doc.page.width - 40, '#e2e8f0', 0.5);
      doc.fontSize(7).font('Helvetica').fillColor(COLORS.lightText)
        .text('This is an auto-generated IPQC summary report by Gautam Solar QC System.', 40, footerY, { width: pageW, align: 'center' });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

// ============================
// IPQC OCR SUMMARY PDF (from checklist + processing result)
// ============================
function generateIPQCOcrSummaryPDF(checklist, result) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 40, bottom: 40, left: 40, right: 40 },
        info: {
          Title: 'IPQC Checksheet OCR Summary',
          Author: 'Gautam Solar — Quality Assurance',
          Subject: 'IPQC OCR Inspection Summary',
        }
      });

      const buffers = [];
      doc.on('data', chunk => buffers.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      const pageW = doc.page.width - 80;

      // ===== HEADER =====
      addCompanyHeader(doc,
        'IPQC Checksheet — OCR Summary Report',
        `Date: ${checklist.date || '—'} | Line: ${checklist.Line || '—'} | Shift: ${checklist.Shift || '—'} | Generated: ${new Date().toLocaleString('en-IN')}`
      );

      // ===== FRAUD RESULT (if available) =====
      const fraud = result.fraudAnalysis;
      if (fraud) {
        const verdict = fraud.overallVerdict || 'N/A';
        const genuineScore = fraud.genuineScore || (100 - (fraud.overallScore || 0));
        const verdictColor = getResultColor(verdict);
        const verdictBg = verdict === 'GENUINE' ? '#dcfce7' : verdict === 'LIKELY_DUMMY' ? '#fee2e2' : '#fef9c3';

        drawRect(doc, 40, doc.y, pageW, 30, verdictBg);
        doc.fontSize(14).font('Helvetica-Bold').fillColor(verdictColor)
          .text(`Fraud Check: ${verdict.replace(/_/g, ' ')} — Genuine Score: ${genuineScore}%`, 40, doc.y + 7, { width: pageW, align: 'center' });
        doc.y += 36;
      }

      // ===== SCAN STATS =====
      const stats = result.stats || {};
      const extracted = result.extractedData || [];
      const totalPages = stats.totalPages || extracted.length || 0;
      const pagesScanned = stats.pagesScanned || extracted.filter(p => (p.rawText?.length || 0) > 0).length;
      const totalSerials = stats.totalSerials || extracted.reduce((s, p) => s + (p.serialNumbers?.length || 0), 0);
      const totalTemps = stats.totalTemps || extracted.reduce((s, p) => s + (p.temperatures?.length || 0), 0);
      const totalTimes = stats.totalTimes || extracted.reduce((s, p) => s + (p.times?.length || 0), 0);
      const totalDates = stats.totalDates || extracted.reduce((s, p) => s + (p.dates?.length || 0), 0);
      const totalDims = stats.totalDimensions || extracted.reduce((s, p) => s + (p.dimensions?.length || 0), 0);

      // Stats row
      const statBoxW = pageW / 5;
      const statsY = doc.y;
      const statItems = [
        { label: 'Pages Scanned', value: `${pagesScanned}/${totalPages}`, color: COLORS.secondary },
        { label: 'Serial Numbers', value: totalSerials, color: COLORS.success },
        { label: 'Temperatures', value: totalTemps, color: '#e11d48' },
        { label: 'Times', value: totalTimes, color: COLORS.warning },
        { label: 'Dimensions', value: totalDims, color: '#7c3aed' },
      ];

      statItems.forEach((st, i) => {
        const x = 40 + i * statBoxW;
        drawRect(doc, x, statsY, statBoxW - 4, 36, COLORS.lightGray);
        doc.fontSize(16).font('Helvetica-Bold').fillColor(st.color)
          .text(String(st.value), x, statsY + 4, { width: statBoxW - 4, align: 'center' });
        doc.fontSize(7).font('Helvetica').fillColor(COLORS.lightText)
          .text(st.label, x, statsY + 24, { width: statBoxW - 4, align: 'center' });
      });
      doc.y = statsY + 42;

      // ===== INSPECTION DETAILS =====
      addSectionHeader(doc, 'INSPECTION DETAILS');
      const info = [
        ['Date', checklist.date || '—'],
        ['Line', checklist.Line || '—'],
        ['Shift', checklist.Shift || '—'],
        ['Excel Generated', result.excelGenerated ? 'Yes' : 'No'],
        ['OCR Scan %', `${stats.scanPercent || 0}%`],
        ['Data Found %', `${stats.dataFetchPercent || 0}%`],
      ];
      info.forEach(([k, v2]) => addKeyValue(doc, k, v2));
      doc.y += 4;

      // ===== PAGE-BY-PAGE DATA =====
      extracted.forEach((page, idx) => {
        checkPageBreak(doc, 80);
        const pageNum = page.pageNumber || idx + 1;
        const hasData = (page.serialNumbers?.length || 0) > 0 || (page.temperatures?.length || 0) > 0 ||
          (page.times?.length || 0) > 0 || (page.dates?.length || 0) > 0 || (page.dimensions?.length || 0) > 0;
        const scanOk = (page.rawText?.length || 0) > 0;

        addSectionHeader(doc,
          `PAGE ${pageNum} — ${scanOk ? (hasData ? 'Data Extracted' : 'Scanned (no structured data)') : 'NOT SCANNED'}`,
          scanOk ? (hasData ? COLORS.success : COLORS.secondary) : COLORS.danger
        );

        if (!scanOk && !hasData) {
          doc.fontSize(8).font('Helvetica').fillColor(COLORS.lightText)
            .text('OCR returned empty — page could not be scanned.', 44, doc.y);
          doc.y += 14;
          return;
        }

        // Mini stats for page
        const miniStats = [];
        if (page.rawText?.length) miniStats.push(`${page.rawText.length.toLocaleString()} chars`);
        if (page.serialNumbers?.length) miniStats.push(`${page.serialNumbers.length} serials`);
        if (page.temperatures?.length) miniStats.push(`${page.temperatures.length} temps`);
        if (page.times?.length) miniStats.push(`${page.times.length} times`);
        if (page.dates?.length) miniStats.push(`${page.dates.length} dates`);
        if (page.dimensions?.length) miniStats.push(`${page.dimensions.length} dims`);
        if (page.percentages?.length) miniStats.push(`${page.percentages.length} %`);

        if (miniStats.length > 0) {
          doc.fontSize(7).font('Helvetica').fillColor(COLORS.mediumText)
            .text(miniStats.join(' | '), 44, doc.y);
          doc.y += 12;
        }

        // Serial numbers
        if (page.serialNumbers?.length > 0) {
          checkPageBreak(doc, 20);
          doc.fontSize(8).font('Helvetica-Bold').fillColor(COLORS.darkText)
            .text(`Serial Numbers (${page.serialNumbers.length}):`, 48, doc.y);
          doc.y += 10;
          // Show serials in rows of 3
          for (let si = 0; si < page.serialNumbers.length; si += 3) {
            checkPageBreak(doc, 14);
            const batch = page.serialNumbers.slice(si, si + 3);
            doc.fontSize(7).font('Helvetica').fillColor(COLORS.darkText)
              .text(batch.join('    |    '), 52, doc.y);
            doc.y += 10;
          }
          doc.y += 2;
        }

        // Temperatures
        if (page.temperatures?.length > 0) {
          checkPageBreak(doc, 16);
          doc.fontSize(8).font('Helvetica-Bold').fillColor('#e11d48')
            .text(`Temperatures: `, 48, doc.y, { continued: true });
          doc.font('Helvetica').fillColor(COLORS.darkText)
            .text(page.temperatures.join(', '));
          doc.y += 4;
        }

        // Times
        if (page.times?.length > 0) {
          checkPageBreak(doc, 16);
          doc.fontSize(8).font('Helvetica-Bold').fillColor(COLORS.warning)
            .text(`Times: `, 48, doc.y, { continued: true });
          doc.font('Helvetica').fillColor(COLORS.darkText)
            .text(page.times.join(', '));
          doc.y += 4;
        }

        // Dates
        if (page.dates?.length > 0) {
          checkPageBreak(doc, 16);
          doc.fontSize(8).font('Helvetica-Bold').fillColor(COLORS.secondary)
            .text(`Dates: `, 48, doc.y, { continued: true });
          doc.font('Helvetica').fillColor(COLORS.darkText)
            .text(page.dates.join(', '));
          doc.y += 4;
        }

        // Dimensions
        if (page.dimensions?.length > 0) {
          checkPageBreak(doc, 16);
          doc.fontSize(8).font('Helvetica-Bold').fillColor('#7c3aed')
            .text(`Dimensions: `, 48, doc.y, { continued: true });
          doc.font('Helvetica').fillColor(COLORS.darkText)
            .text(page.dimensions.join(', '));
          doc.y += 4;
        }

        // Percentages
        if (page.percentages?.length > 0) {
          checkPageBreak(doc, 16);
          doc.fontSize(8).font('Helvetica-Bold').fillColor(COLORS.success)
            .text(`Percentages: `, 48, doc.y, { continued: true });
          doc.font('Helvetica').fillColor(COLORS.darkText)
            .text(page.percentages.join(', '));
          doc.y += 4;
        }

        doc.y += 6;
      });

      // ===== FRAUD DETAILS =====
      if (fraud) {
        checkPageBreak(doc, 80);
        const fVerdict = fraud.overallVerdict || 'N/A';
        addSectionHeader(doc, 'FRAUD DETECTION SUMMARY',
          fVerdict === 'GENUINE' ? COLORS.success : fVerdict === 'LIKELY_DUMMY' ? COLORS.danger : COLORS.warning
        );

        addKeyValue(doc, 'Genuine Score', `${fraud.genuineScore || (100 - (fraud.overallScore || 0))}%`, {
          color: (fraud.genuineScore || (100 - (fraud.overallScore || 0))) >= 80 ? COLORS.success : COLORS.danger,
          bold: true
        });
        addKeyValue(doc, 'Fraud Score', `${fraud.overallScore || 0}/100`, { bold: true });
        addKeyValue(doc, 'Verdict', fVerdict, { color: getResultColor(fVerdict), bold: true });
        if (fraud.overallSummary) addKeyValue(doc, 'Summary', fraud.overallSummary);

        if (fraud.copyDetected) {
          addKeyValue(doc, 'Copy Detected', 'YES — Data appears copied from past checksheet!', { color: COLORS.danger, bold: true });
        }

        const flags = fraud.statisticalAnalysis?.flags || [];
        if (flags.length > 0) {
          doc.y += 4;
          checkPageBreak(doc, 20);
          doc.fontSize(8).font('Helvetica-Bold').fillColor(COLORS.danger)
            .text(`Statistical Flags (${flags.length}):`, 44, doc.y);
          doc.y += 4;
          flags.slice(0, 8).forEach(flag => {
            checkPageBreak(doc, 16);
            doc.fontSize(7).font('Helvetica').fillColor(COLORS.mediumText)
              .text(`[${flag.severity}] ${flag.parameter}: ${flag.message}`, 52, doc.y, { width: pageW - 20 });
            doc.y += 4;
          });
        }
      }

      // ===== FOOTER =====
      const footerY = doc.page.height - 30;
      drawLine(doc, footerY - 5, 40, doc.page.width - 40, '#e2e8f0', 0.5);
      doc.fontSize(7).font('Helvetica').fillColor(COLORS.lightText)
        .text('This is an auto-generated IPQC OCR summary report by Gautam Solar QC System.', 40, footerY, { width: pageW, align: 'center' });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = {
  generateIQCSummaryPDF,
  generateIPQCSummaryPDF,
  generateIPQCOcrSummaryPDF,
};
