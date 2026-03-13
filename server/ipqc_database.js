/**
 * IPQC Database Module — MySQL
 * ============================
 * Stores all IPQC checksheet data in MySQL (Workbench compatible).
 */

const mysql = require('mysql2/promise');

let db;
let initPromise;

const dbConfig = {
  host: process.env.IPQC_DB_HOST || 'localhost',
  port: Number(process.env.IPQC_DB_PORT || 3306),
  user: process.env.IPQC_DB_USER || 'root',
  password: process.env.IPQC_DB_PASSWORD || '',
  database: process.env.IPQC_DB_NAME || 'ipqc_ocr',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
};

function getSafeDatabaseName() {
  const dbName = dbConfig.database;
  if (!/^[a-zA-Z0-9_]+$/.test(dbName)) {
    throw new Error(`Invalid MySQL database name: ${dbName}`);
  }
  return dbName;
}

async function ensureDatabaseExists() {
  const dbName = getSafeDatabaseName();
  const conn = await mysql.createConnection({
    host: dbConfig.host,
    port: dbConfig.port,
    user: dbConfig.user,
    password: dbConfig.password,
  });
  try {
    await conn.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  } finally {
    await conn.end();
  }
}

async function getDB() {
  if (!db) {
    await ensureDatabaseExists();
    db = mysql.createPool(dbConfig);
  }
  return db;
}

async function ensureIndex(d, tableName, indexName, columns) {
  const [rows] = await d.query(
    'SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = ?',
    [dbConfig.database, tableName, indexName]
  );
  if (rows[0].cnt === 0) {
    await d.query(`CREATE INDEX ${indexName} ON ${tableName}(${columns})`);
  }
}

