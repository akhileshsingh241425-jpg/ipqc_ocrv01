/**
 * IPQC Database Module — SQLite
 * ==============================
 * Stores all IPQC checksheet data persistently.
 * Tables: ipqc_checksheets, ipqc_values, ipqc_serials
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, 'ipqc_data.db');

let db;

function getDB() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initTables();
  }
  return db;
}

// ========== CREATE TABLES ==========
function initTables() {
  const d = getDB();

  d.exec(`
    CREATE TABLE IF NOT EXISTS ipqc_checksheets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      shift TEXT NOT NULL,
      line TEXT NOT NULL,
      time TEXT,
      po_number TEXT,
      inspector_name TEXT,
      source TEXT DEFAULT 'form',

      -- Page 1: Shop Floor & Stringer
      shop_floor_temp REAL,
      shop_floor_humidity REAL,
      glass_dimension TEXT,
      glass_visual TEXT DEFAULT 'OK',
      eva_epe_type TEXT,
      eva_epe_dimension TEXT,
      eva_epe_status TEXT DEFAULT 'OK',
      soldering_temp REAL,
      cell_manufacturer TEXT,
      cell_efficiency REAL,
      cell_size TEXT,
      cell_condition TEXT DEFAULT 'OK',
      cell_loading_cleanliness TEXT DEFAULT 'Clean',
      stringer_specification TEXT DEFAULT 'OK',
      cutting_equal TEXT DEFAULT 'Equal',
      ts_visual TEXT DEFAULT 'OK',
      ts_el_image TEXT DEFAULT 'OK',
      string_length TEXT,
      cell_gap_ts01a REAL,
      cell_gap_ts01b REAL,
      cell_gap_ts02a REAL,
      cell_gap_ts02b REAL,
      cell_gap_ts03a REAL,
      cell_gap_ts03b REAL,
      cell_gap_ts04a REAL,
      cell_gap_ts04b REAL,

      -- Page 2: Soldering & Layout
      peel_strength_ribbon_cell REAL,
      peel_strength_ribbon_busbar REAL,
      string_to_string_gap REAL,
      cell_edge_glass_top REAL,
      cell_edge_glass_bottom REAL,
      cell_edge_glass_sides REAL,
      terminal_busbar_to_cell REAL,
      soldering_quality TEXT DEFAULT 'OK',
      creepage_top REAL,
      creepage_bottom REAL,
      creepage_left REAL,
      creepage_right REAL,
      creepage_extra REAL,
      auto_taping TEXT DEFAULT 'OK',
      rfid_logo_position TEXT DEFAULT 'OK',
      back_eva_type TEXT,
      back_eva_dimension TEXT,
      back_glass_dimension TEXT,

      -- Page 3: Pre-Lamination
      holes_count INTEGER DEFAULT 3,
      hole1_dimension REAL,
      hole2_dimension REAL,
      hole3_dimension REAL,
      busbar_flatten TEXT DEFAULT 'OK',
      pre_lam_visual TEXT DEFAULT 'OK',
      rework_station_clean TEXT DEFAULT 'Clean',
      soldering_iron_temp1 REAL,
      soldering_iron_temp2 REAL,
      rework_method TEXT DEFAULT 'Manual',

      -- Page 4: Post-Lamination
      peel_test_eva_glass TEXT,
      peel_test_eva_backsheet TEXT,
      gel_content TEXT,
      tape_removing TEXT DEFAULT 'OK',
      trimming_quality TEXT DEFAULT 'OK',
      trimming_blade_status TEXT DEFAULT 'OK',
      post_lam_visual TEXT DEFAULT 'OK',
      glue_uniformity TEXT DEFAULT 'OK',
      short_side_glue_weight REAL,
      long_side_glue_weight REAL,
      anodizing_thickness REAL,

      -- Page 5: JB Assembly & Curing
      jb_appearance TEXT DEFAULT 'OK',
      jb_cable_length REAL,
      silicon_glue_weight REAL,
      welding_time TEXT,
      welding_current REAL,
      soldering_quality_jb TEXT DEFAULT 'OK',
      glue_ratio TEXT,
      potting_weight REAL,
      nozzle_status TEXT DEFAULT 'OK',
      potting_inspection TEXT DEFAULT 'OK',
      curing_visual TEXT DEFAULT 'OK',
      curing_temp REAL,
      curing_humidity REAL,
      curing_time TEXT,
      buffing_condition TEXT DEFAULT 'OK',
      cleaning_status TEXT DEFAULT 'OK',

      -- Page 6: Flash Tester & EL
      ambient_temp REAL,
      module_temp REAL,
      simulator_calibration TEXT DEFAULT 'OK',
      silver_ref_module TEXT,
      el_check TEXT DEFAULT 'OK',
      dcw_value1 REAL,
      dcw_value2 REAL,
      dcw_value3 REAL,
      dcw_value4 REAL,
      ir_value1 REAL,
      ir_value2 REAL,
      ir_value3 REAL,
      ir_value4 REAL,
      ground_continuity TEXT,
      voltage_verification REAL,
      current_verification REAL,
      post_el_visual TEXT DEFAULT 'OK',
      rfid_position TEXT DEFAULT 'OK',
      manufacturing_month TEXT,

      -- Page 7: Final & Packaging
      final_visual TEXT DEFAULT 'OK',
      backlabel TEXT DEFAULT 'OK',
      module_dimension TEXT,
      mounting_hole_x REAL,
      mounting_hole_y REAL,
      diagonal_difference REAL,
      corner_gap REAL,
      cable_length_final REAL,
      packaging_label TEXT DEFAULT 'OK',
      box_content TEXT DEFAULT 'OK',
      box_condition TEXT DEFAULT 'OK',
      pallet_dimension TEXT,

      -- Metadata
      fraud_verdict TEXT,
      fraud_score INTEGER,
      ocr_data_file TEXT,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS ipqc_serials (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      checksheet_id INTEGER NOT NULL,
      serial_number TEXT NOT NULL,
      page_number INTEGER,
      stage TEXT,
      FOREIGN KEY (checksheet_id) REFERENCES ipqc_checksheets(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_checksheet_date ON ipqc_checksheets(date);
    CREATE INDEX IF NOT EXISTS idx_checksheet_line ON ipqc_checksheets(line);
    CREATE INDEX IF NOT EXISTS idx_checksheet_shift ON ipqc_checksheets(shift);
    CREATE INDEX IF NOT EXISTS idx_serial_checksheet ON ipqc_serials(checksheet_id);
    CREATE INDEX IF NOT EXISTS idx_serial_number ON ipqc_serials(serial_number);
  `);
}

// ========== SAVE CHECKSHEET ==========
function saveChecksheet(data) {
  const d = getDB();

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
    'fraud_verdict','fraud_score','ocr_data_file'
  ];

  const values = cols.map(c => data[c] !== undefined ? data[c] : null);
  const placeholders = cols.map(() => '?').join(',');
  const colNames = cols.join(',');

  const stmt = d.prepare(`INSERT INTO ipqc_checksheets (${colNames}) VALUES (${placeholders})`);
  const result = stmt.run(...values);
  const checksheetId = result.lastInsertRowid;

  // Save serial numbers
  if (data.serials && Array.isArray(data.serials)) {
    const serialStmt = d.prepare('INSERT INTO ipqc_serials (checksheet_id, serial_number, page_number, stage) VALUES (?, ?, ?, ?)');
    const insertSerials = d.transaction((serials) => {
      for (const s of serials) {
        serialStmt.run(checksheetId, s.serial_number || s, s.page_number || null, s.stage || null);
      }
    });
    insertSerials(data.serials);
  }

  return { id: checksheetId, success: true };
}

// ========== UPDATE CHECKSHEET ==========
function updateChecksheet(id, data) {
  const d = getDB();
  const setClauses = [];
  const values = [];

  for (const [key, val] of Object.entries(data)) {
    if (key === 'id' || key === 'serials' || key === 'created_at') continue;
    setClauses.push(`${key} = ?`);
    values.push(val);
  }

  if (setClauses.length === 0) return { success: false, error: 'No fields to update' };

  setClauses.push("updated_at = datetime('now','localtime')");
  values.push(id);

  d.prepare(`UPDATE ipqc_checksheets SET ${setClauses.join(', ')} WHERE id = ?`).run(...values);

  // Update serials if provided
  if (data.serials && Array.isArray(data.serials)) {
    d.prepare('DELETE FROM ipqc_serials WHERE checksheet_id = ?').run(id);
    const serialStmt = d.prepare('INSERT INTO ipqc_serials (checksheet_id, serial_number, page_number, stage) VALUES (?, ?, ?, ?)');
    for (const s of data.serials) {
      serialStmt.run(id, s.serial_number || s, s.page_number || null, s.stage || null);
    }
  }

  return { success: true };
}

// ========== GET ALL CHECKSHEETS ==========
function getAllChecksheets(filters = {}) {
  const d = getDB();
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

  const rows = d.prepare(`SELECT * FROM ipqc_checksheets ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(...params, limit, offset);
  const count = d.prepare(`SELECT COUNT(*) as total FROM ipqc_checksheets ${whereClause}`).get(...params);

  // Get serial counts
  for (const row of rows) {
    const sc = d.prepare('SELECT COUNT(*) as cnt FROM ipqc_serials WHERE checksheet_id = ?').get(row.id);
    row.serial_count = sc.cnt;
  }

  return { rows, total: count.total };
}

// ========== GET ONE CHECKSHEET ==========
function getChecksheet(id) {
  const d = getDB();
  const row = d.prepare('SELECT * FROM ipqc_checksheets WHERE id = ?').get(id);
  if (!row) return null;

  row.serials = d.prepare('SELECT * FROM ipqc_serials WHERE checksheet_id = ? ORDER BY page_number, id').all(id);
  return row;
}

// ========== DELETE CHECKSHEET ==========
function deleteChecksheet(id) {
  const d = getDB();
  d.prepare('DELETE FROM ipqc_checksheets WHERE id = ?').run(id);
  return { success: true };
}

// ========== STATS ==========
function getStats() {
  const d = getDB();
  const total = d.prepare('SELECT COUNT(*) as cnt FROM ipqc_checksheets').get().cnt;
  const fromForm = d.prepare("SELECT COUNT(*) as cnt FROM ipqc_checksheets WHERE source = 'form'").get().cnt;
  const fromOCR = d.prepare("SELECT COUNT(*) as cnt FROM ipqc_checksheets WHERE source = 'ocr'").get().cnt;
  const genuine = d.prepare("SELECT COUNT(*) as cnt FROM ipqc_checksheets WHERE fraud_verdict = 'GENUINE'").get().cnt;
  const suspicious = d.prepare("SELECT COUNT(*) as cnt FROM ipqc_checksheets WHERE fraud_verdict IN ('SUSPICIOUS','LIKELY_DUMMY')").get().cnt;
  const uniqueDates = d.prepare('SELECT COUNT(DISTINCT date) as cnt FROM ipqc_checksheets').get().cnt;
  const uniqueLines = d.prepare('SELECT DISTINCT line FROM ipqc_checksheets ORDER BY line').all().map(r => r.line);
  const last5 = d.prepare('SELECT id, date, line, shift, source, fraud_verdict, created_at FROM ipqc_checksheets ORDER BY created_at DESC LIMIT 5').all();

  return { total, fromForm, fromOCR, genuine, suspicious, uniqueDates, uniqueLines, last5 };
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
};
