/**
 * IPQC Checksheet Fraud / Dummy Detection Engine
 * ================================================
 * Detects if quality person genuinely filled the IPQC checksheet
 * or copied data from past checksheets (dummy fill).
 *
 * Detection Methods:
 *   1. PAST DATA COMPARISON — Compare current values with all past checksheets.
 *      If too many values match exactly → COPIED.
 *   2. STATISTICAL ANALYSIS — Variance too low, digit preference, arithmetic patterns.
 *   3. VALUE PATTERN ANALYSIS — Same sequences, identical ordering, round numbers.
 *   4. TEMPORAL ANALYSIS — Time gaps, impossible measurement sequences.
 */

const fs = require('fs');
const path = require('path');

// ================================================================
// VALUE EXTRACTOR — Parse raw OCR text from IPQC checksheet pages
// to extract all measurable numeric values
// ================================================================
function extractIPQCValues(pagesData) {
  var values = {
    // Page 1 - Shop Floor & Stringer
    shopFloorTemp: null,        // e.g., 24.7°C
    shopFloorHumidity: null,    // e.g., 40%
    glassDimension: null,       // e.g., 2376×1128×2.000mm
    glassVisual: 'OK',
    evaEpeType: null,           // e.g., EP304
    evaEpeDimension: null,      // e.g., 12328×1125×0.700mm
    evaEpeStatus: 'OK',
    solderingTemp: null,        // e.g., 413°C
    cellManufacturer: null,     // e.g., Solar Space
    cellEfficiency: null,       // e.g., 25.40%
    cellSize: null,             // e.g., 105.07×182.34mm
    cellCondition: 'OK',
    cellLoadingCleanliness: 'Clean',
    stringerSpecification: 'OK',
    cuttingEqual: 'Equal',
    tsVisual: 'OK',
    tsElImage: 'OK',
    stringLength: null,         // e.g., 1163mm
    cellToGapValues: [],        // e.g., [0.72, 0.81, 0.78, ...] per stringer

    // Page 2 - Soldering & Layout
    peelStrengthRibbonToCell: null,   // e.g., 1.50N
    peelStrengthRibbonToBusbar: null, // e.g., ≥2N
    stringToStringGap: null,    // e.g., 1.52 mm
    cellEdgeToGlassTop: null,   // e.g., 18.70 mm
    cellEdgeToGlassBottom: null,// e.g., 18.58 mm
    cellEdgeToGlassSides: null, // e.g., 12.46 mm
    terminalBusbarToCell: null, // e.g., 3.04 mm
    solderingQuality: 'OK',
    creepageDistances: [],      // e.g., [11.48, 11.24, 10.98, 11.56, 11.21]
    autoTaping: 'OK',
    rfidLogoPosition: 'OK',
    backEvaType: null,          // e.g., EVA EP309
    backEvaDimension: null,     // e.g., 2378×1125×0.200mm
    backGlassDimension: null,   // e.g., 2376×1128×2.000mm

    // Page 3 - Pre-Lamination
    holesCount: 3,
    holeDimensions: [],         // e.g., [11.99, 12.02, 12.01]
    busbarFlatten: 'OK',
    preLamVisual: 'OK',
    reworkStationClean: 'Clean',
    solderingIronTemp: null,    // e.g., 421°C
    solderingIronTemp2: null,   // second station
    reworkMethod: 'Manual',
    preELSerials: [],

    // Page 4 - Post-Lamination
    peelTestEvaGlass: null,     // e.g., ≥60N/cm
    peelTestEvaBacksheet: null, // e.g., ≥60N/cm
    gelContent: null,           // e.g., 75-95%
    tapeRemoving: 'OK',
    trimmingQuality: 'OK',
    trimmingBladeStatus: 'OK',
    postLamVisual: 'OK',
    glueUniformity: 'OK',
    shortSideGlueWeight: null,
    longSideGlueWeight: null,
    anodizingThickness: null,   // e.g., 18.5 micron
    postLamSerials: [],

    // Page 5 - JB Assembly & Curing
    jbAppearance: 'OK',
    jbCableLength: null,        // e.g., 300mm
    siliconGlueWeight: null,    // e.g., 19.334gm
    weldingTime: null,          // e.g., 2.5 Sec
    weldingCurrent: null,       // e.g., 17 Amp
    solderingQualityJB: 'OK',
    glueRatio: null,
    pottingWeight: null,        // e.g., 19.593 gm
    nozzleStatus: 'OK',
    pottingInspection: 'OK',
    curingVisual: 'OK',
    curingTemp: null,           // e.g., 24.6°C
    curingHumidity: null,       // e.g., 57%
    curingTime: null,           // e.g., 4 hours
    buffingCondition: 'OK',
    cleaningStatus: 'OK',
    glueWeight: null,           // e.g., 16.394 gm

    // Page 6 - Flash Tester & EL
    ambientTemp: null,          // e.g., 27.93°C
    moduleTemp: null,           // e.g., 26.48°C
    simulatorCalibration: 'OK',
    silverRefModule: null,
    elCheck: 'OK',
    dcwValues: [],              // e.g., [1.4, 1.4, 1.448, 1.44]
    irValues: [],               // e.g., [3.58, 3.88, 5.68, 3.83]
    groundContinuity: null,     // e.g., 4.547mΩ
    voltageVerification: null,  // e.g., 51.81V
    currentVerification: null,  // e.g., 7.464A
    postElVisual: 'OK',
    rfidPosition: 'Center',
    manufacturingMonth: null,   // e.g., March 2026
    flashTesterSerials: [],

    // Page 7 - Final & Packaging
    finalVisual: 'OK',
    backlabel: 'OK',
    moduleDimension: null,      // e.g., 2382×1134×30mm
    mountingHoleX: null,        // e.g., 1400mm
    mountingHoleY: null,        // e.g., 1091mm
    diagonalDiff: null,         // e.g., 1 mm
    cornerGap: null,            // e.g., 0.02mm
    cableLengthFinal: null,     // e.g., 300mm
    packagingLabel: 'OK',
    boxContent: 'OK',
    boxCondition: 'OK',
    palletDimension: null,      // e.g., 2400×1081×147mm
    finalVisualSerials: [],

    // All numeric values for comparison (flattened)
    allNumericValues: [],
    allSerials: [],
    date: null,
    line: null,
    shift: null,
    time: null,
  };

  if (!pagesData || !Array.isArray(pagesData)) return values;

  for (var i = 0; i < pagesData.length; i++) {
    var page = pagesData[i];
    var text = page.rawText || '';
    var pageNum = page.pageNumber || i + 1;

    // Collect serials from all pages
    if (page.serialNumbers && page.serialNumbers.length > 0) {
      values.allSerials = values.allSerials.concat(page.serialNumbers);
    }

    // ---- PAGE 1 ----
    if (pageNum === 1) {
      // Date
      var dateMatch = text.match(/Date[:\s-]+(\d{2}[-\/]\d{2}[-\/]\d{4})/i);
      if (!dateMatch) dateMatch = text.match(/Date[:\s-]+(\d{2}[-\/]\d{2}[-\/]\d{2,4})/i);
      if (dateMatch) values.date = dateMatch[1];

      // Time
      var timeMatch = text.match(/Time[:\s-]+(\d{1,2}:\d{2}\s*[AP]?M?)/i);
      if (timeMatch) values.time = timeMatch[1];

      // Shift
      var shiftMatch = text.match(/Shift\s*(Night|Day)/i);
      if (shiftMatch) values.shift = shiftMatch[1];

      // Shop floor temperature
      var sfTemp = text.match(/(?:Time[\s\S]{0,30}?PM\s+)(\d{2,3}\.?\d*)[\s°]*[Cc]/);
      if (sfTemp) values.shopFloorTemp = parseFloat(sfTemp[1]);

      // Humidity
      var humMatch = text.match(/RH[^0-9]*(\d{2,3})\s*%/i);
      if (!humMatch) humMatch = text.match(/(\d{2,3})\s*%\s*(?:\n|$)/);
      if (humMatch) values.shopFloorHumidity = parseFloat(humMatch[1]);

      // Glass dimension - e.g., (2376×1128×2.000)mm
      var glassDimMatch = text.match(/\(?\s*(\d{3,4}\s*[×xX]\s*\d{3,4}\s*[×xX]\s*\d+\.?\d*)\s*\)?\s*mm/i);
      if (glassDimMatch) values.glassDimension = glassDimMatch[1].replace(/\s/g, '');

      // EVA/EPE Type - e.g., EP304
      var evaTypeMatch = text.match(/(?:EVA|EPE|EVA\/EPE)[^A-Z]*([A-Z]{1,3}\d{3})/i);
      if (evaTypeMatch) values.evaEpeType = evaTypeMatch[1];

      // EVA/EPE Dimension
      var evaDimMatch = text.match(/EVA\/EPE[\s\S]{0,100}?(\d{4,5}\s*[×xX]\s*\d{3,4}\s*[×xX]\s*\d+\.?\d*)\s*\)?mm/i);
      if (evaDimMatch) values.evaEpeDimension = evaDimMatch[1].replace(/\s/g, '');

      // Soldering temperature
      var soldTemp = text.match(/(?:soldered|soldering)[^0-9]*(\d{3,4})\s*[°℃]/i);
      if (!soldTemp) soldTemp = text.match(/(\d{3})[\s°℃]+[Cc]?\s*(?:\n|Refer)/);
      if (soldTemp) values.solderingTemp = parseFloat(soldTemp[1]);

      // Cell Manufacturer - e.g., Solar Space
      var cellMfgMatch = text.match(/(?:Refer\s*Process\s*Card|Cell\s*Manufacturer)[^A-Z]*([A-Z][a-z]+\s*[A-Z]?[a-z]*)/i);
      if (cellMfgMatch) values.cellManufacturer = cellMfgMatch[1].trim();

      // Cell efficiency
      var effMatch = text.match(/(\d{2}\.\d{2})\s*%/);
      if (effMatch) values.cellEfficiency = parseFloat(effMatch[1]);

      // Cell Size - e.g., 105.07×182.34mm
      var cellSizeMatch = text.match(/\(?\s*(\d{2,3}\.\d{2}\s*[×xX]\s*\d{2,3}\.\d{2})\s*\)?\s*mm/i);
      if (cellSizeMatch) values.cellSize = cellSizeMatch[1].replace(/\s/g, '');

      // String length - e.g., 1163mm
      var stringLenMatch = text.match(/TS\d{2}[AB]\s*(?:\n)?\s*(\d{4})\s/);
      if (stringLenMatch) values.stringLength = stringLenMatch[1] + 'mm';

      // Cell-to-Cell Gap values (look for TS01A 0.72, TS01B 0.81, etc.)
      var gapMatches = text.match(/TS\d{2}[AB]\s*(?:\n)?\s*(0\.\d{2})/gi);
      if (gapMatches) {
        for (var g = 0; g < gapMatches.length; g++) {
          var gapVal = gapMatches[g].match(/(0\.\d{2})/);
          if (gapVal) values.cellToGapValues.push(parseFloat(gapVal[1]));
        }
      }
      // Fallback: find all 0.XX patterns after "Cell to Cell Gap"
      if (values.cellToGapValues.length === 0) {
        var gapSection = text.substring(text.indexOf('Cell to Cell Gap'));
        if (gapSection) {
          var allGaps = gapSection.match(/0\.\d{2}/g);
          if (allGaps) {
            for (var gg = 0; gg < allGaps.length; gg++) {
              values.cellToGapValues.push(parseFloat(allGaps[gg]));
            }
          }
        }
      }

      // OK/Visual status checks
      if (/visual[\s\S]{0,20}OK/i.test(text)) values.tsVisual = 'OK';
      if (/EL[\s\S]{0,20}OK/i.test(text)) values.tsElImage = 'OK';
      if (/clean/i.test(text)) values.cellLoadingCleanliness = 'Clean';
      if (/equal/i.test(text)) values.cuttingEqual = 'Equal';
    }

    // ---- PAGE 2 ----
    if (pageNum === 2) {
      // Peel strength ribbon to cell - e.g., 1.50N
      var peelCellMatch = text.match(/(?:ribbon\s*to\s*cell|peel\s*strength)[^0-9]*(\d+\.?\d*)\s*(?:N|mm)/i);
      if (peelCellMatch) values.peelStrengthRibbonToCell = parseFloat(peelCellMatch[1]);

      // Peel strength ribbon to busbar
      var peelBusMatch = text.match(/(?:ribbon\s*to\s*busbar)[^0-9]*(\d+\.?\d*)\s*N?/i);
      if (peelBusMatch) values.peelStrengthRibbonToBusbar = parseFloat(peelBusMatch[1]);

      // Cell edge to glass edge - Top
      var topMatch = text.match(/TOP\s*(?:\n)?\s*(\d{1,2}\.\d{2})\s*mm/i);
      if (topMatch) values.cellEdgeToGlassTop = parseFloat(topMatch[1]);

      // Bottom
      var botMatch = text.match(/Bottom\s*(?:\n)?\s*(\d{1,2}\.\d{2})\s*mm/i);
      if (botMatch) values.cellEdgeToGlassBottom = parseFloat(botMatch[1]);

      // Sides
      var sideMatch = text.match(/Sides?\s*(?:\n)?\s*(\d{1,2}\.\d{2})\s*mm/i);
      if (sideMatch) values.cellEdgeToGlassSides = parseFloat(sideMatch[1]);

      // String to string gap
      var stgMatch = text.match(/(\d\.\d{2})\s*mm\s*(?:\n|Ribbon)/i);
      if (stgMatch) values.stringToStringGap = parseFloat(stgMatch[1]);

      // Terminal busbar to cell
      var tbMatch = text.match(/(\d\.\d{2})\s*mm\s*(?:\n|OK)/i);
      if (tbMatch) values.terminalBusbarToCell = parseFloat(tbMatch[1]);

      // Creepage distances — look for multiple XX.XX mm values
      var creepRegex = /(\d{1,2}[:.]\d{2})\s*mm/g;
      var creepMatch;
      while ((creepMatch = creepRegex.exec(text)) !== null) {
        var cv = parseFloat(creepMatch[1].replace(':', '.'));
        if (cv > 5 && cv < 25) {
          values.creepageDistances.push(cv);
        }
      }

      // Back EVA Type - e.g., EVA EP309
      var backEvaMatch = text.match(/EVA\s*([A-Z]{1,3}\d{3})/i);
      if (backEvaMatch) values.backEvaType = 'EVA ' + backEvaMatch[1];

      // Back EVA Dimension
      var backEvaDimMatch = text.match(/\(?\s*(\d{4}\s*[×xX]\s*\d{3,4}\s*[×xX]\s*0\.\d{3})\s*\)?\s*mm/i);
      if (backEvaDimMatch) values.backEvaDimension = backEvaDimMatch[1].replace(/\s/g, '');

      // Back Glass Dimension
      var backGlassMatch = text.match(/(?:Glass|PO)\s*[\s\S]{0,30}?\(?\s*(\d{4}\s*[×xX]\s*\d{3,4}\s*[×xX]\s*\d+\.?\d*)\s*\)?\s*mm/i);
      if (backGlassMatch) values.backGlassDimension = backGlassMatch[1].replace(/\s/g, '');

      // OK status checks
      if (/soldering[\s\S]{0,30}OK/i.test(text)) values.solderingQuality = 'OK';
      if (/taping[\s\S]{0,30}OK/i.test(text)) values.autoTaping = 'OK';
      if (/RFID[\s\S]{0,30}OK/i.test(text)) values.rfidLogoPosition = 'OK';
    }

    // ---- PAGE 3 ----
    if (pageNum === 3) {
      // Hole dimensions (3 holes, 12mm target)
      var holeRegex = /(\d{1,2}\.\d{2})\s*mm/g;
      var holeMatch;
      var holeVals = [];
      while ((holeMatch = holeRegex.exec(text)) !== null) {
        var hv = parseFloat(holeMatch[1]);
        if (hv >= 11.0 && hv <= 13.0) {
          holeVals.push(hv);
        }
      }
      if (holeVals.length > 0) {
        values.holeDimensions = holeVals.slice(0, 3);
        values.holesCount = holeVals.length >= 3 ? 3 : holeVals.length;
      }

      // Soldering iron temp — look for 4XXᵒC pattern
      var siTemp = text.match(/(\d{3})\s*[°º]?\s*[Cc]/);
      if (siTemp && parseInt(siTemp[1]) >= 380 && parseInt(siTemp[1]) <= 450) {
        values.solderingIronTemp = parseFloat(siTemp[1]);
      }
      // Second soldering iron
      var siTemp2Matches = text.match(/(\d{3})\s*[°º]?\s*[Cc]/g);
      if (siTemp2Matches && siTemp2Matches.length >= 2) {
        var t2 = siTemp2Matches[1].match(/(\d{3})/);
        if (t2 && parseInt(t2[1]) >= 380 && parseInt(t2[1]) <= 450) {
          values.solderingIronTemp2 = parseFloat(t2[1]);
        }
      }

      // Rework method
      if (/manual/i.test(text)) values.reworkMethod = 'Manual';
      else if (/auto/i.test(text)) values.reworkMethod = 'Auto';

      // OK status checks
      if (/flatten[\s\S]{0,30}OK/i.test(text)) values.busbarFlatten = 'OK';
      if (/visual[\s\S]{0,30}OK/i.test(text)) values.preLamVisual = 'OK';
      if (/clean[\s\S]{0,20}wet/i.test(text)) values.reworkStationClean = 'Clean';

      // Pre-EL serials
      values.preELSerials = page.serialNumbers || [];
    }

    // ---- PAGE 4 ----
    if (pageNum === 4) {
      // Peel test EVA to Glass - e.g., ≥60N/cm
      var peelGlassMatch = text.match(/E\/G\s*[≥>]?\s*(\d+)\s*N\/cm/i);
      if (peelGlassMatch) values.peelTestEvaGlass = '≥' + peelGlassMatch[1] + 'N/cm';

      // Peel test EVA to Backsheet
      var peelBsMatch = text.match(/E\/B\s*[≥>]?\s*(\d+)\s*N\/cm/i);
      if (peelBsMatch) values.peelTestEvaBacksheet = '≥' + peelBsMatch[1] + 'N/cm';

      // Gel content - e.g., 75-95%
      var gelMatch = text.match(/(\d{2})\s*(?:to|-)\s*(\d{2,3})\s*%/i);
      if (gelMatch) values.gelContent = gelMatch[1] + '-' + gelMatch[2] + '%';

      // Anodizing thickness
      var anoMatch = text.match(/(\d{1,2}\.?\d*)\s*[Mm]icron/i);
      if (anoMatch) values.anodizingThickness = parseFloat(anoMatch[1]);

      // OK status checks
      if (/tape[\s\S]{0,20}remov[\s\S]{0,20}OK/i.test(text)) values.tapeRemoving = 'OK';
      if (/trimming[\s\S]{0,30}OK/i.test(text)) values.trimmingQuality = 'OK';
      if (/blade[\s\S]{0,30}OK/i.test(text)) values.trimmingBladeStatus = 'OK';
      if (/visual[\s\S]{0,30}OK/i.test(text)) values.postLamVisual = 'OK';
      if (/uniform[\s\S]{0,20}OK/i.test(text)) values.glueUniformity = 'OK';

      values.postLamSerials = page.serialNumbers || [];
    }

    // ---- PAGE 5 ----
    if (pageNum === 5) {
      // Silicon glue weight - first gm value
      var siliconMatch = text.match(/(\d{1,2}\.\d{1,3})\s*gm/i);
      if (siliconMatch) values.siliconGlueWeight = parseFloat(siliconMatch[1]);

      // Glue weight (short side)
      var glueMatch = text.match(/(\d{1,2}\.\d{1,3})\s*gm/i);
      if (glueMatch) values.glueWeight = parseFloat(glueMatch[1]);

      // Potting weight
      var potMatches = text.match(/(\d{1,2}\.\d{1,3})\s*gm/gi);
      if (potMatches && potMatches.length >= 2) {
        var pm2 = potMatches[1].match(/(\d{1,2}\.\d{1,3})/);
        if (pm2) values.pottingWeight = parseFloat(pm2[1]);
      }

      // Welding time - e.g., 2.5 Sec
      var wTimeMatch = text.match(/(\d+\.?\d*)\s*Sec/i);
      if (wTimeMatch) values.weldingTime = wTimeMatch[1] + ' Sec';

      // Welding current
      var wcMatch = text.match(/(\d{1,2})\s*Amp/i);
      if (wcMatch) values.weldingCurrent = parseFloat(wcMatch[1]);

      // JB Cable length - e.g., 300mm
      var cableLenMatch = text.match(/(\d{3})\s*mm/);
      if (cableLenMatch && parseInt(cableLenMatch[1]) >= 200 && parseInt(cableLenMatch[1]) <= 500) {
        values.jbCableLength = parseFloat(cableLenMatch[1]);
      }

      // Curing temperature
      var curTemp = text.match(/(\d{2}\.\d)[\s°]*[Cc]/);
      if (curTemp && parseFloat(curTemp[1]) < 40) values.curingTemp = parseFloat(curTemp[1]);

      // Curing humidity
      var curHum = text.match(/(\d{2,3})\s*%/);
      if (curHum && parseInt(curHum[1]) < 100) values.curingHumidity = parseFloat(curHum[1]);

      // Curing time - e.g., 4 hours
      var curTimeMatch = text.match(/(\d+)\s*hours?/i);
      if (curTimeMatch) values.curingTime = curTimeMatch[1] + ' hours';

      // OK status checks
      if (/JB[\s\S]{0,30}OK/i.test(text) || /junction[\s\S]{0,30}OK/i.test(text)) values.jbAppearance = 'OK';
      if (/soldering[\s\S]{0,30}OK/i.test(text)) values.solderingQualityJB = 'OK';
      if (/nozzle[\s\S]{0,30}OK/i.test(text)) values.nozzleStatus = 'OK';
      if (/potting[\s\S]{0,30}OK/i.test(text)) values.pottingInspection = 'OK';
      if (/curing[\s\S]{0,30}OK/i.test(text)) values.curingVisual = 'OK';
      if (/buffing[\s\S]{0,30}OK/i.test(text)) values.buffingCondition = 'OK';
      if (/clean[\s\S]{0,30}OK/i.test(text)) values.cleaningStatus = 'OK';
    }

    // ---- PAGE 6 ----
    if (pageNum === 6) {
      // Ambient temp
      var ambMatch = text.match(/(\d{2}\.\d{1,2})\s*[°ºᵒ]?\s*[Cc]/);
      if (ambMatch) values.ambientTemp = parseFloat(ambMatch[1]);

      // Module temp
      var modTempMatches = text.match(/(\d{2}\.\d{1,2})\s*[°ºᵒ]?\s*[Cc]/g);
      if (modTempMatches && modTempMatches.length >= 2) {
        var mt = modTempMatches[1].match(/(\d{2}\.\d{1,2})/);
        if (mt) values.moduleTemp = parseFloat(mt[1]);
      }

      // DCW values
      var dcwmatches = text.match(/(\d\.\d{1,3})\s*[Mm][Aa]/g);
      if (dcwmatches) {
        for (var d = 0; d < dcwmatches.length; d++) {
          var dv = dcwmatches[d].match(/(\d\.\d{1,3})/);
          if (dv) values.dcwValues.push(parseFloat(dv[1]));
        }
      }

      // IR values — look for X.XX mΩ or similar
      var irmatches = text.match(/(\d\.\d{2})\s*m[Ωm2]/g);
      if (irmatches) {
        for (var ir = 0; ir < irmatches.length; ir++) {
          var irv = irmatches[ir].match(/(\d\.\d{2})/);
          if (irv) values.irValues.push(parseFloat(irv[1]));
        }
      }

      // Ground continuity - e.g., 4.547mΩ
      var gcMatch = text.match(/(\d+\.?\d*)\s*m[Ωm2]/i);
      if (gcMatch) values.groundContinuity = gcMatch[1] + 'mΩ';

      // Voltage verification - e.g., 51.81V
      var voltMatch = text.match(/(\d{2,3}\.\d{1,2})\s*V/);
      if (voltMatch) values.voltageVerification = parseFloat(voltMatch[1]);

      // Current verification - e.g., 7.464A
      var currMatch = text.match(/(\d{1,2}\.\d{1,3})\s*A[^m]/);
      if (currMatch) values.currentVerification = parseFloat(currMatch[1]);

      // Manufacturing month - e.g., March 2026
      var monthMatch = text.match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s*\d{4}/i);
      if (monthMatch) values.manufacturingMonth = monthMatch[0];

      // RFID Position - e.g., Center
      var rfidPosMatch = text.match(/(Center|Left|Right|Top|Bottom)/i);
      if (rfidPosMatch) values.rfidPosition = rfidPosMatch[1];

      // OK status checks
      if (/calibrat[\s\S]{0,30}OK/i.test(text)) values.simulatorCalibration = 'OK';
      if (/EL[\s\S]{0,30}OK/i.test(text)) values.elCheck = 'OK';
      if (/visual[\s\S]{0,30}OK/i.test(text)) values.postElVisual = 'OK';

      values.flashTesterSerials = page.serialNumbers || [];
    }

    // ---- PAGE 7 ----
    if (pageNum === 7) {
      // Module dimension - e.g., 2382×1134×30mm
      var modDimMatch = text.match(/\(?\s*(\d{4}\s*[×xX]\s*\d{3,4}\s*[×xX]\s*\d{2,3})\s*\)?\s*mm/i);
      if (modDimMatch) values.moduleDimension = modDimMatch[1].replace(/\s/g, '');

      // Mounting hole X & Y - e.g., (1400×1091)mm
      var mountMatch = text.match(/\(?\s*(\d{3,4})\s*[×xX]\s*(\d{3,4})\s*\)?\s*mm/i);
      if (mountMatch) {
        values.mountingHoleX = parseFloat(mountMatch[1]);
        values.mountingHoleY = parseFloat(mountMatch[2]);
      }

      // Diagonal difference - e.g., 1mm
      var diagMatch = text.match(/diagonal[\s\S]{0,50}?(\d\.?\d*)\s*mm/i);
      if (!diagMatch) diagMatch = text.match(/(\d\.?\d*)\s*mm\s*(?:\n|$)/);
      if (diagMatch && parseFloat(diagMatch[1]) <= 10) {
        values.diagonalDiff = parseFloat(diagMatch[1]);
      }

      // Corner gap - e.g., 0.02mm
      var cornerMatch = text.match(/corner[\s\S]{0,30}?(\d+\.?\d*)\s*mm/i);
      if (cornerMatch) values.cornerGap = parseFloat(cornerMatch[1]);

      // Cable length final - e.g., 300mm
      var cableFinalMatch = text.match(/cable[\s\S]{0,30}?(\d{3})\s*mm/i);
      if (cableFinalMatch) values.cableLengthFinal = parseFloat(cableFinalMatch[1]);

      // Pallet dimension - e.g., 2400×1081×147mm
      var palletMatch = text.match(/pallet[\s\S]{0,50}?\(?\s*(\d{4}\s*[×xX]\s*\d{3,4}\s*[×xX]\s*\d{2,3})\s*\)?/i);
      if (palletMatch) values.palletDimension = palletMatch[1].replace(/\s/g, '') + 'mm';

      // OK status checks
      if (/visual[\s\S]{0,30}OK/i.test(text)) values.finalVisual = 'OK';
      if (/backlabel[\s\S]{0,30}OK/i.test(text) || /label[\s\S]{0,30}OK/i.test(text)) values.backlabel = 'OK';
      if (/packaging[\s\S]{0,30}OK/i.test(text)) values.packagingLabel = 'OK';
      if (/box[\s\S]{0,20}content[\s\S]{0,20}OK/i.test(text)) values.boxContent = 'OK';
      if (/box[\s\S]{0,20}condition[\s\S]{0,20}OK/i.test(text)) values.boxCondition = 'OK';

      values.finalVisualSerials = page.serialNumbers || [];
    }
  }

  // Build flattened list of all numeric values for comparison
  var allNums = [];
  if (values.shopFloorTemp !== null) allNums.push({ name: 'Shop Floor Temp', value: values.shopFloorTemp, page: 1 });
  if (values.shopFloorHumidity !== null) allNums.push({ name: 'Humidity', value: values.shopFloorHumidity, page: 1 });
  if (values.solderingTemp !== null) allNums.push({ name: 'Soldering Temp', value: values.solderingTemp, page: 1 });
  if (values.cellEfficiency !== null) allNums.push({ name: 'Cell Efficiency', value: values.cellEfficiency, page: 1 });
  for (var ci = 0; ci < values.cellToGapValues.length; ci++) {
    allNums.push({ name: 'Cell Gap #' + (ci + 1), value: values.cellToGapValues[ci], page: 1 });
  }
  if (values.cellEdgeToGlassTop !== null) allNums.push({ name: 'Edge-Top', value: values.cellEdgeToGlassTop, page: 2 });
  if (values.cellEdgeToGlassBottom !== null) allNums.push({ name: 'Edge-Bottom', value: values.cellEdgeToGlassBottom, page: 2 });
  if (values.cellEdgeToGlassSides !== null) allNums.push({ name: 'Edge-Sides', value: values.cellEdgeToGlassSides, page: 2 });
  if (values.stringToStringGap !== null) allNums.push({ name: 'String-String Gap', value: values.stringToStringGap, page: 2 });
  if (values.terminalBusbarToCell !== null) allNums.push({ name: 'Busbar-Cell Dist', value: values.terminalBusbarToCell, page: 2 });
  for (var cr = 0; cr < values.creepageDistances.length; cr++) {
    allNums.push({ name: 'Creepage #' + (cr + 1), value: values.creepageDistances[cr], page: 2 });
  }
  for (var hi = 0; hi < values.holeDimensions.length; hi++) {
    allNums.push({ name: 'Hole #' + (hi + 1), value: values.holeDimensions[hi], page: 3 });
  }
  if (values.solderingIronTemp !== null) allNums.push({ name: 'Solder Iron Temp 1', value: values.solderingIronTemp, page: 3 });
  if (values.solderingIronTemp2 !== null) allNums.push({ name: 'Solder Iron Temp 2', value: values.solderingIronTemp2, page: 3 });
  if (values.anodizingThickness !== null) allNums.push({ name: 'Anodizing Thickness', value: values.anodizingThickness, page: 4 });
  if (values.glueWeight !== null) allNums.push({ name: 'Glue Weight', value: values.glueWeight, page: 5 });
  if (values.pottingWeight !== null) allNums.push({ name: 'Potting Weight', value: values.pottingWeight, page: 5 });
  if (values.weldingCurrent !== null) allNums.push({ name: 'Welding Current', value: values.weldingCurrent, page: 5 });
  if (values.curingTemp !== null) allNums.push({ name: 'Curing Temp', value: values.curingTemp, page: 5 });
  if (values.curingHumidity !== null) allNums.push({ name: 'Curing Humidity', value: values.curingHumidity, page: 5 });
  if (values.ambientTemp !== null) allNums.push({ name: 'Ambient Temp', value: values.ambientTemp, page: 6 });
  if (values.moduleTemp !== null) allNums.push({ name: 'Module Temp', value: values.moduleTemp, page: 6 });
  for (var di = 0; di < values.dcwValues.length; di++) {
    allNums.push({ name: 'DCW #' + (di + 1), value: values.dcwValues[di], page: 6 });
  }
  for (var iri = 0; iri < values.irValues.length; iri++) {
    allNums.push({ name: 'IR #' + (iri + 1), value: values.irValues[iri], page: 6 });
  }
  if (values.diagonalDiff !== null) allNums.push({ name: 'Diagonal Diff', value: values.diagonalDiff, page: 7 });

  values.allNumericValues = allNums;

  return values;
}