// ========== CREATE TABLES ==========
async function initTables() {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const d = await getDB();

    await d.query(`
    CREATE TABLE IF NOT EXISTS ipqc_checksheets (
      id INT AUTO_INCREMENT PRIMARY KEY,
      date VARCHAR(30) NOT NULL,
      shift VARCHAR(20) NOT NULL,
      line VARCHAR(50) NOT NULL,
      time VARCHAR(30),
      po_number VARCHAR(100),
      inspector_name VARCHAR(120),
      source VARCHAR(20) DEFAULT 'form',

      -- Page 1: Shop Floor & Stringer
      shop_floor_temp DOUBLE,
      shop_floor_humidity DOUBLE,
      glass_dimension VARCHAR(100),
      glass_visual VARCHAR(20) DEFAULT 'OK',
      eva_epe_type VARCHAR(120),
      eva_epe_dimension VARCHAR(120),
      eva_epe_status VARCHAR(20) DEFAULT 'OK',
      soldering_temp DOUBLE,
      cell_manufacturer VARCHAR(120),
      cell_efficiency DOUBLE,
      cell_size VARCHAR(120),
      cell_condition VARCHAR(20) DEFAULT 'OK',
      cell_loading_cleanliness VARCHAR(20) DEFAULT 'Clean',
      stringer_specification VARCHAR(20) DEFAULT 'OK',
      cutting_equal VARCHAR(20) DEFAULT 'Equal',
      ts_visual VARCHAR(20) DEFAULT 'OK',
      ts_el_image VARCHAR(20) DEFAULT 'OK',
      string_length VARCHAR(80),
      cell_gap_ts01a DOUBLE,
      cell_gap_ts01b DOUBLE,
      cell_gap_ts02a DOUBLE,
      cell_gap_ts02b DOUBLE,
      cell_gap_ts03a DOUBLE,
      cell_gap_ts03b DOUBLE,
      cell_gap_ts04a DOUBLE,
      cell_gap_ts04b DOUBLE,

      -- Page 2: Soldering & Layout
      peel_strength_ribbon_cell DOUBLE,
      peel_strength_ribbon_busbar DOUBLE,
      string_to_string_gap DOUBLE,
      cell_edge_glass_top DOUBLE,
      cell_edge_glass_bottom DOUBLE,
      cell_edge_glass_sides DOUBLE,
      terminal_busbar_to_cell DOUBLE,
      soldering_quality VARCHAR(20) DEFAULT 'OK',
      creepage_top DOUBLE,
      creepage_bottom DOUBLE,
      creepage_left DOUBLE,
      creepage_right DOUBLE,
      creepage_extra DOUBLE,
      auto_taping VARCHAR(20) DEFAULT 'OK',
      rfid_logo_position VARCHAR(20) DEFAULT 'OK',
      back_eva_type VARCHAR(120),
      back_eva_dimension VARCHAR(120),
      back_glass_dimension VARCHAR(120),

      -- Page 3: Pre-Lamination
      holes_count INT DEFAULT 3,
      hole1_dimension DOUBLE,
      hole2_dimension DOUBLE,
      hole3_dimension DOUBLE,
      busbar_flatten VARCHAR(20) DEFAULT 'OK',
      pre_lam_visual VARCHAR(20) DEFAULT 'OK',
      rework_station_clean VARCHAR(20) DEFAULT 'Clean',
      soldering_iron_temp1 DOUBLE,
      soldering_iron_temp2 DOUBLE,
      rework_method VARCHAR(40) DEFAULT 'Manual',

      -- Page 4: Post-Lamination
      peel_test_eva_glass VARCHAR(120),
      peel_test_eva_backsheet VARCHAR(120),
      gel_content VARCHAR(120),
      tape_removing VARCHAR(20) DEFAULT 'OK',
      trimming_quality VARCHAR(20) DEFAULT 'OK',
      trimming_blade_status VARCHAR(20) DEFAULT 'OK',
      post_lam_visual VARCHAR(20) DEFAULT 'OK',
      glue_uniformity VARCHAR(20) DEFAULT 'OK',
      short_side_glue_weight DOUBLE,
      long_side_glue_weight DOUBLE,
      anodizing_thickness DOUBLE,

      -- Page 5: JB Assembly & Curing
      jb_appearance VARCHAR(20) DEFAULT 'OK',
      jb_cable_length DOUBLE,
      silicon_glue_weight DOUBLE,
      welding_time VARCHAR(40),
      welding_current DOUBLE,
      soldering_quality_jb VARCHAR(20) DEFAULT 'OK',
      glue_ratio VARCHAR(100),
      potting_weight DOUBLE,
      nozzle_status VARCHAR(20) DEFAULT 'OK',
      potting_inspection VARCHAR(20) DEFAULT 'OK',
      curing_visual VARCHAR(20) DEFAULT 'OK',
      curing_temp DOUBLE,
      curing_humidity DOUBLE,
      curing_time VARCHAR(40),
      buffing_condition VARCHAR(20) DEFAULT 'OK',
      cleaning_status VARCHAR(20) DEFAULT 'OK',

      -- Page 6: Flash Tester & EL
      ambient_temp DOUBLE,
      module_temp DOUBLE,
      simulator_calibration VARCHAR(20) DEFAULT 'OK',
      silver_ref_module VARCHAR(120),
      el_check VARCHAR(20) DEFAULT 'OK',
      dcw_value1 DOUBLE,
      dcw_value2 DOUBLE,
      dcw_value3 DOUBLE,
      dcw_value4 DOUBLE,
      ir_value1 DOUBLE,
      ir_value2 DOUBLE,
      ir_value3 DOUBLE,
      ir_value4 DOUBLE,
      ground_continuity VARCHAR(80),
      voltage_verification DOUBLE,
      current_verification DOUBLE,
      post_el_visual VARCHAR(20) DEFAULT 'OK',
      rfid_position VARCHAR(20) DEFAULT 'OK',
      manufacturing_month VARCHAR(40),

      -- Page 7: Final & Packaging
      final_visual VARCHAR(20) DEFAULT 'OK',
      backlabel VARCHAR(20) DEFAULT 'OK',
      module_dimension VARCHAR(120),
      mounting_hole_x DOUBLE,
      mounting_hole_y DOUBLE,
      diagonal_difference DOUBLE,
      corner_gap DOUBLE,
      cable_length_final DOUBLE,
      packaging_label VARCHAR(20) DEFAULT 'OK',
      box_content VARCHAR(20) DEFAULT 'OK',
      box_condition VARCHAR(20) DEFAULT 'OK',
      pallet_dimension VARCHAR(120),

      -- Metadata
      fraud_verdict VARCHAR(40),
      fraud_score INT,
      ocr_data_file VARCHAR(255),
      
      -- Process Result Files
      excel_output_file VARCHAR(255),
      human_excel_file VARCHAR(255),
      scanned_pdf_file VARCHAR(255),
      summary_pdf_file VARCHAR(255),
      process_result JSON,
      is_processed BOOLEAN DEFAULT FALSE,
      
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    );
  `);

    await d.query(`
    CREATE TABLE IF NOT EXISTS ipqc_serials (
      id INT AUTO_INCREMENT PRIMARY KEY,
      checksheet_id INT NOT NULL,
      serial_number VARCHAR(100) NOT NULL,
      page_number INT,
      stage VARCHAR(50),
      FOREIGN KEY (checksheet_id) REFERENCES ipqc_checksheets(id) ON DELETE CASCADE
    );
  `);

    await ensureIndex(d, 'ipqc_checksheets', 'idx_checksheet_date', 'date');
    await ensureIndex(d, 'ipqc_checksheets', 'idx_checksheet_line', 'line');
    await ensureIndex(d, 'ipqc_checksheets', 'idx_checksheet_shift', 'shift');
    await ensureIndex(d, 'ipqc_serials', 'idx_serial_checksheet', 'checksheet_id');
    await ensureIndex(d, 'ipqc_serials', 'idx_serial_number', 'serial_number');

    // ========== ADD NEW COLUMNS IF MISSING (for existing tables) ==========
    const newColumns = [
      { name: 'excel_output_file', def: 'VARCHAR(255)' },
      { name: 'human_excel_file', def: 'VARCHAR(255)' },
      { name: 'scanned_pdf_file', def: 'VARCHAR(255)' },
      { name: 'summary_pdf_file', def: 'VARCHAR(255)' },
      { name: 'process_result', def: 'JSON' },
      { name: 'is_processed', def: 'BOOLEAN DEFAULT FALSE' },
    ];
    for (const col of newColumns) {
      try {
        await d.query(`ALTER TABLE ipqc_checksheets ADD COLUMN ${col.name} ${col.def}`);
        console.log(`[IPQC DB] Added column: ${col.name}`);
      } catch (e) {
        // Column already exists - ignore
      }
    }

    // ========== WIDEN DATE COLUMN (existing tables may have VARCHAR(20)) ==========
    try {
      await d.query(`ALTER TABLE ipqc_checksheets MODIFY COLUMN date VARCHAR(30) NOT NULL`);
    } catch (e) {
      // Ignore if already correct
    }

    // ========== IQC VERIFICATION TABLES ==========
    await d.query(`
      CREATE TABLE IF NOT EXISTS iqc_reports (
        id INT AUTO_INCREMENT PRIMARY KEY,
        material_type VARCHAR(50) NOT NULL,
        report_filename VARCHAR(255),
        
        -- IQC Document Info
        document_no VARCHAR(100),
        issue_date VARCHAR(50),
        material_name VARCHAR(120),
        supplier_name VARCHAR(255),
        invoice_no VARCHAR(100),
        receipt_date VARCHAR(50),
        lot_no VARCHAR(100),
        quantity VARCHAR(100),
        sample_count INT,
        aql_info TEXT,
        checked_by VARCHAR(120),
        approved_by VARCHAR(120),
        inspection_date VARCHAR(50),
        mfg_date VARCHAR(50),
        
        -- IQC Measurements (stored as JSON arrays)
        width_values JSON,
        thickness_values JSON,
        coating_thickness_values JSON,
        weight_values JSON,
        solderability_busbar DOUBLE,
        solderability_ribbon DOUBLE,
        tensile_strength DOUBLE,
        yield_strength DOUBLE,
        resistivity DOUBLE,
        packaging_result VARCHAR(255),
        
        -- COC Document Info
        coc_certificate_no VARCHAR(100),
        coc_customer_name VARCHAR(255),
        coc_product_name VARCHAR(120),
        coc_invoice_no VARCHAR(100),
        coc_delivery_date VARCHAR(50),
        coc_supplier_name VARCHAR(255),
        
        -- COC Measurements (stored as JSON arrays)
        coc_width_values JSON,
        coc_thickness_values JSON,
        coc_tensile_values JSON,
        coc_resistivity_values JSON,
        coc_copper_purity_values JSON,
        coc_weight_values JSON,
        
        -- Verification Results
        overall_result VARCHAR(40),
        total_checks INT,
        passed_checks INT,
        failed_checks INT,
        warning_checks INT,
        fraud_score INT,
        fraud_indicators JSON,
        
        -- Full verification details (JSON)
        verification_details JSON,
        
        -- Metadata
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      );
    `);

    await ensureIndex(d, 'iqc_reports', 'idx_iqc_material_type', 'material_type');
    await ensureIndex(d, 'iqc_reports', 'idx_iqc_invoice', 'invoice_no');
    await ensureIndex(d, 'iqc_reports', 'idx_iqc_supplier', 'supplier_name(100)');
    await ensureIndex(d, 'iqc_reports', 'idx_iqc_result', 'overall_result');
  })();

  return initPromise;
}

