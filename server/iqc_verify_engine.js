/**
 * IQC Verification Engine v2.0 — Advanced
 * 
 * FEATURES:
 *   1. Full COC data extraction (all specs, tolerances, test results)
 *   2. Dynamic range validation from COC (not hardcoded)
 *   3. Deep IQC <-> COC cross-verification
 *   4. FRAUD / DUMMY REPORT DETECTION
 *      - Statistical analysis of measurement patterns
 *      - Detects if inspector actually tested or just filled dummy data
 *      - Digit preference analysis, variance checks, COC copy detection
 *   5. AQL sampling plan verification
 *   6. Comprehensive PASS / FAIL / SUSPICIOUS verdict
 */

// ========== BUS BAR SPECIFICATIONS (GSPL TS — Fallback if COC not provided) ==========
const BUS_BAR_SPECS = {
  width: {
    name: 'Width',
    nominal: 6.0,
    min: 5.90,
    max: 6.10,
    unit: 'mm',
    tolerance: '±0.10',
    sampling: 'SIL S3 AQL 4.0',
  },
  thickness: {
    name: 'Thickness',
    nominal: 0.40,
    min: 0.39,
    max: 0.41,
    unit: 'mm',
    tolerance: '-0.01/+0.01',
    sampling: 'SIL S3 AQL 4.0',
  },
  coatingThickness: {
    name: 'Coating Thickness',
    nominal: 25,
    min: 20,
    max: 30,
    unit: 'um/side',
    tolerance: '+-5',
    acceptanceCriteria: '25+-5 um/side',
    sampling: 'As per Material Data sheet',
  },
  solderabilityBusBar: {
    name: 'Solderability - Bus Bar',
    min: 24,
    unit: 'N',
    acceptanceCriteria: 'B/w Bus Bar >=24N',
    sampling: 'One Sample/lot',
  },
  solderabilityRibbon: {
    name: 'Solderability - Ribbon & Interconnector',
    min: 4,
    unit: 'N',
    acceptanceCriteria: 'B/w Ribbon & Interconnector >=4N',
    sampling: 'One Sample/lot',
  },
  weight: {
    name: 'Weight (per coil)',
    unit: 'kg',
    sampling: 'SIL S3 AQL 4.0',
  },
  tensileStrength: {
    name: 'Tensile Strength',
    min: 100,
    unit: 'MPa',
    sampling: 'As Per COC',
  },
  yieldStrength: {
    name: 'Yield Strength',
    min: 60,
    unit: 'MPa',
    sampling: 'As Per COC',
  },
  resistivity: {
    name: 'Resistivity',
    max: 0.01900,
    unit: 'ohm.mm2/m',
    sampling: 'As Per COC',
  },
  copperPurity: {
    name: 'Copper Purity (Cu)',
    min: 99.90,
    unit: '%',
  },
  tinContent: {
    name: 'Tin Content (Sn)',
    min: 99.90,
    unit: '%',
  },
  elongation: {
    name: 'Elongation',
    min: 20,
    unit: '%',
  },
};

// ========== AQL SAMPLE SIZE TABLE (ISO 2859-1 / IS 2500) ==========
function getAQLSampleSize(lotSize, level) {
  const levelIdx = { S1: 0, S2: 1, S3: 2, S4: 3 }[level] || 2;
  const ranges = [
    { min: 2, max: 8, sizes: [2, 2, 2, 2] },
    { min: 9, max: 15, sizes: [2, 2, 2, 3] },
    { min: 16, max: 25, sizes: [2, 2, 3, 5] },
    { min: 26, max: 50, sizes: [2, 3, 3, 5] },
    { min: 51, max: 90, sizes: [2, 3, 5, 5] },
    { min: 91, max: 150, sizes: [2, 3, 5, 8] },
    { min: 151, max: 280, sizes: [2, 3, 5, 8] },
    { min: 281, max: 500, sizes: [2, 3, 5, 8] },
    { min: 501, max: 1200, sizes: [2, 3, 8, 8] },
    { min: 1201, max: 3200, sizes: [2, 5, 8, 13] },
    { min: 3201, max: 10000, sizes: [3, 5, 8, 13] },
    { min: 10001, max: 35000, sizes: [3, 5, 8, 13] },
    { min: 35001, max: 150000, sizes: [3, 8, 13, 20] },
    { min: 150001, max: 500000, sizes: [5, 8, 13, 20] },
    { min: 500001, max: Infinity, sizes: [8, 13, 20, 32] },
  ];
  const match = ranges.find(r => lotSize >= r.min && lotSize <= r.max);
  return match ? (match.sizes[levelIdx] || 8) : 8;
}

// ================================================================
//  FRAUD / DUMMY REPORT DETECTION ENGINE
// ================================================================

/**
 * Analyze an array of measured values for signs of fabrication.
 * Returns a fraud analysis object with score, flags, and details.
 */
function analyzeMeasurementAuthenticity(values, paramName, spec, cocValues) {
  const analysis = {
    parameter: paramName,
    sampleCount: values.length,
    flags: [],
    score: 0,
    maxScore: 0,
    verdict: 'GENUINE',
    details: [],
  };

  if (!values || values.length < 2) {
    analysis.details.push('Insufficient samples for fraud analysis (need >= 2)');
    return analysis;
  }

  var totalWeight = 0;
  var maxPossibleWeight = 100;

  // ---- 1. IDENTICAL VALUES CHECK (weight: 25) ----
  var unique = new Set(values.map(function(v) { return v.toString(); }));
  var uniqueRatio = unique.size / values.length;

  if (unique.size === 1 && values.length >= 3) {
    analysis.flags.push({
      id: 'IDENTICAL_VALUES',
      severity: 'CRITICAL',
      weight: 25,
      message: 'All ' + values.length + ' samples have IDENTICAL value: ' + values[0] + '. Real measurements always have micro-variations.',
    });
    totalWeight += 25;
  } else if (uniqueRatio < 0.3 && values.length >= 5) {
    analysis.flags.push({
      id: 'LOW_VARIETY',
      severity: 'HIGH',
      weight: 18,
      message: 'Only ' + unique.size + ' unique values among ' + values.length + ' samples (' + (uniqueRatio * 100).toFixed(0) + '% variety). Expected higher variation.',
    });
    totalWeight += 18;
  } else if (uniqueRatio < 0.5 && values.length >= 5) {
    analysis.flags.push({
      id: 'LOW_VARIETY_MILD',
      severity: 'MEDIUM',
      weight: 8,
      message: 'Only ' + unique.size + ' unique values among ' + values.length + ' samples.',
    });
    totalWeight += 8;
  }

  // ---- 2. STANDARD DEVIATION / VARIANCE CHECK (weight: 20) ----
  var mean = values.reduce(function(a, b) { return a + b; }, 0) / values.length;
  var variance = values.reduce(function(sum, v) { return sum + Math.pow(v - mean, 2); }, 0) / values.length;
  var stdDev = Math.sqrt(variance);
  var cv = mean !== 0 ? (stdDev / Math.abs(mean)) * 100 : 0;

  analysis.stats = {
    mean: parseFloat(mean.toFixed(6)),
    stdDev: parseFloat(stdDev.toFixed(6)),
    cv: parseFloat(cv.toFixed(4)),
    min: Math.min.apply(null, values),
    max: Math.max.apply(null, values),
    range: parseFloat((Math.max.apply(null, values) - Math.min.apply(null, values)).toFixed(6)),
  };

  if (stdDev === 0 && values.length >= 3) {
    analysis.flags.push({
      id: 'ZERO_VARIANCE',
      severity: 'CRITICAL',
      weight: 20,
      message: 'Zero standard deviation - impossible in real physical measurements.',
    });
    totalWeight += 20;
  } else if (cv < 0.05 && values.length >= 5) {
    analysis.flags.push({
      id: 'EXTREMELY_LOW_VARIANCE',
      severity: 'HIGH',
      weight: 15,
      message: 'CV ' + cv.toFixed(4) + '% is unrealistically low. Real measurements typically show CV > 0.1%.',
    });
    totalWeight += 15;
  } else if (cv < 0.2 && values.length >= 8) {
    analysis.flags.push({
      id: 'VERY_LOW_VARIANCE',
      severity: 'MEDIUM',
      weight: 6,
      message: 'CV of ' + cv.toFixed(4) + '% is quite low for ' + values.length + ' physical measurements.',
    });
    totalWeight += 6;
  }

  // ---- 3. DIGIT PREFERENCE / TERMINAL DIGIT CHECK (weight: 15) ----
  var lastDigits = values.map(function(v) {
    var str = v.toString();
    return parseInt(str[str.length - 1], 10);
  });

  var digitCounts = {};
  lastDigits.forEach(function(d) { digitCounts[d] = (digitCounts[d] || 0) + 1; });

  var maxDigitFreq = Math.max.apply(null, Object.values(digitCounts));
  var dominantDigitRatio = maxDigitFreq / values.length;

  var zeroFiveCount = (digitCounts[0] || 0) + (digitCounts[5] || 0);
  var zeroFiveRatio = zeroFiveCount / values.length;

  if (dominantDigitRatio > 0.7 && values.length >= 5) {
    var entries = Object.entries(digitCounts).sort(function(a, b) { return b[1] - a[1]; });
    var dominantDigit = entries[0][0];
    analysis.flags.push({
      id: 'DIGIT_PREFERENCE',
      severity: 'HIGH',
      weight: 15,
      message: (dominantDigitRatio * 100).toFixed(0) + '% of values end in digit ' + dominantDigit + '. Real measurements show uniform digit distribution.',
    });
    totalWeight += 15;
  } else if (zeroFiveRatio > 0.7 && values.length >= 5) {
    analysis.flags.push({
      id: 'ROUND_NUMBER_BIAS',
      severity: 'HIGH',
      weight: 12,
      message: (zeroFiveRatio * 100).toFixed(0) + '% of values end in 0 or 5 - strong round number bias suggesting manual entry.',
    });
    totalWeight += 12;
  } else if (dominantDigitRatio > 0.5 && values.length >= 5) {
    analysis.flags.push({
      id: 'MILD_DIGIT_PREFERENCE',
      severity: 'LOW',
      weight: 5,
      message: 'Slight digit preference: ' + (dominantDigitRatio * 100).toFixed(0) + '% end in same digit.',
    });
    totalWeight += 5;
  }

  analysis.digitDistribution = digitCounts;

  // ---- 4. ARITHMETIC / SEQUENTIAL PATTERN CHECK (weight: 15) ----
  if (values.length >= 4) {
    var diffs = [];
    for (var i = 1; i < values.length; i++) {
      diffs.push(parseFloat((values[i] - values[i - 1]).toFixed(6)));
    }

    var uniqueDiffs = new Set(diffs.map(function(d) { return d.toFixed(4); }));

    if (uniqueDiffs.size === 1 && diffs[0] !== 0) {
      analysis.flags.push({
        id: 'ARITHMETIC_SEQUENCE',
        severity: 'CRITICAL',
        weight: 15,
        message: 'Values form a perfect arithmetic sequence (constant diff: ' + diffs[0] + '). This NEVER happens in real measurements.',
      });
      totalWeight += 15;
    }

    // Alternating pattern
    var alternating = true;
    for (var j = 2; j < values.length; j++) {
      if (values[j] !== values[j - 2]) { alternating = false; break; }
    }
    if (alternating && values.length >= 4 && values[0] !== values[1]) {
      analysis.flags.push({
        id: 'ALTERNATING_PATTERN',
        severity: 'HIGH',
        weight: 12,
        message: 'Values show alternating pattern (' + values[0] + ', ' + values[1] + ' repeat). Suspicious.',
      });
      totalWeight += 12;
    }

    // Monotonic
    var increasing = true, decreasing = true;
    for (var k = 1; k < values.length; k++) {
      if (values[k] <= values[k - 1]) increasing = false;
      if (values[k] >= values[k - 1]) decreasing = false;
    }
    if ((increasing || decreasing) && values.length >= 5) {
      analysis.flags.push({
        id: 'MONOTONIC_PATTERN',
        severity: 'MEDIUM',
        weight: 8,
        message: 'Values are perfectly ' + (increasing ? 'increasing' : 'decreasing') + ' - random measurements rarely do this.',
      });
      totalWeight += 8;
    }
  }

  // ---- 5. COC COPY DETECTION (weight: 20) ----
  if (cocValues && cocValues.length > 0 && values.length > 0) {
    var exactCopyCount = 0;
    var closeCopyCount = 0;

    for (var m = 0; m < values.length; m++) {
      for (var n = 0; n < cocValues.length; n++) {
        if (values[m] === cocValues[n]) {
          exactCopyCount++;
          break;
        } else if (Math.abs(values[m] - cocValues[n]) < 0.005) {
          closeCopyCount++;
          break;
        }
      }
    }

    var exactCopyRatio = exactCopyCount / values.length;
    var closeCopyRatio = (exactCopyCount + closeCopyCount) / values.length;

    if (exactCopyRatio > 0.6) {
      analysis.flags.push({
        id: 'COC_EXACT_COPY',
        severity: 'CRITICAL',
        weight: 20,
        message: exactCopyCount + ' of ' + values.length + ' IQC values (' + (exactCopyRatio * 100).toFixed(0) + '%) are EXACTLY SAME as COC. Inspector likely copied COC data instead of actual testing.',
      });
      totalWeight += 20;
    } else if (closeCopyRatio > 0.7) {
      analysis.flags.push({
        id: 'COC_CLOSE_COPY',
        severity: 'HIGH',
        weight: 14,
        message: (exactCopyCount + closeCopyCount) + ' of ' + values.length + ' values are nearly identical to COC (within 0.005). Suspicious similarity.',
      });
      totalWeight += 14;
    } else if (exactCopyRatio > 0.3) {
      analysis.flags.push({
        id: 'COC_PARTIAL_COPY',
        severity: 'MEDIUM',
        weight: 7,
        message: exactCopyCount + ' of ' + values.length + ' values match COC exactly. Some values may be copied.',
      });
      totalWeight += 7;
    }

    analysis.cocComparison = {
      exactMatches: exactCopyCount,
      closeMatches: closeCopyCount,
      totalIQC: values.length,
      totalCOC: cocValues.length,
      exactCopyRatio: parseFloat(exactCopyRatio.toFixed(3)),
      closeCopyRatio: parseFloat(closeCopyRatio.toFixed(3)),
    };
  }

  // ---- 6. VALUES TOO PERFECT / CENTER-BIASED (weight: 10) ----
  if (spec && spec.nominal !== undefined) {
    var nominalDiffs = values.map(function(v) { return Math.abs(v - spec.nominal); });
    var avgDeviation = nominalDiffs.reduce(function(a, b) { return a + b; }, 0) / nominalDiffs.length;
    var specRange = (spec.max || spec.nominal * 1.02) - (spec.min || spec.nominal * 0.98);
    var deviationRatio = avgDeviation / (specRange / 2);

    if (deviationRatio < 0.05 && values.length >= 5) {
      analysis.flags.push({
        id: 'TOO_PERFECT',
        severity: 'HIGH',
        weight: 10,
        message: 'All values extremely close to nominal ' + spec.nominal + (spec.unit || '') + '. Avg deviation only ' + avgDeviation.toFixed(4) + '. Real measurements show more spread.',
      });
      totalWeight += 10;
    }

    if (spec.min !== undefined && spec.max !== undefined && values.length >= 8) {
      var specMargin = specRange * 0.1;
      var allComfortable = values.every(function(v) { return v >= spec.min + specMargin && v <= spec.max - specMargin; });

      if (allComfortable) {
        analysis.flags.push({
          id: 'ALL_COMFORTABLE_SPEC',
          severity: 'LOW',
          weight: 4,
          message: 'All ' + values.length + ' values are well within spec (not even close to limits). Unusual for large sample sizes.',
        });
        totalWeight += 4;
      }
    }
  }

  // ---- CALCULATE FINAL SCORE ----
  analysis.maxScore = maxPossibleWeight;
  analysis.score = Math.min(100, Math.round((totalWeight / maxPossibleWeight) * 100));

  if (analysis.score >= 60) {
    analysis.verdict = 'LIKELY_FAKE';
  } else if (analysis.score >= 30) {
    analysis.verdict = 'SUSPICIOUS';
  } else {
    analysis.verdict = 'GENUINE';
  }

  analysis.details.push(
    'Authenticity Score: ' + (100 - analysis.score) + '/100 (' + analysis.verdict + '). ' +
    analysis.flags.length + ' flag(s) detected.'
  );

  return analysis;
}