// ================================================================
// PAST DATA COMPARISON — Compare current checksheet with all past data
// ================================================================
function compareToPastData(currentValues, pastDatasets) {
  var comparisons = [];

  for (var p = 0; p < pastDatasets.length; p++) {
    var past = pastDatasets[p];
    var pastValues = past.values;
    var comparison = {
      pastDate: past.date || pastValues.date || 'Unknown',
      pastLine: past.line || pastValues.line || 'Unknown',
      pastShift: past.shift || pastValues.shift || 'Unknown',
      pastFile: past.filename || '',
      daysAgo: past.daysAgo || 0,
      exactMatches: [],
      nearMatches: [],
      totalCurrentValues: currentValues.allNumericValues.length,
      totalPastValues: pastValues.allNumericValues.length,
      exactMatchCount: 0,
      nearMatchCount: 0,
      matchPercentage: 0,
      serialOverlap: 0,
      verdict: 'OK',
    };

    // Compare each current value with past values
    for (var c = 0; c < currentValues.allNumericValues.length; c++) {
      var curItem = currentValues.allNumericValues[c];

      for (var pv = 0; pv < pastValues.allNumericValues.length; pv++) {
        var pastItem = pastValues.allNumericValues[pv];

        // Only compare same-name parameters
        if (curItem.name !== pastItem.name) continue;

        var diff = Math.abs(curItem.value - pastItem.value);
        var pctDiff = pastItem.value !== 0 ? (diff / Math.abs(pastItem.value)) * 100 : 0;

        if (diff === 0) {
          // EXACT MATCH
          comparison.exactMatches.push({
            parameter: curItem.name,
            page: curItem.page,
            currentValue: curItem.value,
            pastValue: pastItem.value,
            matchType: 'EXACT',
          });
          comparison.exactMatchCount++;
        } else if (pctDiff < 0.5) {
          // NEAR MATCH (within 0.5%)
          comparison.nearMatches.push({
            parameter: curItem.name,
            page: curItem.page,
            currentValue: curItem.value,
            pastValue: pastItem.value,
            deviation: diff,
            deviationPct: parseFloat(pctDiff.toFixed(3)),
            matchType: 'NEAR',
          });
          comparison.nearMatchCount++;
        }
      }
    }

    // Check serial number overlap
    if (currentValues.allSerials.length > 0 && pastValues.allSerials.length > 0) {
      var curSerials = new Set(currentValues.allSerials.map(function(s) { return s.replace(/[^A-Z0-9]/gi, ''); }));
      var pastSerials = pastValues.allSerials.map(function(s) { return s.replace(/[^A-Z0-9]/gi, ''); });
      for (var si = 0; si < pastSerials.length; si++) {
        if (curSerials.has(pastSerials[si])) {
          comparison.serialOverlap++;
        }
      }
    }

    // Calculate match percentage
    var comparableValues = Math.min(comparison.totalCurrentValues, comparison.totalPastValues);
    if (comparableValues > 0) {
      comparison.matchPercentage = parseFloat(((comparison.exactMatchCount / comparableValues) * 100).toFixed(1));
    }

    // Verdict based on match count
    if (comparison.exactMatchCount >= 8 || comparison.matchPercentage >= 30) {
      comparison.verdict = 'COPIED';
    } else if (comparison.exactMatchCount >= 5 || comparison.matchPercentage >= 20) {
      comparison.verdict = 'SUSPICIOUS';
    } else if (comparison.exactMatchCount >= 3 || comparison.matchPercentage >= 10) {
      comparison.verdict = 'NEEDS_REVIEW';
    } else {
      comparison.verdict = 'OK';
    }

    // Serial overlap raises suspicion (same serials shouldn't appear on different dates)
    if (comparison.serialOverlap >= 3) {
      if (comparison.verdict === 'OK') comparison.verdict = 'SUSPICIOUS';
      if (comparison.verdict === 'NEEDS_REVIEW') comparison.verdict = 'COPIED';
    }

    comparisons.push(comparison);
  }

  // Sort by most suspicious first
  comparisons.sort(function(a, b) {
    var order = { COPIED: 0, SUSPICIOUS: 1, NEEDS_REVIEW: 2, OK: 3 };
    if (order[a.verdict] !== order[b.verdict]) return order[a.verdict] - order[b.verdict];
    return b.exactMatchCount - a.exactMatchCount;
  });

  return comparisons;
}


