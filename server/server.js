/**
 * IPQC OCR Standalone Server
 * Azure Document Intelligence + Python Excel Filler
 * 
 * Port: 5001
 * API:
 *   - POST /api/ipqc-ocr/upload - Single image upload
 *   - POST /api/ipqc-ocr/process-all - Multiple images, fill Excel
 *   - POST /api/ipqc-ocr/process-from-urls - Process from PDF URLs
 *   - GET /api/ipqc-ocr/download/:filename - Download filled Excel
 */

const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const axios = require('axios');
const { AzureKeyCredential, DocumentAnalysisClient } = require('@azure/ai-form-recognizer');
const { spawn } = require('child_process');
const { analyzeIPQCFraud, extractIPQCValues } = require('./ipqc_fraud_engine');
const ipqcDB = require('./ipqc_database');
const { generateIQCSummaryPDF, generateIPQCSummaryPDF, generateIPQCOcrSummaryPDF } = require('./pdf_summary_generator');

const app = express();
const PORT = process.env.PORT || 5001;

// Azure Document Intelligence credentials
const AZURE_ENDPOINT = 'https://ipqcdoc1234.cognitiveservices.azure.com/';
const AZURE_KEY = '3SAIOHgwBwreEtn7g7Kd9zzePXR9uUDkVmSMkT9oA8FCWjjrlMOFJQQJ99CBACrJL3JXJ3w3AAALACOGzUYp';

// Excel template path — auto-detect OS, fallback to server/templates/
const EXCEL_TEMPLATE_PATH = process.platform === 'win32'
  ? 'C:\\Users\\hp\\Desktop\\IPQC Check Sheet.xlsx'
  : path.join(__dirname, 'templates', 'IPQC_Check_Sheet.xlsx');

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Serve React build (frontend + backend on same port)
const buildPath = path.join(__dirname, '..', 'build');
if (fs.existsSync(buildPath)) {
  app.use(express.static(buildPath));
  console.log('📦 Serving React build from:', buildPath);
}

// Multer setup for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, `ipqc_${Date.now()}_${file.originalname}`);
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB
});

// ========== AZURE OCR ==========
async function analyzeDocument(filePath, maxRetries = 3) {
  const client = new DocumentAnalysisClient(AZURE_ENDPOINT, new AzureKeyCredential(AZURE_KEY));
  const fileBuffer = fs.readFileSync(filePath);
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[OCR] Analyzing: ${path.basename(filePath)} (attempt ${attempt}/${maxRetries})`);
      const poller = await client.beginAnalyzeDocument('prebuilt-read', fileBuffer);
      const result = await poller.pollUntilDone();
      
      if (!result.content || result.content.trim().length === 0) {
        console.warn(`[OCR] Warning: Empty result for ${path.basename(filePath)} on attempt ${attempt}`);
        if (attempt < maxRetries) {
          const delay = attempt * 15000; // 15s, 30s, 45s
          console.log(`[OCR] Retrying in ${delay / 1000}s...`);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
      }
      
      return { text: result.content || '' };
    } catch (err) {
      const status = err.statusCode || err.code || err.response?.status || '';
      console.error(`[OCR] Attempt ${attempt} failed: ${err.message} (status: ${status})`);
      
      // Retry on 502, 503, 429 (rate limit), or network errors
      const retryable = [502, 503, 429].includes(Number(status)) || 
                        err.message.includes('502') || 
                        err.message.includes('503') || 
                        err.message.includes('ECONNRESET') ||
                        err.message.includes('ETIMEDOUT') ||
                        err.message.includes('rate') ||
                        err.message.includes('throttl');
      
      if (retryable && attempt < maxRetries) {
        const delay = attempt * 20000; // 20s, 40s, 60s
        console.log(`[OCR] Retryable error. Waiting ${delay / 1000}s before retry...`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      
      throw err; // Non-retryable or max retries reached
    }
  }
  
  return { text: '' };
}

// ========== PARSE IPQC DATA ==========
function parseIPQCData(text, pageNumber) {
  const data = {};
  
  // Serial numbers - BULLETPROOF extraction
  // OCR corruption types:
  //   1. GS prefix → 45, 93, 65, 05, US, CS, LYS, etc.
  //   2. '0' (zero) → 'O' (letter) — e.g. O4890 instead of 04890
  //   3. Spaces inserted in model code — e.g. "LYS0 4890", "43048 30"
  //   4. Digit corruption — 04 → 09 (e.g. 09890 instead of 04890)
  // Strategy: Use multiple regex passes to catch everything
  
  const serialPatterns = [
    // Pattern 1: Standard — prefix + 04xxx model code (0 is digit)
    /[A-Za-z0-9]{0,6}04[3-9]\d[0O]\s*[A-Za-z0-9+]{1,5}\s*\d{6,}/gi,
    // Pattern 2: O/0 confusion — OCR writes letter O instead of zero before 4
    /[A-Za-z0-9]{0,6}O\s*4[3-9]\d[0O]\s*[A-Za-z0-9+]{1,5}\s*\d{6,}/gi,
    // Pattern 3: Space in model code — "LYS0 4890" or similar
    /[A-Za-z0-9]{0,6}[0O]\s+4[3-9]\d[0O]\s*[A-Za-z0-9+]{1,5}\s*\d{6,}/gi,
    // Pattern 4: Digit corruption — 04→09, model becomes 09890
    /[A-Za-z0-9]{0,6}[0O]\s*[49][3-9]\d[0O]\s*[A-Za-z0-9+]{1,5}\s*\d{6,}/gi,
    // Pattern 5: Rearranged/split — "43048 30Tcs..." 
    /[A-Za-z0-9]{0,3}[0O]?4[3-9][0O]?[3-9]\d?\s*[0O]\s*[A-Za-z0-9+]{1,5}\s*\d{6,}/gi,
  ];
  
  let allRaw = [];
  for (const regex of serialPatterns) {
    const matches = text.match(regex) || [];
    allRaw.push(...matches);
  }
  
  // Clean and normalize each serial
  let serials = allRaw.map(s => {
    // Remove all spaces
    s = s.replace(/\s+/g, '');
    // Find the model code position — handle O/0 confusion in model
    // Try standard 04 first, then O4, then 09
    let modelMatch = s.match(/([0O]4[3-9]\d)([0O])/) || s.match(/([0O][49][3-9]\d)([0O])/);
    if (modelMatch) {
      const modelIdx = s.indexOf(modelMatch[0]);
      // Extract the actual model digits (fix O→0, 9→4 if needed)
      let modelDigits = modelMatch[1].replace(/^[Oo]/, '0');
      // Fix 09→04 corruption (09890→04890)
      if (modelDigits[1] === '9') modelDigits = modelDigits[0] + '4' + modelDigits.substring(2);
      // Rebuild: GS + model + 0 + rest
      s = 'GS' + modelDigits + '0' + s.substring(modelIdx + modelMatch[0].length);
    }
    // Truncate to 20 chars max
    if (s.length > 20) s = s.substring(0, 20);
    return s;
  }).filter(s => s.length >= 15);
  
  // Deduplicate by last 8 digits
  const seen = new Set();
  serials = serials.filter(s => {
    const key = s.slice(-8);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  
  data.serialNumbers = serials;
  console.log(`   Page ${pageNumber}: Found ${serials.length} serial numbers`);
  
  // Temperatures
  const tempRegex = /(\d{2,3}\.?\d*)\s*[°]?\s*[Cc]/g;
  const temps = [];
  let match;
  while ((match = tempRegex.exec(text)) !== null) {
    temps.push(match[1] + '°C');
  }
  data.temperatures = temps;
  
  // Dimensions
  const dimRegex = /(\d+\.?\d*)\s*[×xX]\s*(\d+\.?\d*)\s*[×xX]?\s*(\d+\.?\d*)?\s*mm/gi;
  data.dimensions = text.match(dimRegex) || [];
  
  // Times  
  const timeRegex = /(\d{1,2}:\d{2}\s*[AP]M)/gi;
  data.times = text.match(timeRegex) || [];
  
  // Dates
  const dateRegex = /(\d{2}[-\/]\d{2}[-\/]\d{2,4})/g;
  data.dates = text.match(dateRegex) || [];
  
  // Percentages
  const percentRegex = /(\d+\.?\d*)\s*%/g;
  data.percentages = text.match(percentRegex) || [];
  
  data.rawText = text;
  data.pageNumber = pageNumber;
  
  return data;
}

async function autoSaveOcrPagesToDb(allPagesData, meta = {}) {
  const ocrValues = extractIPQCValues(allPagesData || []);
  const nowDate = new Date().toISOString().slice(0, 10);
  const dateValue = meta.date || ocrValues.date || nowDate;
  const shiftValue = meta.shift || ocrValues.shift || 'Unknown';
  const lineRaw = meta.line || ocrValues.line || 'Unknown';
  const lineValue = String(lineRaw).replace(/^Line\s*/i, '').trim() || 'Unknown';

  const dbRecord = {
    // Basic info
    date: dateValue,
    shift: shiftValue,
    line: lineValue,
    time: ocrValues.time || '',
    po_number: meta.poNumber || '',
    inspector_name: meta.inspectorName || '',
    source: 'ocr',

    // Page 1 - Shop Floor & Stringer
    shop_floor_temp: ocrValues.shopFloorTemp,
    shop_floor_humidity: ocrValues.shopFloorHumidity,
    glass_dimension: ocrValues.glassDimension,
    glass_visual: ocrValues.glassVisual || 'OK',
    eva_epe_type: ocrValues.evaEpeType,
    eva_epe_dimension: ocrValues.evaEpeDimension,
    eva_epe_status: ocrValues.evaEpeStatus || 'OK',
    soldering_temp: ocrValues.solderingTemp,
    cell_manufacturer: ocrValues.cellManufacturer,
    cell_efficiency: ocrValues.cellEfficiency,
    cell_size: ocrValues.cellSize,
    cell_condition: ocrValues.cellCondition || 'OK',
    cell_loading_cleanliness: ocrValues.cellLoadingCleanliness || 'Clean',
    stringer_specification: ocrValues.stringerSpecification || 'OK',
    cutting_equal: ocrValues.cuttingEqual || 'Equal',
    ts_visual: ocrValues.tsVisual || 'OK',
    ts_el_image: ocrValues.tsElImage || 'OK',
    string_length: ocrValues.stringLength,
    cell_gap_ts01a: ocrValues.cellToGapValues[0] || null,
    cell_gap_ts01b: ocrValues.cellToGapValues[1] || null,
    cell_gap_ts02a: ocrValues.cellToGapValues[2] || null,
    cell_gap_ts02b: ocrValues.cellToGapValues[3] || null,
    cell_gap_ts03a: ocrValues.cellToGapValues[4] || null,
    cell_gap_ts03b: ocrValues.cellToGapValues[5] || null,
    cell_gap_ts04a: ocrValues.cellToGapValues[6] || null,
    cell_gap_ts04b: ocrValues.cellToGapValues[7] || null,

    // Page 2 - Soldering & Layout
    peel_strength_ribbon_cell: ocrValues.peelStrengthRibbonToCell,
    peel_strength_ribbon_busbar: ocrValues.peelStrengthRibbonToBusbar,
    string_to_string_gap: ocrValues.stringToStringGap,
    cell_edge_glass_top: ocrValues.cellEdgeToGlassTop,
    cell_edge_glass_bottom: ocrValues.cellEdgeToGlassBottom,
    cell_edge_glass_sides: ocrValues.cellEdgeToGlassSides,
    terminal_busbar_to_cell: ocrValues.terminalBusbarToCell,
    soldering_quality: ocrValues.solderingQuality || 'OK',
    creepage_top: ocrValues.creepageDistances[0] || null,
    creepage_bottom: ocrValues.creepageDistances[1] || null,
    creepage_left: ocrValues.creepageDistances[2] || null,
    creepage_right: ocrValues.creepageDistances[3] || null,
    creepage_extra: ocrValues.creepageDistances[4] || null,
    auto_taping: ocrValues.autoTaping || 'OK',
    rfid_logo_position: ocrValues.rfidLogoPosition || 'OK',
    back_eva_type: ocrValues.backEvaType,
    back_eva_dimension: ocrValues.backEvaDimension,
    back_glass_dimension: ocrValues.backGlassDimension,

    // Page 3 - Pre-Lamination
    holes_count: ocrValues.holesCount || 3,
    hole1_dimension: ocrValues.holeDimensions[0] || null,
    hole2_dimension: ocrValues.holeDimensions[1] || null,
    hole3_dimension: ocrValues.holeDimensions[2] || null,
    busbar_flatten: ocrValues.busbarFlatten || 'OK',
    pre_lam_visual: ocrValues.preLamVisual || 'OK',
    rework_station_clean: ocrValues.reworkStationClean || 'Clean',
    soldering_iron_temp1: ocrValues.solderingIronTemp,
    soldering_iron_temp2: ocrValues.solderingIronTemp2,
    rework_method: ocrValues.reworkMethod || 'Manual',

    // Page 4 - Post-Lamination
    peel_test_eva_glass: ocrValues.peelTestEvaGlass,
    peel_test_eva_backsheet: ocrValues.peelTestEvaBacksheet,
    gel_content: ocrValues.gelContent,
    tape_removing: ocrValues.tapeRemoving || 'OK',
    trimming_quality: ocrValues.trimmingQuality || 'OK',
    trimming_blade_status: ocrValues.trimmingBladeStatus || 'OK',
    post_lam_visual: ocrValues.postLamVisual || 'OK',
    glue_uniformity: ocrValues.glueUniformity || 'OK',
    short_side_glue_weight: ocrValues.glueWeight,
    long_side_glue_weight: ocrValues.longSideGlueWeight,
    anodizing_thickness: ocrValues.anodizingThickness,

    // Page 5 - JB Assembly & Curing
    jb_appearance: ocrValues.jbAppearance || 'OK',
    jb_cable_length: ocrValues.jbCableLength,
    silicon_glue_weight: ocrValues.siliconGlueWeight,
    welding_time: ocrValues.weldingTime,
    welding_current: ocrValues.weldingCurrent,
    soldering_quality_jb: ocrValues.solderingQualityJB || 'OK',
    glue_ratio: ocrValues.glueRatio,
    potting_weight: ocrValues.pottingWeight,
    nozzle_status: ocrValues.nozzleStatus || 'OK',
    potting_inspection: ocrValues.pottingInspection || 'OK',
    curing_visual: ocrValues.curingVisual || 'OK',
    curing_temp: ocrValues.curingTemp,
    curing_humidity: ocrValues.curingHumidity,
    curing_time: ocrValues.curingTime,
    buffing_condition: ocrValues.buffingCondition || 'OK',
    cleaning_status: ocrValues.cleaningStatus || 'OK',

    // Page 6 - Flash Tester & EL
    ambient_temp: ocrValues.ambientTemp,
    module_temp: ocrValues.moduleTemp,
    simulator_calibration: ocrValues.simulatorCalibration || 'OK',
    silver_ref_module: ocrValues.silverRefModule,
    el_check: ocrValues.elCheck || 'OK',
    dcw_value1: ocrValues.dcwValues[0] || null,
    dcw_value2: ocrValues.dcwValues[1] || null,
    dcw_value3: ocrValues.dcwValues[2] || null,
    dcw_value4: ocrValues.dcwValues[3] || null,
    ir_value1: ocrValues.irValues[0] || null,
    ir_value2: ocrValues.irValues[1] || null,
    ir_value3: ocrValues.irValues[2] || null,
    ir_value4: ocrValues.irValues[3] || null,
    ground_continuity: ocrValues.groundContinuity,
    voltage_verification: ocrValues.voltageVerification,
    current_verification: ocrValues.currentVerification,
    post_el_visual: ocrValues.postElVisual || 'OK',
    rfid_position: ocrValues.rfidPosition,
    manufacturing_month: ocrValues.manufacturingMonth,

    // Page 7 - Final & Packaging
    final_visual: ocrValues.finalVisual || 'OK',
    backlabel: ocrValues.backlabel || 'OK',
    module_dimension: ocrValues.moduleDimension,
    mounting_hole_x: ocrValues.mountingHoleX,
    mounting_hole_y: ocrValues.mountingHoleY,
    diagonal_difference: ocrValues.diagonalDiff,
    corner_gap: ocrValues.cornerGap,
    cable_length_final: ocrValues.cableLengthFinal,
    packaging_label: ocrValues.packagingLabel || 'OK',
    box_content: ocrValues.boxContent || 'OK',
    box_condition: ocrValues.boxCondition || 'OK',
    pallet_dimension: ocrValues.palletDimension,

    // Metadata
    fraud_verdict: meta.fraudVerdict || null,
    fraud_score: meta.fraudScore || null,
    ocr_data_file: meta.ocrDataFile || null,
    serials: []
  };

  if (ocrValues.preELSerials?.length) {
    ocrValues.preELSerials.forEach(s => dbRecord.serials.push({ serial_number: s, page_number: 3, stage: 'Pre-EL' }));
  }
  if (ocrValues.postLamSerials?.length) {
    ocrValues.postLamSerials.forEach(s => dbRecord.serials.push({ serial_number: s, page_number: 4, stage: 'Post-Lam' }));
  }
  if (ocrValues.flashTesterSerials?.length) {
    ocrValues.flashTesterSerials.forEach(s => dbRecord.serials.push({ serial_number: s, page_number: 6, stage: 'Flash Tester' }));
  }
  if (ocrValues.finalVisualSerials?.length) {
    ocrValues.finalVisualSerials.forEach(s => dbRecord.serials.push({ serial_number: s, page_number: 7, stage: 'Final Visual' }));
  }

  if (!dbRecord.serials.length) {
    (allPagesData || []).forEach((page, index) => {
      const pageNo = page?.pageNumber || (index + 1);
      (page?.serialNumbers || []).forEach((serial) => {
        dbRecord.serials.push({ serial_number: serial, page_number: pageNo, stage: 'OCR' });
      });
    });
  }

  return ipqcDB.saveChecksheet(dbRecord);
}

// ========== FILL EXCEL WITH PYTHON ==========
async function fillExcel(templatePath, outputPath, allPagesData) {
  return new Promise((resolve, reject) => {
    // Save data as JSON for Python
    const jsonPath = outputPath.replace('.xlsx', '_data.json');
    const jsonData = { pages: allPagesData };
    fs.writeFileSync(jsonPath, JSON.stringify(jsonData, null, 2));
    
    console.log(`[OCR] Saved OCR data to: ${jsonPath}`);
    
    // Call Python script
    const pythonScript = path.join(__dirname, 'fill_complete_ocr.py');
    const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
    const python = spawn(pythonCmd, [pythonScript, jsonPath, templatePath, outputPath]);
    
    let stdout = '';
    let stderr = '';
    
    python.stdout.on('data', (data) => {
      stdout += data.toString();
      console.log(`[Python]: ${data.toString().trim()}`);
    });
    
    python.stderr.on('data', (data) => {
      stderr += data.toString();
      console.error(`[Python Error]: ${data.toString().trim()}`);
    });
    
    python.on('close', (code) => {
      if (code === 0) {
        console.log(`[OCR] Excel filled: ${outputPath}`);
        resolve(outputPath);
      } else {
        reject(new Error(`Python script exited with code ${code}: ${stderr}`));
      }
    });
  });
}

// ========== DOWNLOAD FILE FROM URL ==========
async function downloadFile(url, destPath, maxRetries = 3) {
  const encodedUrl = url.replace(/ /g, '%20');
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[Download] Fetching: ${encodedUrl} (attempt ${attempt}/${maxRetries})`);
      
      const response = await axios.get(encodedUrl, {
        responseType: 'arraybuffer',
        timeout: 60000,
        maxRedirects: 5
      });
      
      fs.writeFileSync(destPath, response.data);
      const sizeKB = (response.data.length / 1024).toFixed(1);
      console.log(`[Download] Saved: ${path.basename(destPath)} (${sizeKB} KB)`);
      
      // Verify it's actually a PDF/image, not HTML
      const header = Buffer.from(response.data).toString('utf8', 0, 15);
      if (header.includes('<!doctype') || header.includes('<html')) {
        throw new Error(`URL returned HTML instead of PDF: ${url}`);
      }
      
      return destPath;
    } catch (err) {
      const status = err.response?.status || '';
      console.error(`[Download] Attempt ${attempt} failed: ${err.message} (status: ${status})`);
      
      // Retry on 502, 503, 429, network errors
      const retryable = [502, 503, 429, 500].includes(Number(status)) || 
                        err.message.includes('502') || 
                        err.message.includes('503') || 
                        err.code === 'ECONNRESET' || 
                        err.code === 'ETIMEDOUT' ||
                        err.code === 'ECONNABORTED';
      
      if (retryable && attempt < maxRetries) {
        const delay = attempt * 10000; // 10s, 20s, 30s
        console.log(`[Download] Retrying in ${delay / 1000}s...`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      
      fs.unlink(destPath, () => {});
      throw err;
    }
  }
}