/**
 * Overall fraud analysis combining all parameter analyses
 */
function generateFraudReport(parameterAnalyses) {
  var report = {
    overallScore: 0,
    overallVerdict: 'GENUINE',
    inspectorTested: true,
    confidence: 'HIGH',
    totalFlags: 0,
    criticalFlags: 0,
    highFlags: 0,
    mediumFlags: 0,
    lowFlags: 0,
    parameterResults: [],
    summary: '',
    recommendations: [],
  };

  if (!parameterAnalyses || parameterAnalyses.length === 0) {
    report.summary = 'No measurement data available for fraud analysis.';
    report.confidence = 'LOW';
    return report;
  }

  var totalScore = 0;
  var validAnalyses = 0;

  for (var i = 0; i < parameterAnalyses.length; i++) {
    var pa = parameterAnalyses[i];
    if (pa.sampleCount >= 2) {
      totalScore += pa.score;
      validAnalyses++;
    }

    for (var j = 0; j < pa.flags.length; j++) {
      var flag = pa.flags[j];
      report.totalFlags++;
      if (flag.severity === 'CRITICAL') report.criticalFlags++;
      else if (flag.severity === 'HIGH') report.highFlags++;
      else if (flag.severity === 'MEDIUM') report.mediumFlags++;
      else report.lowFlags++;
    }

    report.parameterResults.push({
      parameter: pa.parameter,
      score: pa.score,
      verdict: pa.verdict,
      flagCount: pa.flags.length,
      flags: pa.flags.map(function(f) {
        return { id: f.id, severity: f.severity, message: f.message };
      }),
      stats: pa.stats || null,
      cocComparison: pa.cocComparison || null,
    });
  }

  report.overallScore = validAnalyses > 0 ? Math.round(totalScore / validAnalyses) : 0;

  if (report.criticalFlags >= 2 || report.overallScore >= 60) {
    report.overallVerdict = 'LIKELY_FAKE';
    report.inspectorTested = false;
    report.summary = 'HIGH PROBABILITY OF DUMMY REPORT - ' + report.criticalFlags + ' critical issues found. Authenticity score: ' + (100 - report.overallScore) + '/100.';
  } else if (report.criticalFlags >= 1 || report.highFlags >= 2 || report.overallScore >= 30) {
    report.overallVerdict = 'SUSPICIOUS';
    report.inspectorTested = false;
    report.summary = 'SUSPICIOUS DATA PATTERNS - ' + report.totalFlags + ' fraud indicators detected. Authenticity score: ' + (100 - report.overallScore) + '/100.';
  } else if (report.highFlags >= 1 || report.overallScore >= 15) {
    report.overallVerdict = 'SUSPICIOUS';
    report.inspectorTested = true;
    report.summary = 'MINOR CONCERNS - Some patterns are slightly unusual. Authenticity score: ' + (100 - report.overallScore) + '/100.';
  } else {
    report.overallVerdict = 'GENUINE';
    report.inspectorTested = true;
    report.summary = 'DATA APPEARS GENUINE - Measurement patterns consistent with actual physical testing. Authenticity score: ' + (100 - report.overallScore) + '/100.';
  }

  if (validAnalyses >= 4) report.confidence = 'HIGH';
  else if (validAnalyses >= 2) report.confidence = 'MEDIUM';
  else report.confidence = 'LOW';

  if (report.overallVerdict === 'LIKELY_FAKE') {
    report.recommendations = [
      'Re-inspect this lot with a different inspector',
      'Request physical re-testing with witnessed measurements',
      'Review inspector previous reports for similar patterns',
      'Cross-verify with random physical sample check',
      'Consider disciplinary action if confirmed',
    ];
  } else if (report.overallVerdict === 'SUSPICIOUS') {
    report.recommendations = [
      'Have supervisor re-verify 2-3 random measurements',
      'Check if measurement instruments were calibrated recently',
      'Compare with this inspector other reports for pattern consistency',
      'Request re-testing of borderline parameters',
    ];
  } else {
    report.recommendations = [
      'Data patterns are normal - no action needed',
      'Continue routine monitoring',
    ];
  }

  return report;
}