// ================================================================
// STATISTICAL FRAUD ANALYSIS — Detect patterns in current data
// ================================================================
function analyzeStatisticalFraud(values) {
  var flags = [];
  var score = 0; // 0 = genuine, 100 = fake

  // 1. Cell-to-Cell Gap Analysis (should vary naturally 0.7-0.9 mm)
  if (values.cellToGapValues.length >= 4) {
    var gaps = values.cellToGapValues;
    var gapMean = gaps.reduce(function(a, b) { return a + b; }, 0) / gaps.length;
    var gapVariance = gaps.reduce(function(a, b) { return a + Math.pow(b - gapMean, 2); }, 0) / gaps.length;
    var gapStdDev = Math.sqrt(gapVariance);
    var gapCV = gapMean > 0 ? (gapStdDev / gapMean) * 100 : 0;

    // All identical
    var allSame = gaps.every(function(v) { return v === gaps[0]; });
    if (allSame) {
      flags.push({
        severity: 'CRITICAL',
        parameter: 'Cell-to-Cell Gap',
        message: 'All ' + gaps.length + ' cell gap values identical (' + gaps[0] + ' mm) — IMPOSSIBLE in real measurement! Inspector ne measure nahi kiya!',
        values: gaps,
      });
      score += 30;
    } else if (gapCV < 2) {
      flags.push({
        severity: 'HIGH',
        parameter: 'Cell-to-Cell Gap',
        message: 'Cell gap values have suspiciously LOW variance (CV = ' + gapCV.toFixed(2) + '%). Real measurements show more variation.',
        values: gaps,
      });
      score += 15;
    }

    // Check digit preference (e.g., all ending in 0 or 5)
    var lastDigits = gaps.map(function(v) { return Math.round(v * 100) % 10; });
    var digitCounts = {};
    for (var ld = 0; ld < lastDigits.length; ld++) {
      digitCounts[lastDigits[ld]] = (digitCounts[lastDigits[ld]] || 0) + 1;
    }
    var maxDigitCount = Math.max.apply(null, Object.values(digitCounts));
    if (maxDigitCount >= gaps.length * 0.7 && gaps.length >= 4) {
      var preferredDigit = Object.keys(digitCounts).find(function(k) { return digitCounts[k] === maxDigitCount; });
      flags.push({
        severity: 'MEDIUM',
        parameter: 'Cell-to-Cell Gap',
        message: 'Digit preference detected: ' + maxDigitCount + '/' + gaps.length + ' values end in ' + preferredDigit + '. Possible made-up data.',
        values: gaps,
      });
      score += 8;
    }

    // Arithmetic sequence (equally spaced - too perfect)
    if (gaps.length >= 4) {
      var diffs = [];
      for (var gd = 1; gd < gaps.length; gd++) {
        diffs.push(parseFloat((gaps[gd] - gaps[gd - 1]).toFixed(4)));
      }
      var allSameDiff = diffs.every(function(d) { return d === diffs[0]; });
      if (allSameDiff && diffs[0] !== 0) {
        flags.push({
          severity: 'HIGH',
          parameter: 'Cell-to-Cell Gap',
          message: 'Values form arithmetic sequence (step ' + diffs[0] + ') — inspector likely made up numbers!',
          values: gaps,
        });
        score += 15;
      }
    }
  }

  // 2. Creepage Distances (should vary slightly between positions)
  if (values.creepageDistances.length >= 3) {
    var creeps = values.creepageDistances;
    var cAllSame = creeps.every(function(v) { return v === creeps[0]; });
    if (cAllSame) {
      flags.push({
        severity: 'HIGH',
        parameter: 'Creepage Distance',
        message: 'All creepage distances identical (' + creeps[0] + ' mm) — should vary between left/right/top/bottom.',
        values: creeps,
      });
      score += 12;
    }
  }

  // 3. Hole Dimensions (3 holes — should vary slightly but not be identical)
  if (values.holeDimensions.length >= 2) {
    var holes = values.holeDimensions;
    var hAllSame = holes.every(function(v) { return v === holes[0]; });
    if (hAllSame) {
      flags.push({
        severity: 'MEDIUM',
        parameter: 'Hole Dimensions',
        message: 'All hole dimensions identical (' + holes[0] + ' mm) — real measurements differ.',
        values: holes,
      });
      score += 8;
    }
  }

  // 4. Temperature Check — Too round numbers
  var temps = [];
  if (values.shopFloorTemp !== null) temps.push({ name: 'Shop Floor Temp', value: values.shopFloorTemp });
  if (values.curingTemp !== null) temps.push({ name: 'Curing Temp', value: values.curingTemp });
  if (values.ambientTemp !== null) temps.push({ name: 'Ambient Temp', value: values.ambientTemp });
  if (values.moduleTemp !== null) temps.push({ name: 'Module Temp', value: values.moduleTemp });

  var roundTempCount = 0;
  for (var ti = 0; ti < temps.length; ti++) {
    if (temps[ti].value === Math.round(temps[ti].value)) {
      roundTempCount++;
    }
  }
  if (roundTempCount >= 3 && temps.length >= 3) {
    flags.push({
      severity: 'MEDIUM',
      parameter: 'Temperatures',
      message: roundTempCount + '/' + temps.length + ' temperatures are round numbers — digital thermometers give decimal values.',
      values: temps.map(function(t) { return t.name + '=' + t.value; }),
    });
    score += 8;
  }

  // 5. Quick Cross-checks
  // Environment: Temp < 20 or > 35, Humidity > 80
  if (values.shopFloorTemp !== null) {
    if (values.shopFloorTemp < 15 || values.shopFloorTemp > 40) {
      flags.push({
        severity: 'MEDIUM',
        parameter: 'Shop Floor Temp',
        message: 'Temperature ' + values.shopFloorTemp + '°C is outside normal range (15-40°C) — suspicious.',
        values: [values.shopFloorTemp],
      });
      score += 5;
    }
  }

  // 6. Soldering iron temps should be different between stations
  if (values.solderingIronTemp !== null && values.solderingIronTemp2 !== null) {
    if (values.solderingIronTemp === values.solderingIronTemp2) {
      flags.push({
        severity: 'LOW',
        parameter: 'Soldering Iron Temp',
        message: 'Both soldering stations show same temp (' + values.solderingIronTemp + '°C) — possible but uncommon.',
        values: [values.solderingIronTemp, values.solderingIronTemp2],
      });
      score += 3;
    }
  }

  // 7. DCW Values (should vary between modules)
  if (values.dcwValues.length >= 3) {
    var dcws = values.dcwValues;
    var dcwAllSame = dcws.every(function(v) { return v === dcws[0]; });
    if (dcwAllSame) {
      flags.push({
        severity: 'HIGH',
        parameter: 'DCW Leakage Current',
        message: 'All DCW values identical (' + dcws[0] + ' mA) — different modules should give different readings.',
        values: dcws,
      });
      score += 12;
    }
  }

  // 8. Too few values overall
  if (values.allNumericValues.length < 10) {
    flags.push({
      severity: 'MEDIUM',
      parameter: 'Overall Data',
      message: 'Only ' + values.allNumericValues.length + ' measurable values found — checksheet appears incomplete or poorly filled.',
      values: [],
    });
    score += 10;
  }

  // Determine verdict
  var verdict = 'GENUINE';
  if (score >= 40) verdict = 'LIKELY_DUMMY';
  else if (score >= 20) verdict = 'SUSPICIOUS';
  else if (score >= 10) verdict = 'NEEDS_REVIEW';

  var criticalFlags = flags.filter(function(f) { return f.severity === 'CRITICAL'; }).length;
  var highFlags = flags.filter(function(f) { return f.severity === 'HIGH'; }).length;

  return {
    score: score,
    verdict: verdict,
    flags: flags,
    totalFlags: flags.length,
    criticalFlags: criticalFlags,
    highFlags: highFlags,
    summary: verdict === 'GENUINE'
      ? 'Data appears genuinely measured. ' + flags.length + ' minor observations.'
      : verdict === 'NEEDS_REVIEW'
      ? 'Some unusual patterns detected. ' + flags.length + ' flag(s) — recommend manual review.'
      : verdict === 'SUSPICIOUS'
      ? 'SUSPICIOUS patterns found! ' + highFlags + ' high-severity flag(s). Data may not be genuine.'
      : 'LIKELY DUMMY DATA! ' + criticalFlags + ' critical + ' + highFlags + ' high flag(s). Inspector probably did not measure!',
  };
}