// ========== API ROUTES ==========

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', service: 'IPQC OCR Standalone Server' });
});

// Upload and process single image
app.post('/api/ipqc-ocr/upload', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    console.log(`[OCR] Received file: ${req.file.originalname}`);
    
    const ocrResult = await analyzeDocument(req.file.path);
    const parsedData = parseIPQCData(ocrResult.text, 1);
    
    res.json({
      success: true,
      filename: req.file.filename,
      ocrText: ocrResult.text,
      parsedData
    });
    
  } catch (error) {
    console.error('[OCR] Upload error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Upload multiple images and fill Excel
app.post('/api/ipqc-ocr/process-all', upload.array('images', 10), async (req, res) => {
  // Extend timeout for long OCR processing (10 min)
  req.setTimeout(600000);
  res.setTimeout(600000);
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }
    
    console.log(`[OCR] Processing ${req.files.length} pages...`);
    
    const allPagesData = [];
    
    for (let i = 0; i < req.files.length; i++) {
      const file = req.files[i];
      console.log(`[OCR] Page ${i + 1}: ${file.originalname}`);
      
      const ocrResult = await analyzeDocument(file.path);
      const parsedData = parseIPQCData(ocrResult.text, i + 1);
      allPagesData.push(parsedData);
    }
    
    // Fill Excel
    const templatePath = req.body.templatePath || EXCEL_TEMPLATE_PATH;
    const outputPath = path.join(__dirname, 'uploads', `IPQC_FILLED_${Date.now()}.xlsx`);
    const humanOutputPath = outputPath.replace('.xlsx', '_REAL.xlsx');
    
    await fillExcel(templatePath, outputPath, allPagesData);
    
    const outputFilename = path.basename(outputPath);
    const humanOutputFilename = path.basename(humanOutputPath);
    const humanExcelGenerated = fs.existsSync(humanOutputPath);

    let dbSaveResult = null;
    try {
      dbSaveResult = await autoSaveOcrPagesToDb(allPagesData, {
        date: req.body.date,
        shift: req.body.shift,
        line: req.body.line,
        poNumber: req.body.poNumber,
        inspectorName: req.body.inspectorName,
        ocrDataFile: `IPQC_FILLED_${Date.now()}_data.json`
      });
      console.log(`[IPQC DB] Auto-saved (process-all): ID #${dbSaveResult.id}`);
    } catch (dbErr) {
      console.error('[IPQC DB] Auto-save error (process-all):', dbErr.message);
    }
    
    res.json({
      success: true,
      message: 'All pages processed and Excel filled',
      pagesProcessed: req.files.length,
      outputFile: outputPath,
      downloadUrl: `/api/ipqc-ocr/download/${outputFilename}`,
      humanExcelGenerated,
      humanOutputFile: humanOutputFilename,
      humanDownloadUrl: `/api/ipqc-ocr/download/${humanOutputFilename}`,
      allData: allPagesData,
      dbSaved: dbSaveResult ? { success: true, id: dbSaveResult.id } : { success: false }
    });
    
  } catch (error) {
    console.error('[OCR] Process error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Process from PDF URLs (called from main app)
app.post('/api/ipqc-ocr/process-from-urls', async (req, res) => {
  // Extend timeout for long OCR processing (10 min)
  req.setTimeout(600000);
  res.setTimeout(600000);
  try {
    const { pdfUrls, checklistInfo } = req.body;
    
    if (!pdfUrls || !Array.isArray(pdfUrls) || pdfUrls.length === 0) {
      return res.status(400).json({ error: 'No PDF URLs provided' });
    }
    
    console.log(`[OCR] Processing ${pdfUrls.length} PDF URLs...`);
    console.log(`[OCR] Checklist: ${checklistInfo?.date} | ${checklistInfo?.line} | ${checklistInfo?.shift}`);
    
    const uploadDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    
    const allPagesData = [];
    const timestamp = Date.now();
    
    for (let i = 0; i < pdfUrls.length; i++) {
      const pdfUrl = pdfUrls[i];
      const localPath = path.join(uploadDir, `ipqc_${timestamp}_page${i + 1}.pdf`);
      
      console.log(`[OCR] Page ${i + 1}: Downloading ${pdfUrl}`);
      
      try {
        await downloadFile(pdfUrl, localPath);
        console.log(`[OCR] Page ${i + 1}: Downloaded`);
        
        const ocrResult = await analyzeDocument(localPath);
        const parsedData = parseIPQCData(ocrResult.text, i + 1);
        allPagesData.push(parsedData);
        
        console.log(`[OCR] Page ${i + 1}: OCR complete, ${parsedData.serialNumbers.length} serials found`);
        
        // Delay between OCR calls to avoid rate limiting
        if (i < pdfUrls.length - 1) {
          console.log(`[OCR] Waiting 10 seconds...`);
          await new Promise(r => setTimeout(r, 10000));
        }
        
      } catch (err) {
        console.error(`[OCR] Page ${i + 1} error:`, err.message);
        allPagesData.push({ rawText: '', serialNumbers: [], pageNumber: i + 1 });
      }
    }
    
    // Fill Excel
    const templatePath = req.body.templatePath || EXCEL_TEMPLATE_PATH;
    const outputPath = path.join(uploadDir, `IPQC_FILLED_${timestamp}.xlsx`);
    const humanOutputPath = outputPath.replace('.xlsx', '_REAL.xlsx');
    
    await fillExcel(templatePath, outputPath, allPagesData);
    
    const outputFilename = path.basename(outputPath);
    const humanOutputFilename = path.basename(humanOutputPath);
    const humanExcelGenerated = fs.existsSync(humanOutputPath);

    let fraudAnalysis = null;
    try {
      const uploadsDir = path.join(__dirname, 'uploads');
      fraudAnalysis = analyzeIPQCFraud(allPagesData, uploadsDir, `IPQC_FILLED_${timestamp}_data.json`);
    } catch (fraudErr) {
      console.error('[IPQC Fraud] Auto-check error (process-from-urls):', fraudErr.message);
    }

    let dbSaveResult = null;
    try {
      dbSaveResult = await autoSaveOcrPagesToDb(allPagesData, {
        date: checklistInfo?.date || req.body.date,
        shift: checklistInfo?.shift || req.body.shift,
        line: checklistInfo?.line || req.body.line,
        poNumber: checklistInfo?.poNumber || req.body.poNumber,
        inspectorName: req.body.inspectorName,
        fraudVerdict: fraudAnalysis?.overallVerdict,
        fraudScore: fraudAnalysis?.overallScore,
        ocrDataFile: `IPQC_FILLED_${timestamp}_data.json`
      });
      console.log(`[IPQC DB] Auto-saved (process-from-urls): ID #${dbSaveResult.id}`);
    } catch (dbErr) {
      console.error('[IPQC DB] Auto-save error (process-from-urls):', dbErr.message);
    }
    
    res.json({
      success: true,
      message: 'IPQC processed and Excel filled',
      pagesProcessed: pdfUrls.length,
      outputFile: outputPath,
      downloadUrl: `/api/ipqc-ocr/download/${outputFilename}`,
      humanExcelGenerated,
      humanOutputFile: humanOutputFilename,
      humanDownloadUrl: `/api/ipqc-ocr/download/${humanOutputFilename}`,
      allData: allPagesData,
      fraudAnalysis,
      dbSaved: dbSaveResult ? { success: true, id: dbSaveResult.id } : { success: false }
    });
    
  } catch (error) {
    console.error('[OCR] Process error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Download filled Excel
app.get('/api/ipqc-ocr/download/:filename', (req, res) => {
  const filePath = path.join(__dirname, 'uploads', req.params.filename);
  if (fs.existsSync(filePath)) {
    res.download(filePath);
  } else {
    res.status(404).json({ error: 'File not found' });
  }
});

// ========== PDF PROXY (for browser viewing) ==========
app.get('/api/ipqc-ocr/proxy-pdf', async (req, res) => {
  try {
    const { url } = req.query;
    if (!url) return res.status(400).json({ error: 'URL parameter required' });
    const encodedUrl = url.replace(/ /g, '%20');
    console.log(`[Proxy PDF] Fetching: ${encodedUrl}`);
    const response = await axios.get(encodedUrl, {
      responseType: 'arraybuffer',
      timeout: 60000,
      maxRedirects: 5
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(Buffer.from(response.data));
  } catch (err) {
    console.error('[Proxy PDF] Error:', err.message);
    res.status(500).json({ error: 'Failed to load PDF: ' + err.message });
  }
});

// ========== SAVE ORIGINAL PDFs ==========
app.post('/api/ipqc-ocr/save-original-pdfs', async (req, res) => {
  try {
    const { checklist } = req.body;
    if (!checklist) return res.status(400).json({ success: false, error: 'No checklist provided' });
    const pdfPages = extractPdfUrlsFromChecklist(checklist);
    if (pdfPages.length === 0) return res.json({ success: false, error: 'No PDF pages found' });
    const uploadDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    const safeDate = (checklist.date || 'nodate').replace(/[^a-zA-Z0-9-]/g, '_').substring(0, 10);
    const safeLine = (checklist.Line || 'unknown').replace(/[^a-zA-Z0-9]/g, '_');
    const safeShift = (checklist.Shift || 'unknown').replace(/[^a-zA-Z0-9]/g, '_');
    const savedFiles = [];
    for (const { page, url } of pdfPages) {
      const filename = `IPQC_Original_${safeDate}_${safeLine}_${safeShift}_Page${page}.pdf`;
      const localPath = path.join(uploadDir, filename);
      try {
        await downloadFile(url, localPath);
        savedFiles.push({ page, filename, size: fs.statSync(localPath).size });
      } catch (err) {
        savedFiles.push({ page, filename, error: err.message });
      }
    }
    res.json({ success: true, files: savedFiles });
  } catch (err) {
    console.error('[Save PDFs] Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ========== IPQC CHECKLIST API (External) ==========

const IPQC_CHECKLIST_API = 'https://newmaintenance.umanerp.com/api/peelTest/getuploadCheckListPdf';
const IPQC_BASE_URL = 'https://newmaintenance.umanerp.com/api/';

// Helper: Extract PDF URLs from a checklist item (Page1PdfFile ... Page7PdfFile)
function extractPdfUrlsFromChecklist(item) {
  const urls = [];
  for (let i = 1; i <= 7; i++) {
    const key = `Page${i}PdfFile`;
    if (item[key]) {
      // If it's a relative path, prepend base URL
      const url = item[key].startsWith('http') ? item[key] : IPQC_BASE_URL + item[key];
      urls.push({ page: i, url, key });
    }
  }
  return urls;
}

// Fetch IPQC checklist data from external API
app.post('/api/ipqc-checklist/fetch', async (req, res) => {
  try {
    const { date, shift, line } = req.body;
    
    console.log(`[IPQC Checklist] Fetching data - Date: ${date || 'all'}, Shift: ${shift || 'all'}, Line: ${line || 'all'}`);
    
    const payload = {};
    if (date) payload.date = date;
    if (shift) payload.Shift = shift;
    if (line) payload.Line = line;
    
    const response = await axios.post(IPQC_CHECKLIST_API, payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 30000
    });
    
    console.log(`[IPQC Checklist] Received response - Status: ${response.status}`);
    
    // Normalize the response - filter by Type=ipqcChecklist and add pdf info
    let items = [];
    const rawData = response.data;
    
    if (rawData.data && Array.isArray(rawData.data)) {
      items = rawData.data;
    } else if (Array.isArray(rawData)) {
      items = rawData;
    }
    
    // Filter for IPQC checklists only
    items = items.filter(item => !item.Type || item.Type === 'ipqcChecklist');
    
    // Filter by date/shift/line if provided
    if (date) items = items.filter(item => item.date === date);
    if (shift) items = items.filter(item => item.Shift === shift);
    if (line) items = items.filter(item => item.Line === line);
    
    // Enrich each item with extracted PDF URLs
    const enrichedItems = items.map(item => ({
      ...item,
      pdfPages: extractPdfUrlsFromChecklist(item),
      totalPages: extractPdfUrlsFromChecklist(item).length
    }));
    
    console.log(`[IPQC Checklist] Found ${enrichedItems.length} checklist(s)`);
    
    res.json({
      success: true,
      count: enrichedItems.length,
      data: enrichedItems
    });
    
  } catch (error) {
    console.error('[IPQC Checklist] Fetch error:', error.message);
    res.status(500).json({ 
      success: false, 
      error: error.response?.data?.message || error.message || 'Failed to fetch IPQC checklist data'
    });
  }
});

// Fetch checklist and process all pages through OCR
app.post('/api/ipqc-checklist/fetch-and-process', async (req, res) => {
  // Extend timeout for long OCR processing (10 min)
  req.setTimeout(600000);
  res.setTimeout(600000);
  try {
    const { date, shift, line, checklistIndex } = req.body;
    
    console.log(`[IPQC Checklist] Fetch & Process - Date: ${date || 'all'}, Shift: ${shift || 'all'}, Line: ${line || 'all'}`);
    
    const payload = {};
    if (date) payload.date = date;
    if (shift) payload.Shift = shift;
    if (line) payload.Line = line;
    
    // Step 1: Fetch checklist data from external API
    const apiResponse = await axios.post(IPQC_CHECKLIST_API, payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 30000
    });
    
    let items = [];
    const rawData = apiResponse.data;
    if (rawData.data && Array.isArray(rawData.data)) {
      items = rawData.data;
    } else if (Array.isArray(rawData)) {
      items = rawData;
    }
    
    // Filter
    items = items.filter(item => !item.Type || item.Type === 'ipqcChecklist');
    if (date) items = items.filter(item => item.date === date);
    if (shift) items = items.filter(item => item.Shift === shift);
    if (line) items = items.filter(item => item.Line === line);
    
    // If checklistIndex specified, process only that one; otherwise process first
    const targetItem = items[checklistIndex || 0];
    
    if (!targetItem) {
      return res.json({
        success: false,
        message: 'No matching IPQC checklist found for the given filters',
        count: items.length
      });
    }
    
    // Step 2: Extract PDF URLs from Page1PdfFile...Page7PdfFile
    const pdfPages = extractPdfUrlsFromChecklist(targetItem);
    
    if (pdfPages.length === 0) {
      return res.json({
        success: true,
        message: 'Checklist found but no PDF pages available',
        checklist: { date: targetItem.date, Line: targetItem.Line, Shift: targetItem.Shift }
      });
    }
    
    console.log(`[IPQC Checklist] Processing ${pdfPages.length} pages for ${targetItem.date} | ${targetItem.Line} | ${targetItem.Shift}`);
    
    // Step 3: Download and OCR each page
    const uploadDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    
    const allPagesData = [];
    const timestamp = Date.now();
    
    for (let i = 0; i < pdfPages.length; i++) {
      const { page, url } = pdfPages[i];
      const ext = path.extname(url).split('?')[0] || '.pdf';
      const localPath = path.join(uploadDir, `ipqc_checklist_${timestamp}_page${page}${ext}`);
      
      console.log(`[IPQC Checklist] Page ${page}: Downloading ${url}`);
      
      try {
        await downloadFile(url, localPath);
        console.log(`[IPQC Checklist] Page ${page}: Downloaded`);
        
        const ocrResult = await analyzeDocument(localPath);
        const parsedData = parseIPQCData(ocrResult.text, page);
        allPagesData.push(parsedData);
        
        console.log(`[IPQC Checklist] Page ${page}: OCR complete, ${parsedData.serialNumbers?.length || 0} serials found`);
        
        // Delay between OCR calls to avoid rate limiting
        if (i < pdfPages.length - 1) {
          console.log(`[IPQC Checklist] Waiting 10 seconds...`);
          await new Promise(r => setTimeout(r, 10000));
        }
      } catch (err) {
        console.error(`[IPQC Checklist] Page ${page} error:`, err.message);
        allPagesData.push({ rawText: '', serialNumbers: [], pageNumber: page, error: err.message });
      }
    }
    
    // Step 4: Fill Excel
    const templatePath = req.body.templatePath || EXCEL_TEMPLATE_PATH;
    const safeDate2 = (targetItem.date || 'nodate').replace(/[^a-zA-Z0-9-]/g, '_').substring(0, 10);
    const safeLine2 = (targetItem.Line || 'unknown').replace(/[^a-zA-Z0-9]/g, '_');
    const safeShift2 = (targetItem.Shift || 'unknown').replace(/[^a-zA-Z0-9]/g, '_');
    const outputPath = path.join(uploadDir, `IPQC_CHECKLIST_${safeDate2}_${safeLine2}_${safeShift2}_${timestamp}.xlsx`);
    
    let excelGenerated = false;
    try {
      await fillExcel(templatePath, outputPath, allPagesData);
      excelGenerated = true;
    } catch (excelErr) {
      console.error('[IPQC Checklist] Excel fill error:', excelErr.message);
    }
    
    const outputFilename = path.basename(outputPath);

    let fraudAnalysis = null;
    try {
      const uploadsDir = path.join(__dirname, 'uploads');
      fraudAnalysis = analyzeIPQCFraud(allPagesData, uploadsDir, `IPQC_CHECKLIST_${safeDate2}_${safeLine2}_${safeShift2}_${timestamp}_data.json`);
    } catch (fraudErr) {
      console.error('[IPQC Fraud] Auto-check error (fetch-and-process):', fraudErr.message);
    }

    let dbSaveResult = null;
    try {
      dbSaveResult = await autoSaveOcrPagesToDb(allPagesData, {
        date: targetItem.date,
        shift: targetItem.Shift,
        line: targetItem.Line,
        poNumber: targetItem.poNumber || '',
        fraudVerdict: fraudAnalysis?.overallVerdict,
        fraudScore: fraudAnalysis?.overallScore,
        ocrDataFile: `IPQC_CHECKLIST_${safeDate2}_${safeLine2}_${safeShift2}_${timestamp}_data.json`
      });
      console.log(`[IPQC DB] Auto-saved (fetch-and-process): ID #${dbSaveResult.id}`);
    } catch (dbErr) {
      console.error('[IPQC DB] Auto-save error (fetch-and-process):', dbErr.message);
    }
    
    res.json({
      success: true,
      message: `IPQC checklist processed: ${targetItem.date} | ${targetItem.Line} | ${targetItem.Shift}`,
      checklist: {
        date: targetItem.date,
        Line: targetItem.Line,
        Shift: targetItem.Shift,
        Type: targetItem.Type
      },
      pagesProcessed: pdfPages.length,
      excelGenerated,
      outputFile: outputFilename,
      downloadUrl: `/api/ipqc-ocr/download/${outputFilename}`,
      extractedData: allPagesData,
      fraudAnalysis,
      dbSaved: dbSaveResult ? { success: true, id: dbSaveResult.id } : { success: false }
    });
    
  } catch (error) {
    console.error('[IPQC Checklist] Process error:', error.message);
    res.status(500).json({ 
      success: false, 
      error: error.response?.data?.message || error.message || 'Failed to process IPQC checklist'
    });
  }
});

// Process a single checklist item directly (already fetched data passed from frontend)
app.post('/api/ipqc-checklist/process-item', async (req, res) => {
  // Extend timeout for long OCR processing (10 min)
  req.setTimeout(600000);
  res.setTimeout(600000);
  try {
    const { checklist } = req.body;
    
    if (!checklist) {
      return res.status(400).json({ success: false, error: 'No checklist item provided' });
    }
    
    const pdfPages = extractPdfUrlsFromChecklist(checklist);
    
    if (pdfPages.length === 0) {
      return res.json({ success: false, error: 'No PDF pages found in this checklist' });
    }
    
    console.log(`[IPQC Process] Processing ${pdfPages.length} pages | ${checklist.date} | ${checklist.Line} | ${checklist.Shift}`);
    
    const uploadDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    
    const allPagesData = [];
    const timestamp = Date.now();
    
    for (let i = 0; i < pdfPages.length; i++) {
      const { page, url } = pdfPages[i];
      const ext = path.extname(url).split('?')[0] || '.pdf';
      const localPath = path.join(uploadDir, `ipqc_item_${timestamp}_page${page}${ext}`);
      
      try {
        await downloadFile(url, localPath);
        const ocrResult = await analyzeDocument(localPath);
        const parsedData = parseIPQCData(ocrResult.text, page);
        allPagesData.push(parsedData);
        console.log(`[IPQC Process] Page ${page}: Done`);
        
        if (i < pdfPages.length - 1) {
          await new Promise(r => setTimeout(r, 10000));
        }
      } catch (err) {
        console.error(`[IPQC Process] Page ${page} error:`, err.message);
        allPagesData.push({ rawText: '', serialNumbers: [], pageNumber: page, error: err.message });
      }
    }
    
    // Fill Excel
    const templatePath = req.body.templatePath || EXCEL_TEMPLATE_PATH;
    const safeDate = (checklist.date || 'nodate').replace(/[^a-zA-Z0-9-]/g, '_').substring(0, 10);
    const safeLine = (checklist.Line || 'unknown').replace(/[^a-zA-Z0-9]/g, '_');
    const safeShift = (checklist.Shift || 'unknown').replace(/[^a-zA-Z0-9]/g, '_');
    const outputPath = path.join(uploadDir, `IPQC_${safeDate}_${safeLine}_${safeShift}_${timestamp}.xlsx`);
    
    let excelGenerated = false;
    let humanExcelGenerated = false;
    let scannedPdfGenerated = false;
    const humanOutputPath = outputPath.replace('.xlsx', '_REAL.xlsx');
    const scannedPdfPath = humanOutputPath.replace('.xlsx', '.pdf');
    try {
      await fillExcel(templatePath, outputPath, allPagesData);
      excelGenerated = true;
      // Python script auto-generates _REAL.xlsx human version + _REAL.pdf scanned PDF
      if (fs.existsSync(humanOutputPath)) {
        humanExcelGenerated = true;
      }
      if (fs.existsSync(scannedPdfPath)) {
        scannedPdfGenerated = true;
      }
    } catch (excelErr) {
      console.error('[IPQC Process] Excel fill error:', excelErr.message);
    }
    
    const outputFilename = path.basename(outputPath);
    const humanOutputFilename = path.basename(humanOutputPath);
    const scannedPdfFilename = path.basename(scannedPdfPath);

    // Compute extraction stats
    const pagesScanned = allPagesData.filter(p => (p.rawText?.length || 0) > 0).length;
    const pagesWithSerials = allPagesData.filter(p => (p.serialNumbers?.length || 0) > 0).length;
    const pagesWithAnyData = allPagesData.filter(p => 
      (p.serialNumbers?.length || 0) > 0 || 
      (p.temperatures?.length || 0) > 0 || 
      (p.times?.length || 0) > 0 || 
      (p.dates?.length || 0) > 0 || 
      (p.dimensions?.length || 0) > 0 || 
      (p.percentages?.length || 0) > 0
    ).length;
    const pagesWithErrors = allPagesData.filter(p => p.error).length;
    const totalSerials = allPagesData.reduce((sum, p) => sum + (p.serialNumbers?.length || 0), 0);
    const totalTemps = allPagesData.reduce((sum, p) => sum + (p.temperatures?.length || 0), 0);
    const totalDimensions = allPagesData.reduce((sum, p) => sum + (p.dimensions?.length || 0), 0);
    const totalTimes = allPagesData.reduce((sum, p) => sum + (p.times?.length || 0), 0);
    const totalDates = allPagesData.reduce((sum, p) => sum + (p.dates?.length || 0), 0);
    const totalChars = allPagesData.reduce((sum, p) => sum + (p.rawText?.length || 0), 0);
    const scanPercent = pdfPages.length > 0 ? Math.round((pagesScanned / pdfPages.length) * 100) : 0;
    const dataFetchPercent = pdfPages.length > 0 ? Math.round((pagesWithAnyData / pdfPages.length) * 100) : 0;
    const serialPercent = pdfPages.length > 0 ? Math.round((pagesWithSerials / pdfPages.length) * 100) : 0;

    // Per-page scan status
    const pageStats = allPagesData.map((p, i) => ({
      page: p.pageNumber || i + 1,
      scanned: (p.rawText?.length || 0) > 0,
      chars: p.rawText?.length || 0,
      serials: p.serialNumbers?.length || 0,
      temps: p.temperatures?.length || 0,
      times: p.times?.length || 0,
      dates: p.dates?.length || 0,
      dims: p.dimensions?.length || 0,
      error: p.error || null
    }));

    const stats = {
      totalPages: pdfPages.length,
      pagesScanned,
      pagesWithSerials,
      pagesWithAnyData,
      pagesWithErrors,
      totalSerials,
      totalTemps,
      totalDimensions,
      totalTimes,
      totalDates,
      totalChars,
      scanPercent,
      dataFetchPercent,
      serialPercent,
      pageStats
    };

    console.log(`[IPQC Process] Stats: ${JSON.stringify(stats)}`);

    // Auto-run fraud detection
    let fraudAnalysis = null;
    try {
      const uploadsDir = path.join(__dirname, 'uploads');
      const dataJsonFilename = `IPQC_${safeDate}_${safeLine}_${safeShift}_${timestamp}_data.json`;
      fraudAnalysis = analyzeIPQCFraud(allPagesData, uploadsDir, dataJsonFilename);
      console.log(`[IPQC Fraud] Auto-check: ${fraudAnalysis.overallVerdict} (score ${fraudAnalysis.overallScore})`);
    } catch (fraudErr) {
      console.error('[IPQC Fraud] Auto-check error:', fraudErr.message);
    }

    // ===== AUTO-SAVE TO DATABASE =====
    let dbSaveResult = null;
    try {
      const ocrValues = extractIPQCValues(allPagesData);
      const dataJsonFilename = `IPQC_${safeDate}_${safeLine}_${safeShift}_${timestamp}_data.json`;
      const dbRecord = {
        date: (checklist.date || ocrValues.date || safeDate).substring(0, 10),
        shift: checklist.Shift || ocrValues.shift || safeShift,
        line: (checklist.Line || ocrValues.line || safeLine).replace(/^Line\s*/i, ''),
        time: ocrValues.time || '',
        po_number: checklist.poNumber || '',
        inspector_name: '',
        source: 'ocr',
        // Page 1
        shop_floor_temp: ocrValues.shopFloorTemp,
        shop_floor_humidity: ocrValues.shopFloorHumidity,
        soldering_temp: ocrValues.solderingTemp,
        cell_efficiency: ocrValues.cellEfficiency,
        cell_gap_ts01a: ocrValues.cellToGapValues[0] || null,
        cell_gap_ts01b: ocrValues.cellToGapValues[1] || null,
        cell_gap_ts02a: ocrValues.cellToGapValues[2] || null,
        cell_gap_ts02b: ocrValues.cellToGapValues[3] || null,
        cell_gap_ts03a: ocrValues.cellToGapValues[4] || null,
        cell_gap_ts03b: ocrValues.cellToGapValues[5] || null,
        cell_gap_ts04a: ocrValues.cellToGapValues[6] || null,
        cell_gap_ts04b: ocrValues.cellToGapValues[7] || null,
        // Page 2
        string_to_string_gap: ocrValues.stringToStringGap,
        cell_edge_glass_top: ocrValues.cellEdgeToGlassTop,
        cell_edge_glass_bottom: ocrValues.cellEdgeToGlassBottom,
        cell_edge_glass_sides: ocrValues.cellEdgeToGlassSides,
        terminal_busbar_to_cell: ocrValues.terminalBusbarToCell,
        creepage_top: ocrValues.creepageDistances[0] || null,
        creepage_bottom: ocrValues.creepageDistances[1] || null,
        creepage_left: ocrValues.creepageDistances[2] || null,
        creepage_right: ocrValues.creepageDistances[3] || null,
        creepage_extra: ocrValues.creepageDistances[4] || null,
        // Page 3
        hole1_dimension: ocrValues.holeDimensions[0] || null,
        hole2_dimension: ocrValues.holeDimensions[1] || null,
        hole3_dimension: ocrValues.holeDimensions[2] || null,
        soldering_iron_temp1: ocrValues.solderingIronTemp,
        soldering_iron_temp2: ocrValues.solderingIronTemp2,
        // Page 4
        anodizing_thickness: ocrValues.anodizingThickness,
        // Page 5
        short_side_glue_weight: ocrValues.glueWeight,
        potting_weight: ocrValues.pottingWeight,
        welding_current: ocrValues.weldingCurrent,
        curing_temp: ocrValues.curingTemp,
        curing_humidity: ocrValues.curingHumidity,
        // Page 6
        ambient_temp: ocrValues.ambientTemp,
        module_temp: ocrValues.moduleTemp,
        dcw_value1: ocrValues.dcwValues[0] || null,
        dcw_value2: ocrValues.dcwValues[1] || null,
        dcw_value3: ocrValues.dcwValues[2] || null,
        dcw_value4: ocrValues.dcwValues[3] || null,
        ir_value1: ocrValues.irValues[0] || null,
        ir_value2: ocrValues.irValues[1] || null,
        ir_value3: ocrValues.irValues[2] || null,
        ir_value4: ocrValues.irValues[3] || null,
        // Page 7
        module_dimension: ocrValues.moduleDimension,
        diagonal_difference: ocrValues.diagonalDiff,
        // Fraud results
        fraud_verdict: fraudAnalysis ? fraudAnalysis.overallVerdict : null,
        fraud_score: fraudAnalysis ? fraudAnalysis.overallScore : null,
        ocr_data_file: dataJsonFilename,
        // Serial numbers from all pages
        serials: []
      };
      // Collect serials from all pages
      if (ocrValues.preELSerials && ocrValues.preELSerials.length > 0) {
        ocrValues.preELSerials.forEach(s => dbRecord.serials.push({ serial_number: s, page_number: 3, stage: 'Pre-EL' }));
      }
      if (ocrValues.postLamSerials && ocrValues.postLamSerials.length > 0) {
        ocrValues.postLamSerials.forEach(s => dbRecord.serials.push({ serial_number: s, page_number: 4, stage: 'Post-Lam' }));
      }
      if (ocrValues.flashTesterSerials && ocrValues.flashTesterSerials.length > 0) {
        ocrValues.flashTesterSerials.forEach(s => dbRecord.serials.push({ serial_number: s, page_number: 6, stage: 'Flash Tester' }));
      }
      if (ocrValues.finalVisualSerials && ocrValues.finalVisualSerials.length > 0) {
        ocrValues.finalVisualSerials.forEach(s => dbRecord.serials.push({ serial_number: s, page_number: 7, stage: 'Final Visual' }));
      }
      dbSaveResult = await ipqcDB.saveChecksheet(dbRecord);
      console.log(`[IPQC DB] Auto-saved to database: ID #${dbSaveResult.id} | ${dbRecord.serials.length} serials`);
    } catch (dbErr) {
      console.error('[IPQC DB] Auto-save error:', dbErr.message);
    }

    // Build full process result object
    const processResult = {
      success: true,
      message: `Processed ${pdfPages.length} pages`,
      pagesProcessed: pdfPages.length,
      excelGenerated,
      outputFile: outputFilename,
      downloadUrl: `/api/ipqc-ocr/download/${outputFilename}`,
      humanExcelGenerated,
      humanOutputFile: humanOutputFilename,
      humanDownloadUrl: `/api/ipqc-ocr/download/${humanOutputFilename}`,
      scannedPdfGenerated,
      scannedPdfFile: scannedPdfFilename,
      scannedPdfDownloadUrl: `/api/ipqc-ocr/download/${scannedPdfFilename}`,
      extractedData: allPagesData,
      pdfUrls: pdfPages.map(p => ({ page: p.page, url: p.url })),
      stats,
      fraudAnalysis,
      dbSaved: dbSaveResult ? { success: true, id: dbSaveResult.id } : { success: false }
    };

    // ===== SAVE PROCESS RESULT FOR PERSISTENCE =====
    try {
      await ipqcDB.saveProcessResult(
        { date: checklist.date, line: checklist.Line, shift: checklist.Shift },
        processResult
      );
      console.log(`[IPQC DB] Process result saved for ${checklist.date}/${checklist.Line}/${checklist.Shift}`);
    } catch (prErr) {
      console.error('[IPQC DB] Process result save error:', prErr.message);
    }

    res.json(processResult);
    
  } catch (error) {
    console.error('[IPQC Process] Error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ========================================
// IPQC FRAUD DETECTION
// ========================================

// POST /api/ipqc/fraud-check — Analyze IPQC checksheet for fraud/dummy data
app.post('/api/ipqc/fraud-check', (req, res) => {
  try {
    const { pages } = req.body;
    if (!pages || !Array.isArray(pages) || pages.length === 0) {
      return res.status(400).json({ success: false, error: 'No pages data provided' });
    }

    const uploadsDir = path.join(__dirname, 'uploads');
    const result = analyzeIPQCFraud(pages, uploadsDir);

    console.log(`[IPQC Fraud] Verdict: ${result.overallVerdict} | Score: ${result.overallScore} | Compared with ${result.pastDatasetsCount} past checksheets`);
    if (result.copyDetected && result.worstMatch) {
      console.log(`[IPQC Fraud] ⚠ COPY DETECTED from ${result.worstMatch.pastDate} (${result.worstMatch.exactMatchCount} exact matches)`);
    }

    res.json({ success: true, fraudAnalysis: result });
  } catch (error) {
    console.error('[IPQC Fraud] Error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/ipqc/fraud-check-file — Analyze a saved IPQC data file
app.post('/api/ipqc/fraud-check-file', (req, res) => {
  try {
    const { filename } = req.body;
    if (!filename) {
      return res.status(400).json({ success: false, error: 'No filename provided' });
    }

    const filePath = path.join(__dirname, 'uploads', filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, error: 'File not found' });
    }

    const raw = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(raw);
    const pages = data.pages || [];

    const uploadsDir = path.join(__dirname, 'uploads');
    const result = analyzeIPQCFraud(pages, uploadsDir, filename);

    console.log(`[IPQC Fraud] File: ${filename} | Verdict: ${result.overallVerdict} | Score: ${result.overallScore}`);

    res.json({ success: true, fraudAnalysis: result, filename });
  } catch (error) {
    console.error('[IPQC Fraud] Error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ========================================
// IPQC DATA CRUD — Save / List / Get / Delete
// ========================================

// POST /api/ipqc-data/save — Save IPQC checksheet (from form or OCR)
app.post('/api/ipqc-data/save', async (req, res) => {
  try {
    const data = req.body;
    if (!data.date || !data.shift || !data.line) {
      return res.status(400).json({ success: false, error: 'date, shift, line are required' });
    }
    const result = await ipqcDB.saveChecksheet(data);
    console.log(`[IPQC DB] Saved checksheet #${result.id} — ${data.date} ${data.line} ${data.shift} (source: ${data.source || 'form'})`);
    res.json({ success: true, id: result.id });
  } catch (error) {
    console.error('[IPQC DB] Save error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/ipqc-data/update/:id — Update checksheet
app.put('/api/ipqc-data/update/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const result = await ipqcDB.updateChecksheet(id, req.body);
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('[IPQC DB] Update error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/ipqc-data/list — List all checksheets with filters
app.get('/api/ipqc-data/list', async (req, res) => {
  try {
    const filters = {
      date: req.query.date,
      line: req.query.line,
      shift: req.query.shift,
      source: req.query.source,
      fraud_verdict: req.query.fraud_verdict,
      limit: parseInt(req.query.limit) || 100,
      offset: parseInt(req.query.offset) || 0,
    };
    const result = await ipqcDB.getAllChecksheets(filters);
    res.json({ success: true, data: result.rows, total: result.total });
  } catch (error) {
    console.error('[IPQC DB] List error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/ipqc-data/get/:id — Get single checksheet with serials
app.get('/api/ipqc-data/get/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const row = await ipqcDB.getChecksheet(id);
    if (!row) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true, data: row });
  } catch (error) {
    console.error('[IPQC DB] Get error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/ipqc-data/delete/:id — Delete checksheet
app.delete('/api/ipqc-data/delete/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await ipqcDB.deleteChecksheet(id);
    res.json({ success: true });
  } catch (error) {
    console.error('[IPQC DB] Delete error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ========== PROCESS RESULTS API (FOR REFRESH PERSISTENCE) ==========

// GET /api/ipqc-data/process-results — Get all saved process results
app.get('/api/ipqc-data/process-results', async (req, res) => {
  try {
    const results = await ipqcDB.getAllProcessResults();
    res.json({ success: true, data: results });
  } catch (error) {
    console.error('[IPQC DB] Process results fetch error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/ipqc-data/process-result/:date/:line/:shift — Get single process result
app.get('/api/ipqc-data/process-result/:date/:line/:shift', async (req, res) => {
  try {
    const { date, line, shift } = req.params;
    const result = await ipqcDB.getProcessResultByChecklist(date, line, shift);
    if (!result) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('[IPQC DB] Process result fetch error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/ipqc-data/stats — Dashboard stats
app.get('/api/ipqc-data/stats', async (req, res) => {
  try {
    const stats = await ipqcDB.getStats();
    res.json({ success: true, stats });
  } catch (error) {
    console.error('[IPQC DB] Stats error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ========================================
// IQC — INCOMING QUALITY CONTROL ROUTES
// ========================================

// IQC data storage directory
const IQC_DATA_DIR = path.join(__dirname, 'iqc-data');
if (!fs.existsSync(IQC_DATA_DIR)) fs.mkdirSync(IQC_DATA_DIR, { recursive: true });

// IQC OCR process — upload documents, extract data via Azure OCR
app.post('/api/iqc/ocr-process', upload.array('images', 20), async (req, res) => {
  try {
    const materialType = req.body.materialType || 'unknown';
    console.log(`[IQC OCR] Processing ${req.files?.length || 0} files for material: ${materialType}`);

    if (!req.files || req.files.length === 0) {
      return res.json({ success: false, error: 'No files uploaded' });
    }

    let allText = '';
    for (const file of req.files) {
      try {
        const text = await analyzeDocument(file.path);
        allText += text + '\n';
      } catch (e) {
        console.error(`[IQC OCR] Error processing ${file.originalname}:`, e.message);
      }
    }

    // Extract common IQC fields from OCR text
    const extractedData = extractIQCData(allText, materialType);

    res.json({
      success: true,
      materialType,
      rawText: allText,
      extractedData,
      filesProcessed: req.files.length,
    });
  } catch (error) {
    console.error('[IQC OCR] Error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Extract IQC data from OCR text using regex patterns
function extractIQCData(text, materialType) {
  const data = {
    supplierName: '',
    batchNo: '',
    qtyReceived: '',
    inspectionDate: '',
    params: {}
  };

  // Try to extract batch/lot number
  const batchMatch = text.match(/(?:batch|lot|batch\s*no|lot\s*no)[.:# ]*\s*([A-Z0-9\-\/]+)/i);
  if (batchMatch) data.batchNo = batchMatch[1].trim();

  // Try to extract supplier
  const supplierMatch = text.match(/(?:supplier|vendor|manufacturer|mfg)[.:# ]*\s*([A-Za-z0-9\s&.]+?)(?:\n|,|;)/i);
  if (supplierMatch) data.supplierName = supplierMatch[1].trim();

  // Try to extract quantity
  const qtyMatch = text.match(/(?:qty|quantity|received)[.:# ]*\s*(\d+)/i);
  if (qtyMatch) data.qtyReceived = qtyMatch[1];

  // Try to extract date
  const dateMatch = text.match(/(?:date|inspection\s*date|mfg\s*date)[.:# ]*\s*(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/i);
  if (dateMatch) data.inspectionDate = dateMatch[1];

  // Material-specific extraction
  switch (materialType) {
    case 'glass':
      const thicknessMatch = text.match(/(?:thickness)[.:# ]*\s*([\d.]+\s*mm)/i);
      if (thicknessMatch) data.params['Thickness'] = thicknessMatch[1];
      const transmittanceMatch = text.match(/(?:transmittance|transmission)[.:# ]*\s*([\d.]+\s*%?)/i);
      if (transmittanceMatch) data.params['Transmittance %'] = transmittanceMatch[1];
      break;
    case 'eva':
      const gelMatch = text.match(/(?:gel\s*content)[.:# ]*\s*([\d.]+\s*%?)/i);
      if (gelMatch) data.params['Gel Content %'] = gelMatch[1];
      const peelMatch = text.match(/(?:peel\s*strength)[.:# ]*\s*([\d.]+)/i);
      if (peelMatch) data.params['Peel Strength'] = peelMatch[1];
      break;
    case 'cell':
      const effMatch = text.match(/(?:efficiency|eff)[.:# ]*\s*([\d.]+\s*%?)/i);
      if (effMatch) data.params['Efficiency %'] = effMatch[1];
      const wattMatch = text.match(/(?:watt|power|wp)[.:# ]*\s*([\d.]+)/i);
      if (wattMatch) data.params['Watt Class'] = wattMatch[1];
      break;
    case 'ribbon':
      const widthMatch = text.match(/(?:width)[.:# ]*\s*([\d.]+\s*mm)/i);
      if (widthMatch) data.params['Width (mm)'] = widthMatch[1];
      break;
    case 'frame':
      const anodizeMatch = text.match(/(?:anodiz|anodis|coating)[.:# ]*\s*([\d.]+)\s*(?:micron|μm|um)/i);
      if (anodizeMatch) data.params['Anodizing Thickness (Micron)'] = anodizeMatch[1];
      break;
    case 'jbox':
      const ipMatch = text.match(/(?:IP)\s*(\d{2})/i);
      if (ipMatch) data.params['IP Rating'] = 'IP' + ipMatch[1];
      break;
    default:
      break;
  }

  return data;
}

// Save IQC inspection
app.post('/api/iqc/save-inspection', async (req, res) => {
  try {
    const { materialType, materialName, ...inspectionData } = req.body;
    console.log(`[IQC Save] Saving inspection for ${materialName} (${materialType})`);

    // Create material directory
    const matDir = path.join(IQC_DATA_DIR, materialType);
    if (!fs.existsSync(matDir)) fs.mkdirSync(matDir, { recursive: true });

    // Save JSON record
    const timestamp = Date.now();
    const batchSafe = (inspectionData.batchNo || 'no-batch').replace(/[^a-zA-Z0-9\-]/g, '_');
    const recordFile = path.join(matDir, `${batchSafe}_${timestamp}.json`);
    
    const record = {
      materialType,
      materialName,
      ...inspectionData,
      savedAt: new Date().toISOString(),
    };
    
    fs.writeFileSync(recordFile, JSON.stringify(record, null, 2));

    // Generate Excel report using Python
    let excelGenerated = false;
    const excelFilename = `IQC_${materialType}_${batchSafe}_${timestamp}.xlsx`;
    const excelPath = path.join(__dirname, 'uploads', excelFilename);

    try {
      const pyResult = await runIQCPythonFiller(record, excelPath);
      excelGenerated = pyResult.success;
    } catch (e) {
      console.error('[IQC Save] Excel generation error:', e.message);
    }

    res.json({
      success: true,
      message: 'Inspection saved',
      recordFile: path.basename(recordFile),
      excelGenerated,
      excelFile: excelFilename,
    });
  } catch (error) {
    console.error('[IQC Save] Error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Run IQC Python filler
function runIQCPythonFiller(record, outputPath) {
  return new Promise((resolve, reject) => {
    const pyScript = path.join(__dirname, 'fill_iqc_excel.py');
    if (!fs.existsSync(pyScript)) {
      // Python script not yet created — generate basic Excel via Node
      generateBasicIQCExcel(record, outputPath);
      return resolve({ success: true });
    }

    const jsonInput = JSON.stringify(record);
    const py = spawn('python', [pyScript, '--json', jsonInput, '--output', outputPath]);
    
    let stdout = '', stderr = '';
    py.stdout.on('data', d => stdout += d.toString());
    py.stderr.on('data', d => stderr += d.toString());
    py.on('close', code => {
      if (code === 0) {
        resolve({ success: true, output: stdout });
      } else {
        console.error('[IQC Python] stderr:', stderr);
        // Fallback to basic Excel
        generateBasicIQCExcel(record, outputPath);
        resolve({ success: true });
      }
    });
    py.on('error', () => {
      generateBasicIQCExcel(record, outputPath);
      resolve({ success: true });
    });
  });
}

// Basic Excel generation fallback (no Python needed)
function generateBasicIQCExcel(record, outputPath) {
  // Minimal xlsx generation using a simple approach — write the data as JSON for now
  // The full Python filler will handle proper formatting
  const data = {
    title: `IQC Inspection Report — ${record.materialName}`,
    ...record
  };
  fs.writeFileSync(outputPath.replace('.xlsx', '.json'), JSON.stringify(data, null, 2));
}

// Get IQC inspection history
app.get('/api/iqc/history/:materialType', (req, res) => {
  try {
    const { materialType } = req.params;
    const matDir = path.join(IQC_DATA_DIR, materialType);
    
    if (!fs.existsSync(matDir)) {
      return res.json({ success: true, records: [] });
    }

    const files = fs.readdirSync(matDir).filter(f => f.endsWith('.json')).sort().reverse();
    const records = files.map(f => {
      try {
        return JSON.parse(fs.readFileSync(path.join(matDir, f), 'utf8'));
      } catch (e) {
        return null;
      }
    }).filter(Boolean);

    res.json({ success: true, records });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Download IQC Excel
app.get('/api/iqc/download-excel/:materialType/:batch', (req, res) => {
  try {
    const { materialType, batch } = req.params;
    const uploadsDir = path.join(__dirname, 'uploads');
    
    // Find the latest matching file
    const files = fs.readdirSync(uploadsDir)
      .filter(f => f.startsWith(`IQC_${materialType}_`) && f.endsWith('.xlsx'))
      .sort()
      .reverse();
    
    if (files.length === 0) {
      return res.status(404).json({ success: false, error: 'No Excel file found' });
    }

    const filePath = path.join(uploadsDir, files[0]);
    res.download(filePath);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Download IQC generated file
app.get('/api/iqc/download/:filename', (req, res) => {
  const filePath = path.join(__dirname, 'uploads', req.params.filename);
  if (fs.existsSync(filePath)) {
    res.download(filePath);
  } else {
    res.status(404).json({ success: false, error: 'File not found' });
  }
});

// ========================================
// IQC VERIFICATION — OCR + COC Cross-Check
// ========================================
const { parseIQCBusBarReport, parseCOCDocument, verifyBusBar } = require('./iqc_verify_engine');

// Analyze document with layout model for better table extraction
async function analyzeDocumentLayout(filePath) {
  const client = new DocumentAnalysisClient(AZURE_ENDPOINT, new AzureKeyCredential(AZURE_KEY));
  const fileBuffer = fs.readFileSync(filePath);
  
  console.log(`[OCR Layout] Analyzing: ${path.basename(filePath)}`);
  const poller = await client.beginAnalyzeDocument('prebuilt-layout', fileBuffer);
  const result = await poller.pollUntilDone();
  
  return {
    text: result.content || '',
    tables: result.tables || [],
    pages: result.pages || []
  };
}

// Main IQC Verification endpoint
app.post('/api/iqc/verify-report', upload.fields([
  { name: 'iqcImages', maxCount: 5 },
  { name: 'cocImages', maxCount: 5 }
]), async (req, res) => {
  // Extend timeout for long OCR processing (10 min)
  req.setTimeout(600000);
  res.setTimeout(600000);
  try {
    const materialType = req.body.materialType || 'busbar';
    const iqcFiles = req.files?.iqcImages || [];
    const cocFiles = req.files?.cocImages || [];

    console.log(`[IQC Verify] Material: ${materialType}, IQC files: ${iqcFiles.length}, COC files: ${cocFiles.length}`);

    if (iqcFiles.length === 0) {
      return res.status(400).json({ success: false, error: 'Upload at least one IQC report image' });
    }

    // Step 1: OCR all IQC report pages
    let iqcFullText = '';
    const iqcPageTexts = [];
    for (let i = 0; i < iqcFiles.length; i++) {
      console.log(`[IQC Verify] OCR IQC page ${i + 1}/${iqcFiles.length}: ${iqcFiles[i].originalname}`);
      try {
        const result = await analyzeDocumentLayout(iqcFiles[i].path);
        iqcFullText += result.text + '\n\n--- PAGE BREAK ---\n\n';
        iqcPageTexts.push({ page: i + 1, text: result.text, tables: result.tables?.length || 0 });
      } catch (e) {
        console.error(`[IQC Verify] OCR error page ${i + 1}:`, e.message);
        iqcPageTexts.push({ page: i + 1, text: '', error: e.message });
      }
      // Rate limit
      if (i < iqcFiles.length - 1) await new Promise(r => setTimeout(r, 3000));
    }

    // Step 2: OCR all COC pages
    let cocFullText = '';
    const cocPageTexts = [];
    for (let i = 0; i < cocFiles.length; i++) {
      console.log(`[IQC Verify] OCR COC page ${i + 1}/${cocFiles.length}: ${cocFiles[i].originalname}`);
      try {
        const result = await analyzeDocumentLayout(cocFiles[i].path);
        cocFullText += result.text + '\n\n--- PAGE BREAK ---\n\n';
        cocPageTexts.push({ page: i + 1, text: result.text, tables: result.tables?.length || 0 });
      } catch (e) {
        console.error(`[IQC Verify] COC OCR error page ${i + 1}:`, e.message);
        cocPageTexts.push({ page: i + 1, text: '', error: e.message });
      }
      if (i < cocFiles.length - 1) await new Promise(r => setTimeout(r, 3000));
    }

    console.log(`[IQC Verify] OCR complete. IQC text: ${iqcFullText.length} chars, COC text: ${cocFullText.length} chars`);

    // Step 3: Parse extracted data
    let iqcData, cocData, verification;

    if (materialType === 'busbar') {
      iqcData = parseIQCBusBarReport(iqcFullText);
      cocData = cocFiles.length > 0 ? parseCOCDocument(cocFullText) : null;
      
      console.log(`[IQC Verify] Parsed IQC: ${iqcData.width.length} width values, ${iqcData.thickness.length} thickness values`);
      if (cocData) console.log(`[IQC Verify] Parsed COC: ${cocData.tensileStrength.length} tensile values, ${cocData.resistivity.length} resistivity values`);

      // Step 4: Run verification
      verification = verifyBusBar(iqcData, cocData);
    } else {
      return res.json({ success: false, error: `Material type '${materialType}' verification not yet implemented` });
    }

    // Step 5: Save verification report to JSON file
    const timestamp = Date.now();
    const reportFilename = `IQC_VERIFY_${materialType}_${timestamp}.json`;
    const reportPath = path.join(__dirname, 'uploads', reportFilename);
    const fullReport = {
      materialType,
      iqcData: { ...iqcData, rawText: undefined },
      cocData: cocData ? { ...cocData, rawText: undefined } : null,
      verification,
      iqcOcrChars: iqcFullText.length,
      cocOcrChars: cocFullText.length,
      iqcRawOcrText: iqcFullText,   // Save raw OCR text for debugging
      cocRawOcrText: cocFullText,   // Save raw OCR text for debugging
      iqcPages: iqcPageTexts.map(p => ({ page: p.page, chars: p.text.length, tables: p.tables, error: p.error })),
      cocPages: cocPageTexts.map(p => ({ page: p.page, chars: p.text.length, tables: p.tables, error: p.error })),
    };
    fs.writeFileSync(reportPath, JSON.stringify(fullReport, null, 2));

    // Step 6: Save to MySQL database
    let dbSaveResult = null;
    try {
      dbSaveResult = await ipqcDB.saveIQCReport({
        materialType,
        reportFile: reportFilename,
        iqcData,
        cocData,
        verification,
      });
      console.log(`[IQC Verify] Saved to MySQL: ID=${dbSaveResult.id}`);
    } catch (dbErr) {
      console.error('[IQC Verify] MySQL save error:', dbErr.message);
    }

    console.log(`[IQC Verify] Result: ${verification.overallResult} — ${verification.summary.passed}/${verification.summary.totalChecks} passed`);

    res.json({
      success: true,
      ...fullReport,
      iqcRawText: iqcFullText,
      cocRawText: cocFullText,
      reportFile: reportFilename,
      dbId: dbSaveResult?.id || null,
    });

  } catch (error) {
    console.error('[IQC Verify] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get verification history
app.get('/api/iqc/verify-history', (req, res) => {
  try {
    const uploadsDir = path.join(__dirname, 'uploads');
    const files = fs.readdirSync(uploadsDir)
      .filter(f => f.startsWith('IQC_VERIFY_') && f.endsWith('.json'))
      .sort()
      .reverse()
      .slice(0, 50);
    
    const reports = files.map(f => {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(uploadsDir, f), 'utf8'));
        return {
          filename: f,
          materialType: data.materialType,
          overallResult: data.verification?.overallResult,
          summary: data.verification?.summary,
          timestamp: data.verification?.timestamp,
        };
      } catch (e) { return null; }
    }).filter(Boolean);

    res.json({ success: true, reports });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== IQC DATABASE API ENDPOINTS ====================
// Get IQC data list from MySQL
app.get('/api/iqc-data/list', async (req, res) => {
  try {
    const filters = {
      material_type: req.query.material_type,
      supplier_name: req.query.supplier_name,
      invoice_no: req.query.invoice_no,
      overall_result: req.query.overall_result,
      limit: parseInt(req.query.limit) || 100,
      offset: parseInt(req.query.offset) || 0,
    };
    const result = await ipqcDB.getAllIQCReports(filters);
    res.json({ success: true, data: result.rows, total: result.total });
  } catch (error) {
    console.error('[IQC API] List error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get single IQC report from MySQL
app.get('/api/iqc-data/get/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const row = await ipqcDB.getIQCReport(id);
    if (!row) {
      return res.status(404).json({ success: false, error: 'IQC report not found' });
    }
    res.json({ success: true, data: row });
  } catch (error) {
    console.error('[IQC API] Get error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get IQC stats from MySQL
app.get('/api/iqc-data/stats', async (req, res) => {
  try {
    const stats = await ipqcDB.getIQCStats();
    res.json({ success: true, stats });
  } catch (error) {
    console.error('[IQC API] Stats error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== IQC COMPARISON REPORT — EXCEL DOWNLOAD ====================
const ExcelJS = require('exceljs');

app.get('/api/iqc/verify-report-excel/:filename', async (req, res) => {
  try {
    const { filename } = req.params;
    const filePath = path.join(__dirname, 'uploads', filename);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Report not found' });
    }

    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const v = data.verification;
    const iqc = data.iqcData || {};
    const coc = data.cocData || {};

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Gautam Solar — IQC Verification System';
    workbook.created = new Date();

    // ===== Color palette =====
    const COLORS = {
      headerBg: 'FF1E3A5F',      // dark blue
      headerFont: 'FFFFFFFF',     // white
      subHeaderBg: 'FF3B82F6',    // blue
      passBg: 'FFDCFCE7',        // light green
      passFont: 'FF166534',       // dark green
      failBg: 'FFFEE2E2',        // light red
      failFont: 'FF991B1B',      // dark red
      warnBg: 'FFFEF9C3',        // light yellow
      warnFont: 'FF854D0E',      // dark yellow
      matchBg: 'FFD1FAE5',       // green tint
      mismatchBg: 'FFFECACA',    // red tint
      devBg: 'FFFEF3C7',         // yellow tint
      lightGray: 'FFF1F5F9',     // alternate row
      borderColor: 'FFD1D5DB',   // gray border
      titleBg: 'FF0F172A',       // near black
    };

    const thinBorder = {
      top: { style: 'thin', color: { argb: COLORS.borderColor } },
      left: { style: 'thin', color: { argb: COLORS.borderColor } },
      bottom: { style: 'thin', color: { argb: COLORS.borderColor } },
      right: { style: 'thin', color: { argb: COLORS.borderColor } },
    };

    const applyHeaderStyle = (row, bgColor = COLORS.headerBg) => {
      row.eachCell(cell => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
        cell.font = { bold: true, color: { argb: COLORS.headerFont }, size: 11 };
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        cell.border = thinBorder;
      });
      row.height = 24;
    };

    const applyDataStyle = (cell, status) => {
      cell.border = thinBorder;
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      if (status === 'PASS' || status === 'MATCH' || status === 'EXACT' || status === 'EXACT_MATCH' || status === 'GENUINE') {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.passBg } };
        cell.font = { bold: true, color: { argb: COLORS.passFont } };
      } else if (status === 'FAIL' || status === 'MISMATCH' || status === 'LIKELY_FAKE') {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.failBg } };
        cell.font = { bold: true, color: { argb: COLORS.failFont } };
      } else if (status === 'WARNING' || status === 'DEVIATION' || status === 'SUSPICIOUS') {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.warnBg } };
        cell.font = { bold: true, color: { argb: COLORS.warnFont } };
      }
    };

    // ==================== SHEET 1: SUMMARY ====================
    const ws1 = workbook.addWorksheet('Summary', { 
      properties: { tabColor: { argb: 'FF1E3A5F' } },
      pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 }
    });
    ws1.columns = [
      { width: 5 },   // A - S.No
      { width: 30 },  // B - Field
      { width: 25 },  // C - Value
      { width: 25 },  // D - Value2
      { width: 15 },  // E - Status
      { width: 40 },  // F - Remarks
    ];

    // Company Header
    ws1.mergeCells('A1:F1');
    const titleCell = ws1.getCell('A1');
    titleCell.value = 'GAUTAM SOLAR PRIVATE LIMITED';
    titleCell.font = { bold: true, size: 16, color: { argb: COLORS.headerFont } };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.titleBg } };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    ws1.getRow(1).height = 35;

    ws1.mergeCells('A2:F2');
    const subtitleCell = ws1.getCell('A2');
    subtitleCell.value = `IQC Verification Comparison Report — ${(iqc.materialName || data.materialType || '').toUpperCase()}`;
    subtitleCell.font = { bold: true, size: 13, color: { argb: COLORS.headerFont } };
    subtitleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.subHeaderBg } };
    subtitleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    ws1.getRow(2).height = 28;

    // Overall Result
    ws1.mergeCells('A3:F3');
    const resultCell = ws1.getCell('A3');
    const overallResult = v?.overallResult || 'N/A';
    resultCell.value = `OVERALL RESULT: ${overallResult}`;
    resultCell.font = { bold: true, size: 14, color: { argb: COLORS.headerFont } };
    resultCell.fill = { 
      type: 'pattern', pattern: 'solid', 
      fgColor: { argb: overallResult === 'PASS' ? 'FF16A34A' : overallResult === 'FAIL' ? 'FFDC2626' : 'FFEAB308' } 
    };
    resultCell.alignment = { horizontal: 'center', vertical: 'middle' };
    ws1.getRow(3).height = 30;

    // General Info section
    let row = 5;
    const addInfoRow = (label, value) => {
      const r = ws1.getRow(row);
      ws1.mergeCells(`C${row}:F${row}`);
      r.getCell(2).value = label;
      r.getCell(2).font = { bold: true, size: 10 };
      r.getCell(2).border = thinBorder;
      r.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.lightGray } };
      r.getCell(3).value = value || '-';
      r.getCell(3).border = thinBorder;
      r.getCell(3).alignment = { wrapText: true };
      row++;
    };

    ws1.mergeCells(`A5:F5`);
    const infoHeader = ws1.getCell('A5');
    infoHeader.value = 'DOCUMENT & INSPECTION DETAILS';
    applyHeaderStyle(ws1.getRow(5), COLORS.subHeaderBg);
    row = 6;

    addInfoRow('Material', iqc.materialName || data.materialType || '-');
    addInfoRow('Document No.', iqc.documentNo || '-');
    addInfoRow('Supplier (IQC)', iqc.supplierName || '-');
    addInfoRow('Supplier (COC)', coc.supplierName || '-');
    addInfoRow('Invoice No. (IQC)', iqc.invoiceNo || '-');
    addInfoRow('Invoice No. (COC)', coc.invoiceNo || '-');
    addInfoRow('Receipt Date', iqc.receiptDate || '-');
    addInfoRow('MFG Date', iqc.mfgDate || '-');
    addInfoRow('Checked By', iqc.checkedBy || '-');
    addInfoRow('Approved By', iqc.approvedBy || '-');
    addInfoRow('Sample Count', iqc.sampleCount || '-');
    addInfoRow('AQL Info', iqc.aqlInfo || '-');
    addInfoRow('Verification Date', v?.timestamp ? new Date(v.timestamp).toLocaleString('en-IN') : '-');

    // Summary Stats
    row += 1;
    ws1.mergeCells(`A${row}:F${row}`);
    ws1.getCell(`A${row}`).value = 'VERIFICATION SUMMARY';
    applyHeaderStyle(ws1.getRow(row), COLORS.subHeaderBg);
    row++;

    const summary = v?.summary || {};
    addInfoRow('Total Checks', summary.totalChecks || '-');
    addInfoRow('Passed', `${summary.passed || 0} ✓`);
    addInfoRow('Failed', `${summary.failed || 0} ✗`);
    addInfoRow('Warnings', `${summary.warnings || 0} ⚠`);
    addInfoRow('COC Mismatches', `${summary.cocMismatches || 0}`);
    addInfoRow('COC Deviations', `${summary.cocDeviations || 0}`);
    addInfoRow('Fraud Score', summary.fraudScore != null ? `${summary.fraudScore}/100 (Authenticity: ${100 - summary.fraudScore}%)` : '-');
    addInfoRow('Overall Message', v?.overallMessage || '-');

    // ==================== SHEET 2: VERIFICATION CHECKS ====================
    const ws2 = workbook.addWorksheet('Verification Checks', {
      properties: { tabColor: { argb: 'FF16A34A' } },
      pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 }
    });
    ws2.columns = [
      { width: 5 },   // A - S.No
      { width: 30 },  // B - Check Name
      { width: 12 },  // C - Status
      { width: 30 },  // D - IQC Values
      { width: 25 },  // E - Specification
      { width: 30 },  // F - COC Values
      { width: 45 },  // G - Details/Remarks
    ];

    // Header
    ws2.mergeCells('A1:G1');
    ws2.getCell('A1').value = 'IQC VERIFICATION CHECKS — IQC Report vs Specification vs COC';
    ws2.getCell('A1').font = { bold: true, size: 14, color: { argb: COLORS.headerFont } };
    ws2.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.titleBg } };
    ws2.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
    ws2.getRow(1).height = 30;

    const checksHeaderRow = ws2.addRow(['#', 'Check Name', 'Status', 'IQC Report Values', 'Specification', 'COC Values', 'Details / Remarks']);
    applyHeaderStyle(checksHeaderRow);

    const checks = v?.checks || [];
    checks.forEach((check, i) => {
      const iqcVals = Array.isArray(check.values) ? check.values.join(', ') : (check.values || '-');
      const cocVals = Array.isArray(check.cocValues) ? check.cocValues.join(', ') : (check.cocValues || '-');
      const r = ws2.addRow([i + 1, check.name, check.status, iqcVals, check.spec || '-', cocVals, check.details || '-']);
      
      r.eachCell(cell => {
        cell.border = thinBorder;
        cell.alignment = { vertical: 'middle', wrapText: true };
      });
      // Color the status cell
      applyDataStyle(r.getCell(3), check.status);
      // Alternate row coloring
      if (i % 2 === 0) {
        r.eachCell(cell => {
          if (!cell.fill || cell.fill.fgColor?.argb === undefined) {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.lightGray } };
          }
        });
      }
      r.height = 36;
    });

    // AQL section
    const aql = v?.aqlVerification;
    if (aql) {
      ws2.addRow([]);
      const aqlHeaderRow = ws2.addRow(['', 'AQL SAMPLING PLAN VERIFICATION', '', '', '', '', '']);
      ws2.mergeCells(`B${aqlHeaderRow.number}:G${aqlHeaderRow.number}`);
      applyHeaderStyle(aqlHeaderRow, COLORS.subHeaderBg);
      
      const aqlRow = ws2.addRow(['', 'AQL Sampling', aql.status, 
        `Actual: ${aql.actualSamples} samples`, 
        `Required S3: ${aql.requiredSamplesS3}, S4: ${aql.requiredSamplesS4}`,
        `Lot: ${aql.lotSize} units`,
        aql.details || '-'
      ]);
      aqlRow.eachCell(cell => { cell.border = thinBorder; cell.alignment = { vertical: 'middle', wrapText: true }; });
      applyDataStyle(aqlRow.getCell(3), aql.status);
      aqlRow.height = 36;
    }

    // ==================== SHEET 3: VALUE-BY-VALUE COMPARISON ====================
    const ws3 = workbook.addWorksheet('IQC vs COC Comparison', {
      properties: { tabColor: { argb: 'FFEAB308' } },
      pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 }
    });
    ws3.columns = [
      { width: 5 },   // A - #
      { width: 22 },  // B - Parameter
      { width: 10 },  // C - Sample #
      { width: 15 },  // D - IQC Value
      { width: 15 },  // E - COC Value
      { width: 15 },  // F - Deviation
      { width: 12 },  // G - Dev %
      { width: 12 },  // H - Status
      { width: 30 },  // I - Remarks
    ];

    ws3.mergeCells('A1:I1');
    ws3.getCell('A1').value = 'VALUE-BY-VALUE COMPARISON — IQC Report vs COC (Certificate of Conformance)';
    ws3.getCell('A1').font = { bold: true, size: 14, color: { argb: COLORS.headerFont } };
    ws3.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.titleBg } };
    ws3.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
    ws3.getRow(1).height = 30;

    const compHeaderRow = ws3.addRow(['#', 'Parameter', 'Sample #', 'IQC Value', 'COC Value', 'Deviation', 'Dev %', 'Status', 'Remarks']);
    applyHeaderStyle(compHeaderRow);

    // Extract pair comparisons from checks that have cocMatchInfo
    let compIdx = 1;
    const comparisonParams = ['Width', 'Thickness', 'Coating Thickness', 'Weight', 'Tensile Strength', 'Yield Strength', 'Resistivity'];
    
    checks.forEach(check => {
      const cmi = check.cocMatchInfo;
      if (!cmi) return;

      // Section header for parameter
      const paramHeaderRow = ws3.addRow(['', cmi.parameter || check.name, '', '', '', '', '', '', cmi.summary || '']);
      ws3.mergeCells(`B${paramHeaderRow.number}:C${paramHeaderRow.number}`);
      ws3.mergeCells(`I${paramHeaderRow.number}:I${paramHeaderRow.number}`);
      paramHeaderRow.eachCell(cell => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
        cell.font = { bold: true, size: 10 };
        cell.border = thinBorder;
        cell.alignment = { vertical: 'middle', wrapText: true };
      });
      paramHeaderRow.height = 22;

      if (cmi.pairComparisons && Array.isArray(cmi.pairComparisons)) {
        // Array comparison (width, thickness, weight)
        cmi.pairComparisons.forEach(pair => {
          const r = ws3.addRow([
            compIdx++,
            cmi.parameter,
            `#${pair.index}`,
            `${pair.iqcValue} ${cmi.unit || ''}`,
            `${pair.cocValue} ${cmi.unit || ''}`,
            pair.deviation != null ? pair.deviation.toFixed(4) : '-',
            pair.deviationPct != null ? `${pair.deviationPct.toFixed(3)}%` : '-',
            pair.status || '-',
            ''
          ]);
          r.eachCell(cell => { cell.border = thinBorder; cell.alignment = { horizontal: 'center', vertical: 'middle' }; });
          applyDataStyle(r.getCell(8), pair.status);
          if (compIdx % 2 === 0) {
            [4, 5, 6, 7].forEach(col => {
              const c = r.getCell(col);
              if (!c.fill?.fgColor?.argb) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.lightGray } };
            });
          }
        });
        // Average row
        const avgRow = ws3.addRow(['', '', 'Average', 
          `${cmi.iqcMean?.toFixed(4) || '-'} ${cmi.unit || ''}`,
          `${cmi.cocMean?.toFixed(4) || '-'} ${cmi.unit || ''}`,
          cmi.avgDeviation?.toFixed(4) || '-',
          `${cmi.avgDeviationPct?.toFixed(3) || '-'}%`,
          cmi.overallMatch ? 'MATCH' : 'DEVIATION',
          ''
        ]);
        avgRow.eachCell(cell => { 
          cell.border = thinBorder; 
          cell.font = { bold: true }; 
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } };
        });
        applyDataStyle(avgRow.getCell(8), cmi.overallMatch ? 'MATCH' : 'DEVIATION');
      } else {
        // Single value comparison (tensile, yield, resistivity)
        const r = ws3.addRow([
          compIdx++,
          cmi.parameter,
          'Single',
          cmi.iqcValue != null ? `${cmi.iqcValue} ${cmi.unit || ''}` : 'N/A',
          Array.isArray(cmi.cocValues) ? cmi.cocValues.map(v2 => v2).join(', ') + ' ' + (cmi.unit || '') : '-',
          cmi.deviation != null ? cmi.deviation.toFixed(4) : '-',
          cmi.deviationPct != null ? `${cmi.deviationPct.toFixed(3)}%` : '-',
          cmi.status || '-',
          cmi.details || ''
        ]);
        r.eachCell(cell => { cell.border = thinBorder; cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }; });
        applyDataStyle(r.getCell(8), cmi.status);
        r.height = 30;
      }
      ws3.addRow([]); // spacer
    });

    // ==================== SHEET 4: COC CROSS-CHECK ====================
    const ws4 = workbook.addWorksheet('COC Cross-Check', {
      properties: { tabColor: { argb: 'FFDC2626' } },
      pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 }
    });
    ws4.columns = [
      { width: 5 },   // A - #
      { width: 30 },  // B - Field
      { width: 30 },  // C - IQC Value
      { width: 30 },  // D - COC Value
      { width: 12 },  // E - Match
      { width: 12 },  // F - Status
      { width: 12 },  // G - Importance
      { width: 15 },  // H - Deviation
    ];

    ws4.mergeCells('A1:H1');
    ws4.getCell('A1').value = 'COC CROSS-CHECK — IQC Report Data vs Supplier Certificate of Conformance';
    ws4.getCell('A1').font = { bold: true, size: 14, color: { argb: COLORS.headerFont } };
    ws4.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.titleBg } };
    ws4.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
    ws4.getRow(1).height = 30;

    const cocHeaderRow = ws4.addRow(['#', 'Field', 'IQC Report Value', 'COC Value', 'Match?', 'Status', 'Importance', 'Deviation']);
    applyHeaderStyle(cocHeaderRow);

    const cocChecks = v?.cocCrossCheck || [];
    cocChecks.forEach((cc, i) => {
      const iqcVal = typeof cc.iqcValue === 'string' ? cc.iqcValue : JSON.stringify(cc.iqcValue);
      const cocVal = typeof cc.cocValue === 'string' ? cc.cocValue : JSON.stringify(cc.cocValue);
      const r = ws4.addRow([
        i + 1,
        cc.field,
        iqcVal || '-',
        cocVal || '-',
        cc.match ? 'Yes' : 'No',
        cc.status,
        cc.importance || '-',
        cc.deviation || '-'
      ]);
      r.eachCell(cell => { cell.border = thinBorder; cell.alignment = { vertical: 'middle', wrapText: true }; });
      applyDataStyle(r.getCell(5), cc.match ? 'PASS' : 'FAIL');
      applyDataStyle(r.getCell(6), cc.status);
      r.height = 28;
      if (i % 2 === 0) {
        [2, 3, 4, 8].forEach(col => {
          const c = r.getCell(col);
          if (!c.fill?.fgColor?.argb) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.lightGray } };
        });
      }
    });

    // ==================== SHEET 5: FRAUD DETECTION ====================
    const fraud = v?.fraudDetection;
    if (fraud) {
      const ws5 = workbook.addWorksheet('Fraud Detection', {
        properties: { tabColor: { argb: 'FF7C3AED' } },
        pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 }
      });
      ws5.columns = [
        { width: 5 },   // A
        { width: 22 },  // B - Parameter
        { width: 12 },  // C - Score
        { width: 15 },  // D - Verdict
        { width: 45 },  // E - Check Details
        { width: 45 },  // F - Recommendations
      ];

      ws5.mergeCells('A1:F1');
      ws5.getCell('A1').value = 'FRAUD / DUMMY REPORT DETECTION — Statistical Analysis';
      ws5.getCell('A1').font = { bold: true, size: 14, color: { argb: COLORS.headerFont } };
      ws5.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.titleBg } };
      ws5.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
      ws5.getRow(1).height = 30;

      // Overall fraud summary
      ws5.mergeCells('A2:F2');
      const fraudVerdict = fraud.overallVerdict || 'N/A';
      ws5.getCell('A2').value = `Overall Score: ${fraud.overallScore || 0}/100 — Verdict: ${fraudVerdict} — Authenticity: ${100 - (fraud.overallScore || 0)}%`;
      ws5.getCell('A2').font = { bold: true, size: 12, color: { argb: COLORS.headerFont } };
      ws5.getCell('A2').fill = { 
        type: 'pattern', pattern: 'solid',
        fgColor: { argb: fraudVerdict === 'GENUINE' ? 'FF16A34A' : fraudVerdict === 'LIKELY_FAKE' ? 'FFDC2626' : 'FFEAB308' }
      };
      ws5.getCell('A2').alignment = { horizontal: 'center', vertical: 'middle' };
      ws5.getRow(2).height = 28;

      const fraudHeaderRow = ws5.addRow(['#', 'Parameter', 'Score', 'Verdict', 'Check Details', 'Recommendations']);
      applyHeaderStyle(fraudHeaderRow);

      const paramResults = fraud.parameterResults || [];
      paramResults.forEach((pr, i) => {
        const checkDetails = (pr.checks || []).map(c => `${c.name}: ${c.status} (${c.details || ''})`).join('\n');
        const r = ws5.addRow([
          i + 1,
          pr.parameter || '-',
          pr.score != null ? pr.score : '-',
          pr.verdict || '-',
          checkDetails || '-',
          (pr.recommendations || []).join('\n') || '-'
        ]);
        r.eachCell(cell => { cell.border = thinBorder; cell.alignment = { vertical: 'middle', wrapText: true }; });
        applyDataStyle(r.getCell(4), pr.verdict);
        r.height = Math.max(30, (pr.checks || []).length * 16);
      });

      // Recommendations at bottom
      if (fraud.recommendations && fraud.recommendations.length > 0) {
        ws5.addRow([]);
        const recHeaderRow = ws5.addRow(['', 'OVERALL RECOMMENDATIONS', '', '', '', '']);
        ws5.mergeCells(`B${recHeaderRow.number}:F${recHeaderRow.number}`);
        applyHeaderStyle(recHeaderRow, COLORS.subHeaderBg);

        fraud.recommendations.forEach((rec, i) => {
          const r = ws5.addRow(['', `${i + 1}. ${rec}`, '', '', '', '']);
          ws5.mergeCells(`B${r.number}:F${r.number}`);
          r.getCell(2).font = { size: 10 };
          r.getCell(2).border = thinBorder;
          r.getCell(2).alignment = { wrapText: true };
        });
      }
    }

    // ==================== SHEET 6: RAW DATA ====================
    const ws6 = workbook.addWorksheet('Raw Data', {
      properties: { tabColor: { argb: 'FF64748B' } },
      pageSetup: { paperSize: 9, orientation: 'landscape' }
    });
    ws6.columns = [
      { width: 5 },
      { width: 25 },
      { width: 40 },
      { width: 40 },
    ];

    ws6.mergeCells('A1:D1');
    ws6.getCell('A1').value = 'RAW OCR EXTRACTED DATA — IQC Report & COC';
    ws6.getCell('A1').font = { bold: true, size: 14, color: { argb: COLORS.headerFont } };
    ws6.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.titleBg } };
    ws6.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
    ws6.getRow(1).height = 30;

    const rawHeaderRow = ws6.addRow(['#', 'Field', 'IQC Report Value', 'COC Value']);
    applyHeaderStyle(rawHeaderRow);

    const allFields = new Set([...Object.keys(iqc), ...Object.keys(coc)]);
    const skipFields = new Set(['derivedRanges', 'allJudgmentsOK', 'judgmentDetails']);
    let rawIdx = 1;
    allFields.forEach(field => {
      if (skipFields.has(field)) return;
      const iqcVal = iqc[field];
      const cocVal = coc[field];
      const formatVal = (v2) => {
        if (v2 == null) return '-';
        if (Array.isArray(v2)) return v2.join(', ');
        return String(v2);
      };
      const r = ws6.addRow([rawIdx++, field, formatVal(iqcVal), formatVal(cocVal)]);
      r.eachCell(cell => { cell.border = thinBorder; cell.alignment = { vertical: 'middle', wrapText: true }; });
      if (rawIdx % 2 === 0) {
        r.eachCell(cell => {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.lightGray } };
        });
      }
    });

    // Generate and send
    const excelFilename = `IQC_Comparison_Report_${data.materialType}_${Date.now()}.xlsx`;
    const excelPath = path.join(__dirname, 'uploads', excelFilename);
    await workbook.xlsx.writeFile(excelPath);

    res.download(excelPath, excelFilename, (err) => {
      if (err) console.error('Download error:', err);
    });

    console.log(`[IQC Report] Excel comparison report generated: ${excelFilename}`);

  } catch (error) {
    console.error('[IQC Report] Error generating Excel:', error);
    res.status(500).json({ error: 'Failed to generate report: ' + error.message });
  }
});

// ==================== IQC SUMMARY PDF ====================
app.get('/api/iqc/verify-report-pdf/:filename', async (req, res) => {
  try {
    const { filename } = req.params;
    const filePath = path.join(__dirname, 'uploads', filename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Report not found' });
    }

    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const pdfBuffer = await generateIQCSummaryPDF(data);

    const pdfFilename = `IQC_Summary_${data.materialType || 'report'}_${Date.now()}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${pdfFilename}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.send(pdfBuffer);

    console.log(`[IQC PDF] Summary PDF generated: ${pdfFilename}`);
  } catch (error) {
    console.error('[IQC PDF] Error generating PDF:', error);
    res.status(500).json({ error: 'Failed to generate PDF: ' + error.message });
  }
});

// ==================== IPQC OCR SUMMARY PDF (POST — from checklist data) ====================
app.post('/api/ipqc-ocr/summary-pdf', async (req, res) => {
  try {
    const { checklist, result } = req.body;
    if (!checklist || !result) {
      return res.status(400).json({ error: 'checklist and result are required' });
    }

    const pdfBuffer = await generateIPQCOcrSummaryPDF(checklist, result);

    const pdfFilename = `IPQC_OCR_Summary_${checklist.date || 'report'}_${checklist.Line || ''}_${checklist.Shift || ''}_${Date.now()}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${pdfFilename}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.send(pdfBuffer);

    console.log(`[IPQC OCR PDF] Summary PDF generated: ${pdfFilename}`);
  } catch (error) {
    console.error('[IPQC OCR PDF] Error generating PDF:', error);
    res.status(500).json({ error: 'Failed to generate PDF: ' + error.message });
  }
});

// ==================== IPQC SUMMARY PDF ====================
app.get('/api/ipqc-data/summary-pdf/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const row = await ipqcDB.getChecksheet(id);

    if (!row) {
      return res.status(404).json({ error: 'Checksheet not found' });
    }

    const pdfBuffer = await generateIPQCSummaryPDF(row);

    const pdfFilename = `IPQC_Summary_${row.date || 'report'}_${row.line || ''}_${row.shift || ''}_${Date.now()}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${pdfFilename}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.send(pdfBuffer);

    console.log(`[IPQC PDF] Summary PDF generated: ${pdfFilename}`);
  } catch (error) {
    console.error('[IPQC PDF] Error generating PDF:', error);
    res.status(500).json({ error: 'Failed to generate PDF: ' + error.message });
  }
});

// Serve React app for all non-API routes (SPA support)
app.get('*', (req, res) => {
  const indexPath = path.join(__dirname, '..', 'build', 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).json({ error: 'Frontend build not found. Run npm run build in frontend folder.' });
  }
});

// Start server
const server = app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   🏭 Gautam Solar — QC Server                             ║
║                                                           ║
║   Running on: http://localhost:${PORT}                      ║
║                                                           ║
║   IPQC Endpoints:                                         ║
║   ├─ GET  /api/health                  - Health check     ║
║   ├─ POST /api/ipqc-ocr/upload         - Single image     ║
║   ├─ POST /api/ipqc-ocr/process-all    - Multiple images  ║
║   ├─ POST /api/ipqc-ocr/process-from-urls - From PDF URLs ║
║   ├─ GET  /api/ipqc-ocr/download/:file - Download Excel   ║
║   ├─ POST /api/ipqc-checklist/fetch    - Fetch checklist  ║
║   ├─ POST /api/ipqc-checklist/fetch-and-process - OCR     ║
║   └─ GET  /api/ipqc-data/summary-pdf/:id - Summary PDF   ║
║                                                           ║
║   IQC Endpoints:                                          ║
║   ├─ POST /api/iqc/ocr-process         - OCR documents    ║
║   ├─ POST /api/iqc/save-inspection     - Save inspection  ║
║   ├─ GET  /api/iqc/history/:material   - Get history      ║
║   ├─ GET  /api/iqc/download-excel/:m/:b - Download Excel  ║
║   ├─ GET  /api/iqc/download/:file      - Download file    ║
║   ├─ POST /api/iqc/verify-report       - Verify IQC+COC   ║
║   ├─ GET  /api/iqc/verify-history      - Verify history   ║
║   ├─ GET  /api/iqc/verify-report-excel - Download Report  ║
║   └─ GET  /api/iqc/verify-report-pdf  - Summary PDF      ║
║                                                           ║
║   Template: ${EXCEL_TEMPLATE_PATH.substring(0, 40)}...    ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
  `);
});

// Increase timeout for long OCR processing (10 minutes)
server.timeout = 600000;        // 10 min request timeout
server.keepAliveTimeout = 620000; // keep-alive slightly longer
server.headersTimeout = 625000;   // headers timeout slightly longer