// ================================================================
//  IQC REPORT PARSER (Enhanced)
// ================================================================
function parseIQCBusBarReport(ocrText) {
  var report = {
    documentNo: '',
    issueDate: '',
    revNo: '',
    materialName: '',
    supplierName: '',
    quantity: '',
    quantityNum: 0,
    quantityUnit: '',
    invoiceNo: '',
    receiptDate: '',
    rmDetails: '',
    lotNo: '',
    sampleCount: 0,
    aqlInfo: '',
    checkedBy: '',
    approvedBy: '',
    inspectionDate: '',

    width: [],
    thickness: [],
    coatingThickness: [],
    solderabilityBusBar: null,
    solderabilityRibbon: null,
    weight: [],
    tensileStrength: null,
    yieldStrength: null,
    resistivity: null,

    packagingResult: '',
    expiryInfo: '',
    mfgDate: '',

    rmSpecification: '',
    rmSpecWidth: null,
    rmSpecThickness: null,

    rawText: ocrText,
  };

  var text = ocrText || '';

  // ---- HEADER INFO ----
  var docNoMatch = text.match(/GSPL\/PVR\(?IQC\)?\/\d+/i);
  if (docNoMatch) report.documentNo = docNoMatch[0];

  var revMatch = text.match(/Rev\.?\s*(?:No\.?)?\s*[:.]?\s*(\d+)/i);
  if (revMatch) report.revNo = revMatch[1];

  var issueDateMatch = text.match(/Issue\s*Date[.:]*\s*(\d{2}[-\/]\d{2}[-\/]\d{4})/i);
  if (issueDateMatch) report.issueDate = issueDateMatch[1];

  var matNameMatch = text.match(/Material\s*Name[.:]*\s*([A-Za-z\s]+?)(?:\n|Quantity|$)/i);
  if (matNameMatch) report.materialName = matNameMatch[1].trim();

  var supplierMatch = text.match(/Supplier\s*(?:Name)?[.:]*\s*(.+?)(?:\n|Invoice)/i);
  if (supplierMatch) report.supplierName = supplierMatch[1].trim();

  var qtyMatch = text.match(/Quantity\s*(?:Recd|Received)?\.?[.:]*\s*([\d,]+)\s*(kg|pcs|nos|units|Kg|KG)?/i);
  if (qtyMatch) {
    report.quantityNum = parseInt(qtyMatch[1].replace(/,/g, ''), 10) || 0;
    report.quantityUnit = (qtyMatch[2] || 'kg').toLowerCase();
    report.quantity = report.quantityNum + ' ' + report.quantityUnit;
  }

  // Invoice No: require colon/dot separator, OR value must contain digits
  // Avoids false match from "PO/Invoice\nNo Physical Damage..." text
  var invoiceMatch = text.match(/Invoice\s*No\.?\s*[.:]+\s*([A-Za-z0-9\/\-]+)/i)
    || text.match(/Invoice\s*No\.?\s+([A-Z]*\d{3,}[A-Za-z0-9\/\-]*)/i);
  if (invoiceMatch) report.invoiceNo = invoiceMatch[1].trim();

  var receiptMatch = text.match(/Receipt\s*Date[.:]*\s*(\d{2}\/\d{2}\/\d{4})/i);
  if (receiptMatch) report.receiptDate = receiptMatch[1];

  var rmMatch = text.match(/RM\s*Detail'?s?[.:]*\s*\(?([0-9.]+\s*[xX*]\s*[0-9.]+)\s*\)?\s*(mm)?/i);
  if (rmMatch) {
    report.rmDetails = rmMatch[1].replace(/\s/g, '') + ' mm';
    report.rmSpecification = rmMatch[1].replace(/\s/g, '');
    var dimParts = report.rmSpecification.split(/[xX*]/);
    if (dimParts.length === 2) {
      var d1 = parseFloat(dimParts[0]);
      var d2 = parseFloat(dimParts[1]);
      report.rmSpecThickness = Math.min(d1, d2);
      report.rmSpecWidth = Math.max(d1, d2);
    }
  }

  var sampleMatch = text.match(/(\d+)\s*[Ss]ample/);
  if (sampleMatch) report.sampleCount = parseInt(sampleMatch[1], 10);

  var aqlMatch = text.match(/((?:SIL|S)\s*S\d\s*AQL\s*[\d.]+)/gi);
  if (aqlMatch) report.aqlInfo = aqlMatch.join(' / ');

  var checkedByMatch = text.match(/Checked\s*By[.:]*\s*([A-Za-z\/\s]+?)(?:\n|Approved|$)/i);
  if (checkedByMatch) report.checkedBy = checkedByMatch[1].trim();

  var approvedByMatch = text.match(/Approved\s*By[.:]*\s*([A-Za-z\/\s]+?)(?:\n|$)/i);
  if (approvedByMatch) report.approvedBy = approvedByMatch[1].trim();

  var inspDateMatch = text.match(/(?:Inspection|Insp\.?)\s*Date[.:]*\s*(\d{2}[-\/]\d{2}[-\/]\d{4})/i);
  if (inspDateMatch) report.inspectionDate = inspDateMatch[1];

  // ---- WIDTH VALUES ----
  var widthCandidates = [];
  var widthRegex = /\b([56]\.\d{2})\b/g;
  var wm;
  while ((wm = widthRegex.exec(text)) !== null) {
    var wval = parseFloat(wm[1]);
    if (wval >= 5.80 && wval <= 6.20) {
      var wctx = text.substring(Math.max(0, wm.index - 20), wm.index + 20);
      if (!/\d{4}/.test(wctx.replace(wm[0], '')) || /[Ww]idth|Physical|GSPL|[Mm]m/.test(wctx)) {
        widthCandidates.push(wval);
      }
    }
  }
  report.width = widthCandidates;

  // ---- THICKNESS VALUES ----
  var thicknessCandidates = [];
  var thicknessRegex = /\b(0\.[34]\d{1,2})\b/g;
  var tm;
  while ((tm = thicknessRegex.exec(text)) !== null) {
    var tval = parseFloat(tm[1]);
    if (tval >= 0.35 && tval <= 0.45) {
      thicknessCandidates.push(tval);
    }
  }
  report.thickness = thicknessCandidates;

  // ---- COATING THICKNESS VALUES ----
  var coatingCandidates = [];
  var coatingRegex = /\b(\d{2}\.\d)\b/g;
  var cm;
  while ((cm = coatingRegex.exec(text)) !== null) {
    var cval = parseFloat(cm[1]);
    if (cval >= 15 && cval <= 35) {
      var cctx = text.substring(Math.max(0, cm.index - 80), Math.min(text.length, cm.index + 80));
      if (/[Cc]oating|[u]m|side|25[+\-]5|Thickness\s*Tester/i.test(cctx)) {
        coatingCandidates.push(cval);
      }
    }
  }
  if (coatingCandidates.length === 0) {
    var coatingSection = text.match(/[Cc]oating[\s\S]{0,300}/);
    if (coatingSection) {
      var sectionRegex = /\b(\d{2}\.\d)\b/g;
      var sm;
      while ((sm = sectionRegex.exec(coatingSection[0])) !== null) {
        var sval = parseFloat(sm[1]);
        if (sval >= 15 && sval <= 35) coatingCandidates.push(sval);
      }
    }
  }
  report.coatingThickness = coatingCandidates;

  // ---- SOLDERABILITY ----
  var solderBBMatch = text.match(/Bus\s*Bar[^0-9]*?(\d+\.?\d*)\s*N/i)
    || text.match(/[>]\s*24\s*N[^0-9]*?(\d+\.?\d*)\s*N/i)
    || text.match(/49\.\d/);
  if (solderBBMatch) {
    report.solderabilityBusBar = parseFloat(solderBBMatch[1] || solderBBMatch[0]);
  }

  var solderRibbonMatch = text.match(/(?:Ribbon|Interconnector)[^0-9]*?(\d+\.?\d*)\s*N/i)
    || text.match(/[>]\s*4\s*N[^0-9]*?(\d+\.?\d*)\s*N/i);
  if (solderRibbonMatch) {
    report.solderabilityRibbon = parseFloat(solderRibbonMatch[1]);
  }
  if (report.solderabilityBusBar === null || report.solderabilityRibbon === null) {
    var solderSection = text.match(/[Ss]older[\s\S]{0,400}/);
    if (solderSection) {
      var nValues = [];
      var nRegex = /(\d+\.?\d*)\s*N\b/g;
      var nm;
      while ((nm = nRegex.exec(solderSection[0])) !== null) {
        nValues.push(parseFloat(nm[1]));
      }
      if (nValues.length >= 1 && report.solderabilityBusBar === null) {
        report.solderabilityBusBar = Math.max.apply(null, nValues);
      }
      if (nValues.length >= 2 && report.solderabilityRibbon === null) {
        report.solderabilityRibbon = Math.min.apply(null, nValues);
      }
    }
  }

  // ---- WEIGHT VALUES ----
  var weightCandidates = [];
  var weightRegex2 = /\b(\d{1,2}\.\d{3})\b/g;
  var wmatch;
  while ((wmatch = weightRegex2.exec(text)) !== null) {
    var wval2 = parseFloat(wmatch[1]);
    if (wval2 >= 8.0 && wval2 <= 12.0) {
      var wctx2 = text.substring(Math.max(0, wmatch.index - 50), Math.min(text.length, wmatch.index + 50));
      if (/[Ww]eight|kg|[Mm]easurement|GSPL|Weighing/i.test(wctx2) || weightCandidates.length > 0) {
        weightCandidates.push(wval2);
      }
    }
  }
  if (weightCandidates.length === 0) {
    var allWeightRegex = /\b(9\.\d{3})\b/g;
    var aw;
    while ((aw = allWeightRegex.exec(text)) !== null) {
      weightCandidates.push(parseFloat(aw[1]));
    }
  }
  report.weight = weightCandidates;

  // ---- TENSILE STRENGTH ----
  // Find section near "Tensile Strength", collect all candidate values, pick best one
  var iqcTensileSection = text.match(/[Tt]ensile\s*[Ss]trength[\s\S]{0,250}/);
  if (iqcTensileSection) {
    var tCandidates = [];
    // Match decimal values (e.g. 121.88, 145.5)
    var tDecRegex = /\b(\d{2,3}\.\d{1,3})\b/g;
    var tM;
    while ((tM = tDecRegex.exec(iqcTensileSection[0])) !== null) {
      var tv = parseFloat(tM[1]);
      if (tv >= 80 && tv <= 250) tCandidates.push(tv);
    }
    // Also match integer values near MPa
    var tIntRegex = /\b(\d{2,3})\s*(?:MPa|mpa|Mpa)/gi;
    while ((tM = tIntRegex.exec(iqcTensileSection[0])) !== null) {
      var tv2 = parseFloat(tM[1]);
      if (tv2 >= 80 && tv2 <= 250 && tCandidates.indexOf(tv2) === -1) tCandidates.push(tv2);
    }
    if (tCandidates.length > 0) {
      // Pick the last value in the section (result comes after spec in table row)
      report.tensileStrength = tCandidates[tCandidates.length - 1];
    }
  }
  // Fallback: original pattern with range validation
  if (report.tensileStrength === null) {
    var tensileMatch = text.match(/[Tt]ensile[\s\S]{0,100}?(\d{2,3}\.\d{1,3})\s*(?:\(?\s*[Mm][Pp][Aa]\s*\)?)?/);
    if (tensileMatch) {
      var tv3 = parseFloat(tensileMatch[1]);
      if (tv3 >= 80 && tv3 <= 250) report.tensileStrength = tv3;
    }
  }

  // ---- YIELD STRENGTH ----
  // Find section near "Yield Strength", collect all candidate values, pick best one
  var iqcYieldSection = text.match(/[Yy]ield\s*[Ss]trength[\s\S]{0,250}/);
  if (iqcYieldSection) {
    var yCandidates = [];
    // Match decimal values
    var yDecRegex = /\b(\d{2,3}\.\d{1,3})\b/g;
    var yM;
    while ((yM = yDecRegex.exec(iqcYieldSection[0])) !== null) {
      var yv = parseFloat(yM[1]);
      if (yv >= 40 && yv <= 200) yCandidates.push(yv);
    }
    // Also match integer values near MPa
    var yIntRegex = /\b(\d{2,3})\s*(?:MPa|mpa|Mpa)/gi;
    while ((yM = yIntRegex.exec(iqcYieldSection[0])) !== null) {
      var yv2 = parseFloat(yM[1]);
      if (yv2 >= 40 && yv2 <= 200 && yCandidates.indexOf(yv2) === -1) yCandidates.push(yv2);
    }
    if (yCandidates.length > 0) {
      report.yieldStrength = yCandidates[yCandidates.length - 1];
    }
  }
  // Fallback: original pattern with range validation
  if (report.yieldStrength === null) {
    var yieldMatch = text.match(/[Yy]ield[\s\S]{0,100}?(\d{2,3}\.\d{1,3})\s*(?:\(?\s*[Mm][Pp][Aa]\s*\)?)?/);
    if (yieldMatch) {
      var yv3 = parseFloat(yieldMatch[1]);
      if (yv3 >= 40 && yv3 <= 200) report.yieldStrength = yv3;
    }
  }

  // ---- RESISTIVITY ----
  var resistMatch = text.match(/[Rr]esistiv[\s\S]{0,100}?(0\.\d{3,6})/);
  if (resistMatch) report.resistivity = parseFloat(resistMatch[1]);

  // ---- VISUAL CHECKS ----
  var packMatch = text.match(/[Pp]ackag(?:ing|e)[\s\S]{0,200}?((?:condition|ok|no mismatch|found|damage)[^.]*\.)/i);
  if (packMatch) report.packagingResult = packMatch[1].trim();

  var expiryMatch = text.match(/(?:[Mm]fg|[Ee]xpiry|[Bb]est\s*before)[\s\S]{0,200}?(\d{2}\/\d{2}\/\d{4})/);
  if (expiryMatch) {
    report.expiryInfo = expiryMatch[0].substring(0, 100).trim();
    report.mfgDate = expiryMatch[1];
  }

  return report;
}


// ================================================================
//  COC DOCUMENT PARSER (Enhanced - Full Extraction)
// ================================================================
function parseCOCDocument(ocrText) {
  var coc = {
    certificateNo: '',
    customerName: '',
    productName: '',
    productSpec: '',
    invoiceNo: '',
    deliveryDate: '',
    productionDate: '',
    totalWeight: '',
    totalWeightNum: 0,
    supplierName: '',

    widthSpec: null,
    thicknessSpec: null,

    width: [],
    thickness: [],
    tinContent: [],
    copperPurity: [],
    tensileStrength: [],
    yieldStrength: [],
    elongation: [],
    resistivity: [],
    weight: [],
    solderability: '',

    derivedRanges: {},

    allJudgmentsOK: true,
    judgmentDetails: [],

    rawText: ocrText,
  };

  var text = ocrText || '';

  // ---- HEADER INFO ----
  var certMatch = text.match(/(?:Certificate|Report)[^:]*[:]\s*([A-Z0-9\-\/]+)/i);
  if (certMatch) coc.certificateNo = certMatch[1].trim();

  var customerMatch = text.match(/(?:Customer)[^:]*[:]\s*([A-Z][A-Za-z\s.]+)/i)
    || text.match(/GAUTAM\s*SOLAR[^,\n]*/i);
  if (customerMatch) coc.customerName = (customerMatch[1] || customerMatch[0]).trim();

  var suppMatch = text.match(/(?:Manufacturer|Supplier)[^:]*[:]\s*(.+?)(?:\n|$)/i)
    || text.match(/(?:Taicang)[^\n]*/i);
  if (suppMatch) coc.supplierName = (suppMatch[1] || suppMatch[0]).trim();

  // COC Invoice No: multiple patterns — structured field, then direct pattern match
  var invMatch = text.match(/(?:INVOICE|Invoice)\s*(?:No|NUMBER)?\.?\s*[.:]+\s*([A-Za-z0-9\/\-]+)/i)
    || text.match(/(?:INVOICE|Invoice)\s*(?:No|NUMBER)?\.?\s+([A-Z]*\d{3,}[A-Za-z0-9\/\-]*)/i)
    || text.match(/JR[A-Z]*\d{8,}/i);
  if (invMatch) coc.invoiceNo = (invMatch[1] || invMatch[0]).trim();

  var delMatch = text.match(/(?:Delivery|delivery\s*date)[^:]*[:]\s*([\d.\/\-]+)/i);
  if (delMatch) coc.deliveryDate = delMatch[1];

  var prodDateMatch = text.match(/(?:Production)[^:]*[:]\s*([\d.\/\-]+)/i);
  if (prodDateMatch) coc.productionDate = prodDateMatch[1];

  var wgtMatch = text.match(/(?:Weight|Net\s*Weight)[^:]*[:]\s*([\d,]+)\s*(?:kg|Kg|KG)/i);
  if (wgtMatch) {
    coc.totalWeight = wgtMatch[1].replace(/,/g, '') + ' kg';
    coc.totalWeightNum = parseInt(wgtMatch[1].replace(/,/g, ''), 10);
  }

  var prodMatch = text.match(/(?:Bus\s*[Bb]ar)/i);
  if (prodMatch) coc.productName = 'Bus Bar';

  // ---- EXTRACT SPEC / TOLERANCE FROM COC ----
  var widthSpecMatch = text.match(/(?:Width|W)[^:]*[:]\s*(\d+\.?\d*)\s*(?:[+-]\s*(\d+\.?\d*))?/i);
  if (widthSpecMatch) {
    var wnom = parseFloat(widthSpecMatch[1]);
    var wtol = widthSpecMatch[2] ? parseFloat(widthSpecMatch[2]) : 0.10;
    if (wnom >= 4 && wnom <= 8) {
      coc.widthSpec = {
        nominal: wnom,
        min: parseFloat((wnom - wtol).toFixed(3)),
        max: parseFloat((wnom + wtol).toFixed(3)),
        tolerance: '+-' + wtol,
        unit: 'mm',
        source: 'COC',
      };
    }
  }

  var thickSpecMatch = text.match(/(?:Thickness|T)[^:]*[:]\s*(0\.\d+)\s*(?:[+-]\s*(0\.?\d*))?/i);
  if (thickSpecMatch) {
    var tnom = parseFloat(thickSpecMatch[1]);
    var ttol = thickSpecMatch[2] ? parseFloat(thickSpecMatch[2]) : 0.01;
    if (tnom >= 0.2 && tnom <= 1.0) {
      coc.thicknessSpec = {
        nominal: tnom,
        min: parseFloat((tnom - ttol).toFixed(4)),
        max: parseFloat((tnom + ttol).toFixed(4)),
        tolerance: '+-' + ttol,
        unit: 'mm',
        source: 'COC',
      };
    }
  }

  var specMatch = text.match(/\(?\s*(0\.\d+)\s*[xX*]\s*(\d+\.?\d*)\s*\)?\s*mm/i);
  if (specMatch) {
    coc.productSpec = specMatch[1] + 'x' + specMatch[2] + ' mm';
    var st = parseFloat(specMatch[1]);
    var sw = parseFloat(specMatch[2]);
    if (!coc.widthSpec && sw >= 4 && sw <= 8) {
      coc.widthSpec = { nominal: sw, min: sw - 0.10, max: sw + 0.10, tolerance: '+-0.10', unit: 'mm', source: 'COC-spec' };
    }
    if (!coc.thicknessSpec && st >= 0.2 && st <= 1.0) {
      coc.thicknessSpec = { nominal: st, min: st - 0.01, max: st + 0.01, tolerance: '+-0.01', unit: 'mm', source: 'COC-spec' };
    }
  }

  // ---- EXTRACT NUMERIC TEST RESULTS ----

  // Width test values
  var cocWidthRegex = /\b(6\.\d{2,3})\b/g;
  var cwm;
  while ((cwm = cocWidthRegex.exec(text)) !== null) {
    var cwv = parseFloat(cwm[1]);
    if (cwv >= 5.8 && cwv <= 6.2) coc.width.push(cwv);
  }

  // Thickness test values
  var cocThkRegex = /\b(0\.[34]\d{1,3})\b/g;
  var ctm;
  while ((ctm = cocThkRegex.exec(text)) !== null) {
    var ctv = parseFloat(ctm[1]);
    if (ctv >= 0.35 && ctv <= 0.50) coc.thickness.push(ctv);
  }

  // Tensile strength — ONLY match "Tensile Strength" (not generic "Strength" to avoid Yield Strength confusion)
  var tensileSection = text.match(/[Tt]ensile\s*[Ss]trength[\s\S]{0,300}/);
  if (tensileSection) {
    // Match any 2-3 digit number with optional decimals (expanded from 100-159 to full range)
    var tRgx = /\b(\d{2,3}\.?\d{0,3})\b/g;
    var tsm;
    while ((tsm = tRgx.exec(tensileSection[0])) !== null) {
      var tsv = parseFloat(tsm[1]);
      // Skip spec values like ">=100" — check if preceded by > or >= 
      var tCtx = tensileSection[0].substring(Math.max(0, tsm.index - 3), tsm.index);
      var isSpec = /[>≥]\s*$/.test(tCtx);
      if (tsv >= 80 && tsv <= 300 && !isSpec) coc.tensileStrength.push(tsv);
    }
  }
  if (coc.tensileStrength.length === 0) {
    // Fallback: search entire text for values in tensile range (100-300 MPa)
    var gTensile = /\b(\d{2,3}\.\d{1,3})\b/g;
    var gtm;
    while ((gtm = gTensile.exec(text)) !== null) {
      var gtv = parseFloat(gtm[1]);
      if (gtv >= 100 && gtv <= 300) coc.tensileStrength.push(gtv);
    }
  }

  // Yield strength — use "Yield Strength" specifically, shorter window to avoid bleeding into other rows
  var yieldSection = text.match(/[Yy]ield\s*[Ss]trength[\s\S]{0,250}/);
  if (yieldSection) {
    var ysRegex = /\b(\d{2,3}\.?\d{0,3})\b/g;
    var ysm;
    while ((ysm = ysRegex.exec(yieldSection[0])) !== null) {
      var ysv = parseFloat(ysm[1]);
      // Skip spec values preceded by > or >=
      var yCtx = yieldSection[0].substring(Math.max(0, ysm.index - 3), ysm.index);
      var isYSpec = /[>≥]\s*$/.test(yCtx);
      if (ysv >= 40 && ysv <= 200 && !isYSpec) coc.yieldStrength.push(ysv);
    }
  }

  // Elongation
  var elongSection = text.match(/(?:[Ee]longation)[\s\S]{0,300}/);
  if (elongSection) {
    var eRegex = /\b(\d{1,2}\.?\d{0,2})\s*%?/g;
    var em;
    while ((em = eRegex.exec(elongSection[0])) !== null) {
      var ev = parseFloat(em[1]);
      if (ev >= 10 && ev <= 60) coc.elongation.push(ev);
    }
  }

  // Resistivity
  var resRegex = /\b(0\.0[12]\d{2,4})\b/g;
  var rm;
  while ((rm = resRegex.exec(text)) !== null) {
    coc.resistivity.push(parseFloat(rm[1]));
  }

  // Copper purity
  var cuRegex = /\b(99\.\d{1,4})\b/g;
  var cum;
  while ((cum = cuRegex.exec(text)) !== null) {
    coc.copperPurity.push(parseFloat(cum[1]));
  }

  // Tin content
  var snSection = text.match(/(?:[Tt]in|[Ss]n)[^:]*[:]\s*[\s\S]{0,200}/i);
  if (snSection) {
    var snRegex = /\b(99\.\d{1,4})\b/g;
    var snm;
    while ((snm = snRegex.exec(snSection[0])) !== null) {
      coc.tinContent.push(parseFloat(snm[1]));
    }
  }

  // Weight per sample
  var cocWgtRegex = /\b(\d{1,2}\.\d{3})\b/g;
  var cwm2;
  while ((cwm2 = cocWgtRegex.exec(text)) !== null) {
    var cwv2 = parseFloat(cwm2[1]);
    if (cwv2 >= 8.0 && cwv2 <= 12.0) coc.weight.push(cwv2);
  }

  // Judgment
  var judgments = text.match(/\b(OK|NG|PASS|FAIL)\b/gi) || [];
  coc.judgmentDetails = judgments;
  coc.allJudgmentsOK = judgments.length > 0 && !judgments.some(function(j) { return /NG|FAIL/i.test(j); });

  var solMatch = text.match(/[Ss]older(?:ability)?[\s\S]{0,100}?(OK|NG|PASS|FAIL)/i);
  if (solMatch) coc.solderability = solMatch[1].toUpperCase();

  // ---- COMPUTE DERIVED RANGES ----
  function computeRange(arr, label) {
    if (arr.length === 0) return null;
    var min = Math.min.apply(null, arr);
    var max = Math.max.apply(null, arr);
    var mean = arr.reduce(function(a, b) { return a + b; }, 0) / arr.length;
    var stdDev = Math.sqrt(arr.reduce(function(s, v) { return s + Math.pow(v - mean, 2); }, 0) / arr.length);
    return {
      label: label,
      count: arr.length,
      values: arr,
      min: parseFloat(min.toFixed(6)),
      max: parseFloat(max.toFixed(6)),
      mean: parseFloat(mean.toFixed(6)),
      stdDev: parseFloat(stdDev.toFixed(6)),
      range: parseFloat((max - min).toFixed(6)),
    };
  }

  coc.derivedRanges = {
    width: computeRange(coc.width, 'Width'),
    thickness: computeRange(coc.thickness, 'Thickness'),
    tensileStrength: computeRange(coc.tensileStrength, 'Tensile Strength'),
    yieldStrength: computeRange(coc.yieldStrength, 'Yield Strength'),
    elongation: computeRange(coc.elongation, 'Elongation'),
    resistivity: computeRange(coc.resistivity, 'Resistivity'),
    copperPurity: computeRange(coc.copperPurity, 'Copper Purity'),
    tinContent: computeRange(coc.tinContent, 'Tin Content'),
    weight: computeRange(coc.weight, 'Weight'),
  };

  return coc;
}


// ================================================================
//  HELPER: Compare arrays of IQC values against COC values
// ================================================================
function compareArrayValues(iqcArr, cocArr, paramName, unit, tolerance) {
  var comparison = {
    parameter: paramName,
    unit: unit,
    iqcValues: iqcArr,
    cocValues: cocArr,
    iqcCount: iqcArr.length,
    cocCount: cocArr.length,
    pairComparisons: [],
    overallMatch: true,
    avgDeviation: 0,
    maxDeviation: 0,
    avgDeviationPct: 0,
    iqcMean: 0,
    cocMean: 0,
    summary: '',
  };

  if (iqcArr.length === 0 || cocArr.length === 0) {
    comparison.summary = iqcArr.length === 0 ? 'No IQC values found' : 'No COC values found for comparison';
    comparison.overallMatch = false;
    return comparison;
  }

  // Compute means
  comparison.iqcMean = parseFloat((iqcArr.reduce(function(a, b) { return a + b; }, 0) / iqcArr.length).toFixed(6));
  comparison.cocMean = parseFloat((cocArr.reduce(function(a, b) { return a + b; }, 0) / cocArr.length).toFixed(6));

  // Pair-wise comparison: compare each IQC value to closest COC value
  var totalDev = 0;
  var maxDev = 0;
  var usedCocIndices = [];

  for (var i = 0; i < iqcArr.length; i++) {
    var iqcVal = iqcArr[i];
    // Find closest COC value
    var closestIdx = 0;
    var closestDiff = Infinity;
    for (var j = 0; j < cocArr.length; j++) {
      var diff = Math.abs(iqcVal - cocArr[j]);
      if (diff < closestDiff) {
        closestDiff = diff;
        closestIdx = j;
      }
    }
    var cocVal = cocArr[closestIdx];
    var deviation = parseFloat((iqcVal - cocVal).toFixed(6));
    var absDeviation = Math.abs(deviation);
    var deviationPct = cocVal !== 0 ? parseFloat(((absDeviation / Math.abs(cocVal)) * 100).toFixed(3)) : 0;

    var pairStatus = 'MATCH';
    if (absDeviation > tolerance * 2) pairStatus = 'MISMATCH';
    else if (absDeviation > tolerance) pairStatus = 'DEVIATION';
    else if (absDeviation === 0) pairStatus = 'EXACT';

    comparison.pairComparisons.push({
      index: i + 1,
      iqcValue: iqcVal,
      cocValue: cocVal,
      deviation: deviation,
      absDeviation: absDeviation,
      deviationPct: deviationPct,
      status: pairStatus,
    });

    totalDev += absDeviation;
    if (absDeviation > maxDev) maxDev = absDeviation;
    if (pairStatus === 'MISMATCH') comparison.overallMatch = false;
  }

  comparison.avgDeviation = parseFloat((totalDev / iqcArr.length).toFixed(6));
  comparison.maxDeviation = parseFloat(maxDev.toFixed(6));
  comparison.avgDeviationPct = comparison.cocMean !== 0 ? parseFloat(((comparison.avgDeviation / Math.abs(comparison.cocMean)) * 100).toFixed(3)) : 0;

  var exactCount = comparison.pairComparisons.filter(function(p) { return p.status === 'EXACT'; }).length;
  var matchCount = comparison.pairComparisons.filter(function(p) { return p.status === 'MATCH' || p.status === 'EXACT'; }).length;
  var devCount = comparison.pairComparisons.filter(function(p) { return p.status === 'DEVIATION'; }).length;
  var misCount = comparison.pairComparisons.filter(function(p) { return p.status === 'MISMATCH'; }).length;

  comparison.summary = iqcArr.length + ' IQC values vs ' + cocArr.length + ' COC values | ' +
    'IQC avg: ' + comparison.iqcMean + ' ' + unit + ', COC avg: ' + comparison.cocMean + ' ' + unit +
    ' | Avg deviation: ' + comparison.avgDeviation + ' ' + unit + ' (' + comparison.avgDeviationPct + '%)' +
    ' | ' + matchCount + ' match, ' + devCount + ' deviation, ' + misCount + ' mismatch';

  return comparison;
}

// Helper: Compare single IQC value vs COC value (for "As per COC" fields)
function compareSingleValue(iqcVal, cocVals, paramName, unit, mustMatchExact) {
  var comparison = {
    parameter: paramName,
    unit: unit,
    iqcValue: iqcVal,
    cocValues: cocVals,
    cocMean: null,
    deviation: null,
    deviationPct: null,
    status: 'NOT_AVAILABLE',
    details: '',
  };

  if (iqcVal === null || iqcVal === undefined) {
    comparison.status = 'IQC_MISSING';
    comparison.details = paramName + ' not detected in IQC report';
    return comparison;
  }

  if (!cocVals || cocVals.length === 0) {
    comparison.status = 'COC_MISSING';
    comparison.details = paramName + ': IQC = ' + iqcVal + ' ' + unit + ' (no COC value to compare)';
    return comparison;
  }

  comparison.cocMean = parseFloat((cocVals.reduce(function(a, b) { return a + b; }, 0) / cocVals.length).toFixed(6));
  comparison.deviation = parseFloat((iqcVal - comparison.cocMean).toFixed(6));
  comparison.deviationPct = comparison.cocMean !== 0
    ? parseFloat(((Math.abs(comparison.deviation) / Math.abs(comparison.cocMean)) * 100).toFixed(3))
    : 0;

  // Find closest COC value
  var closestCocVal = cocVals[0];
  var closestDiff = Math.abs(iqcVal - cocVals[0]);
  for (var i = 1; i < cocVals.length; i++) {
    var d = Math.abs(iqcVal - cocVals[i]);
    if (d < closestDiff) { closestDiff = d; closestCocVal = cocVals[i]; }
  }
  comparison.closestCocValue = closestCocVal;
  comparison.closestDeviation = parseFloat((iqcVal - closestCocVal).toFixed(6));

  if (mustMatchExact) {
    // For "As per COC" fields - inspector should copy exact value from COC
    if (closestDiff === 0 || closestDiff < 0.001) {
      comparison.status = 'EXACT_MATCH';
      comparison.details = paramName + ': IQC = ' + iqcVal + ' ' + unit + ' = COC ' + closestCocVal + ' ' + unit + ' ✓ EXACT MATCH';
    } else if (comparison.deviationPct < 2) {
      comparison.status = 'CLOSE_MATCH';
      comparison.details = paramName + ': IQC = ' + iqcVal + ' ' + unit + ' vs COC = ' + closestCocVal + ' ' + unit + ' (diff: ' + comparison.closestDeviation + ', ' + comparison.deviationPct + '%) - Close but not exact';
    } else if (comparison.deviationPct < 10) {
      comparison.status = 'DEVIATION';
      comparison.details = paramName + ': IQC = ' + iqcVal + ' ' + unit + ' vs COC = ' + closestCocVal + ' ' + unit + ' — DEVIATION ' + comparison.deviationPct + '% — Inspector ne galat value likhi hai!';
    } else {
      comparison.status = 'MISMATCH';
      comparison.details = paramName + ': IQC = ' + iqcVal + ' ' + unit + ' vs COC = ' + closestCocVal + ' ' + unit + ' — MISMATCH ' + comparison.deviationPct + '% — Value does NOT match COC!';
    }
  } else {
    // For physically measured fields - should be in same range but not identical
    if (comparison.deviationPct < 1) {
      comparison.status = 'MATCH';
      comparison.details = paramName + ': IQC = ' + iqcVal + ' vs COC = ' + closestCocVal + ' ' + unit + ' — matches well';
    } else if (comparison.deviationPct < 5) {
      comparison.status = 'ACCEPTABLE';
      comparison.details = paramName + ': IQC = ' + iqcVal + ' vs COC = ' + closestCocVal + ' ' + unit + ' — ' + comparison.deviationPct + '% deviation (acceptable)';
    } else if (comparison.deviationPct < 15) {
      comparison.status = 'DEVIATION';
      comparison.details = paramName + ': IQC = ' + iqcVal + ' vs COC = ' + closestCocVal + ' ' + unit + ' — ' + comparison.deviationPct + '% deviation (needs review)';
    } else {
      comparison.status = 'MISMATCH';
      comparison.details = paramName + ': IQC = ' + iqcVal + ' vs COC = ' + closestCocVal + ' ' + unit + ' — ' + comparison.deviationPct + '% — DOES NOT MATCH!';
    }
  }

  return comparison;
}


// ================================================================
//  MAIN VERIFICATION ENGINE (COC-Centric Value Matching)
// ================================================================
function verifyBusBar(iqcData, cocData) {
  var checks = [];
  var passCount = 0;
  var failCount = 0;
  var warningCount = 0;

  // Value comparison results for detailed display
  var valueComparisons = [];

  function addCheck(name, status, values, spec, details, cocValues, cocRange, cocMatchInfo) {
    checks.push({
      name: name,
      status: status,
      values: values,
      spec: spec,
      details: details,
      cocValues: cocValues || null,
      cocRange: cocRange || null,
      cocMatchInfo: cocMatchInfo || null,
    });
    if (status === 'PASS') passCount++;
    else if (status === 'FAIL') failCount++;
    else warningCount++;
  }

  var hasCOC = cocData && (cocData.width.length > 0 || cocData.thickness.length > 0 || cocData.tensileStrength.length > 0 || cocData.resistivity.length > 0);

  // ---- 1. VISUAL - PACKAGING ----
  var pkg = iqcData.packagingResult || '';
  var pkgPass = /ok|no\s*mismatch|no\s*damage|good|found/i.test(pkg);
  addCheck(
    'Visual - Packaging (Make, Type)',
    pkgPass ? 'PASS' : (pkg ? 'FAIL' : 'WARNING'),
    null,
    'No Physical Damage, No Mismatch against PO/Invoice',
    pkg || 'Not detected in OCR'
  );

  // ---- 2. VISUAL - EXPIRY DATE ----
  var exp = iqcData.expiryInfo || '';
  var hasExpiry = exp.length > 5;
  var expiryStatus = hasExpiry ? 'PASS' : 'WARNING';
  var expiryDetail = exp || 'Expiry info not detected';

  if (hasExpiry && iqcData.mfgDate) {
    var dateMatch = iqcData.mfgDate.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    if (dateMatch) {
      var mfgDate = new Date(dateMatch[3], dateMatch[2] - 1, dateMatch[1]);
      var now = new Date();
      var monthsDiff = (now - mfgDate) / (1000 * 60 * 60 * 24 * 30);
      if (monthsDiff > 12) {
        expiryStatus = 'FAIL';
        expiryDetail += ' — Material is ' + Math.round(monthsDiff) + ' months old (>12 months)';
      } else if (monthsDiff > 6) {
        expiryStatus = 'WARNING';
        expiryDetail += ' — Material is ' + Math.round(monthsDiff) + ' months old';
      } else {
        expiryDetail += ' — Material is ' + Math.round(monthsDiff) + ' months old (OK)';
      }
    }
  }
  addCheck('Visual - Expiry Date', expiryStatus, null, 'Expiry should be min. 6 months from receiving', expiryDetail);

  // ===================================
  // PHYSICALLY MEASURED PARAMETERS
  // Inspector measures with instruments — compare IQC values directly with COC values
  // ===================================

  // ---- 3. PHYSICAL - WIDTH (measured by vernier caliper) ----
  var widthValues = iqcData.width;
  var cocWidthVals = cocData ? cocData.width : [];
  var widthSpec = BUS_BAR_SPECS.width;
  var widthStatus = 'PASS';
  var widthDetails = '';
  var widthMatchInfo = null;

  if (widthValues.length === 0) {
    widthStatus = 'WARNING';
    widthDetails = 'No width values detected from IQC OCR';
  } else if (cocWidthVals.length > 0) {
    // PRIMARY: Compare IQC values directly with COC values
    widthMatchInfo = compareArrayValues(widthValues, cocWidthVals, 'Width', 'mm', 0.05);
    valueComparisons.push(widthMatchInfo);

    if (widthMatchInfo.avgDeviationPct > 2) {
      widthStatus = 'FAIL';
      widthDetails = 'IQC WIDTH DOES NOT MATCH COC! IQC avg: ' + widthMatchInfo.iqcMean + ' mm, COC avg: ' + widthMatchInfo.cocMean + ' mm — Deviation: ' + widthMatchInfo.avgDeviation + ' mm (' + widthMatchInfo.avgDeviationPct + '%)';
    } else if (widthMatchInfo.avgDeviationPct > 0.5) {
      widthStatus = 'WARNING';
      widthDetails = 'IQC Width slightly differs from COC. IQC avg: ' + widthMatchInfo.iqcMean + ' mm, COC avg: ' + widthMatchInfo.cocMean + ' mm — Deviation: ' + widthMatchInfo.avgDeviationPct + '%';
    } else {
      widthDetails = 'IQC Width MATCHES COC ✓. IQC avg: ' + widthMatchInfo.iqcMean + ' mm, COC avg: ' + widthMatchInfo.cocMean + ' mm — Deviation: ' + widthMatchInfo.avgDeviationPct + '%';
    }

    // SECONDARY: Also check spec range
    var widthOutOfSpec = widthValues.filter(function(v) { return v < widthSpec.min || v > widthSpec.max; });
    if (widthOutOfSpec.length > 0) {
      widthStatus = 'FAIL';
      widthDetails += ' | OUT OF SPEC: [' + widthOutOfSpec.join(', ') + '] outside ' + widthSpec.min + '-' + widthSpec.max + ' mm';
    }
  } else {
    // No COC — fallback to spec range only
    var widthOutOfSpec2 = widthValues.filter(function(v) { return v < widthSpec.min || v > widthSpec.max; });
    if (widthOutOfSpec2.length > 0) {
      widthStatus = 'FAIL';
      widthDetails = widthOutOfSpec2.length + '/' + widthValues.length + ' OUT OF SPEC: [' + widthOutOfSpec2.join(', ') + '] outside ' + widthSpec.min + '-' + widthSpec.max + ' mm. (No COC for comparison)';
    } else {
      widthDetails = widthValues.length + ' samples within spec ' + widthSpec.min + '-' + widthSpec.max + ' mm. (No COC for comparison)';
    }
  }

  addCheck(
    'Physical - Width (IQC vs COC)',
    widthStatus,
    widthValues.length > 0 ? widthValues.map(function(v) { return v + ' mm'; }) : null,
    widthSpec.nominal + ' ' + widthSpec.tolerance + ' mm',
    widthDetails,
    cocWidthVals.length > 0 ? cocWidthVals.map(function(v) { return v + ' mm'; }) : null,
    cocData && cocData.derivedRanges ? cocData.derivedRanges.width : null,
    widthMatchInfo
  );

  // ---- 4. PHYSICAL - THICKNESS (measured by micrometer) ----
  var thickValues = iqcData.thickness;
  var cocThickVals = cocData ? cocData.thickness : [];
  var thickSpec = BUS_BAR_SPECS.thickness;
  var thickStatus = 'PASS';
  var thickDetails = '';
  var thickMatchInfo = null;

  if (thickValues.length === 0) {
    thickStatus = 'WARNING';
    thickDetails = 'No thickness values detected from IQC OCR';
  } else if (cocThickVals.length > 0) {
    // PRIMARY: Direct comparison with COC
    thickMatchInfo = compareArrayValues(thickValues, cocThickVals, 'Thickness', 'mm', 0.005);
    valueComparisons.push(thickMatchInfo);

    if (thickMatchInfo.avgDeviationPct > 3) {
      thickStatus = 'FAIL';
      thickDetails = 'IQC THICKNESS DOES NOT MATCH COC! IQC avg: ' + thickMatchInfo.iqcMean + ' mm, COC avg: ' + thickMatchInfo.cocMean + ' mm — Deviation: ' + thickMatchInfo.avgDeviation + ' mm (' + thickMatchInfo.avgDeviationPct + '%)';
    } else if (thickMatchInfo.avgDeviationPct > 1) {
      thickStatus = 'WARNING';
      thickDetails = 'IQC Thickness slightly differs from COC. IQC avg: ' + thickMatchInfo.iqcMean + ' mm, COC avg: ' + thickMatchInfo.cocMean + ' mm — Deviation: ' + thickMatchInfo.avgDeviationPct + '%';
    } else {
      thickDetails = 'IQC Thickness MATCHES COC ✓. IQC avg: ' + thickMatchInfo.iqcMean + ' mm, COC avg: ' + thickMatchInfo.cocMean + ' mm — Deviation: ' + thickMatchInfo.avgDeviationPct + '%';
    }

    // SECONDARY: Spec range check
    var thickOutOfSpec = thickValues.filter(function(v) { return v < thickSpec.min || v > thickSpec.max; });
    if (thickOutOfSpec.length > 0) {
      thickStatus = 'FAIL';
      thickDetails += ' | OUT OF SPEC: [' + thickOutOfSpec.join(', ') + '] outside ' + thickSpec.min + '-' + thickSpec.max + ' mm';
    }
  } else {
    var thickOutOfSpec2 = thickValues.filter(function(v) { return v < thickSpec.min || v > thickSpec.max; });
    if (thickOutOfSpec2.length > 0) {
      thickStatus = 'FAIL';
      thickDetails = thickOutOfSpec2.length + '/' + thickValues.length + ' OUT OF SPEC. (No COC for comparison)';
    } else {
      thickDetails = thickValues.length + ' samples within spec. (No COC for comparison)';
    }
  }

  addCheck(
    'Physical - Thickness (IQC vs COC)',
    thickStatus,
    thickValues.length > 0 ? thickValues.map(function(v) { return v + ' mm'; }) : null,
    thickSpec.nominal + ' ' + thickSpec.tolerance + ' mm',
    thickDetails,
    cocThickVals.length > 0 ? cocThickVals.map(function(v) { return v + ' mm'; }) : null,
    cocData && cocData.derivedRanges ? cocData.derivedRanges.thickness : null,
    thickMatchInfo
  );

  // ---- 5. COATING THICKNESS ----
  var coatSpec = BUS_BAR_SPECS.coatingThickness;
  var coatValues = iqcData.coatingThickness;
  var coatOutOfSpec = coatValues.filter(function(v) { return v < coatSpec.min || v > coatSpec.max; });

  var coatStatus = 'PASS';
  var coatDetails = '';

  if (coatValues.length === 0) {
    coatStatus = 'WARNING';
    coatDetails = 'No coating thickness values detected from OCR';
  } else if (coatOutOfSpec.length > 0) {
    coatStatus = 'FAIL';
    coatDetails = coatOutOfSpec.length + '/' + coatValues.length + ' OUT OF SPEC: [' + coatOutOfSpec.join(', ') + '] outside ' + coatSpec.min + '-' + coatSpec.max + ' ' + coatSpec.unit;
  } else {
    coatDetails = coatValues.length + ' samples all within ' + coatSpec.min + '-' + coatSpec.max + ' ' + coatSpec.unit + '. Values: ' + coatValues.join(', ');
  }

  addCheck(
    'Physical - Coating Thickness',
    coatStatus,
    coatValues.length > 0 ? coatValues.map(function(v) { return v + ' ' + coatSpec.unit; }) : null,
    coatSpec.nominal + ' ±5 ' + coatSpec.unit + ' (' + coatSpec.min + '-' + coatSpec.max + ')',
    coatDetails
  );

  // ---- 6. SOLDERABILITY - BUS BAR ----
  var solBBSpec = BUS_BAR_SPECS.solderabilityBusBar;
  var solBBVal = iqcData.solderabilityBusBar;
  var solBBStatus = 'PASS';
  var solBBDetails = '';
  if (solBBVal === null) {
    solBBStatus = 'WARNING';
    solBBDetails = 'Solderability (Bus Bar) not detected from OCR';
  } else if (solBBVal < solBBSpec.min) {
    solBBStatus = 'FAIL';
    solBBDetails = 'IQC: ' + solBBVal + ' N < minimum ' + solBBSpec.min + ' N — BELOW SPEC';
  } else {
    solBBDetails = 'IQC: ' + solBBVal + ' N >= ' + solBBSpec.min + ' N — OK';
  }
  addCheck('Solderability - B/w Bus Bar', solBBStatus, solBBVal !== null ? [solBBVal + ' N'] : null, '>= ' + solBBSpec.min + ' N', solBBDetails);

  // ---- 7. SOLDERABILITY - RIBBON ----
  var solRSpec = BUS_BAR_SPECS.solderabilityRibbon;
  var solRVal = iqcData.solderabilityRibbon;
  var solRStatus = 'PASS';
  var solRDetails = '';
  if (solRVal === null) {
    solRStatus = 'WARNING';
    solRDetails = 'Solderability (Ribbon) not detected from OCR';
  } else if (solRVal < solRSpec.min) {
    solRStatus = 'FAIL';
    solRDetails = 'IQC: ' + solRVal + ' N < minimum ' + solRSpec.min + ' N — BELOW SPEC';
  } else {
    solRDetails = 'IQC: ' + solRVal + ' N >= ' + solRSpec.min + ' N — OK';
  }
  addCheck('Solderability - B/w Ribbon & Interconnector', solRStatus, solRVal !== null ? [solRVal + ' N'] : null, '>= ' + solRSpec.min + ' N', solRDetails);

  // ---- 8. WEIGHT (measured by weighing machine — compare with COC) ----
  var weightValues = iqcData.weight;
  var cocWeights = cocData ? cocData.weight : [];
  var weightStatus = 'PASS';
  var weightDetails = '';
  var weightMatchInfo = null;

  if (weightValues.length === 0) {
    weightStatus = 'WARNING';
    weightDetails = 'No weight values detected from IQC OCR';
  } else if (cocWeights.length > 0) {
    // Direct comparison with COC
    weightMatchInfo = compareArrayValues(weightValues, cocWeights, 'Weight', 'kg', 0.05);
    valueComparisons.push(weightMatchInfo);

    if (weightMatchInfo.avgDeviationPct > 5) {
      weightStatus = 'FAIL';
      weightDetails = 'IQC WEIGHT DOES NOT MATCH COC! IQC avg: ' + weightMatchInfo.iqcMean + ' kg, COC avg: ' + weightMatchInfo.cocMean + ' kg — Deviation: ' + weightMatchInfo.avgDeviationPct + '%';
    } else if (weightMatchInfo.avgDeviationPct > 2) {
      weightStatus = 'WARNING';
      weightDetails = 'IQC Weight slightly differs from COC. IQC avg: ' + weightMatchInfo.iqcMean + ' kg, COC avg: ' + weightMatchInfo.cocMean + ' kg — Deviation: ' + weightMatchInfo.avgDeviationPct + '%';
    } else {
      weightDetails = 'IQC Weight MATCHES COC ✓. IQC avg: ' + weightMatchInfo.iqcMean + ' kg, COC avg: ' + weightMatchInfo.cocMean + ' kg — Deviation: ' + weightMatchInfo.avgDeviationPct + '%';
    }
  } else {
    var wAvg = weightValues.reduce(function(a, b) { return a + b; }, 0) / weightValues.length;
    weightDetails = weightValues.length + ' samples. Avg: ' + wAvg.toFixed(3) + ' kg. (No COC for comparison)';
  }

  addCheck(
    'Measurement - Weight (IQC vs COC)',
    weightStatus,
    weightValues.length > 0 ? weightValues.map(function(v) { return v.toFixed(3) + ' kg'; }) : null,
    'Must match COC values',
    weightDetails,
    cocWeights.length > 0 ? cocWeights.map(function(v) { return v.toFixed(3) + ' kg'; }) : null,
    cocData && cocData.derivedRanges ? cocData.derivedRanges.weight : null,
    weightMatchInfo
  );

  // ===================================
  // "AS PER COC" PARAMETERS
  // Inspector copies value from COC document — MUST MATCH EXACTLY
  // ===================================

  // ---- 9. TENSILE STRENGTH (IQC must match COC exactly) ----
  var tensileVal = iqcData.tensileStrength;
  var cocTensileVals = cocData ? cocData.tensileStrength : [];
  var tensileSpec = BUS_BAR_SPECS.tensileStrength;
  var tensileStatus = 'PASS';
  var tensileDetails = '';
  var tensileComp = compareSingleValue(tensileVal, cocTensileVals, 'Tensile Strength', 'MPa', true);
  if (tensileComp.parameter) valueComparisons.push(tensileComp);

  if (tensileVal === null) {
    tensileStatus = 'WARNING';
    tensileDetails = 'Tensile strength not detected from IQC OCR';
  } else if (cocTensileVals.length > 0) {
    // PRIMARY: Must match COC value
    if (tensileComp.status === 'EXACT_MATCH' || tensileComp.status === 'CLOSE_MATCH') {
      tensileDetails = tensileComp.details;
      // Also verify COC value is within spec
      if (tensileComp.cocMean < tensileSpec.min) {
        tensileStatus = 'FAIL';
        tensileDetails += ' | BUT COC value itself < ' + tensileSpec.min + ' MPa spec!';
      }
    } else if (tensileComp.status === 'DEVIATION') {
      tensileStatus = 'FAIL';
      tensileDetails = tensileComp.details;
    } else if (tensileComp.status === 'MISMATCH') {
      tensileStatus = 'FAIL';
      tensileDetails = tensileComp.details;
    }
  } else {
    // No COC — use spec check
    if (tensileVal < tensileSpec.min) {
      tensileStatus = 'FAIL';
      tensileDetails = tensileVal + ' MPa < ' + tensileSpec.min + ' MPa — BELOW SPEC (no COC for comparison)';
    } else {
      tensileDetails = tensileVal + ' MPa >= ' + tensileSpec.min + ' MPa — OK (no COC for comparison)';
    }
  }

  addCheck(
    'As per COC - Tensile Strength',
    tensileStatus,
    tensileVal !== null ? [tensileVal + ' MPa'] : null,
    'IQC must match COC value | Min: ' + tensileSpec.min + ' MPa',
    tensileDetails,
    cocTensileVals.length > 0 ? cocTensileVals.map(function(v) { return v.toFixed(1) + ' MPa'; }) : null,
    cocData && cocData.derivedRanges ? cocData.derivedRanges.tensileStrength : null,
    tensileComp
  );

  // ---- 10. YIELD STRENGTH (IQC must match COC exactly) ----
  var yieldVal = iqcData.yieldStrength;
  var cocYieldVals = cocData ? cocData.yieldStrength : [];
  var yieldSpec = BUS_BAR_SPECS.yieldStrength;
  var yieldStatus = 'PASS';
  var yieldDetails = '';
  var yieldComp = compareSingleValue(yieldVal, cocYieldVals, 'Yield Strength', 'MPa', true);
  if (yieldComp.parameter) valueComparisons.push(yieldComp);

  if (yieldVal === null) {
    yieldStatus = 'WARNING';
    yieldDetails = 'Yield strength not detected from IQC OCR';
  } else if (cocYieldVals.length > 0) {
    if (yieldComp.status === 'EXACT_MATCH' || yieldComp.status === 'CLOSE_MATCH') {
      yieldDetails = yieldComp.details;
      if (yieldComp.cocMean < yieldSpec.min) {
        yieldStatus = 'FAIL';
        yieldDetails += ' | BUT COC value itself < ' + yieldSpec.min + ' MPa spec!';
      }
    } else {
      yieldStatus = 'FAIL';
      yieldDetails = yieldComp.details;
    }
  } else {
    if (yieldVal < yieldSpec.min) {
      yieldStatus = 'FAIL';
      yieldDetails = yieldVal + ' MPa < ' + yieldSpec.min + ' MPa — BELOW SPEC (no COC)';
    } else {
      yieldDetails = yieldVal + ' MPa >= ' + yieldSpec.min + ' MPa — OK (no COC)';
    }
  }

  addCheck(
    'As per COC - Yield Strength',
    yieldStatus,
    yieldVal !== null ? [yieldVal + ' MPa'] : null,
    'IQC must match COC value | Min: ' + yieldSpec.min + ' MPa',
    yieldDetails,
    cocYieldVals.length > 0 ? cocYieldVals.map(function(v) { return v.toFixed(1) + ' MPa'; }) : null,
    cocData && cocData.derivedRanges ? cocData.derivedRanges.yieldStrength : null,
    yieldComp
  );

  // ---- 11. RESISTIVITY (IQC must match COC exactly) ----
  var resVal = iqcData.resistivity;
  var cocResVals = cocData ? cocData.resistivity : [];
  var resSpec = BUS_BAR_SPECS.resistivity;
  var resStatus = 'PASS';
  var resDetails = '';
  var resComp = compareSingleValue(resVal, cocResVals, 'Resistivity', 'Ω·mm²/m', true);
  if (resComp.parameter) valueComparisons.push(resComp);

  if (resVal === null) {
    resStatus = 'WARNING';
    resDetails = 'Resistivity not detected from IQC OCR';
  } else if (cocResVals.length > 0) {
    if (resComp.status === 'EXACT_MATCH' || resComp.status === 'CLOSE_MATCH') {
      resDetails = resComp.details;
      if (resComp.cocMean > resSpec.max) {
        resStatus = 'FAIL';
        resDetails += ' | BUT COC value itself > ' + resSpec.max + ' spec!';
      }
    } else {
      resStatus = 'FAIL';
      resDetails = resComp.details;
    }
  } else {
    if (resVal > resSpec.max) {
      resStatus = 'FAIL';
      resDetails = resVal + ' > ' + resSpec.max + ' — EXCEEDS MAX (no COC)';
    } else {
      resDetails = resVal + ' <= ' + resSpec.max + ' — OK (no COC)';
    }
  }

  addCheck(
    'As per COC - Resistivity',
    resStatus,
    resVal !== null ? [resVal + ' Ω·mm²/m'] : null,
    'IQC must match COC value | Max: ' + resSpec.max + ' Ω·mm²/m',
    resDetails,
    cocResVals.length > 0 ? cocResVals.map(function(v) { return v + ' Ω·mm²/m'; }) : null,
    cocData && cocData.derivedRanges ? cocData.derivedRanges.resistivity : null,
    resComp
  );

  // ---- AQL SAMPLING VERIFICATION ----
  var lotSize = iqcData.quantityNum || 9000;
  var requiredSampleS3 = getAQLSampleSize(lotSize, 'S3');
  var requiredSampleS4 = getAQLSampleSize(lotSize, 'S4');
  var actualSamples = Math.max(
    iqcData.width.length,
    iqcData.thickness.length,
    iqcData.weight.length,
    iqcData.coatingThickness.length
  );

  var aqlStatus = 'PASS';
  var aqlDetails = 'Lot: ' + lotSize + ' ' + (iqcData.quantityUnit || 'units') + '. SIL S3 -> ' + requiredSampleS3 + ' samples, SIL S4 -> ' + requiredSampleS4 + ' samples. Found: ' + actualSamples + ' samples.';

  if (actualSamples < requiredSampleS3) {
    aqlStatus = 'FAIL';
    aqlDetails += ' — INSUFFICIENT (need min ' + requiredSampleS3 + ')';
  } else if (actualSamples >= requiredSampleS4) {
    aqlDetails += ' — Exceeds S4 requirement.';
  } else {
    aqlDetails += ' — Meets S3 requirement.';
  }

  var aqlCheck = {
    name: 'AQL Sampling Plan Verification',
    status: aqlStatus,
    lotSize: lotSize,
    inspectionLevel: 'S3',
    requiredSamplesS3: requiredSampleS3,
    requiredSamplesS4: requiredSampleS4,
    actualSamples: actualSamples,
    details: aqlDetails,
  };

  // ---- COMPREHENSIVE COC CROSS-VERIFICATION ----
  var cocChecks = [];

  if (cocData) {
    // 1. Invoice match
    if (iqcData.invoiceNo && cocData.invoiceNo) {
      var iqcInv = iqcData.invoiceNo.replace(/[\s\-\/]/g, '').toUpperCase();
      var cocInv = cocData.invoiceNo.replace(/[\s\-\/]/g, '').toUpperCase();
      var invMatch2 = iqcInv.indexOf(cocInv) >= 0 || cocInv.indexOf(iqcInv) >= 0 || iqcInv === cocInv;
      cocChecks.push({ field: 'Invoice Number', iqcValue: iqcData.invoiceNo, cocValue: cocData.invoiceNo, match: invMatch2, status: invMatch2 ? 'MATCH' : 'MISMATCH', importance: 'HIGH' });
    }

    // 2. Customer name
    if (cocData.customerName) {
      var isGautam = /gautam/i.test(cocData.customerName);
      cocChecks.push({ field: 'Customer Name', iqcValue: 'Gautam Solar Pvt. Ltd.', cocValue: cocData.customerName, match: isGautam, status: isGautam ? 'MATCH' : 'MISMATCH', importance: 'HIGH' });
    }

    // 3. Total Weight/Quantity
    if (iqcData.quantityNum && cocData.totalWeightNum) {
      var wMatch = iqcData.quantityNum === cocData.totalWeightNum;
      var wDev = Math.abs(iqcData.quantityNum - cocData.totalWeightNum);
      cocChecks.push({ field: 'Total Weight/Quantity', iqcValue: iqcData.quantity, cocValue: cocData.totalWeight, match: wMatch, status: wMatch ? 'MATCH' : (wDev < 100 ? 'DEVIATION' : 'MISMATCH'), importance: 'HIGH', deviation: wDev });
    }

    // 4. Material specification
    if (iqcData.rmDetails && cocData.productSpec) {
      var iqcRm = iqcData.rmDetails.replace(/\s/g, '').toLowerCase();
      var cocSp = cocData.productSpec.replace(/\s/g, '').toLowerCase();
      var specMatch2 = iqcRm.indexOf(cocSp) >= 0 || cocSp.indexOf(iqcRm) >= 0;
      cocChecks.push({ field: 'Material Specification', iqcValue: iqcData.rmDetails, cocValue: cocData.productSpec, match: specMatch2, status: specMatch2 ? 'MATCH' : 'MISMATCH', importance: 'HIGH' });
    }

    // 5. COC all judgments OK
    cocChecks.push({ field: 'COC Test Judgments', iqcValue: '-', cocValue: cocData.allJudgmentsOK ? 'All OK (' + cocData.judgmentDetails.length + ' checks)' : 'SOME FAILED: ' + cocData.judgmentDetails.join(', '), match: cocData.allJudgmentsOK, status: cocData.allJudgmentsOK ? 'PASS' : 'FAIL', importance: 'CRITICAL' });

    // 6. Width value-by-value comparison
    if (iqcData.width.length > 0 && cocData.width.length > 0) {
      var wComp = widthMatchInfo || compareArrayValues(iqcData.width, cocData.width, 'Width', 'mm', 0.05);
      var mismatches = wComp.pairComparisons.filter(function(p) { return p.status === 'MISMATCH'; });
      cocChecks.push({
        field: 'Width — Value Comparison',
        iqcValue: iqcData.width.map(function(v) { return v + ' mm'; }).join(', '),
        cocValue: cocData.width.map(function(v) { return v + ' mm'; }).join(', '),
        match: mismatches.length === 0,
        status: mismatches.length === 0 ? 'MATCH' : (mismatches.length <= 2 ? 'DEVIATION' : 'MISMATCH'),
        importance: 'HIGH',
        deviation: wComp.avgDeviationPct + '%',
        pairDetails: wComp.pairComparisons,
      });
    }

    // 7. Thickness value-by-value comparison
    if (iqcData.thickness.length > 0 && cocData.thickness.length > 0) {
      var tComp = thickMatchInfo || compareArrayValues(iqcData.thickness, cocData.thickness, 'Thickness', 'mm', 0.005);
      var tMismatches = tComp.pairComparisons.filter(function(p) { return p.status === 'MISMATCH'; });
      cocChecks.push({
        field: 'Thickness — Value Comparison',
        iqcValue: iqcData.thickness.map(function(v) { return v + ' mm'; }).join(', '),
        cocValue: cocData.thickness.map(function(v) { return v + ' mm'; }).join(', '),
        match: tMismatches.length === 0,
        status: tMismatches.length === 0 ? 'MATCH' : (tMismatches.length <= 2 ? 'DEVIATION' : 'MISMATCH'),
        importance: 'HIGH',
        deviation: tComp.avgDeviationPct + '%',
        pairDetails: tComp.pairComparisons,
      });
    }

    // 8. Resistivity — exact match required
    if (iqcData.resistivity !== null && cocData.resistivity.length > 0) {
      cocChecks.push({
        field: 'Resistivity — MUST match COC',
        iqcValue: iqcData.resistivity + ' Ω·mm²/m',
        cocValue: cocData.resistivity.join(', ') + ' Ω·mm²/m',
        match: resComp.status === 'EXACT_MATCH' || resComp.status === 'CLOSE_MATCH',
        status: resComp.status === 'EXACT_MATCH' ? 'MATCH' : (resComp.status === 'CLOSE_MATCH' ? 'MATCH' : (resComp.status === 'DEVIATION' ? 'DEVIATION' : 'MISMATCH')),
        importance: 'CRITICAL',
        deviation: resComp.deviationPct !== null ? resComp.deviationPct + '%' : '-',
      });
    }

    // 9. Tensile — exact match required
    if (iqcData.tensileStrength !== null && cocData.tensileStrength.length > 0) {
      cocChecks.push({
        field: 'Tensile Strength — MUST match COC',
        iqcValue: iqcData.tensileStrength + ' MPa',
        cocValue: cocData.tensileStrength.join(', ') + ' MPa',
        match: tensileComp.status === 'EXACT_MATCH' || tensileComp.status === 'CLOSE_MATCH',
        status: tensileComp.status === 'EXACT_MATCH' ? 'MATCH' : (tensileComp.status === 'CLOSE_MATCH' ? 'MATCH' : (tensileComp.status === 'DEVIATION' ? 'DEVIATION' : 'MISMATCH')),
        importance: 'CRITICAL',
        deviation: tensileComp.deviationPct !== null ? tensileComp.deviationPct + '%' : '-',
      });
    }

    // 10. Yield — exact match required
    if (iqcData.yieldStrength !== null && cocData.yieldStrength.length > 0) {
      cocChecks.push({
        field: 'Yield Strength — MUST match COC',
        iqcValue: iqcData.yieldStrength + ' MPa',
        cocValue: cocData.yieldStrength.join(', ') + ' MPa',
        match: yieldComp.status === 'EXACT_MATCH' || yieldComp.status === 'CLOSE_MATCH',
        status: yieldComp.status === 'EXACT_MATCH' ? 'MATCH' : (yieldComp.status === 'CLOSE_MATCH' ? 'MATCH' : (yieldComp.status === 'DEVIATION' ? 'DEVIATION' : 'MISMATCH')),
        importance: 'CRITICAL',
        deviation: yieldComp.deviationPct !== null ? yieldComp.deviationPct + '%' : '-',
      });
    }

    // 11. Copper Purity
    if (cocData.copperPurity.length > 0) {
      var minCu = Math.min.apply(null, cocData.copperPurity);
      var cuPass = minCu >= 99.90;
      cocChecks.push({ field: 'Copper Purity (Cu%)', iqcValue: 'As per COC', cocValue: cocData.copperPurity.join(', ') + '% (min: ' + minCu + '%)', match: cuPass, status: cuPass ? 'PASS' : 'FAIL', importance: 'HIGH' });
    }

    // 12. Tin content
    if (cocData.tinContent.length > 0) {
      var minSn = Math.min.apply(null, cocData.tinContent);
      var snPass = minSn >= 99.90;
      cocChecks.push({ field: 'Tin Content (Sn%)', iqcValue: 'As per COC', cocValue: cocData.tinContent.join(', ') + '% (min: ' + minSn + '%)', match: snPass, status: snPass ? 'PASS' : 'FAIL', importance: 'MEDIUM' });
    }

    // 13. Elongation
    if (cocData.elongation.length > 0) {
      var minElong = Math.min.apply(null, cocData.elongation);
      var elongPass = minElong >= 20;
      cocChecks.push({ field: 'Elongation (%)', iqcValue: 'As per COC', cocValue: cocData.elongation.join(', ') + '% (min: ' + minElong + '%)', match: elongPass, status: elongPass ? 'PASS' : (minElong >= 15 ? 'DEVIATION' : 'FAIL'), importance: 'MEDIUM' });
    }

    // 14. Weight value-by-value
    if (weightValues.length > 0 && cocWeights.length > 0) {
      var wgtComp = weightMatchInfo || compareArrayValues(weightValues, cocWeights, 'Weight', 'kg', 0.05);
      var wgtMis = wgtComp.pairComparisons.filter(function(p) { return p.status === 'MISMATCH'; });
      cocChecks.push({
        field: 'Weight — Value Comparison',
        iqcValue: weightValues.map(function(v) { return v.toFixed(3) + ' kg'; }).join(', '),
        cocValue: cocWeights.map(function(v) { return v.toFixed(3) + ' kg'; }).join(', '),
        match: wgtMis.length === 0,
        status: wgtMis.length === 0 ? 'MATCH' : (wgtMis.length <= 2 ? 'DEVIATION' : 'MISMATCH'),
        importance: 'HIGH',
        deviation: wgtComp.avgDeviationPct + '%',
        pairDetails: wgtComp.pairComparisons,
      });
    }

    // 15. Supplier name
    if (iqcData.supplierName && cocData.supplierName) {
      var iqcSup = iqcData.supplierName.toLowerCase().replace(/[^a-z]/g, '');
      var cocSup = cocData.supplierName.toLowerCase().replace(/[^a-z]/g, '');
      var supMatch = iqcSup.indexOf(cocSup) >= 0 || cocSup.indexOf(iqcSup) >= 0;
      cocChecks.push({ field: 'Supplier Name', iqcValue: iqcData.supplierName, cocValue: cocData.supplierName, match: supMatch, status: supMatch ? 'MATCH' : 'MISMATCH', importance: 'HIGH' });
    }
  }

  // ================================================================
  //  FRAUD / DUMMY DETECTION
  // ================================================================
  var fraudAnalyses = [];

  if (iqcData.width.length >= 2) {
    fraudAnalyses.push(analyzeMeasurementAuthenticity(iqcData.width, 'Width', BUS_BAR_SPECS.width, cocData ? cocData.width : null));
  }
  if (iqcData.thickness.length >= 2) {
    fraudAnalyses.push(analyzeMeasurementAuthenticity(iqcData.thickness, 'Thickness', BUS_BAR_SPECS.thickness, cocData ? cocData.thickness : null));
  }
  if (iqcData.coatingThickness.length >= 2) {
    fraudAnalyses.push(analyzeMeasurementAuthenticity(iqcData.coatingThickness, 'Coating Thickness', BUS_BAR_SPECS.coatingThickness, null));
  }
  if (iqcData.weight.length >= 2) {
    fraudAnalyses.push(analyzeMeasurementAuthenticity(iqcData.weight, 'Weight', null, cocData ? cocData.weight : null));
  }

  var fraudReport = generateFraudReport(fraudAnalyses);

  // ---- OVERALL VERDICT ----
  var overallPass = failCount === 0 && aqlStatus !== 'FAIL';
  var cocMismatches = cocChecks.filter(function(c) { return !c.match && c.status !== 'DEVIATION'; }).length;
  var cocDeviations = cocChecks.filter(function(c) { return c.status === 'DEVIATION'; }).length;

  var finalResult = overallPass ? 'PASS' : 'FAIL';
  var finalMessage = '';

  // COC mismatches on CRITICAL fields should cause FAIL
  var criticalMismatches = cocChecks.filter(function(c) { return c.importance === 'CRITICAL' && !c.match; });
  if (criticalMismatches.length > 0 && finalResult === 'PASS') {
    finalResult = 'FAIL';
  }

  if (finalResult === 'PASS' && fraudReport.overallVerdict === 'LIKELY_FAKE') {
    finalResult = 'FAIL';
    finalMessage = 'IQC Report FAILED — Data passes spec checks but FRAUD DETECTED: ' + fraudReport.summary;
  } else if (finalResult === 'PASS' && cocMismatches > 0) {
    finalResult = 'FAIL';
    finalMessage = 'IQC Report FAILED — ' + cocMismatches + ' IQC value(s) DO NOT MATCH COC!';
  } else if (finalResult === 'PASS' && fraudReport.overallVerdict === 'SUSPICIOUS') {
    finalMessage = 'IQC Report PASSED with CONCERNS — ' + passCount + '/' + checks.length + ' checks passed. ' + fraudReport.summary;
  } else if (finalResult === 'PASS') {
    finalMessage = 'IQC Report PASSED — All ' + passCount + '/' + checks.length + ' checks passed. ' + (hasCOC ? 'All IQC values match COC.' : 'No COC provided for cross-check.');
    if (warningCount > 0) finalMessage += ' (' + warningCount + ' warnings)';
  } else {
    finalMessage = 'IQC Report FAILED — ' + failCount + ' check(s) failed out of ' + checks.length;
    if (cocMismatches > 0) finalMessage += '. ' + cocMismatches + ' IQC value(s) DO NOT MATCH COC';
    if (fraudReport.overallVerdict !== 'GENUINE') {
      finalMessage += '. ' + fraudReport.summary;
    }
  }

  if (cocDeviations > 0) finalMessage += ' | ' + cocDeviations + ' COC deviation(s) need review';

  return {
    materialType: 'busbar',
    materialName: 'Bus Bar',
    checks: checks,
    aqlVerification: aqlCheck,
    cocCrossCheck: cocChecks,
    valueComparisons: valueComparisons,
    fraudDetection: fraudReport,
    cocDataSummary: cocData ? {
      widthSpec: cocData.widthSpec,
      thicknessSpec: cocData.thicknessSpec,
      derivedRanges: cocData.derivedRanges,
      totalWeight: cocData.totalWeight,
      certificateNo: cocData.certificateNo,
      allJudgmentsOK: cocData.allJudgmentsOK,
    } : null,
    summary: {
      totalChecks: checks.length,
      passed: passCount,
      failed: failCount,
      warnings: warningCount,
      cocMismatches: cocMismatches,
      cocDeviations: cocDeviations,
      cocChecksTotal: cocChecks.length,
      fraudScore: fraudReport.overallScore,
      inspectorTested: fraudReport.inspectorTested,
    },
    overallResult: finalResult,
    overallMessage: finalMessage,
    timestamp: new Date().toISOString(),
  };
}

module.exports = {
  BUS_BAR_SPECS: BUS_BAR_SPECS,
  getAQLSampleSize: getAQLSampleSize,
  parseIQCBusBarReport: parseIQCBusBarReport,
  parseCOCDocument: parseCOCDocument,
  verifyBusBar: verifyBusBar,
  analyzeMeasurementAuthenticity: analyzeMeasurementAuthenticity,
  generateFraudReport: generateFraudReport,
};