// ================================================================
// MAIN FUNCTION — Full IPQC Fraud Analysis
// ================================================================
function analyzeIPQCFraud(currentPagesData, uploadsDir, excludeFilename) {
  // 1. Extract current values
  var currentValues = extractIPQCValues(currentPagesData);

  // 2. Load all past IPQC data files
  var pastDatasets = [];
  try {
    var files = fs.readdirSync(uploadsDir);
    var ipqcFiles = files.filter(function(f) { return f.startsWith('IPQC_') && f.endsWith('_data.json'); });

    for (var i = 0; i < ipqcFiles.length; i++) {
      // Skip the current file itself
      if (excludeFilename && ipqcFiles[i] === excludeFilename) continue;
      try {
        var filePath = path.join(uploadsDir, ipqcFiles[i]);
        var raw = fs.readFileSync(filePath, 'utf8');
        var data = JSON.parse(raw);
        var pastValues = extractIPQCValues(data.pages || []);

        // Parse date from filename (IPQC_2026-02-27_Line_A_Night_...)
        var parts = ipqcFiles[i].split('_');
        var pastDate = parts[1] || '';
        var pastLine = parts[3] || '';
        var pastShift = parts[4] || '';

        // Calculate days ago
        var daysAgo = 0;
        if (pastDate && currentValues.date) {
          try {
            var curDateParts = currentValues.date.split(/[-\/]/);
            var pastDateParts = pastDate.split('-');
            if (curDateParts.length === 3 && pastDateParts.length === 3) {
              var curD = new Date(curDateParts[2], curDateParts[1] - 1, curDateParts[0]);
              var pastD = new Date(pastDateParts[0], pastDateParts[1] - 1, pastDateParts[2]);
              daysAgo = Math.round((curD - pastD) / (1000 * 60 * 60 * 24));
            }
          } catch (e) {}
        }

        pastDatasets.push({
          filename: ipqcFiles[i],
          date: pastDate,
          line: pastLine,
          shift: pastShift,
          daysAgo: daysAgo,
          values: pastValues,
        });
      } catch (e) {
        // Skip corrupt files
      }
    }
  } catch (e) {
    console.error('[IPQC Fraud] Error reading past data:', e.message);
  }

  // 3. Compare current vs all past data
  var pastComparisons = compareToPastData(currentValues, pastDatasets);

  // 4. Statistical analysis of current data
  var statistical = analyzeStatisticalFraud(currentValues);

  // 5. Find worst match
  var worstMatch = pastComparisons.length > 0 ? pastComparisons[0] : null;
  var copyDetected = worstMatch && (worstMatch.verdict === 'COPIED' || worstMatch.verdict === 'SUSPICIOUS');

  // 6. Overall verdict
  var overallScore = statistical.score;
  if (worstMatch) {
    if (worstMatch.verdict === 'COPIED') overallScore += 40;
    else if (worstMatch.verdict === 'SUSPICIOUS') overallScore += 25;
    else if (worstMatch.verdict === 'NEEDS_REVIEW') overallScore += 10;
  }

  var overallVerdict = 'GENUINE';
  if (overallScore >= 50) overallVerdict = 'LIKELY_DUMMY';
  else if (overallScore >= 30) overallVerdict = 'SUSPICIOUS';
  else if (overallScore >= 15) overallVerdict = 'NEEDS_REVIEW';

  var overallSummary = '';
  if (overallVerdict === 'GENUINE') {
    overallSummary = 'IPQC checksheet appears GENUINELY filled. Data patterns are consistent with real measurements.';
  } else if (overallVerdict === 'NEEDS_REVIEW') {
    overallSummary = 'Some unusual patterns detected. Recommend supervisor review.';
  } else if (overallVerdict === 'SUSPICIOUS') {
    overallSummary = 'SUSPICIOUS! ';
    if (copyDetected) {
      overallSummary += worstMatch.exactMatchCount + ' values EXACTLY match checksheet from ' + worstMatch.pastDate + ' (' + worstMatch.daysAgo + ' days ago). ';
    }
    overallSummary += statistical.summary;
  } else {
    overallSummary = 'LIKELY DUMMY DATA! ';
    if (copyDetected) {
      overallSummary += worstMatch.exactMatchCount + ' out of ' + worstMatch.totalCurrentValues + ' values match older checksheet (' + worstMatch.pastDate + ', ' + worstMatch.daysAgo + ' days ago). ';
      overallSummary += 'Match percentage: ' + worstMatch.matchPercentage + '%. ';
    }
    overallSummary += statistical.summary;
  }

  return {
    overallVerdict: overallVerdict,
    overallScore: Math.min(overallScore, 100),
    overallSummary: overallSummary,
    genuineScore: Math.max(0, 100 - overallScore),
    currentValues: {
      date: currentValues.date,
      line: currentValues.line,
      shift: currentValues.shift,
      time: currentValues.time,
      totalMeasurableValues: currentValues.allNumericValues.length,
      totalSerials: currentValues.allSerials.length,
      valuesList: currentValues.allNumericValues,
    },
    pastDataComparisons: pastComparisons,
    pastDatasetsCount: pastDatasets.length,
    worstMatch: worstMatch ? {
      pastDate: worstMatch.pastDate,
      pastLine: worstMatch.pastLine,
      pastShift: worstMatch.pastShift,
      daysAgo: worstMatch.daysAgo,
      exactMatchCount: worstMatch.exactMatchCount,
      nearMatchCount: worstMatch.nearMatchCount,
      matchPercentage: worstMatch.matchPercentage,
      verdict: worstMatch.verdict,
      exactMatches: worstMatch.exactMatches,
      serialOverlap: worstMatch.serialOverlap,
    } : null,
    statisticalAnalysis: statistical,
    copyDetected: copyDetected,
    timestamp: new Date().toISOString(),
  };
}


module.exports = {
  extractIPQCValues,
  compareToPastData,
  analyzeStatisticalFraud,
  analyzeIPQCFraud,
};