// ========== SAVE CHECKSHEET ==========
async function saveChecksheet(data) {
  await initTables();
  const d = await getDB();
  const conn = await d.getConnection();

  const cols = [
    'date','shift','line','time','po_number','inspector_name','source',
    'shop_floor_temp','shop_floor_humidity','glass_dimension','glass_visual',
    'eva_epe_type','eva_epe_dimension','eva_epe_status','soldering_temp',
    'cell_manufacturer','cell_efficiency','cell_size','cell_condition',
    'cell_loading_cleanliness','stringer_specification','cutting_equal',
    'ts_visual','ts_el_image','string_length',
    'cell_gap_ts01a','cell_gap_ts01b','cell_gap_ts02a','cell_gap_ts02b',
    'cell_gap_ts03a','cell_gap_ts03b','cell_gap_ts04a','cell_gap_ts04b',
    'peel_strength_ribbon_cell','peel_strength_ribbon_busbar',
    'string_to_string_gap','cell_edge_glass_top','cell_edge_glass_bottom',
    'cell_edge_glass_sides','terminal_busbar_to_cell','soldering_quality',
    'creepage_top','creepage_bottom','creepage_left','creepage_right','creepage_extra',
    'auto_taping','rfid_logo_position','back_eva_type','back_eva_dimension','back_glass_dimension',
    'holes_count','hole1_dimension','hole2_dimension','hole3_dimension',
    'busbar_flatten','pre_lam_visual','rework_station_clean',
    'soldering_iron_temp1','soldering_iron_temp2','rework_method',
    'peel_test_eva_glass','peel_test_eva_backsheet','gel_content',
    'tape_removing','trimming_quality','trimming_blade_status','post_lam_visual',
    'glue_uniformity','short_side_glue_weight','long_side_glue_weight','anodizing_thickness',
    'jb_appearance','jb_cable_length','silicon_glue_weight','welding_time','welding_current',
    'soldering_quality_jb','glue_ratio','potting_weight','nozzle_status','potting_inspection',
    'curing_visual','curing_temp','curing_humidity','curing_time',
    'buffing_condition','cleaning_status',
    'ambient_temp','module_temp','simulator_calibration','silver_ref_module','el_check',
    'dcw_value1','dcw_value2','dcw_value3','dcw_value4',
    'ir_value1','ir_value2','ir_value3','ir_value4',
    'ground_continuity','voltage_verification','current_verification',
    'post_el_visual','rfid_position','manufacturing_month',
    'final_visual','backlabel','module_dimension',
    'mounting_hole_x','mounting_hole_y','diagonal_difference','corner_gap',
    'cable_length_final','packaging_label','box_content','box_condition','pallet_dimension',
    'fraud_verdict','fraud_score','ocr_data_file',
    'excel_output_file','human_excel_file','scanned_pdf_file','summary_pdf_file','process_result','is_processed'
  ];

  const values = cols.map(c => {
    if (data[c] === undefined) return null;
    // JSON columns need to be stringified
    if (c === 'process_result' && typeof data[c] === 'object') {
      return JSON.stringify(data[c]);
    }
    return data[c];
  });
  const placeholders = cols.map(() => '?').join(',');
  const colNames = cols.join(',');

  try {
    await conn.beginTransaction();
    const [result] = await conn.query(`INSERT INTO ipqc_checksheets (${colNames}) VALUES (${placeholders})`, values);
    const checksheetId = result.insertId;

    if (data.serials && Array.isArray(data.serials)) {
      for (const s of data.serials) {
        await conn.query(
          'INSERT INTO ipqc_serials (checksheet_id, serial_number, page_number, stage) VALUES (?, ?, ?, ?)',
          [checksheetId, s.serial_number || s, s.page_number || null, s.stage || null]
        );
      }
    }

    await conn.commit();
    return { id: checksheetId, success: true };
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

// ========== UPDATE CHECKSHEET ==========
async function updateChecksheet(id, data) {
  await initTables();
  const d = await getDB();
  const conn = await d.getConnection();
  const setClauses = [];
  const values = [];

  for (const [key, val] of Object.entries(data)) {
    if (key === 'id' || key === 'serials' || key === 'created_at') continue;
    setClauses.push(`${key} = ?`);
    values.push(val);
  }

  if (setClauses.length === 0) return { success: false, error: 'No fields to update' };

  setClauses.push('updated_at = CURRENT_TIMESTAMP');
  values.push(id);

  try {
    await conn.beginTransaction();
    await conn.query(`UPDATE ipqc_checksheets SET ${setClauses.join(', ')} WHERE id = ?`, values);

    if (data.serials && Array.isArray(data.serials)) {
      await conn.query('DELETE FROM ipqc_serials WHERE checksheet_id = ?', [id]);
      for (const s of data.serials) {
        await conn.query(
          'INSERT INTO ipqc_serials (checksheet_id, serial_number, page_number, stage) VALUES (?, ?, ?, ?)',
          [id, s.serial_number || s, s.page_number || null, s.stage || null]
        );
      }
    }

    await conn.commit();
    return { success: true };
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

// ========== GET ALL CHECKSHEETS ==========
async function getAllChecksheets(filters = {}) {
  await initTables();
  const d = await getDB();
  let where = [];
  let params = [];

  if (filters.date) { where.push('date = ?'); params.push(filters.date); }
  if (filters.line) { where.push('line = ?'); params.push(filters.line); }
  if (filters.shift) { where.push('shift = ?'); params.push(filters.shift); }
  if (filters.source) { where.push('source = ?'); params.push(filters.source); }
  if (filters.fraud_verdict) { where.push('fraud_verdict = ?'); params.push(filters.fraud_verdict); }

  const whereClause = where.length > 0 ? 'WHERE ' + where.join(' AND ') : '';
  const limit = filters.limit || 100;
  const offset = filters.offset || 0;

  const [rows] = await d.query(
    `SELECT * FROM ipqc_checksheets ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  const [countRows] = await d.query(`SELECT COUNT(*) as total FROM ipqc_checksheets ${whereClause}`, params);

  for (const row of rows) {
    const [scRows] = await d.query('SELECT COUNT(*) as cnt FROM ipqc_serials WHERE checksheet_id = ?', [row.id]);
    row.serial_count = scRows[0].cnt;
  }

  return { rows, total: countRows[0].total };
}

// ========== GET ONE CHECKSHEET ==========
async function getChecksheet(id) {
  await initTables();
  const d = await getDB();
  const [rows] = await d.query('SELECT * FROM ipqc_checksheets WHERE id = ?', [id]);
  const row = rows[0];
  if (!row) return null;

  const [serialRows] = await d.query('SELECT * FROM ipqc_serials WHERE checksheet_id = ? ORDER BY page_number, id', [id]);
  row.serials = serialRows;
  return row;
}

// ========== DELETE CHECKSHEET ==========
async function deleteChecksheet(id) {
  await initTables();
  const d = await getDB();
  await d.query('DELETE FROM ipqc_checksheets WHERE id = ?', [id]);
  return { success: true };
}

// ========== STATS ==========
async function getStats() {
  await initTables();
  const d = await getDB();
  const [[{ cnt: total }]] = await d.query('SELECT COUNT(*) as cnt FROM ipqc_checksheets');
  const [[{ cnt: fromForm }]] = await d.query("SELECT COUNT(*) as cnt FROM ipqc_checksheets WHERE source = 'form'");
  const [[{ cnt: fromOCR }]] = await d.query("SELECT COUNT(*) as cnt FROM ipqc_checksheets WHERE source = 'ocr'");
  const [[{ cnt: genuine }]] = await d.query("SELECT COUNT(*) as cnt FROM ipqc_checksheets WHERE fraud_verdict = 'GENUINE'");
  const [[{ cnt: suspicious }]] = await d.query("SELECT COUNT(*) as cnt FROM ipqc_checksheets WHERE fraud_verdict IN ('SUSPICIOUS','LIKELY_DUMMY')");
  const [[{ cnt: uniqueDates }]] = await d.query('SELECT COUNT(DISTINCT date) as cnt FROM ipqc_checksheets');
  const [lineRows] = await d.query('SELECT DISTINCT line FROM ipqc_checksheets ORDER BY line');
  const uniqueLines = lineRows.map((r) => r.line);
  const [last5] = await d.query('SELECT id, date, line, shift, source, fraud_verdict, created_at FROM ipqc_checksheets ORDER BY created_at DESC LIMIT 5');

  return { total, fromForm, fromOCR, genuine, suspicious, uniqueDates, uniqueLines, last5 };
}

// ========== IQC REPORT FUNCTIONS ==========
async function saveIQCReport(data) {
  await initTables();
  const d = await getDB();

  const iqcData = data.iqcData || {};
  const cocData = data.cocData || {};
  const verification = data.verification || {};

  const insertData = {
    material_type: data.materialType || 'busbar',
    report_filename: data.reportFile || null,

    // IQC Document Info
    document_no: iqcData.documentNo || null,
    issue_date: iqcData.issueDate || null,
    material_name: iqcData.materialName || null,
    supplier_name: iqcData.supplierName || null,
    invoice_no: iqcData.invoiceNo || null,
    receipt_date: iqcData.receiptDate || null,
    lot_no: iqcData.lotNo || null,
    quantity: iqcData.quantity || null,
    sample_count: iqcData.sampleCount || null,
    aql_info: iqcData.aqlInfo || null,
    checked_by: iqcData.checkedBy || null,
    approved_by: iqcData.approvedBy || null,
    inspection_date: iqcData.inspectionDate || null,
    mfg_date: iqcData.mfgDate || null,

    // IQC Measurements
    width_values: JSON.stringify(iqcData.width || []),
    thickness_values: JSON.stringify(iqcData.thickness || []),
    coating_thickness_values: JSON.stringify(iqcData.coatingThickness || []),
    weight_values: JSON.stringify(iqcData.weight || []),
    solderability_busbar: iqcData.solderabilityBusBar || null,
    solderability_ribbon: iqcData.solderabilityRibbon || null,
    tensile_strength: iqcData.tensileStrength || null,
    yield_strength: iqcData.yieldStrength || null,
    resistivity: iqcData.resistivity || null,
    packaging_result: iqcData.packagingResult || null,

    // COC Document Info
    coc_certificate_no: cocData.certificateNo || null,
    coc_customer_name: cocData.customerName || null,
    coc_product_name: cocData.productName || null,
    coc_invoice_no: cocData.invoiceNo || null,
    coc_delivery_date: cocData.deliveryDate || null,
    coc_supplier_name: cocData.supplierName || null,

    // COC Measurements
    coc_width_values: JSON.stringify(cocData.width || []),
    coc_thickness_values: JSON.stringify(cocData.thickness || []),
    coc_tensile_values: JSON.stringify(cocData.tensileStrength || []),
    coc_resistivity_values: JSON.stringify(cocData.resistivity || []),
    coc_copper_purity_values: JSON.stringify(cocData.copperPurity || []),
    coc_weight_values: JSON.stringify(cocData.weight || []),

    // Verification Results
    overall_result: verification.overallResult || null,
    total_checks: verification.summary?.totalChecks || null,
    passed_checks: verification.summary?.passed || null,
    failed_checks: verification.summary?.failed || null,
    warning_checks: verification.summary?.warnings || null,
    fraud_score: verification.fraudAnalysis?.fraudLikelihood?.score || null,
    fraud_indicators: JSON.stringify(verification.fraudAnalysis?.suspiciousPatterns || []),
    verification_details: JSON.stringify(verification.checks || []),
  };

  const cols = Object.keys(insertData);
  const values = Object.values(insertData);
  const placeholders = cols.map(() => '?').join(',');

  const [result] = await d.query(
    `INSERT INTO iqc_reports (${cols.join(',')}) VALUES (${placeholders})`,
    values
  );

  console.log(`[IQC DB] Saved IQC report ID=${result.insertId}, material=${insertData.material_type}, result=${insertData.overall_result}`);
  return { id: result.insertId, success: true };
}

async function getAllIQCReports(filters = {}) {
  await initTables();
  const d = await getDB();
  let where = [];
  let params = [];

  if (filters.material_type) { where.push('material_type = ?'); params.push(filters.material_type); }
  if (filters.supplier_name) { where.push('supplier_name LIKE ?'); params.push(`%${filters.supplier_name}%`); }
  if (filters.invoice_no) { where.push('invoice_no LIKE ?'); params.push(`%${filters.invoice_no}%`); }
  if (filters.overall_result) { where.push('overall_result = ?'); params.push(filters.overall_result); }

  const whereClause = where.length > 0 ? 'WHERE ' + where.join(' AND ') : '';
  const limit = filters.limit || 100;
  const offset = filters.offset || 0;

  const [rows] = await d.query(
    `SELECT id, material_type, report_filename, document_no, material_name, supplier_name, invoice_no, receipt_date, 
            overall_result, total_checks, passed_checks, failed_checks, warning_checks, fraud_score, created_at 
     FROM iqc_reports ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  const [countRows] = await d.query(`SELECT COUNT(*) as total FROM iqc_reports ${whereClause}`, params);

  return { rows, total: countRows[0].total };
}

async function getIQCReport(id) {
  await initTables();
  const d = await getDB();
  const [rows] = await d.query('SELECT * FROM iqc_reports WHERE id = ?', [id]);
  const row = rows[0];
  if (!row) return null;

  // Parse JSON fields
  try { row.width_values = JSON.parse(row.width_values); } catch (e) { row.width_values = []; }
  try { row.thickness_values = JSON.parse(row.thickness_values); } catch (e) { row.thickness_values = []; }
  try { row.coating_thickness_values = JSON.parse(row.coating_thickness_values); } catch (e) { row.coating_thickness_values = []; }
  try { row.weight_values = JSON.parse(row.weight_values); } catch (e) { row.weight_values = []; }
  try { row.coc_width_values = JSON.parse(row.coc_width_values); } catch (e) { row.coc_width_values = []; }
  try { row.coc_thickness_values = JSON.parse(row.coc_thickness_values); } catch (e) { row.coc_thickness_values = []; }
  try { row.coc_tensile_values = JSON.parse(row.coc_tensile_values); } catch (e) { row.coc_tensile_values = []; }
  try { row.coc_resistivity_values = JSON.parse(row.coc_resistivity_values); } catch (e) { row.coc_resistivity_values = []; }
  try { row.coc_copper_purity_values = JSON.parse(row.coc_copper_purity_values); } catch (e) { row.coc_copper_purity_values = []; }
  try { row.coc_weight_values = JSON.parse(row.coc_weight_values); } catch (e) { row.coc_weight_values = []; }
  try { row.fraud_indicators = JSON.parse(row.fraud_indicators); } catch (e) { row.fraud_indicators = []; }
  try { row.verification_details = JSON.parse(row.verification_details); } catch (e) { row.verification_details = []; }

  return row;
}

async function getIQCStats() {
  await initTables();
  const d = await getDB();
  const [[{ cnt: total }]] = await d.query('SELECT COUNT(*) as cnt FROM iqc_reports');
  const [[{ cnt: passed }]] = await d.query("SELECT COUNT(*) as cnt FROM iqc_reports WHERE overall_result = 'PASS'");
  const [[{ cnt: failed }]] = await d.query("SELECT COUNT(*) as cnt FROM iqc_reports WHERE overall_result = 'FAIL'");
  const [[{ cnt: suspicious }]] = await d.query("SELECT COUNT(*) as cnt FROM iqc_reports WHERE overall_result = 'SUSPICIOUS'");
  const [materialRows] = await d.query('SELECT DISTINCT material_type FROM iqc_reports');
  const materialTypes = materialRows.map(r => r.material_type);
  const [last5] = await d.query('SELECT id, material_type, supplier_name, invoice_no, overall_result, created_at FROM iqc_reports ORDER BY created_at DESC LIMIT 5');

  return { total, passed, failed, suspicious, materialTypes, last5 };
}

// ========== SAVE PROCESS RESULT ==========
async function saveProcessResult(checklistInfo, processResult) {
  await initTables();
  const d = await getDB();
  const conn = await d.getConnection();

  let { date, line, shift } = checklistInfo;
  if (!date || !line || !shift) {
    throw new Error('date, line, shift are required to save process result');
  }

  // Normalize date to YYYY-MM-DD (ERP sends ISO like '2026-03-01T00:00:00.000Z')
  date = date.substring(0, 10);
  // Normalize line to strip 'Line ' prefix (consistent with saveChecksheet)
  line = line.replace(/^Line\s*/i, '');
  console.log(`[IPQC DB] saveProcessResult normalized: date=${date}, line=${line}, shift=${shift}`);

  try {
    await conn.beginTransaction();

    // Find existing checksheet by date, line, shift
    const [existing] = await conn.query(
      'SELECT id FROM ipqc_checksheets WHERE date = ? AND line = ? AND shift = ? LIMIT 1',
      [date, line, shift]
    );

    let checksheetId;
    if (existing.length > 0) {
      // Update existing record
      checksheetId = existing[0].id;
      await conn.query(
        `UPDATE ipqc_checksheets SET 
          excel_output_file = ?,
          human_excel_file = ?,
          scanned_pdf_file = ?,
          summary_pdf_file = ?,
          process_result = ?,
          fraud_verdict = ?,
          fraud_score = ?,
          is_processed = TRUE,
          updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [
          processResult.outputFile || null,
          processResult.humanOutputFile || null,
          processResult.scannedPdfFile || null,
          processResult.summaryPdfFile || null,
          JSON.stringify(processResult),
          processResult.fraudAnalysis?.overallVerdict || null,
          processResult.fraudAnalysis?.overallScore || null,
          checksheetId
        ]
      );
    } else {
      // Create new record
      const [insertResult] = await conn.query(
        `INSERT INTO ipqc_checksheets (date, line, shift, source, excel_output_file, human_excel_file, scanned_pdf_file, summary_pdf_file, process_result, fraud_verdict, fraud_score, is_processed)
         VALUES (?, ?, ?, 'ocr', ?, ?, ?, ?, ?, ?, ?, TRUE)`,
        [
          date,
          line,
          shift,
          processResult.outputFile || null,
          processResult.humanOutputFile || null,
          processResult.scannedPdfFile || null,
          processResult.summaryPdfFile || null,
          JSON.stringify(processResult),
          processResult.fraudAnalysis?.overallVerdict || null,
          processResult.fraudAnalysis?.overallScore || null
        ]
      );
      checksheetId = insertResult.insertId;
    }

    await conn.commit();
    return { success: true, id: checksheetId };
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

// ========== GET ALL PROCESS RESULTS ==========
async function getAllProcessResults() {
  await initTables();
  const d = await getDB();

  const [rows] = await d.query(
    `SELECT id, date, line AS Line, shift AS Shift, excel_output_file, human_excel_file, scanned_pdf_file, summary_pdf_file, process_result, fraud_verdict, fraud_score, is_processed
     FROM ipqc_checksheets 
     WHERE is_processed = TRUE
     ORDER BY created_at DESC`
  );

  // Parse JSON process_result
  const results = {};
  for (const row of rows) {
    try {
      row.process_result = row.process_result ? JSON.parse(row.process_result) : null;
    } catch (e) {
      row.process_result = null;
    }
    // Create key matching ERP format: date(YYYY-MM-DD)_Line X_Shift
    const key = `${row.date}_Line ${row.Line}_${row.Shift}`;
    results[key] = row;
  }

  return results;
}

// ========== GET PROCESS RESULT BY CHECKLIST ==========
async function getProcessResultByChecklist(date, line, shift) {
  await initTables();
  const d = await getDB();

  const [rows] = await d.query(
    `SELECT id, date, line AS Line, shift AS Shift, excel_output_file, human_excel_file, scanned_pdf_file, summary_pdf_file, process_result, fraud_verdict, fraud_score, is_processed
     FROM ipqc_checksheets 
     WHERE date = ? AND line = ? AND shift = ? AND is_processed = TRUE
     LIMIT 1`,
    [date, line, shift]
  );

  if (rows.length === 0) return null;

  const row = rows[0];
  try {
    row.process_result = row.process_result ? JSON.parse(row.process_result) : null;
  } catch (e) {
    row.process_result = null;
  }

  return row;
}

module.exports = {
  getDB,
  initTables,
  saveChecksheet,
  updateChecksheet,
  getAllChecksheets,
  getChecksheet,
  deleteChecksheet,
  getStats,
  // Process Result Functions
  saveProcessResult,
  getAllProcessResults,
  getProcessResultByChecklist,
  // IQC Functions
  saveIQCReport,
  getAllIQCReports,
  getIQCReport,
  getIQCStats,
};
