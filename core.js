/* ===== Stock Dashboard Core Engine v2.4.1 ===== */
/* Bug fixes: ASP YoY editor, FY35 editing, interpolation toggle behavior */
(function () {
  "use strict";

  var CFG = window.TICKER_CONFIG;
  if (!CFG) { throw new Error("TICKER_CONFIG not loaded"); }

  var CURRENT_PRICE = CFG.currentPrice;

  // ========== LIVE PRICE SYNC ==========
  var _livepriceInitDone = false;
  function syncLivePrice() {
    var ticker = CFG.ticker || "BLLN";
    fetch("/api/quote/" + ticker)
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (data && data.price) {
          CURRENT_PRICE = data.price;
          CFG.currentPrice = data.price;
          setText("headerPrice", "$" + CURRENT_PRICE.toFixed(2));
          setText("heroCurrentPrice", "$" + CURRENT_PRICE.toFixed(2));
          setText("kpiCurrentPrice", "$" + CURRENT_PRICE.toFixed(2));
          // Only re-render after init is done (avoid double-render on first load)
          if (_livepriceInitDone) {
            updateUI();
          }
        }
      })
      .catch(function () { /* silently fail */ });
  }

  // Run on load (initial sync)
  syncLivePrice();
  // Periodic update every 5 minutes
  setInterval(syncLivePrice, 300000);
  var YEARS = CFG.years;
  var YEAR_COUNT = YEARS.length;
  var ACTUALS = CFG.actuals;
  var SCHEDULE = CFG.schedule;
  var INCREMENTS = CFG.increments;
  var BOUNDS = CFG.bounds;
  var CASH_EQUIVALENTS = CFG.cashEquivalents;
  var DEBT_OUTSTANDING = CFG.debtOutstanding;

  // ========== REVENUE DRIVER LABELS (configurable per ticker) ==========
  var RD_LABELS = CFG.revenueDriverLabels || {};
  var RD_VOL_LABEL   = RD_LABELS.volumeLabel   || "Tests (K)";
  var RD_VOL_YOY     = RD_LABELS.volumeYoYLabel || "Tests YoY %";
  var RD_ASP_LABEL   = RD_LABELS.aspLabel       || "ASP";
  var RD_ASP_YOY     = RD_LABELS.aspYoYLabel    || "ASP YoY %";
  var RD_VOL_COMMENT = RD_LABELS.volumeYoYCommentary || "YoY volume growth rate. When interpolation is off, edit each year independently.";
  var RD_ASP_COMMENT = RD_LABELS.aspYoYCommentary    || "ASP year-over-year growth. Editing adjusts underlying ASP anchor values.";
  var RD_ASP_HINT    = RD_LABELS.aspHintPrefix       || "ASP";
  var RD_HIDE_ASP    = RD_LABELS.hideAspRows === true;

  // ========== STATE ==========
  var defaults = {};
  for (var dk in CFG.defaults) {
    if (CFG.defaults.hasOwnProperty(dk)) {
      defaults[dk] = CFG.defaults[dk];
    }
  }

  var state = {};
  for (var sk in defaults) {
    if (defaults.hasOwnProperty(sk)) {
      state[sk] = defaults[sk];
    }
  }

  var currentScenario = "base";
  var scenarioCache = []; // [{name, impliedPrice, caseType}]

  // Settings (not saved in scenarios)
  var settings = {
    dcfBaseYear: 2,  // index into YEARS array: 2 = FY27E (default)
    decayStartYear: 2, // index into YEARS: 2 = FY27E (default). Decay applies from this year onward.
    peGrowthThreshold: 8, // % revenue growth that triggers P/E convergence (default 8)
    peMultiple: 20,       // P/E multiple applied at convergence (default 20x)
    valuationMode: "blended", // "blended" (avg DCF+PE), "dcf" (DCF only), "pe" (PE only)
    revenueDriverMode: "decay" // "decay" (growth rate decay) or "buildup" (detailed segment buildup from Revenue tab)
  };

  // ========== EDITABLE METRICS CONFIG ==========
  // Each metric defines how it maps to state and how editing works.
  // statePrefix: base name for per-year state keys (e.g., "gm" -> "gm_y1", "gm_y2", ... "gm_y10")
  // key26/key35: legacy anchor state keys used in lerp mode
  // lerpDefault: initial lerp mode (true = interpolation on by default)
  // getModelVal(i, t): function to compute value at year index i with lerp parameter t,
  //   only used in lerp mode. In manual mode, per-year state values are used directly.
  var EDITABLE_METRICS = {
    grossMargin: {
      label: "Gross Margin",
      statePrefix: "gm",
      key26: "gm26", key35: "gm35",
      suffix: "%", displayMul: 100, stateMul: 0.01,
      lerpDefault: true,
      commentary: "Gross margin from FY26 to FY35. Interpolates between endpoints."
    },
    opexPct: {
      label: "OpEx % of Rev",
      statePrefix: "opex",
      key26: "opex26", key35: "opex35",
      suffix: "%", displayMul: 100, stateMul: 0.01,
      lerpDefault: true,
      commentary: "Total operating expenses as % of revenue."
    },
    rdPct: {
      label: "R&D % of Rev",
      statePrefix: "rd",
      key26: "rdPct26", key35: "rdPct35",
      suffix: "%", displayMul: 100, stateMul: 0.01,
      lerpDefault: true,
      commentary: "R&D spending as % of revenue."
    },
    sbcPct: {
      label: "SBC % of Rev",
      statePrefix: "sbc",
      key26: "sbcPct26", key35: "sbcPct35",
      suffix: "%", displayMul: 100, stateMul: 0.01,
      lerpDefault: true,
      commentary: "Stock-based compensation as % of revenue. Deducted from EBIT in Adj FCF."
    },
    daPct: {
      label: "D&A % of Rev",
      statePrefix: "da",
      key26: "daPct26", key35: "daPct35",
      suffix: "%", displayMul: 100, stateMul: 0.01,
      lerpDefault: true,
      commentary: "Depreciation & amortization as % of revenue."
    },
    capexPct: {
      label: "CapEx % of Rev",
      statePrefix: "capex",
      key26: "capexPct26", key35: "capexPct35",
      suffix: "%", displayMul: 100, stateMul: 0.01,
      lerpDefault: true,
      commentary: "Capital expenditures as % of revenue."
    },
    shares: {
      label: "Shares (M)",
      statePrefix: "shares",
      key26: "shares26", key35: "shares35",
      suffix: "M", displayMul: 0.001, stateMul: 1000,
      lerpDefault: true,
      commentary: "Diluted shares outstanding in millions."
    },
    taxRate: {
      label: "Tax Rate",
      statePrefix: "tax",
      key26: null, key35: "taxRate",
      suffix: "%", displayMul: 100, stateMul: 0.01,
      lerpDefault: true,
      commentary: "Long-term tax rate. Ramps from ~5% (NOL) to this rate by FY30."
    },
    testsYoY: {
      label: RD_VOL_YOY,
      statePrefix: "testsYoY",
      key26: "volGrowth", key35: "volGrowth35",
      suffix: "%", displayMul: 1, stateMul: 1,
      isVolGrowth: true,
      lerpDefault: false,
      commentary: RD_VOL_COMMENT
    },
    aspYoY: {
      label: RD_ASP_YOY,
      statePrefix: "aspYoY",
      key26: "asp26", key35: "asp35",
      suffix: "%", displayMul: 1, stateMul: 1,
      isAspYoY: true,
      lerpDefault: true,
      commentary: RD_ASP_COMMENT
    }
  };

  // ========== LERP MODE STATE ==========
  // lerpMode[metricKey] = true (interpolate) or false (per-year manual)
  var lerpMode = {};
  for (var mk in EDITABLE_METRICS) {
    if (EDITABLE_METRICS.hasOwnProperty(mk)) {
      lerpMode[mk] = EDITABLE_METRICS[mk].lerpDefault;
    }
  }

  // Per-year override values: perYear[metricKey] = [null, val1, val2, ..., val10]
  // Index 0 = actuals (always null), indices 1-10 = FY26-FY35
  var perYear = {};

  // ========== HELPERS ==========
  function fmt(val, type) {
    if (val === null || val === undefined || isNaN(val)) return "\u2014";
    switch (type) {
      case "dollar":
        return "$" + Math.round(val).toLocaleString("en-US");
      case "dollarM":
        return "$" + (val / 1000).toFixed(0) + "M";
      case "dollarMdec":
        return "$" + (val / 1000).toFixed(1) + "M";
      case "pct":
        return (val * 100).toFixed(1) + "%";
      case "pctInt":
        return Math.round(val * 100) + "%";
      case "eps":
        return "$" + val.toFixed(2);
      case "price":
        return "$" + val.toFixed(0);
      case "priceDecimal":
        return "$" + val.toFixed(2);
      case "multiple":
        return val.toFixed(1) + "x";
      default:
        return String(val);
    }
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function clamp(val, min, max) {
    return Math.min(max, Math.max(min, val));
  }

  function roundPrecision(val, step) {
    var stepStr = step.toString();
    var decimalIdx = stepStr.indexOf(".");
    var decimals = decimalIdx >= 0 ? stepStr.length - decimalIdx - 1 : 0;
    var factor = Math.pow(10, Math.max(decimals, 1));
    return Math.round(val * factor) / factor;
  }

  // Get the interpolated value for a metric at year index i using anchor state keys
  function getLerpVal(metric, i) {
    var t = (i - 1) / 9;
    var v26, v35;

    if (metric.isVolGrowth) {
      // Volume growth: lerp between FY26 growth and FY35 terminal growth
      v26 = state[metric.key26]; // volGrowth
      v35 = state[metric.key35]; // volGrowth35
      return lerp(v26, v35, t);
    }

    if (metric.isAspYoY) {
      // ASP: lerp between anchor $ values
      return lerp(state.asp26, state.asp35, t);
    }

    if (metric.key26 && metric.key35) {
      v26 = state[metric.key26];
      v35 = state[metric.key35];
    } else if (metric.key26 && !metric.key35) {
      v26 = state[metric.key26];
      v35 = v26;
    } else if (!metric.key26 && metric.key35) {
      // Tax rate style: ramps to LT value
      v35 = state[metric.key35];
      return v35;
    } else {
      return 0;
    }

    return lerp(v26, v35, t);
  }

  // Snapshot current model values into per-year array for a metric.
  // If existingArr is provided, use it as base (preserves manual edits).
  function initPerYearFromLerp(metricKey, existingArr) {
    var metric = EDITABLE_METRICS[metricKey];
    if (!metric) return;

    // If we have an existing array, keep it — no recompute needed
    if (existingArr) {
      perYear[metricKey] = existingArr;
      return;
    }

    var arr = [null]; // index 0 = actuals

    if (metric.isVolGrowth) {
      // Store YoY growth % per year from the current lerp trajectory
      var savedMode = lerpMode[metricKey];
      lerpMode[metricKey] = true;
      var tempData = runModel();
      lerpMode[metricKey] = savedMode;
      for (var i = 1; i <= 10; i++) {
        arr.push(tempData.testsYoY[i] !== null ? roundPrecision(tempData.testsYoY[i] * 100, 0.1) : 0);
      }
    } else if (metric.isAspYoY) {
      // Store ASP YoY % per year from the current lerp trajectory
      var savedMode2 = lerpMode[metricKey];
      lerpMode[metricKey] = true;
      var tempData2 = runModel();
      lerpMode[metricKey] = savedMode2;
      for (var j = 1; j <= 10; j++) {
        var yoy = tempData2.aspYoY[j];
        arr.push(yoy !== null ? roundPrecision(yoy * 100, 0.1) : 0);
      }
    } else {
      // Standard metric: store the display-unit value (e.g., 74.7 for 74.7%)
      for (var k = 1; k <= 10; k++) {
        var val = getLerpVal(metric, k);
        var inc = getIncrementForMetric(metricKey, k);
        arr.push(roundPrecision(val, inc || 0.1));
      }
    }

    perYear[metricKey] = arr;
  }

  // Get increment for a metric at a specific year
  function getIncrementForMetric(metricKey, yearIndex) {
    var metric = EDITABLE_METRICS[metricKey];
    if (!metric) return 1;

    if (metric.isVolGrowth) {
      return INCREMENTS.volGrowth || 2;
    }
    if (metric.isAspYoY) {
      return 1; // YoY% increments of 1pp
    }

    // For standard metrics, use the near-term increment
    if (metric.key26 && INCREMENTS[metric.key26]) {
      return INCREMENTS[metric.key26];
    }
    if (metric.key35 && INCREMENTS[metric.key35]) {
      return INCREMENTS[metric.key35];
    }
    return 1;
  }

  // Get bounds for a metric at a specific year
  function getBoundsForMetric(metricKey, yearIndex) {
    var metric = EDITABLE_METRICS[metricKey];
    if (!metric) return null;

    if (metric.isVolGrowth) {
      // In per-year mode, allow wider bounds for YoY growth
      return { min: -10, max: 100 };
    }
    if (metric.isAspYoY) {
      return { min: -20, max: 50 }; // YoY% bounds
    }

    // Use the widest bounds available (union of key26 and key35 bounds)
    var b26 = metric.key26 ? BOUNDS[metric.key26] : null;
    var b35 = metric.key35 ? BOUNDS[metric.key35] : null;
    if (b26 && b35) {
      return { min: Math.min(b26.min, b35.min), max: Math.max(b26.max, b35.max) };
    }
    return b26 || b35 || null;
  }

  // ========== FINANCIAL MODEL ==========
  function runModel() {
    // Read values per-year from either lerp or manual overrides
    function getVal(metricKey, yearIndex) {
      if (lerpMode[metricKey] !== false) {
        // Lerp mode: compute from anchor state
        return getLerpVal(EDITABLE_METRICS[metricKey], yearIndex);
      }
      // Manual mode: read from perYear
      if (perYear[metricKey] && perYear[metricKey][yearIndex] !== undefined && perYear[metricKey][yearIndex] !== null) {
        return perYear[metricKey][yearIndex];
      }
      // Fallback to lerp
      return getLerpVal(EDITABLE_METRICS[metricKey], yearIndex);
    }

    var data = {
      year: YEARS,
      tests: new Array(YEAR_COUNT),
      asp: new Array(YEAR_COUNT),
      revenue: new Array(YEAR_COUNT),
      revYoY: new Array(YEAR_COUNT),
      cogs: new Array(YEAR_COUNT),
      grossProfit: new Array(YEAR_COUNT),
      grossMargin: new Array(YEAR_COUNT),
      rd: new Array(YEAR_COUNT),
      rdPct: new Array(YEAR_COUNT),
      sga: new Array(YEAR_COUNT),
      totalOpEx: new Array(YEAR_COUNT),
      opexPct: new Array(YEAR_COUNT),
      opIncome: new Array(YEAR_COUNT),
      opMargin: new Array(YEAR_COUNT),
      otherIncome: new Array(YEAR_COUNT),
      preTaxIncome: new Array(YEAR_COUNT),
      tax: new Array(YEAR_COUNT),
      taxRate: new Array(YEAR_COUNT),
      netIncome: new Array(YEAR_COUNT),
      netMargin: new Array(YEAR_COUNT),
      shares: new Array(YEAR_COUNT),
      eps: new Array(YEAR_COUNT),
      da: new Array(YEAR_COUNT),
      daPct: new Array(YEAR_COUNT),
      sbc: new Array(YEAR_COUNT),
      sbcPct: new Array(YEAR_COUNT),
      capex: new Array(YEAR_COUNT),
      capexPct: new Array(YEAR_COUNT),
      wcChange: new Array(YEAR_COUNT),
      ebit: new Array(YEAR_COUNT),
      ufcf: new Array(YEAR_COUNT),
      fcfMargin: new Array(YEAR_COUNT),
      testsYoY: new Array(YEAR_COUNT),
      aspYoY: new Array(YEAR_COUNT),
      consensusRevenue: new Array(YEAR_COUNT),
      revGrowthDecay: new Array(YEAR_COUNT),
      fcfPreSBC: new Array(YEAR_COUNT),
      fcfMarginPreSBC: new Array(YEAR_COUNT)
    };

    // Actuals (index 0)
    data.tests[0] = ACTUALS.tests || null;
    data.asp[0] = ACTUALS.asp || null;
    data.revenue[0] = ACTUALS.revenue;
    data.revYoY[0] = null;
    data.cogs[0] = ACTUALS.cogs;
    data.grossProfit[0] = ACTUALS.grossProfit;
    data.grossMargin[0] = ACTUALS.grossMargin;
    data.rd[0] = ACTUALS.rd;
    data.rdPct[0] = ACTUALS.rd / ACTUALS.revenue;
    data.sga[0] = ACTUALS.sga;
    data.totalOpEx[0] = ACTUALS.rd + ACTUALS.sga;
    data.opexPct[0] = (ACTUALS.rd + ACTUALS.sga) / ACTUALS.revenue;
    data.opIncome[0] = ACTUALS.opIncome;
    data.opMargin[0] = ACTUALS.opIncome / ACTUALS.revenue;
    data.otherIncome[0] = ACTUALS.otherIncome;
    data.preTaxIncome[0] = ACTUALS.opIncome + ACTUALS.otherIncome;
    data.tax[0] = ACTUALS.tax;
    data.taxRate[0] = ACTUALS.tax / Math.max(1, data.preTaxIncome[0]);
    data.netIncome[0] = ACTUALS.netIncome;
    data.netMargin[0] = ACTUALS.netIncome / ACTUALS.revenue;
    data.shares[0] = ACTUALS.shares;
    data.eps[0] = ACTUALS.eps;
    data.da[0] = ACTUALS.da;
    data.daPct[0] = ACTUALS.da / ACTUALS.revenue;
    data.sbc[0] = ACTUALS.sbc;
    data.sbcPct[0] = ACTUALS.sbc / ACTUALS.revenue;
    data.capex[0] = ACTUALS.capex;
    data.capexPct[0] = Math.abs(ACTUALS.capex) / ACTUALS.revenue;
    data.wcChange[0] = ACTUALS.wcChange;
    data.ebit[0] = ACTUALS.opIncome;
    data.ufcf[0] = null;
    data.fcfMargin[0] = null;
    data.testsYoY[0] = null;
    data.aspYoY[0] = null;
    data.consensusRevenue[0] = (CFG.consensusRevenue && CFG.consensusRevenue[0]) ? CFG.consensusRevenue[0] : null;
    data.revGrowthDecay[0] = null;
    data.fcfPreSBC[0] = null;
    data.fcfMarginPreSBC[0] = null;

    // Projections
    for (var i = 1; i <= 10; i++) {
      var t = (i - 1) / 9;

      // ---- Tests ----
      if (lerpMode.testsYoY !== false) {
        // Lerp mode: interpolate growth rate between FY26 and FY35
        var growthPct = lerp(state.volGrowth, state.volGrowth35, t);
        data.tests[i] = data.tests[i - 1] * (1 + growthPct / 100);
      } else {
        // Manual mode: apply per-year YoY growth rates
        var yoyGrowth = (perYear.testsYoY && perYear.testsYoY[i] !== undefined && perYear.testsYoY[i] !== null)
          ? perYear.testsYoY[i] / 100
          : 0;
        data.tests[i] = data.tests[i - 1] * (1 + yoyGrowth);
      }

      // ---- ASP ----
      if (lerpMode.aspYoY !== false) {
        data.asp[i] = lerp(state.asp26, state.asp35, t);
      } else {
        // Manual mode: apply per-year YoY growth rates
        var aspYoYPct = (perYear.aspYoY && perYear.aspYoY[i] !== undefined && perYear.aspYoY[i] !== null)
          ? perYear.aspYoY[i] / 100
          : 0;
        data.asp[i] = data.asp[i - 1] * (1 + aspYoYPct);
      }

      data.revenue[i] = data.tests[i] * data.asp[i];

      // Revenue Buildup Override: when in "buildup" mode, override revenue
      // from the detailed segment build (Electron + Neutron + Space Systems)
      if (settings.revenueDriverMode === "buildup" && window._revBuildupTotals && window._revBuildupTotals[i]) {
        data.revenue[i] = window._revBuildupTotals[i];
        data.tests[i] = data.revenue[i]; // keep tests in sync (since asp = 1)
      }

      data.revYoY[i] = (data.revenue[i] / data.revenue[i - 1]) - 1;

      // ---- Gross Margin ----
      var gmVal = getVal("grossMargin", i);
      data.grossMargin[i] = gmVal / 100;
      data.cogs[i] = data.revenue[i] * (1 - data.grossMargin[i]);
      data.grossProfit[i] = data.revenue[i] - data.cogs[i];

      // ---- OpEx ----
      var opexVal = getVal("opexPct", i);
      data.opexPct[i] = opexVal / 100;
      data.totalOpEx[i] = data.revenue[i] * data.opexPct[i];

      // ---- R&D ----
      var rdVal = getVal("rdPct", i);
      data.rdPct[i] = rdVal / 100;
      data.rd[i] = data.revenue[i] * data.rdPct[i];
      data.sga[i] = data.totalOpEx[i] - data.rd[i];

      data.opIncome[i] = data.grossProfit[i] - data.totalOpEx[i];
      data.opMargin[i] = data.opIncome[i] / data.revenue[i];

      data.otherIncome[i] = SCHEDULE.otherIncome[i - 1];
      data.preTaxIncome[i] = data.opIncome[i] + data.otherIncome[i];

      // ---- Tax Rate ----
      if (lerpMode.taxRate !== false) {
        var ltTaxRate = state.taxRate / 100;
        if (i <= 5) {
          data.taxRate[i] = lerp(0.05, ltTaxRate, (i - 1) / 4);
        } else {
          data.taxRate[i] = ltTaxRate;
        }
      } else {
        var taxVal = getVal("taxRate", i);
        data.taxRate[i] = taxVal / 100;
      }
      data.tax[i] = Math.max(0, data.preTaxIncome[i] * data.taxRate[i]);

      data.netIncome[i] = data.preTaxIncome[i] - data.tax[i];
      data.netMargin[i] = data.netIncome[i] / data.revenue[i];

      // ---- Shares ----
      if (lerpMode.shares !== false) {
        data.shares[i] = lerp(state.shares26 * 1000, state.shares35 * 1000, t);
      } else {
        var sharesVal = getVal("shares", i);
        data.shares[i] = sharesVal * 1000;
      }
      data.eps[i] = data.netIncome[i] / data.shares[i];

      // ---- D&A ----
      var daVal = getVal("daPct", i);
      data.daPct[i] = daVal / 100;
      data.da[i] = data.revenue[i] * data.daPct[i];

      // ---- SBC ----
      var sbcVal = getVal("sbcPct", i);
      data.sbcPct[i] = sbcVal / 100;
      data.sbc[i] = data.revenue[i] * data.sbcPct[i];

      // ---- CapEx ----
      var capexVal = getVal("capexPct", i);
      data.capexPct[i] = capexVal / 100;
      data.capex[i] = -(data.revenue[i] * data.capexPct[i]);

      data.wcChange[i] = SCHEDULE.wcChange[i - 1];
      data.ebit[i] = data.opIncome[i];

      var ebitMinusSbc = data.ebit[i] - data.sbc[i];
      data.ufcf[i] = ebitMinusSbc * (1 - data.taxRate[i]) + data.da[i] + data.capex[i] + data.wcChange[i];
      data.fcfMargin[i] = data.ufcf[i] / data.revenue[i];

      // Computed YoY
      data.testsYoY[i] = (data.tests[i] / data.tests[i - 1]) - 1;
      data.aspYoY[i] = (data.asp[i] / data.asp[i - 1]) - 1;
      data.consensusRevenue[i] = (CFG.consensusRevenue && CFG.consensusRevenue[i]) ? CFG.consensusRevenue[i] : null;

      // Rev Growth Decay: revYoY[i] / revYoY[i-1] (only if both are positive)
      if (i >= 2 && data.revYoY[i] > 0 && data.revYoY[i - 1] > 0) {
        data.revGrowthDecay[i] = data.revYoY[i] / data.revYoY[i - 1];
      } else {
        data.revGrowthDecay[i] = null;
      }

      // FCF Pre-SBC: Adj FCF + after-tax SBC add-back
      data.fcfPreSBC[i] = data.ufcf[i] + data.sbc[i] * (1 - data.taxRate[i]);
      data.fcfMarginPreSBC[i] = data.fcfPreSBC[i] / data.revenue[i];
    }

    return data;
  }

  // ========== VALUATION YIELD ==========
  function calcMonopolyPremium() {
    return state.hasPricingPower ? 0.15 : 0;
  }

  function calcLongTermValuationYield(finalYearRevenueGrowth) {
    var x = finalYearRevenueGrowth;
    var baseValue = (9.2 - ((x * 100) * 0.56)) / 100;
    var adjusted = baseValue * (1 - calcMonopolyPremium());
    return Math.max(0.02, Math.min(0.12, adjusted));
  }

  // ========== DCF ==========
  function runDCF(data, discountRateOverride) {
    var discountRate = discountRateOverride !== undefined ? discountRateOverride : state.discountRate / 100;
    var baseYr = settings.dcfBaseYear; // 1 = FY26E (default)

    var sumPVFCF = 0;
    var pvFCFs = [];
    for (var i = baseYr; i <= 10; i++) {
      var pvi = i - baseYr + 1;
      var pv = data.ufcf[i] / Math.pow(1 + discountRate, pvi);
      pvFCFs.push(pv);
      sumPVFCF += pv;
    }

    var lastFCF = data.ufcf[10];
    var finalRevGrowth = data.revYoY[10];
    var longTermYield = calcLongTermValuationYield(finalRevGrowth);
    var termYearsOut = 10 - baseYr + 1;
    var terminalFutureValue = lastFCF / longTermYield;
    var pvTV = terminalFutureValue / Math.pow(1 + discountRate, termYearsOut);

    var ev = sumPVFCF + pvTV;
    var equityValue = ev - DEBT_OUTSTANDING + CASH_EQUIVALENTS;
    var sharesForPrice = data.shares[baseYr] || data.shares[1];
    var impliedPrice = equityValue / sharesForPrice;
    var upside = (impliedPrice / CURRENT_PRICE) - 1;

    return {
      sumPVFCF: sumPVFCF,
      pvFCFs: pvFCFs,
      terminalFutureValue: terminalFutureValue,
      pvTV: pvTV,
      ev: ev,
      debt: DEBT_OUTSTANDING,
      cash: CASH_EQUIVALENTS,
      equityValue: equityValue,
      impliedPrice: impliedPrice,
      upside: upside,
      sharesForPrice: sharesForPrice,
      lastFCF: lastFCF,
      longTermYield: longTermYield,
      discountRate: discountRate,
      monopolyPremium: calcMonopolyPremium(),
      dcfBaseYear: baseYr
    };
  }

  // ========== P/E VALUATION ==========
  // Methodology:
  // 1. Find the first projection year where revenue growth falls below 8% (S&P 500 avg)
  // 2. Apply a 20x P/E multiple (S&P 500 average) to that year's EPS
  // 3. Discount that future price back to present value
  // 4. If revenue growth never falls below 8%, PE valuation is N/A
  function runPEValuation(data, discountRateOverride) {
    var discountRate = discountRateOverride !== undefined ? discountRateOverride : state.discountRate / 100;
    var SP500_GROWTH_THRESHOLD = settings.peGrowthThreshold / 100; // e.g. 8 -> 0.08
    var SP500_PE_MULTIPLE = settings.peMultiple; // e.g. 20

    // Find first year where revenue growth < threshold
    var convergenceYear = null;
    var convergenceIndex = null;
    for (var i = 1; i <= 10; i++) {
      if (data.revYoY[i] !== null && data.revYoY[i] < SP500_GROWTH_THRESHOLD) {
        convergenceYear = YEARS[i];
        convergenceIndex = i;
        break;
      }
    }

    // If growth never drops below threshold, PE valuation is not applicable
    if (convergenceIndex === null) {
      return {
        applicable: false,
        convergenceYear: null,
        convergenceIndex: null,
        targetEPS: null,
        revGrowthAtConvergence: null,
        futurePrice: null,
        impliedPrice: null,
        upside: null,
        discountRate: discountRate,
        peMultiple: SP500_PE_MULTIPLE,
        growthThreshold: SP500_GROWTH_THRESHOLD,
        yearsToDiscount: null
      };
    }

    var targetEPS = data.eps[convergenceIndex];
    var futurePrice = targetEPS * SP500_PE_MULTIPLE;
    var yearsToDiscount = convergenceIndex; // number of years from now
    var pvEarningsPrice = futurePrice / Math.pow(1 + discountRate, yearsToDiscount);

    // Net cash/debt at convergence year:
    // Start with current balance sheet, accumulate Adj FCF (ufcf) each year
    var futureNetCash = CASH_EQUIVALENTS - DEBT_OUTSTANDING; // starting net cash ($K)
    for (var ci = 1; ci <= convergenceIndex; ci++) {
      futureNetCash += (data.ufcf[ci] || 0);
    }
    var sharesAtConv = data.shares[convergenceIndex] || data.shares[1];
    var futureNetCashPerShare = futureNetCash / sharesAtConv;
    var pvNetCashPerShare = futureNetCashPerShare / Math.pow(1 + discountRate, yearsToDiscount);

    var impliedPrice = pvEarningsPrice + pvNetCashPerShare;
    var upside = (impliedPrice / CURRENT_PRICE) - 1;

    return {
      applicable: true,
      convergenceYear: convergenceYear,
      convergenceIndex: convergenceIndex,
      targetEPS: targetEPS,
      revGrowthAtConvergence: data.revYoY[convergenceIndex],
      futurePrice: futurePrice,
      pvEarningsPrice: pvEarningsPrice,
      futureNetCash: futureNetCash,
      futureNetCashPerShare: futureNetCashPerShare,
      pvNetCashPerShare: pvNetCashPerShare,
      impliedPrice: impliedPrice,
      upside: upside,
      discountRate: discountRate,
      peMultiple: SP500_PE_MULTIPLE,
      growthThreshold: SP500_GROWTH_THRESHOLD,
      yearsToDiscount: yearsToDiscount,
      netIncome: data.netIncome[convergenceIndex],
      shares: data.shares[convergenceIndex],
      revenue: data.revenue[convergenceIndex],
      revGrowthPath: (function () {
        var path = [];
        for (var j = 1; j <= 10; j++) {
          path.push({
            year: YEARS[j],
            index: j,
            revGrowth: data.revYoY[j],
            eps: data.eps[j],
            belowThreshold: data.revYoY[j] !== null && data.revYoY[j] < SP500_GROWTH_THRESHOLD
          });
        }
        return path;
      })()
    };
  }

  // Compute blended valuation: average of DCF and PE (if applicable)
  function computeBlendedPrice(dcf, pe) {
    var mode = settings.valuationMode || "blended";
    var peApplicable = pe && pe.applicable;
    var dcfP = dcf.impliedPrice;
    var peP = peApplicable ? pe.impliedPrice : null;

    // DCF-only mode or PE not applicable
    if (mode === "dcf" || !peApplicable) {
      return { price: dcfP, isDCFOnly: true, dcfPrice: dcfP, pePrice: peP, mode: "dcf" };
    }
    // PE-only mode
    if (mode === "pe") {
      return { price: peP, isDCFOnly: false, dcfPrice: dcfP, pePrice: peP, mode: "pe" };
    }
    // Blended (default)
    var avg = (dcfP + peP) / 2;
    return { price: avg, isDCFOnly: false, dcfPrice: dcfP, pePrice: peP, mode: "blended" };
  }

  // ========== PE VALUATION RENDER ==========
  function renderPEValuation(data, pe, dcf) {
    var container = document.getElementById("peSummary");
    if (!container) return;

    var html = "";

    if (!pe.applicable) {
      html += '<div class="pe-not-applicable">';
      html += '<div class="pe-na-icon">';
      html += '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.4"><circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/></svg>';
      html += '</div>';
      html += '<div class="pe-na-title">P/E Valuation Not Applicable</div>';
      html += '<div class="pe-na-reason">Revenue growth does not fall below ' + (pe.growthThreshold * 100).toFixed(0) + '% within the forecast window (FY26\u2013FY35). ';
      html += 'The company has not yet converged to S&P 500 growth rates, so applying an S&P-level P/E multiple would be premature.</div>';
      html += '</div>';
      container.innerHTML = html;
      return;
    }

    var blended = computeBlendedPrice(dcf, pe);

    // Hero: PE Implied Price
    html += '<div class="dcf-implied-price">';
    html += '<div class="dcf-implied-label">P/E Implied Price</div>';
    html += '<div class="dcf-implied-value">' + fmt(pe.impliedPrice, "priceDecimal") + '</div>';
    var upsideStr = (pe.upside >= 0 ? "+" : "") + fmt(pe.upside, "pct");
    var upsideCls = pe.upside >= 0 ? "positive" : "negative";
    html += '<div class="dcf-upside ' + upsideCls + '">' + upsideStr + ' vs $' + CURRENT_PRICE.toFixed(2) + '</div>';
    html += '</div>';

    // Methodology explanation
    html += '<div class="pe-methodology">';
    html += '<div class="pe-method-title">Methodology</div>';
    html += '<div class="pe-method-steps">';
    html += '<div class="pe-step">';
    html += '<span class="pe-step-num">1</span>';
    html += '<span class="pe-step-text">Find the first year revenue growth falls below ' + (pe.growthThreshold * 100).toFixed(0) + '% (S&P 500 avg growth rate)</span>';
    html += '</div>';
    html += '<div class="pe-step">';
    html += '<span class="pe-step-num">2</span>';
    html += '<span class="pe-step-text">Apply ' + pe.peMultiple + 'x P/E (S&P 500 avg) to that year\u2019s EPS</span>';
    html += '</div>';
    html += '<div class="pe-step">';
    html += '<span class="pe-step-num">3</span>';
    html += '<span class="pe-step-text">Estimate net cash at convergence (starting balance + cumulative Adj FCF)</span>';
    html += '</div>';
    html += '<div class="pe-step">';
    html += '<span class="pe-step-num">4</span>';
    html += '<span class="pe-step-text">Discount earnings-based price + net cash per share back to today at ' + (pe.discountRate * 100).toFixed(0) + '% discount rate</span>';
    html += '</div>';
    html += '</div>';
    html += '</div>';

    // Detail grid
    html += '<div class="dcf-detail-grid">';
    html += '<div class="dcf-detail-item"><span class="dcf-detail-label">Convergence Year</span><span class="dcf-detail-val pe-highlight">' + pe.convergenceYear + '</span></div>';
    html += '<div class="dcf-detail-item"><span class="dcf-detail-label">Rev Growth at Convergence</span><span class="dcf-detail-val">' + (pe.revGrowthAtConvergence * 100).toFixed(1) + '%</span></div>';
    html += '<div class="dcf-detail-item"><span class="dcf-detail-label">EPS at ' + pe.convergenceYear + '</span><span class="dcf-detail-val">' + fmt(pe.targetEPS, "eps") + '</span></div>';
    html += '<div class="dcf-detail-item"><span class="dcf-detail-label">P/E Multiple Applied</span><span class="dcf-detail-val">' + pe.peMultiple + 'x</span></div>';
    html += '<div class="dcf-detail-item"><span class="dcf-detail-label">Future Share Price (' + pe.convergenceYear + ')</span><span class="dcf-detail-val">' + fmt(pe.futurePrice, "priceDecimal") + '</span></div>';
    var netCashLabel = pe.futureNetCash >= 0 ? 'Net Cash at ' + pe.convergenceYear : 'Net Debt at ' + pe.convergenceYear;
    html += '<div class="dcf-detail-item"><span class="dcf-detail-label">' + netCashLabel + '</span><span class="dcf-detail-val">' + fmt(Math.abs(pe.futureNetCash), "dollarM") + '</span></div>';
    html += '<div class="dcf-detail-item"><span class="dcf-detail-label">' + (pe.futureNetCash >= 0 ? 'Net Cash' : 'Net Debt') + '/Share</span><span class="dcf-detail-val">' + fmt(pe.futureNetCashPerShare, "priceDecimal") + '</span></div>';
    html += '<div class="dcf-detail-item"><span class="dcf-detail-label">Years Discounted</span><span class="dcf-detail-val">' + pe.yearsToDiscount + '</span></div>';
    html += '<div class="dcf-detail-item"><span class="dcf-detail-label">Discount Rate</span><span class="dcf-detail-val">' + (pe.discountRate * 100).toFixed(0) + '%</span></div>';
    html += '</div>';

    // EV bridge-style build
    html += '<div class="dcf-row dcf-divider">';
    html += '<span class="dcf-row-label">EPS \u00D7 P/E Multiple</span>';
    html += '<span class="dcf-row-value">' + fmt(pe.targetEPS, "eps") + ' \u00D7 ' + pe.peMultiple + 'x = ' + fmt(pe.futurePrice, "priceDecimal") + '</span>';
    html += '</div>';
    html += '<div class="dcf-row">';
    html += '<span class="dcf-row-label">PV of Earnings Price</span>';
    html += '<span class="dcf-row-value">' + fmt(pe.futurePrice, "priceDecimal") + ' \u00F7 (1 + ' + (pe.discountRate * 100).toFixed(0) + '%)<sup>' + pe.yearsToDiscount + '</sup> = ' + fmt(pe.pvEarningsPrice, "priceDecimal") + '</span>';
    html += '</div>';
    var ncSign = pe.futureNetCashPerShare >= 0 ? '+ ' : '\u2212 ';
    html += '<div class="dcf-row">';
    html += '<span class="dcf-row-label">PV of ' + (pe.futureNetCash >= 0 ? 'Net Cash' : 'Net Debt') + '/Share</span>';
    html += '<span class="dcf-row-value">' + ncSign + fmt(Math.abs(pe.pvNetCashPerShare), "priceDecimal") + '</span>';
    html += '</div>';
    html += '<div class="dcf-row dcf-divider">';
    html += '<span class="dcf-row-label">P/E Implied Price</span>';
    html += '<span class="dcf-row-value">' + fmt(pe.pvEarningsPrice, "priceDecimal") + ' ' + ncSign + fmt(Math.abs(pe.pvNetCashPerShare), "priceDecimal") + ' = ' + fmt(pe.impliedPrice, "priceDecimal") + '</span>';
    html += '</div>';

    // Blended valuation
    html += '<div class="pe-blended-section">';
    html += '<div class="pe-blended-title">Blended Valuation</div>';
    html += '<div class="pe-blended-grid">';
    html += '<div class="pe-blend-item"><span class="pe-blend-label">DCF Implied</span><span class="pe-blend-val">' + fmt(dcf.impliedPrice, "priceDecimal") + '</span></div>';
    html += '<div class="pe-blend-item pe-blend-plus"><span>+</span></div>';
    html += '<div class="pe-blend-item"><span class="pe-blend-label">P/E Implied</span><span class="pe-blend-val">' + fmt(pe.impliedPrice, "priceDecimal") + '</span></div>';
    html += '<div class="pe-blend-item pe-blend-eq"><span>\u00F7 2 =</span></div>';
    html += '<div class="pe-blend-item pe-blend-result"><span class="pe-blend-label">Blended Target</span><span class="pe-blend-val">' + fmt(blended.price, "priceDecimal") + '</span></div>';
    html += '</div>';
    html += '</div>';

    // Revenue growth path table
    html += '<div class="pe-growth-table">';
    html += '<div class="pe-growth-title">Revenue Growth Path to Convergence</div>';
    html += '<table class="fin-table">';
    html += '<thead><tr><th></th>';
    for (var h = 0; h < pe.revGrowthPath.length; h++) {
      var hCls = pe.revGrowthPath[h].index === pe.convergenceIndex ? ' class="col-focus"' : '';
      html += '<th' + hCls + '>' + pe.revGrowthPath[h].year + '</th>';
    }
    html += '</tr></thead><tbody>';

    // Rev Growth row
    html += '<tr><td>Rev Growth</td>';
    for (var g = 0; g < pe.revGrowthPath.length; g++) {
      var gp = pe.revGrowthPath[g];
      var gCls = gp.index === pe.convergenceIndex ? 'col-focus' : '';
      if (gp.belowThreshold) gCls += ' val-negative';
      else gCls += ' val-positive';
      html += '<td class="' + gCls + '">' + (gp.revGrowth !== null ? (gp.revGrowth * 100).toFixed(1) + '%' : '\u2014') + '</td>';
    }
    html += '</tr>';

    // EPS row
    html += '<tr><td>EPS</td>';
    for (var ep = 0; ep < pe.revGrowthPath.length; ep++) {
      var epp = pe.revGrowthPath[ep];
      var eCls = epp.index === pe.convergenceIndex ? 'col-focus' : '';
      html += '<td class="' + eCls + '">' + fmt(epp.eps, "eps") + '</td>';
    }
    html += '</tr>';

    // Threshold row
    html += '<tr class="row-threshold"><td>S&P Threshold</td>';
    for (var th = 0; th < pe.revGrowthPath.length; th++) {
      html += '<td>' + (pe.growthThreshold * 100).toFixed(0) + '%</td>';
    }
    html += '</tr>';

    html += '</tbody></table></div>';

    // Footnote
    html += '<div class="dcf-footnote">';
    html += 'Once a company\u2019s revenue growth converges with the S&P 500 average (~' + (pe.growthThreshold * 100).toFixed(0) + '%), ';
    html += 'the market typically values it at a market-average P/E (~' + pe.peMultiple + 'x). ';
    html += 'The future share price at convergence is discounted back using the same discount rate as the DCF. ';
    html += 'The blended target averages the DCF and P/E valuations for a balanced view.';
    html += '</div>';

    container.innerHTML = html;
  }

  // ========== EDITABLE CELL DETECTION ==========
  function getEditableInfo(rowKey, yearIndex) {
    if (yearIndex === 0) return null; // actuals not editable

    var metric = EDITABLE_METRICS[rowKey];
    if (!metric) return null;

    var isManual = lerpMode[rowKey] === false;

    if (isManual) {
      // Manual mode: every estimate year (1-10) is editable
      return {
        metric: metric,
        metricKey: rowKey,
        stateKey: null, // will use perYear instead
        yearIndex: yearIndex,
        isPerYear: true
      };
    }

    // Lerp mode: only anchor years editable
    var stateKey = null;
    var anchor = null;

    if (metric.isVolGrowth) {
      // Volume growth: FY26 and FY35 endpoints editable in lerp mode
      if (yearIndex === 1) {
        stateKey = metric.key26;
        anchor = "near";
      } else if (yearIndex === 10 && metric.key35) {
        stateKey = metric.key35;
        anchor = "far";
      }
      return stateKey ? { metric: metric, metricKey: rowKey, stateKey: stateKey, anchor: anchor, yearIndex: yearIndex, isPerYear: false } : null;
    }

    if (metric.isAspYoY) {
      // ASP YoY: edit underlying asp26/asp35 but show as YoY%
      if (yearIndex === 1) {
        stateKey = metric.key26; // asp26
        anchor = "near";
      } else if (yearIndex === 10) {
        stateKey = metric.key35; // asp35
        anchor = "far";
      }
      return stateKey ? { metric: metric, metricKey: rowKey, stateKey: stateKey, anchor: anchor, yearIndex: yearIndex, isPerYear: false, isAspYoYEdit: true } : null;
    }

    // Standard metrics with both endpoints
    if (metric.key26 && metric.key35) {
      if (yearIndex === 1) {
        stateKey = metric.key26;
        anchor = "near";
      } else if (yearIndex === 10) {
        stateKey = metric.key35;
        anchor = "far";
      }
      return stateKey ? { metric: metric, metricKey: rowKey, stateKey: stateKey, anchor: anchor, yearIndex: yearIndex, isPerYear: false } : null;
    }

    if (metric.key26 && !metric.key35) {
      if (yearIndex === 1) {
        stateKey = metric.key26;
        anchor = "near";
      }
      return stateKey ? { metric: metric, metricKey: rowKey, stateKey: stateKey, anchor: anchor, yearIndex: yearIndex, isPerYear: false } : null;
    }

    if (!metric.key26 && metric.key35) {
      if (yearIndex === 10) {
        stateKey = metric.key35;
        anchor = "far";
      }
      return stateKey ? { metric: metric, metricKey: rowKey, stateKey: stateKey, anchor: anchor, yearIndex: yearIndex, isPerYear: false } : null;
    }

    return null;
  }

  // ========== BOTTOM SHEET EDITOR ==========
  var activeEditor = null;

  function openEditor(info) {
    var sheet = document.getElementById("editorSheet");
    var overlay = document.getElementById("editorOverlay");
    if (!sheet || !overlay) return;

    activeEditor = info;

    var metric = info.metric;
    var yearLabel = YEARS[info.yearIndex];
    var currentVal, inc, bound;

    if (info.isPerYear) {
      // Per-year mode: read from perYear array
      currentVal = perYear[info.metricKey] ? perYear[info.metricKey][info.yearIndex] : 0;
      inc = getIncrementForMetric(info.metricKey, info.yearIndex);
      bound = getBoundsForMetric(info.metricKey, info.yearIndex);
    } else if (info.isAspYoYEdit) {
      // ASP YoY lerp mode: compute YoY% from absolute ASP state values
      var aspAbs = state[info.stateKey]; // asp26 or asp35
      var prevAsp;
      if (info.anchor === "near") {
        prevAsp = ACTUALS.asp; // FY25 actual ASP
      } else {
        // For FY35: compute FY34 ASP from lerp
        prevAsp = lerp(state.asp26, state.asp35, 8 / 9);
      }
      currentVal = roundPrecision((aspAbs / prevAsp - 1) * 100, 0.1);
      inc = 1;
      bound = { min: -20, max: 50 };
    } else {
      // Lerp mode: read from state
      currentVal = state[info.stateKey];
      inc = INCREMENTS[info.stateKey];
      bound = BOUNDS[info.stateKey];
    }

    setText("editorMetricName", metric.label);
    setText("editorYearLabel", yearLabel);
    setText("editorCommentary", metric.commentary || "");

    // Show interpolation hint
    var hintEl = document.getElementById("editorHint");
    if (hintEl) {
      if (info.isAspYoYEdit) {
        // Show the other ASP endpoint's YoY%
        var otherAspKey = info.anchor === "near" ? "asp35" : "asp26";
        var otherYr = info.anchor === "near" ? YEARS[10] : YEARS[1];
        var otherPrev = info.anchor === "near" ? lerp(state.asp26, state.asp35, 8 / 9) : ACTUALS.asp;
        var otherYoY = roundPrecision((state[otherAspKey] / otherPrev - 1) * 100, 0.1);
        hintEl.textContent = "Interpolates " + RD_ASP_HINT + " to " + otherYr + ": " + otherYoY.toFixed(1) + "% YoY";
        hintEl.style.display = "";
      } else if (!info.isPerYear && metric.key26 && metric.key35) {
        var otherKey = info.anchor === "near" ? metric.key35 : metric.key26;
        var otherYear2 = info.anchor === "near" ? YEARS[10] : YEARS[1];
        var otherVal = state[otherKey];
        var suffix = metric.suffix || "";
        var prefix = metric.prefix || "";
        hintEl.textContent = "Interpolates to " + otherYear2 + ": " + prefix + formatStateVal(otherVal, inc) + suffix;
        hintEl.style.display = "";
      } else {
        hintEl.style.display = "none";
      }
    }

    var input = document.getElementById("editorInput");
    if (input) {
      input.value = formatStateVal(currentVal, inc);
      input.setAttribute("min", bound ? bound.min : "");
      input.setAttribute("max", bound ? bound.max : "");
      input.setAttribute("step", inc || 1);
    }

    // For ASP YoY edit, show % suffix regardless of metric config
    if (info.isAspYoYEdit) {
      setText("editorPrefix", "");
      setText("editorSuffix", "%");
    } else {
      setText("editorPrefix", metric.prefix || "");
      setText("editorSuffix", metric.suffix || "");
    }

    updateEditorChanged();

    overlay.classList.add("visible");
    sheet.classList.add("visible");
    document.body.classList.add("editor-open");

    setTimeout(function () {
      if (input) input.select();
    }, 200);
  }

  function closeEditor() {
    var sheet = document.getElementById("editorSheet");
    var overlay = document.getElementById("editorOverlay");
    if (sheet) sheet.classList.remove("visible");
    if (overlay) overlay.classList.remove("visible");
    document.body.classList.remove("editor-open");
    activeEditor = null;
  }

  function formatStateVal(val, inc) {
    if (inc && inc < 1) {
      return val.toFixed(1);
    } else if (Number.isInteger(val)) {
      return val.toString();
    } else {
      return val.toFixed(1);
    }
  }

  function applyEditorValue(newVal) {
    if (!activeEditor) return;

    var inc, bound;

    if (activeEditor.isPerYear) {
      inc = getIncrementForMetric(activeEditor.metricKey, activeEditor.yearIndex);
      bound = getBoundsForMetric(activeEditor.metricKey, activeEditor.yearIndex);
      if (inc) newVal = roundPrecision(newVal, inc);
      if (bound) newVal = clamp(newVal, bound.min, bound.max);

      if (!perYear[activeEditor.metricKey]) {
        initPerYearFromLerp(activeEditor.metricKey);
      }
      perYear[activeEditor.metricKey][activeEditor.yearIndex] = newVal;
    } else if (activeEditor.isAspYoYEdit) {
      // User edited YoY% — convert back to absolute ASP
      inc = 1;
      bound = { min: -20, max: 50 };
      newVal = roundPrecision(newVal, inc);
      newVal = clamp(newVal, bound.min, bound.max);
      var prevAsp;
      if (activeEditor.anchor === "near") {
        prevAsp = ACTUALS.asp;
      } else {
        prevAsp = lerp(state.asp26, state.asp35, 8 / 9);
      }
      var absAsp = Math.round(prevAsp * (1 + newVal / 100));
      state[activeEditor.stateKey] = absAsp;
    } else {
      var stateKey = activeEditor.stateKey;
      inc = INCREMENTS[stateKey];
      bound = BOUNDS[stateKey];
      if (inc) newVal = roundPrecision(newVal, inc);
      if (bound) newVal = clamp(newVal, bound.min, bound.max);
      state[stateKey] = newVal;
    }

    var input = document.getElementById("editorInput");
    if (input) input.value = formatStateVal(newVal, inc);

    updateEditorChanged();
    updateUI();
  }

  function editorIncrement(dir) {
    if (!activeEditor) return;
    var inc;
    var currentVal;

    if (activeEditor.isPerYear) {
      inc = getIncrementForMetric(activeEditor.metricKey, activeEditor.yearIndex) || 1;
      currentVal = perYear[activeEditor.metricKey] ? perYear[activeEditor.metricKey][activeEditor.yearIndex] : 0;
    } else if (activeEditor.isAspYoYEdit) {
      // Read current YoY% from editor input
      inc = 1;
      var input = document.getElementById("editorInput");
      currentVal = input ? parseFloat(input.value) || 0 : 0;
    } else {
      var stateKey = activeEditor.stateKey;
      inc = INCREMENTS[stateKey] || 1;
      currentVal = state[stateKey];
    }

    var newVal = currentVal + (dir * inc);
    applyEditorValue(newVal);
  }

  function updateEditorChanged() {
    if (!activeEditor) return;
    var isChanged = false;

    if (activeEditor.isPerYear) {
      // Check if this per-year value differs from the lerp default
      // For now, any per-year override is considered "changed"
      isChanged = true;
    } else {
      var stateKey = activeEditor.stateKey;
      isChanged = defaults[stateKey] !== undefined && Math.abs(state[stateKey] - defaults[stateKey]) > 0.001;
    }

    var indicator = document.getElementById("editorChangedDot");
    if (indicator) {
      indicator.style.display = isChanged ? "" : "none";
    }
  }

  // ========== LERP MODE TOGGLING ==========
  // Behavior:
  //   Toggle ON (to lerp): read current perYear[1] and perYear[10] as anchors,
  //     write them back to the state keys, then enable interpolation.
  //   Toggle OFF (to manual): snapshot current interpolated values into perYear,
  //     keep everything as-is and make all years editable.
  function toggleLerpMode(metricKey) {
    var metric = EDITABLE_METRICS[metricKey];
    var wasLerp = lerpMode[metricKey] !== false;

    if (wasLerp) {
      // Switching to manual: snapshot current interpolated values
      initPerYearFromLerp(metricKey);
      lerpMode[metricKey] = false;
    } else {
      // Switching to lerp: read current manual perYear[1] and perYear[10] as anchors
      var arr = perYear[metricKey];
      if (arr) {
        if (metric.isVolGrowth) {
          // perYear stores YoY growth %, state stores growth %
          if (metric.key26 && arr[1] !== null && arr[1] !== undefined) {
            state[metric.key26] = arr[1];
          }
          if (metric.key35 && arr[10] !== null && arr[10] !== undefined) {
            state[metric.key35] = arr[10];
          }
        } else if (metric.isAspYoY) {
          // perYear stores YoY %, need to convert back to absolute ASP
          // Recompute ASP trajectory from perYear to get absolute values
          var aspVals = [ACTUALS.asp];
          for (var ai = 1; ai <= 10; ai++) {
            var yoyPct = (arr[ai] !== null && arr[ai] !== undefined) ? arr[ai] / 100 : 0;
            aspVals.push(aspVals[ai - 1] * (1 + yoyPct));
          }
          state.asp26 = Math.round(aspVals[1]);
          state.asp35 = Math.round(aspVals[10]);
        } else {
          // Standard metric: perYear stores display-unit values, state stores same
          if (metric.key26 && arr[1] !== null && arr[1] !== undefined) {
            state[metric.key26] = arr[1];
          }
          if (metric.key35 && arr[10] !== null && arr[10] !== undefined) {
            state[metric.key35] = arr[10];
          }
        }
      }
      lerpMode[metricKey] = true;
    }

    closeEditor();
    updateUI();
  }

  // ========== UI UPDATE ==========
  function updateUI() {
    var data = runModel();
    var dcf = runDCF(data);
    var pe = runPEValuation(data);
    var blended = computeBlendedPrice(dcf, pe);

    // Financial tab hero — show blended valuation
    setText("heroCurrentPrice", "$" + CURRENT_PRICE.toFixed(2));
    var heroLabel = document.getElementById("heroTargetLabel");
    if (heroLabel) {
      var labelMap = { dcf: "DCF Implied", pe: "P/E Implied", blended: "Blended Target" };
      heroLabel.textContent = labelMap[blended.mode] || "DCF Implied";
    }
    setText("heroDCFPrice", fmt(blended.price, "price"));
    var elHeroUpside = document.getElementById("heroUpside");
    if (elHeroUpside) {
      var heroUp = (blended.price / CURRENT_PRICE) - 1;
      var heroUpStr = (heroUp >= 0 ? "+" : "") + fmt(heroUp, "pct");
      elHeroUpside.textContent = heroUpStr;
      elHeroUpside.className = "val-upside " + (heroUp >= 0 ? "positive" : "negative");
    }
    // Sub-label showing DCF + PE breakdown
    var heroSub = document.getElementById("heroBlendedSub");
    if (heroSub) {
      if (blended.mode === "blended") {
        heroSub.textContent = "DCF " + fmt(blended.dcfPrice, "price") + " + P/E " + fmt(blended.pePrice, "price");
        heroSub.style.display = "";
      } else {
        heroSub.style.display = "none";
      }
    }

    // DCF tab KPIs
    setText("kpiDCFPrice", fmt(dcf.impliedPrice, "price"));
    setText("kpiCurrentPrice", "$" + CURRENT_PRICE.toFixed(2));
    var elUpside = document.getElementById("kpiUpside");
    if (elUpside) {
      elUpside.textContent = (dcf.upside >= 0 ? "+" : "") + fmt(dcf.upside, "pct");
      elUpside.className = "kpi-value " + (dcf.upside >= 0 ? "positive" : "negative");
    }
    var elEVRev = document.getElementById("kpiEVRev");
    if (elEVRev) {
      elEVRev.textContent = fmt(dcf.ev / data.revenue[1], "multiple");
    }

    // PE tab KPIs
    setText("kpiPEPrice", pe.applicable ? fmt(pe.impliedPrice, "price") : "\u2014");
    setText("kpiPEYear", pe.applicable ? pe.convergenceYear : "\u2014");
    var elPEUpside = document.getElementById("kpiPEUpside");
    if (elPEUpside) {
      if (pe.applicable) {
        elPEUpside.textContent = (pe.upside >= 0 ? "+" : "") + fmt(pe.upside, "pct");
        elPEUpside.className = "kpi-value " + (pe.upside >= 0 ? "positive" : "negative");
      } else {
        elPEUpside.textContent = "\u2014";
        elPEUpside.className = "kpi-value";
      }
    }
    setText("kpiBlendedPrice", fmt(blended.price, "price"));
    var kpiBlLbl = document.getElementById("kpiBlendedLabel");
    if (kpiBlLbl) {
      var kpiLblMap = { dcf: "DCF Target", pe: "P/E Target", blended: "Blended Target" };
      kpiBlLbl.textContent = kpiLblMap[blended.mode] || "DCF Target";
    }

    updateDCFTabDisplays();

    renderIncomeTable(data);
    renderFCFTable(data);
    renderDCFSummary(data, dcf);
    renderMultiplesTable(data);
    renderPEValuation(data, pe, dcf);
    // Only render summary + price chart when summary tab is active (they share priceCanvas)
    var sumPanel = document.getElementById("panel-summary");
    if (sumPanel && sumPanel.classList.contains("active")) {
      renderSummary(data, dcf, pe, blended);
    }
  }

  function setText(id, text) {
    var el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  function updateDCFTabDisplays() {
    var dcfDisplays = {
      discountRate: { el: "valDiscountRate", suffix: "%", prefix: "" }
    };
    for (var key in dcfDisplays) {
      if (!dcfDisplays.hasOwnProperty(key)) continue;
      if (state[key] === undefined) continue;
      var dispInfo = dcfDisplays[key];
      var el = document.getElementById(dispInfo.el);
      if (!el) continue;
      var val = state[key];
      var displayVal = (INCREMENTS[key] && INCREMENTS[key] < 1) ? val.toFixed(1) : val.toString();
      el.textContent = dispInfo.prefix + displayVal + dispInfo.suffix;
      var isChanged = defaults[key] !== undefined && Math.abs(state[key] - defaults[key]) > 0.001;
      if (isChanged) { el.classList.add("changed"); } else { el.classList.remove("changed"); }
    }
  }

  // ========== INCOME STATEMENT TABLE (with editable cells + lerp toggles) ==========
  function renderIncomeTable(data) {
    var table = document.getElementById("incomeTable");
    if (!table) return;
    var thead = table.querySelector("thead");
    var tbody = table.querySelector("tbody");

    var headerHTML = "<tr><th></th>";
    for (var i = 0; i < YEAR_COUNT; i++) {
      var cls = i === 1 ? " class=\"col-focus\"" : (i === 0 ? " class=\"col-actual\"" : "");
      headerHTML += "<th" + cls + ">" + YEARS[i] + "</th>";
    }
    headerHTML += "</tr>";
    thead.innerHTML = headerHTML;

    var rows = [
      { label: "Revenue Drivers", section: true },
      { label: RD_VOL_LABEL, key: "tests", format: "testsK", cls: "", hideIf: false },
      { label: RD_VOL_YOY, key: "testsYoY", format: "pct", cls: "", hideIf: false },
      { label: RD_ASP_LABEL, key: "asp", format: "dollar", cls: "", hideIf: RD_HIDE_ASP },
      { label: RD_ASP_YOY, key: "aspYoY", format: "pct", cls: "", hideIf: RD_HIDE_ASP },
      { label: (settings.revenueDriverMode === "buildup" && CFG.revenueBuildup) ? "Revenue \u25C0" : "Revenue", key: "revenue", format: "dollarM", cls: "row-revenue" },
      { label: "Consensus Rev", key: "consensusRevenue", format: "dollarM", cls: "row-consensus" },
      { label: "Rev YoY %", key: "revYoY", format: "pct", cls: "" },
      { label: "Rev Growth Decay", key: "revGrowthDecay", format: "decayX", cls: "row-decay" },
      { label: "Profitability", section: true },
      { label: "Gross Margin", key: "grossMargin", format: "pct", cls: "" },
      { label: "Gross Profit", key: "grossProfit", format: "dollarM", cls: "" },
      { label: "R&D % Rev", key: "rdPct", format: "pct", cls: "" },
      { label: "OpEx % Rev", key: "opexPct", format: "pct", cls: "" },
      { label: "Op Income", key: "opIncome", format: "dollarM", cls: "row-highlight" },
      { label: "Op Margin", key: "opMargin", format: "pct", cls: "" },
      { label: "Tax Rate", key: "taxRate", format: "pct", cls: "" },
      { label: "Net Income", key: "netIncome", format: "dollarM", cls: "row-highlight" },
      { label: "EPS", key: "eps", format: "eps", cls: "" },
      { label: "Cash Flow & Capital", section: true },
      { label: "SBC % Rev", key: "sbcPct", format: "pct", cls: "" },
      { label: "D&A % Rev", key: "daPct", format: "pct", cls: "" },
      { label: "CapEx % Rev", key: "capexPct", format: "pct", cls: "" },
      { label: "Shares (M)", key: "shares", format: "sharesM", cls: "" },
      { label: "FCF", key: "fcfPreSBC", format: "dollarM", cls: "row-highlight" },
      { label: "FCF Margin", key: "fcfMarginPreSBC", format: "pct", cls: "" },
      { label: "Adj FCF", key: "ufcf", format: "dollarM", cls: "" },
      { label: "Adj FCF Margin", key: "fcfMargin", format: "pct", cls: "" }
    ];

    var bodyHTML = "";
    for (var r = 0; r < rows.length; r++) {
      var row = rows[r];

      // Skip hidden rows (e.g., ASP rows when revenue driver doesn't use ASP)
      if (row.hideIf) { continue; }

      // Section header row
      if (row.section) {
        bodyHTML += "<tr class=\"row-section-header\"><td>" + row.label + "</td>";
        for (var s = 0; s < YEAR_COUNT; s++) { bodyHTML += "<td></td>"; }
        bodyHTML += "</tr>";
        continue;
      }

      // Check if this row has a lerp toggle
      var hasLerpToggle = EDITABLE_METRICS.hasOwnProperty(row.key);
      var isLerpOn = hasLerpToggle && lerpMode[row.key] !== false;

      // Build row label cell with optional toggle
      var labelHTML;
      if (hasLerpToggle) {
        var toggleCls = isLerpOn ? "lerp-toggle on" : "lerp-toggle";
        labelHTML = "<td class=\"td-label-with-toggle\">"
          + "<span class=\"row-label-text\">" + row.label + "</span>"
          + "<button class=\"" + toggleCls + "\" data-lerp-metric=\"" + row.key + "\" "
          + "title=\"" + (isLerpOn ? "Interpolation on — click to edit each year" : "Manual mode — click to interpolate") + "\" "
          + "aria-label=\"Toggle interpolation for " + row.label + "\">"
          + "<svg width=\"12\" height=\"12\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2.5\">"
          + (isLerpOn
            ? "<path d=\"M4 12h16\"/><circle cx=\"4\" cy=\"12\" r=\"2.5\" fill=\"currentColor\"/><circle cx=\"20\" cy=\"12\" r=\"2.5\" fill=\"currentColor\"/>"
            : "<rect x=\"2\" y=\"4\" width=\"20\" height=\"16\" rx=\"2\"/><path d=\"M6 12h2M10 12h2M14 12h2M18 12h2\"/>")
          + "</svg>"
          + "</button>"
          + "</td>";
      } else {
        labelHTML = "<td>" + row.label + "</td>";
      }

      bodyHTML += "<tr class=\"" + row.cls + "\">" + labelHTML;

      for (var j = 0; j < YEAR_COUNT; j++) {
        var val = data[row.key][j];
        var cellCls = j === 0 ? "col-actual" : "";

        if (row.format === "pct" && val !== null && val !== undefined) {
          if (val > 0) cellCls += " val-positive";
          else if (val < 0) cellCls += " val-negative";
        }
        if ((row.key === "opIncome" || row.key === "netIncome" || row.key === "ufcf" || row.key === "fcfPreSBC") && val !== null) {
          if (val > 0) cellCls += " val-positive";
          else if (val < 0) cellCls += " val-negative";
        }

        // Check if editable
        var editInfo = getEditableInfo(row.key, j);
        if (editInfo) {
          cellCls += " cell-editable";
          // Mark changed
          if (editInfo.isPerYear) {
            cellCls += " cell-manual";
          } else {
            var isk = editInfo.stateKey;
            var isChanged = defaults[isk] !== undefined && Math.abs(state[isk] - defaults[isk]) > 0.001;
            if (isChanged) cellCls += " cell-changed";
          }
          bodyHTML += "<td class=\"" + cellCls + "\" data-edit-row=\"" + row.key + "\" data-edit-col=\"" + j + "\">" + fmtCell(val, row.format) + "</td>";
        } else {
          bodyHTML += "<td class=\"" + cellCls + "\">" + fmtCell(val, row.format) + "</td>";
        }
      }
      bodyHTML += "</tr>";
    }
    tbody.innerHTML = bodyHTML;

    // Bind click handlers for editable cells
    var editableCells = tbody.querySelectorAll("[data-edit-row]");
    for (var e = 0; e < editableCells.length; e++) {
      editableCells[e].addEventListener("click", handleCellClick);
    }

    // Bind lerp toggle buttons
    var lerpBtns = tbody.querySelectorAll("[data-lerp-metric]");
    for (var lb = 0; lb < lerpBtns.length; lb++) {
      lerpBtns[lb].addEventListener("click", handleLerpToggle);
    }
  }

  function fmtCell(val, format) {
    if (val === null || val === undefined || isNaN(val)) return "\u2014";
    switch (format) {
      case "testsK": return Math.round(val).toLocaleString("en-US");
      case "sharesM": return (val / 1000).toFixed(1) + "M";
      case "decayX": return val.toFixed(2) + "x";
      default: return fmt(val, format);
    }
  }

  function handleCellClick(e) {
    var cell = e.currentTarget;
    var rowKey = cell.getAttribute("data-edit-row");
    var colIndex = parseInt(cell.getAttribute("data-edit-col"), 10);
    var info = getEditableInfo(rowKey, colIndex);
    if (info) openEditor(info);
  }

  function handleLerpToggle(e) {
    e.stopPropagation();
    var metricKey = e.currentTarget.getAttribute("data-lerp-metric");
    if (metricKey) toggleLerpMode(metricKey);
  }

  // ========== FCF TABLE ==========
  function renderFCFTable(data) {
    var table = document.getElementById("fcfTable");
    if (!table) return;
    var thead = table.querySelector("thead");
    var tbody = table.querySelector("tbody");

    var headerHTML = "<tr><th></th>";
    for (var i = 1; i <= 10; i++) {
      headerHTML += "<th>" + YEARS[i] + "</th>";
    }
    headerHTML += "</tr>";
    thead.innerHTML = headerHTML;

    var fcfRows = [
      { label: "EBIT", key: "ebit", format: "dollarM" },
      { label: "(-) SBC", key: "sbc", format: "dollarM" },
      { label: "Tax Rate", key: "taxRate", format: "pct" },
      { label: "(+) D&A", key: "da", format: "dollarM" },
      { label: "CapEx", key: "capex", format: "dollarM" },
      { label: "WC Change", key: "wcChange", format: "dollarM" },
      { label: "Adj FCF", key: "ufcf", format: "dollarM", cls: "row-highlight" },
      { label: "Adj FCF Margin", key: "fcfMargin", format: "pct" }
    ];

    var bodyHTML = "";
    for (var r = 0; r < fcfRows.length; r++) {
      var row = fcfRows[r];
      var rowCls = row.cls || "";
      bodyHTML += "<tr class=\"" + rowCls + "\"><td>" + row.label + "</td>";
      for (var j = 1; j <= 10; j++) {
        bodyHTML += "<td>" + fmt(data[row.key][j], row.format) + "</td>";
      }
      bodyHTML += "</tr>";
    }
    tbody.innerHTML = bodyHTML;
  }

  // ========== DCF SUMMARY ==========
  function renderDCFSummary(data, dcf) {
    var container = document.getElementById("dcfSummary");
    if (!container) return;

    var rows = [
      { label: "PV of Forecast Adjusted FCF", value: fmt(dcf.sumPVFCF, "dollarM") },
      { label: "PV of Terminal Value", value: fmt(dcf.pvTV, "dollarM") },
      { label: "Enterprise Value", value: fmt(dcf.ev, "dollarM"), divider: true },
      { label: "(-) Debt", value: fmt(-dcf.debt, "dollarM") },
      { label: "(+) Cash", value: fmt(dcf.cash, "dollarM") },
      { label: "Equity Value", value: fmt(dcf.equityValue, "dollarM"), divider: true },
      { label: "Shares Outstanding", value: (dcf.sharesForPrice / 1000).toFixed(0) + "M" }
    ];

    var html = "<div class=\"dcf-implied-price\">";
    html += "<div class=\"dcf-implied-label\">Valuation Per Share</div>";
    html += "<div class=\"dcf-implied-value\">" + fmt(dcf.impliedPrice, "priceDecimal") + "</div>";
    var upsideStr = (dcf.upside >= 0 ? "+" : "") + fmt(dcf.upside, "pct");
    var upsideCls = dcf.upside >= 0 ? "positive" : "negative";
    html += "<div class=\"dcf-upside " + upsideCls + "\">" + upsideStr + " vs $" + CURRENT_PRICE.toFixed(2) + "</div>";
    html += "</div>";

    html += "<div class=\"dcf-detail-grid\">";
    html += "<div class=\"dcf-detail-item\"><span class=\"dcf-detail-label\">Last Adj. FCF (FY35)</span><span class=\"dcf-detail-val\">" + fmt(dcf.lastFCF, "dollarM") + "</span></div>";
    html += "<div class=\"dcf-detail-item\"><span class=\"dcf-detail-label\">LT Valuation Yield</span><span class=\"dcf-detail-val\">" + (dcf.longTermYield * 100).toFixed(2) + "%</span></div>";
    html += "<div class=\"dcf-detail-item\"><span class=\"dcf-detail-label\">Terminal Value (undiscounted)</span><span class=\"dcf-detail-val\">" + fmt(dcf.terminalFutureValue, "dollarM") + "</span></div>";
    html += "<div class=\"dcf-detail-item\"><span class=\"dcf-detail-label\">Discount Rate</span><span class=\"dcf-detail-val\">" + (dcf.discountRate * 100).toFixed(0) + "%</span></div>";
    html += "<div class=\"dcf-detail-item\"><span class=\"dcf-detail-label\">Monopoly Premium</span><span class=\"dcf-detail-val\">" + (dcf.monopolyPremium * 100).toFixed(0) + "%</span></div>";
    html += "</div>";

    for (var ri = 0; ri < rows.length; ri++) {
      var row = rows[ri];
      var divCls = row.divider ? " dcf-divider" : "";
      html += "<div class=\"dcf-row" + divCls + "\">";
      html += "<span class=\"dcf-row-label\">" + row.label + "</span>";
      html += "<span class=\"dcf-row-value\">" + row.value + "</span>";
      html += "</div>";
    }

    html += "<div class=\"dcf-footnote\">";
    html += "LT Valuation Yield = ((9.2 - (final yr rev growth% \u00D7 0.56)) / 100) \u00D7 (1 - monopoly premium). ";
    html += "Terminal value = final yr Adj FCF \u00F7 LT valuation yield. ";
    html += "Monopoly premium = 15% if pricing power, 0% otherwise.";
    html += "</div>";

    container.innerHTML = html;
  }

  // ========== DCF INLINE ==========
  function renderDCFInline(data, dcf) {
    var container = document.getElementById("dcfInlineSummary");
    if (!container) return;

    var html = "";
    html += "<div class=\"dcf-inline-hero\">";
    html += "<div class=\"dcf-inline-price\">" + fmt(dcf.impliedPrice, "priceDecimal") + "</div>";
    var upsideStr = (dcf.upside >= 0 ? "+" : "") + fmt(dcf.upside, "pct");
    var upsideCls = dcf.upside >= 0 ? "positive" : "negative";
    html += "<div class=\"dcf-inline-upside " + upsideCls + "\">" + upsideStr + " vs $" + CURRENT_PRICE.toFixed(2) + "</div>";
    html += "</div>";

    html += "<div class=\"dcf-inline-details\">";
    var details = [
      { label: "Discount Rate", value: (dcf.discountRate * 100).toFixed(0) + "%" },
      { label: "LT Valuation Yield", value: (dcf.longTermYield * 100).toFixed(2) + "%" },
      { label: "Terminal Adj FCF (FY35)", value: fmt(dcf.lastFCF, "dollarM") },
      { label: "Terminal Value", value: fmt(dcf.terminalFutureValue, "dollarM") },
      { label: "Monopoly Premium", value: (dcf.monopolyPremium * 100).toFixed(0) + "%" },
      { label: "Shares (FY26)", value: (dcf.sharesForPrice / 1000).toFixed(0) + "M" }
    ];
    for (var d = 0; d < details.length; d++) {
      html += "<div class=\"dcf-inline-detail\">";
      html += "<span class=\"dcf-inline-detail-label\">" + details[d].label + "</span>";
      html += "<span class=\"dcf-inline-detail-val\">" + details[d].value + "</span>";
      html += "</div>";
    }
    html += "</div>";

    var bridgeRows = [
      { label: "PV of Forecast Adj FCF", value: fmt(dcf.sumPVFCF, "dollarM") },
      { label: "PV of Terminal Value", value: fmt(dcf.pvTV, "dollarM") },
      { label: "Enterprise Value", value: fmt(dcf.ev, "dollarM"), divider: true },
      { label: "(-) Debt", value: fmt(-dcf.debt, "dollarM") },
      { label: "(+) Cash", value: fmt(dcf.cash, "dollarM") },
      { label: "Equity Value", value: fmt(dcf.equityValue, "dollarM"), divider: true }
    ];

    html += "<div class=\"dcf-inline-bridge\">";
    for (var b = 0; b < bridgeRows.length; b++) {
      var row = bridgeRows[b];
      var divCls = row.divider ? " dcf-divider" : "";
      html += "<div class=\"dcf-row" + divCls + "\">";
      html += "<span class=\"dcf-row-label\">" + row.label + "</span>";
      html += "<span class=\"dcf-row-value\">" + row.value + "</span>";
      html += "</div>";
    }
    html += "</div>";

    container.innerHTML = html;
  }

  // ========== MULTIPLES TABLE ==========
  function renderMultiplesTable(data) {
    // Update multiples note with current price
    var noteEl = document.getElementById("multiplesNote");
    if (noteEl) {
      noteEl.textContent = "Based on current share price of $" + CURRENT_PRICE.toFixed(2) + " held constant across all years. FCF = before SBC; Adj FCF = after SBC deduction.";
    }
    var table = document.getElementById("multiplesTable");
    if (!table) return;
    var thead = table.querySelector("thead");
    var tbody = table.querySelector("tbody");

    var mktCap = new Array(YEAR_COUNT);
    var ev = new Array(YEAR_COUNT);
    var pe = new Array(YEAR_COUNT);
    var evSales = new Array(YEAR_COUNT);
    var evEbitda = new Array(YEAR_COUNT);
    var evEbit = new Array(YEAR_COUNT);
    var fcfYield = new Array(YEAR_COUNT);
    var adjFcfYield = new Array(YEAR_COUNT);
    var adjFcf = new Array(YEAR_COUNT);
    var earningsYield = new Array(YEAR_COUNT);
    var pFcf = new Array(YEAR_COUNT);
    var pAdjFcf = new Array(YEAR_COUNT);

    for (var i = 0; i < YEAR_COUNT; i++) {
      mktCap[i] = CURRENT_PRICE * data.shares[i];
      ev[i] = mktCap[i] + DEBT_OUTSTANDING - CASH_EQUIVALENTS;
      pe[i] = (data.netIncome[i] > 0) ? mktCap[i] / data.netIncome[i] : null;
      earningsYield[i] = (data.netIncome[i] > 0 && mktCap[i] > 0) ? data.netIncome[i] / mktCap[i] : null;
      evSales[i] = (data.revenue[i] > 0) ? ev[i] / data.revenue[i] : null;
      var ebitda = data.ebit[i] + data.da[i];
      evEbitda[i] = (ebitda > 0) ? ev[i] / ebitda : null;
      evEbit[i] = (data.ebit[i] > 0) ? ev[i] / data.ebit[i] : null;

      adjFcf[i] = data.ufcf[i];
      adjFcfYield[i] = (adjFcf[i] !== null && mktCap[i] > 0) ? adjFcf[i] / mktCap[i] : null;

      var unadjFcf;
      if (data.ufcf[i] !== null && i > 0) {
        unadjFcf = data.ufcf[i] + data.sbc[i] * (1 - data.taxRate[i]);
      } else {
        unadjFcf = null;
      }
      fcfYield[i] = (unadjFcf !== null && mktCap[i] > 0) ? unadjFcf / mktCap[i] : null;
      pFcf[i] = (unadjFcf !== null && unadjFcf > 0) ? mktCap[i] / unadjFcf : null;
      pAdjFcf[i] = (adjFcf[i] !== null && adjFcf[i] > 0) ? mktCap[i] / adjFcf[i] : null;
    }

    // KPIs
    var elPE = document.getElementById("kpiPE");
    var elEVS = document.getElementById("kpiEVSales");
    var elFCFY = document.getElementById("kpiFCFYield");
    var elAFCFY = document.getElementById("kpiAdjFCFYield");
    if (elPE) elPE.textContent = pe[1] !== null ? pe[1].toFixed(1) + "x" : "\u2014";
    if (elEVS) elEVS.textContent = evSales[1] !== null ? evSales[1].toFixed(1) + "x" : "\u2014";
    if (elFCFY) elFCFY.textContent = fcfYield[1] !== null ? (fcfYield[1] * 100).toFixed(1) + "%" : "\u2014";
    if (elAFCFY) elAFCFY.textContent = adjFcfYield[1] !== null ? (adjFcfYield[1] * 100).toFixed(1) + "%" : "\u2014";

    var headerHTML = "<tr><th></th>";
    for (var h = 0; h < YEAR_COUNT; h++) {
      var cls = h === 1 ? " class=\"col-focus\"" : (h === 0 ? " class=\"col-actual\"" : "");
      headerHTML += "<th" + cls + ">" + YEARS[h] + "</th>";
    }
    headerHTML += "</tr>";
    thead.innerHTML = headerHTML;

    var multRows = [
      { label: "Mkt Cap ($M)", data: mktCap, format: "dollarM", cls: "row-separator" },
      { label: "EV ($M)", data: ev, format: "dollarM", cls: "row-separator" },
      { label: "P/E", data: pe, format: "multiple", cls: "" },
      { label: "Earnings Yield", data: earningsYield, format: "pct", cls: "row-separator" },
      { label: "EV / Sales", data: evSales, format: "multiple", cls: "" },
      { label: "EV / EBITDA", data: evEbitda, format: "multiple", cls: "" },
      { label: "EV / EBIT", data: evEbit, format: "multiple", cls: "row-separator" },
      { label: "Price / FCF", data: pFcf, format: "multiple", cls: "" },
      { label: "FCF Yield", data: fcfYield, format: "pct", cls: "row-separator" },
      { label: "Price / Adj FCF", data: pAdjFcf, format: "multiple", cls: "row-highlight" },
      { label: "Adj FCF Yield", data: adjFcfYield, format: "pct", cls: "row-highlight" }
    ];

    var bodyHTML = "";
    for (var r = 0; r < multRows.length; r++) {
      var row = multRows[r];
      bodyHTML += "<tr class=\"" + row.cls + "\"><td>" + row.label + "</td>";
      for (var j = 0; j < YEAR_COUNT; j++) {
        var val = row.data[j];
        var cellCls = j === 1 ? "col-focus" : (j === 0 ? "col-actual" : "");
        bodyHTML += "<td class=\"" + cellCls + "\">" + fmt(val, row.format) + "</td>";
      }
      bodyHTML += "</tr>";
    }
    tbody.innerHTML = bodyHTML;
  }

  // ========== SENSITIVITY ==========

  // ========== SUMMARY TAB (screenshot-optimized) ==========
  // Run model with a temporary state snapshot (for scenario comparison)
  function runModelWithState(scenarioState) {
    // Save current state
    var savedState = {};
    var savedLerp = {};
    var savedPerYear = {};
    var sk;
    for (sk in state) {
      if (state.hasOwnProperty(sk)) savedState[sk] = state[sk];
    }
    for (sk in lerpMode) {
      if (lerpMode.hasOwnProperty(sk)) savedLerp[sk] = lerpMode[sk];
    }
    for (sk in perYear) {
      if (perYear.hasOwnProperty(sk)) savedPerYear[sk] = perYear[sk].slice();
    }

    // Apply scenario state
    if (scenarioState._lerpMode) {
      for (sk in scenarioState._lerpMode) {
        if (scenarioState._lerpMode.hasOwnProperty(sk)) lerpMode[sk] = scenarioState._lerpMode[sk];
      }
    }
    if (scenarioState._perYear) {
      for (sk in scenarioState._perYear) {
        if (scenarioState._perYear.hasOwnProperty(sk)) perYear[sk] = scenarioState._perYear[sk];
      }
    }
    for (sk in scenarioState) {
      if (scenarioState.hasOwnProperty(sk) && state.hasOwnProperty(sk)) {
        state[sk] = scenarioState[sk];
      }
    }

    var d = runModel();
    var dcfR = runDCF(d);
    var peR = runPEValuation(d);
    var bl = computeBlendedPrice(dcfR, peR);

    // Restore original state
    for (sk in savedState) {
      if (savedState.hasOwnProperty(sk)) state[sk] = savedState[sk];
    }
    lerpMode = {};
    for (sk in savedLerp) {
      if (savedLerp.hasOwnProperty(sk)) lerpMode[sk] = savedLerp[sk];
    }
    perYear = {};
    for (sk in savedPerYear) {
      if (savedPerYear.hasOwnProperty(sk)) perYear[sk] = savedPerYear[sk];
    }

    return { data: d, dcf: dcfR, pe: peR, blended: bl };
  }

  // Load all scenario JSONs and build comparison, then call callback
  function loadScenarioModels(cb) {
    var results = {};
    var slots = SLOT_ORDER.slice();
    var pending = slots.length;
    if (pending === 0) { cb(results); return; }
    for (var si = 0; si < slots.length; si++) {
      (function (slot) {
        // Find scenario name for this slot
        var found = null;
        for (var ci = 0; ci < scenarioCache.length; ci++) {
          if ((scenarioCache[ci].caseType || "base") === slot) { found = scenarioCache[ci]; break; }
        }
        if (!found) {
          pending--;
          if (pending === 0) cb(results);
          return;
        }
        var xhr = new XMLHttpRequest();
        xhr.open("GET", getTickerPath() + "/" + encodeURIComponent(found.name), true);
        xhr.onload = function () {
          if (xhr.status === 200) {
            var scenData = JSON.parse(xhr.responseText);
            var res = runModelWithState(scenData);
            results[slot] = { model: res, impliedPrice: found.impliedPrice, name: found.name };
          }
          pending--;
          if (pending === 0) cb(results);
        };
        xhr.onerror = function () {
          pending--;
          if (pending === 0) cb(results);
        };
        xhr.send();
      })(slots[si]);
    }
  }

  function renderSummary(data, dcf, pe, blended) {
    var container = document.getElementById("summaryPage");
    if (!container) return;

    var ticker = CFG.ticker;
    var companyName = CFG.companyName;
    var desc = CFG.companyDescription || "";
    var recPct = state.recurringRevPct;
    var hasPP = state.hasPricingPower;

    // Find base scenario implied price for hero
    var basePrice = blended.price;
    for (var bi = 0; bi < scenarioCache.length; bi++) {
      if ((scenarioCache[bi].caseType || "base") === "base" && scenarioCache[bi].impliedPrice) {
        basePrice = scenarioCache[bi].impliedPrice;
        break;
      }
    }
    var upside = (basePrice / CURRENT_PRICE) - 1;
    var upsideStr = (upside >= 0 ? "+" : "") + (upside * 100).toFixed(0) + "%";
    var upsideClass = upside >= 0 ? "positive" : "negative";

    var html = "";

    // === COMPANY HEADER ===
    html += '<div class="sum-header">';
    html += '<div class="sum-title-row">';
    html += '<span class="sum-ticker">' + ticker + '</span>';
    html += '<span class="sum-name">' + companyName + '</span>';
    html += '</div>';
    if (desc) html += '<div class="sum-desc">' + desc + '</div>';
    html += '<div class="sum-tags">';
    html += '<span class="sum-tag">' + recPct + '% Recurring Rev</span>';
    html += '<span class="sum-tag">' + (hasPP ? "\u2714" : "\u2716") + ' Pricing Power</span>';
    html += '</div>';
    html += '</div>';

    // === PRICE ROW ===
    html += '<div class="sum-price-row">';
    html += '<div class="sum-price-block">';
    html += '<span class="sum-price-label">Price</span>';
    html += '<span class="sum-price-val">$' + CURRENT_PRICE.toFixed(2) + '</span>';
    html += '</div>';
    html += '<span class="sum-price-arrow">\u2192</span>';
    html += '<div class="sum-price-block">';
    html += '<span class="sum-price-label">Target Price</span>';
    html += '<span class="sum-price-val sum-price-target">' + fmt(basePrice, "price") + '</span>';
    html += '</div>';
    html += '<span class="sum-price-upside ' + upsideClass + '">' + upsideStr + '</span>';
    html += '</div>';

    // === PRICE CHART (reuse priceCanvas) ===
    html += '<div class="sum-chart-section">';
    html += '<div class="sum-chart-toolbar">';
    html += '<span class="sum-chart-label">Stock Price</span>';
    html += '<div class="sum-view-toggle">';
    html += '<button class="sum-view-btn active" data-sum-view="1y">12M</button>';
    html += '<button class="sum-view-btn" data-sum-view="ytd">YTD</button>';
    html += '</div>';
    html += '</div>';
    html += '<div class="sum-price-chart-wrap"><canvas id="priceCanvas"></canvas></div>';
    html += '</div>';

    // === SCENARIO COMPARISON TABLE (placeholder — filled async) ===
    html += '<div class="sum-scenarios" id="sumScenarios">Loading scenarios...</div>';

    // === FOOTER ===
    html += '<div class="sum-footer">';
    html += '<span>' + ticker + ' \u00B7 ' + new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) + '</span>';
    html += '<span>Perplexity Computer</span>';
    html += '</div>';

    container.innerHTML = html;

    // Bind view toggle buttons
    var viewBtns = container.querySelectorAll("[data-sum-view]");
    for (var vi = 0; vi < viewBtns.length; vi++) {
      viewBtns[vi].addEventListener("click", function () {
        var view = this.getAttribute("data-sum-view");
        priceChartState.view = view;
        var all = container.querySelectorAll("[data-sum-view]");
        for (var j = 0; j < all.length; j++) all[j].classList.remove("active");
        this.classList.add("active");
        var d2 = runModel();
        var dcf2 = runDCF(d2);
        var pe2 = runPEValuation(d2);
        loadPriceChart(computeBlendedPrice(dcf2, pe2));
      });
    }

    // Load price chart into the summary canvas
    loadPriceChart(blended);

    // Load scenarios and build comparison table
    loadScenarioModels(function (scenResults) {
      renderScenarioTable(scenResults);

      // Update summary hero price with freshly computed base price
      if (scenResults.base && scenResults.base.model) {
        var freshBase = computeBlendedPrice(scenResults.base.model.dcf, scenResults.base.model.pe).price;
        var sumTargetEl = container.querySelector(".sum-price-target");
        if (sumTargetEl) sumTargetEl.textContent = fmt(freshBase, "price");
        var upEl = container.querySelector(".sum-price-upside");
        if (upEl) {
          var freshUp = (freshBase / CURRENT_PRICE) - 1;
          upEl.textContent = (freshUp >= 0 ? "+" : "") + (freshUp * 100).toFixed(0) + "%";
          upEl.className = "sum-price-upside " + (freshUp >= 0 ? "positive" : "negative");
        }
      }

      // Patch scenarioCache with freshly computed prices (re-derive from
      // current settings.valuationMode) so hero tags + chart overlays stay in sync
      for (var sci = 0; sci < scenarioCache.length; sci++) {
        var tagSlot = scenarioCache[sci].caseType || "base";
        if (scenResults[tagSlot] && scenResults[tagSlot].model) {
          var freshBl = computeBlendedPrice(scenResults[tagSlot].model.dcf, scenResults[tagSlot].model.pe);
          scenarioCache[sci].impliedPrice = freshBl.price;
        }
      }
      // Re-render hero tags with updated cache
      renderScenarioTags(scenarioCache);
    });
  }

  function renderScenarioTable(scenResults) {
    var el = document.getElementById("sumScenarios");
    if (!el) return;

    var slots = ["base", "bull", "bear"];
    var slotLabels = { base: "Base", bull: "Bull", bear: "Bear" };
    var slotColors = { base: "var(--color-primary)", bull: "var(--color-positive)", bear: "var(--color-negative)" };

    // Collect available scenarios
    var activeCols = [];
    for (var si = 0; si < slots.length; si++) {
      if (scenResults[slots[si]]) activeCols.push(slots[si]);
    }
    if (activeCols.length === 0) {
      el.innerHTML = '<div class="sum-no-scen">Save Base, Bull, and Bear scenarios to see comparison</div>';
      return;
    }

    // Show FY26–FY28, gap, FY30, gap, FY35 (indices 1,2,3, sep, 5, sep, 10)
    // "sep" entries render as thin dashed-line columns
    var yearCols = [
      { idx: 1 }, { idx: 2 }, { idx: 3 },
      { sep: true },
      { idx: 5 },
      { sep: true },
      { idx: 10 }
    ];
    var yearLabels = [];
    for (var yi = 0; yi < yearCols.length; yi++) {
      if (yearCols[yi].sep) {
        yearLabels.push(null); // separator
      } else {
        yearLabels.push(YEARS[yearCols[yi].idx].replace("FY", "'").replace("A", "").replace("E", ""));
      }
    }

    var html = '';

    // Each scenario in its own card with colored left accent
    for (var ci = 0; ci < activeCols.length; ci++) {
      var slot = activeCols[ci];
      var res = scenResults[slot];
      var d = res.model.data;
      var dcfR = res.model.dcf;
      // Re-compute blended using current settings.valuationMode
      var bl = computeBlendedPrice(res.model.dcf, res.model.pe);
      var lbl = slotLabels[slot];
      var col = slotColors[slot];
      var targetStr = fmt(bl.price, "price");

      // Pre-scan for any FCF Yield > 10% to flag the card
      var hasHotYield = false;
      var scanMktCap = CURRENT_PRICE * d.shares[1];
      for (var yi2 = 0; yi2 < yearCols.length; yi2++) {
        if (yearCols[yi2].sep) continue;
        var yIdx2 = yearCols[yi2].idx;
        if (yIdx2 > 0 && d.fcfPreSBC[yIdx2] && scanMktCap > 0) {
          if ((d.fcfPreSBC[yIdx2] / scanMktCap) * 100 > 10) { hasHotYield = true; break; }
        }
      }

      var cardCls = 'sum-scen-card' + (hasHotYield ? ' sum-scen-hot' : '');
      html += '<div class="' + cardCls + '" style="border-left-color:' + col + ';">';

      // Scenario header (clickable to collapse/expand)
      html += '<div class="sum-scen-card-header" data-sum-toggle="' + ci + '">';
      html += '<span class="sum-scen-name">' + lbl + '</span>';
      html += '<span class="sum-scen-target" style="color:' + col + ';">' + targetStr + '</span>';
      html += '<span class="sum-chevron">\u25B2</span>';
      html += '</div>';

      // Table
      html += '<table class="sum-table">';
      html += '<thead><tr><th></th>';
      for (var hi = 0; hi < yearLabels.length; hi++) {
        if (yearLabels[hi] === null) {
          html += '<th class="sum-sep-col"><span class="sum-sep-dash"></span></th>';
        } else {
          html += '<th>' + yearLabels[hi] + '</th>';
        }
      }
      html += '</tr></thead><tbody>';

      // Helper: render a separator or data cell
      function sumCell(content, extraCls) {
        return '<td' + (extraCls ? ' class="' + extraCls + '"' : '') + '>' + content + '</td>';
      }
      var SEP_TD = '<td class="sum-sep-col"><span class="sum-sep-dash"></span></td>';

      // Rev Growth row (always visible)
      html += '<tr><td class="sum-metric-lbl">Rev Growth</td>';
      for (var ri = 0; ri < yearCols.length; ri++) {
        if (yearCols[ri].sep) { html += SEP_TD; continue; }
        var idx = yearCols[ri].idx;
        if (idx === 0) {
          html += sumCell('\u2014');
        } else {
          var rg = d.revenue[idx - 1] > 0 ? ((d.revenue[idx] / d.revenue[idx - 1]) - 1) * 100 : 0;
          html += sumCell(rg.toFixed(0) + '%');
        }
      }
      html += '</tr>';
      html += '</tbody><tbody class="sum-detail-rows">';

      // FCF Margin row (pre-SBC)
      html += '<tr><td class="sum-metric-lbl">FCF Margin</td>';
      for (var fi = 0; fi < yearCols.length; fi++) {
        if (yearCols[fi].sep) { html += SEP_TD; continue; }
        var fIdx = yearCols[fi].idx;
        var fm = d.fcfMarginPreSBC[fIdx];
        html += sumCell(fm !== null && fm !== undefined ? (fm * 100).toFixed(0) + '%' : '\u2014');
      }
      html += '</tr>';

      // EPS row
      html += '<tr><td class="sum-metric-lbl">EPS</td>';
      for (var ei = 0; ei < yearCols.length; ei++) {
        if (yearCols[ei].sep) { html += SEP_TD; continue; }
        var eIdx = yearCols[ei].idx;
        html += sumCell(fmt(d.eps[eIdx], "eps"));
      }
      html += '</tr>';

      // FCF Yield by year (FCF pre-SBC / Market Cap)
      var mktCap = CURRENT_PRICE * d.shares[1];
      html += '<tr class="sum-implied-row"><td class="sum-metric-lbl">FCF Yield</td>';
      for (var fy = 0; fy < yearCols.length; fy++) {
        if (yearCols[fy].sep) { html += SEP_TD; continue; }
        var fyIdx = yearCols[fy].idx;
        if (fyIdx === 0 || !d.fcfPreSBC[fyIdx]) {
          html += sumCell('\u2014');
        } else {
          var fcfY = mktCap > 0 ? (d.fcfPreSBC[fyIdx] / mktCap) * 100 : 0;
          html += sumCell(fcfY.toFixed(1) + '%', fcfY > 10 ? 'sum-yield-hot' : '');
        }
      }
      html += '</tr>';

      // P/E Multiple by year (Market Cap / Net Income)
      html += '<tr class="sum-implied-row"><td class="sum-metric-lbl">P/E</td>';
      for (var py = 0; py < yearCols.length; py++) {
        if (yearCols[py].sep) { html += SEP_TD; continue; }
        var pyIdx = yearCols[py].idx;
        if (pyIdx === 0) {
          var actNI = ACTUALS.netIncome;
          if (actNI > 0) {
            var actPE = mktCap / actNI;
            html += sumCell(actPE.toFixed(0) + 'x');
          } else {
            html += sumCell('\u2014');
          }
        } else {
          var ni = d.netIncome[pyIdx];
          if (ni > 0) {
            html += sumCell((mktCap / ni).toFixed(0) + 'x');
          } else {
            html += sumCell('neg');
          }
        }
      }
      html += '</tr>';

      html += '</tbody></table>';
      html += '</div>'; // close sum-scen-card
    }
    el.innerHTML = html;

    // Bind collapse/expand toggles on card headers
    var toggleBtns = el.querySelectorAll("[data-sum-toggle]");
    for (var ti = 0; ti < toggleBtns.length; ti++) {
      toggleBtns[ti].addEventListener("click", function () {
        var card = this.closest(".sum-scen-card");
        if (!card) return;
        card.classList.toggle("sum-collapsed");
      });
    }
  }

  // ========== PRICE CHART (Polygon API) ==========
  var priceChartState = { view: "1y", bars: [], loading: false };

  function fetchPriceBars(view, cb) {
    var ticker = CFG.ticker;
    var xhr = new XMLHttpRequest();
    xhr.open("GET", "/api/prices/" + ticker + "?period=" + view, true);
    xhr.onload = function () {
      if (xhr.status === 200) {
        var resp = JSON.parse(xhr.responseText);
        cb(null, resp.bars || []);
      } else {
        cb("API error " + xhr.status, []);
      }
    };
    xhr.onerror = function () { cb("Network error", []); };
    xhr.send();
  }

  function refreshQuote(cb) {
    var ticker = CFG.ticker;
    var xhr = new XMLHttpRequest();
    xhr.open("GET", "/api/quote/" + ticker, true);
    xhr.onload = function () {
      if (xhr.status === 200) {
        var resp = JSON.parse(xhr.responseText);
        cb(null, resp);
      } else {
        cb("Quote error", null);
      }
    };
    xhr.onerror = function () { cb("Network error", null); };
    xhr.send();
  }

  function loadPriceChart(blendedOrDcf) {
    if (priceChartState.loading) return;
    priceChartState.loading = true;
    var chartTarget = blendedOrDcf;
    fetchPriceBars(priceChartState.view, function (err, bars) {
      priceChartState.loading = false;
      if (err || !bars.length) {
        // Fallback to config.priceHistory if API unavailable
        if (CFG.priceHistory && CFG.priceHistory.length) {
          priceChartState.bars = CFG.priceHistory;
          priceChartState.isLive = false;
          renderPriceChart(chartTarget);
        }
        return;
      }
      priceChartState.bars = bars;
      priceChartState.isLive = true;
      // Update CURRENT_PRICE from latest live bar (not static fallback)
      var lastBar = bars[bars.length - 1];
      CURRENT_PRICE = lastBar.c;
      CFG.currentPrice = lastBar.c;
      setText("headerPrice", "$" + CURRENT_PRICE.toFixed(2));
      setText("heroCurrentPrice", "$" + CURRENT_PRICE.toFixed(2));
      setText("kpiCurrentPrice", "$" + CURRENT_PRICE.toFixed(2));
      renderPriceChart(chartTarget);
    });
  }

  function renderPriceChart(blendedOrDcf) {
    var canvas = document.getElementById("priceCanvas");
    var data = priceChartState.bars;
    if (!canvas || !data || !data.length) return;
    var ctx = canvas.getContext("2d");
    var container = canvas.parentElement;
    var inSummary = canvas.closest && canvas.closest(".sum-chart-section");
    var dpr = window.devicePixelRatio || 1;
    var w = container.clientWidth;
    var h = container.clientHeight || 360;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Support both blended object {price, dcfPrice, pePrice} and legacy dcf object {impliedPrice}
    var dcfTarget;
    if (blendedOrDcf && blendedOrDcf.price !== undefined) {
      dcfTarget = blendedOrDcf.price;
    } else if (blendedOrDcf && blendedOrDcf.impliedPrice !== undefined) {
      dcfTarget = blendedOrDcf.impliedPrice;
    } else {
      dcfTarget = CURRENT_PRICE;
    }
    var rawLastClose = data[data.length - 1].c;
    // Use CURRENT_PRICE for consistency (config or live-synced value)
    var lastClose = priceChartState.isLive ? rawLastClose : CURRENT_PRICE;
    var lastDate = new Date(data[data.length - 1].d);

    // Target point: 3 months from last data point (keeps forecast area small)
    var targetDate = new Date(lastDate);
    targetDate.setMonth(targetDate.getMonth() + 3);

    // Gather all scenario implied prices for axis scaling
    var scenarioPrices = [dcfTarget];
    for (var si = 0; si < scenarioCache.length; si++) {
      var sc = scenarioCache[si];
      if (sc.impliedPrice !== undefined && sc.name !== currentScenario) {
        scenarioPrices.push(sc.impliedPrice);
      }
    }

    // Combine historical + target for axis scaling
    var historicalDates = data.map(function (p) { return new Date(p.d); });
    var allDates = historicalDates.concat([targetDate]);
    var highs = data.map(function (p) { return p.h; });
    var lows = data.map(function (p) { return p.l; });
    var allTargetPrices = scenarioPrices.concat([lastClose]);
    var pricePadLo = inSummary ? 0.95 : 0.93;
    var pricePadHi = inSummary ? 1.05 : 1.07;
    var minPrice = Math.min(Math.min.apply(null, lows), Math.min.apply(null, allTargetPrices)) * pricePadLo;
    var maxPrice = Math.max(Math.max.apply(null, highs), Math.max.apply(null, allTargetPrices)) * pricePadHi;
    var minDateMs = allDates[0].getTime();
    var maxDateMs = targetDate.getTime();

    // Chart layout — tighter padding when inside summary tab
    var pad = inSummary
      ? { top: 14, right: 100, bottom: 14, left: 12 }
      : { top: 24, right: 108, bottom: 32, left: 56 };
    var cw = w - pad.left - pad.right;
    var ch = h - pad.top - pad.bottom;

    function xPos(date) { return pad.left + ((date.getTime() - minDateMs) / (maxDateMs - minDateMs)) * cw; }
    function yPos(price) { return pad.top + (1 - (price - minPrice) / (maxPrice - minPrice)) * ch; }

    // Read CSS variables
    var cs = getComputedStyle(document.documentElement);
    var colorText = cs.getPropertyValue("--color-text").trim();
    var colorMuted = cs.getPropertyValue("--color-text-muted").trim();
    var colorFaint = cs.getPropertyValue("--color-text-faint").trim();
    var colorDivider = cs.getPropertyValue("--color-divider").trim();
    var colorPrimary = cs.getPropertyValue("--color-primary").trim();
    var colorPositive = cs.getPropertyValue("--color-positive").trim();
    var colorNegative = cs.getPropertyValue("--color-negative").trim();

    // Clear
    ctx.clearRect(0, 0, w, h);

    // Grid lines
    ctx.strokeStyle = colorDivider;
    ctx.lineWidth = 0.5;
    var priceStep = Math.pow(10, Math.floor(Math.log10(maxPrice - minPrice))) / 2;
    if ((maxPrice - minPrice) / priceStep > 10) priceStep *= 2;
    if ((maxPrice - minPrice) / priceStep < 3) priceStep /= 2;
    ctx.font = (inSummary ? "9" : "11") + "px Inter, sans-serif";
    ctx.fillStyle = colorFaint;
    ctx.textAlign = "right";
    for (var g = Math.ceil(minPrice / priceStep) * priceStep; g < maxPrice; g += priceStep) {
      var gy = yPos(g);
      ctx.beginPath();
      ctx.moveTo(pad.left, gy);
      ctx.lineTo(w - pad.right, gy);
      ctx.stroke();
      if (!inSummary) {
        ctx.fillText("$" + g.toFixed(0), pad.left - 6, gy + 4);
      }
    }

    // Date labels on x-axis
    ctx.textAlign = "center";
    ctx.fillStyle = colorFaint;
    var monthsSeen = {};
    var lastLabelX = -Infinity;
    var minLabelGap = w < 500 ? 60 : 40;
    for (var di = 0; di < allDates.length; di++) {
      var dateObj = allDates[di];
      var monthKey = dateObj.getFullYear() + "-" + dateObj.getMonth();
      if (!monthsSeen[monthKey]) {
        monthsSeen[monthKey] = true;
        var dx = xPos(dateObj);
        if (dx > pad.left + 20 && dx < w - pad.right - 20 && dx - lastLabelX >= minLabelGap) {
          var monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
          ctx.fillText(monthNames[dateObj.getMonth()] + " " + String(dateObj.getFullYear()).slice(2), dx, h - (inSummary ? 2 : pad.bottom - 16));
          lastLabelX = dx;
        }
      }
    }

    // Build path points for historical price line
    var pathPts = [];
    for (var hi = 0; hi < data.length; hi++) {
      pathPts.push({ x: xPos(new Date(data[hi].d)), y: yPos(data[hi].c) });
    }

    // Gradient fill under the line (primary color fading to transparent)
    var gradFill = ctx.createLinearGradient(0, pad.top, 0, h - pad.bottom);
    gradFill.addColorStop(0, colorPrimary);
    gradFill.addColorStop(1, "rgba(32,128,141,0)");
    ctx.beginPath();
    ctx.moveTo(pathPts[0].x, pathPts[0].y);
    for (var fi = 1; fi < pathPts.length; fi++) {
      ctx.lineTo(pathPts[fi].x, pathPts[fi].y);
    }
    ctx.lineTo(pathPts[pathPts.length - 1].x, h - pad.bottom);
    ctx.lineTo(pathPts[0].x, h - pad.bottom);
    ctx.closePath();
    ctx.globalAlpha = 0.15;
    ctx.fillStyle = gradFill;
    ctx.fill();
    ctx.globalAlpha = 1;

    // Historical price line (primary color with glow)
    ctx.shadowColor = colorPrimary;
    ctx.shadowBlur = inSummary ? 4 : 6;
    ctx.strokeStyle = colorPrimary;
    ctx.lineWidth = inSummary ? 1.5 : 2;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(pathPts[0].x, pathPts[0].y);
    for (var pi = 1; pi < pathPts.length; pi++) {
      ctx.lineTo(pathPts[pi].x, pathPts[pi].y);
    }
    ctx.stroke();
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;

    // Draw saved scenario targets (non-current scenarios as dimmer lines)
    var targetX = xPos(targetDate);
    var curPriceX = xPos(lastDate);
    var drawnLabels = []; // track label y-positions to avoid overlap

    for (var sj = 0; sj < scenarioCache.length; sj++) {
      var scen = scenarioCache[sj];
      if (scen.impliedPrice === undefined) continue;
      if (scen.name === currentScenario) continue; // current scenario drawn separately

      var scenCaseType = scen.caseType || "base";
      var scenColor = scenCaseType === "bull" ? colorPositive : scenCaseType === "bear" ? colorNegative : colorMuted;
      var scenTarget = scen.impliedPrice;
      var scenY = yPos(scenTarget);

      // Dashed line
      ctx.strokeStyle = scenColor;
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.5;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(curPriceX, yPos(lastClose));
      ctx.lineTo(targetX, scenY);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;

      // Small dot
      ctx.beginPath();
      ctx.arc(targetX, scenY, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = scenColor;
      ctx.globalAlpha = 0.7;
      ctx.fill();
      ctx.globalAlpha = 1;

      // Label — to the right of the dot
      ctx.font = "600 10px Inter, sans-serif";
      ctx.fillStyle = scenColor;
      ctx.globalAlpha = 0.8;
      var scenPct = ((scenTarget / lastClose) - 1) * 100;
      var scenPctStr = scenPct >= 0 ? "+" + Math.round(scenPct) + "%" : Math.round(scenPct) + "%";
      var scenLabel = "$" + Math.round(scenTarget) + " (" + scenPctStr + ")";
      // Avoid overlap with nearby labels
      var labelY = scenY + 4;
      for (var li = 0; li < drawnLabels.length; li++) {
        if (Math.abs(labelY - drawnLabels[li]) < 13) {
          labelY = drawnLabels[li] + 13;
        }
      }
      drawnLabels.push(labelY);
      ctx.textAlign = "left";
      ctx.fillText(scenLabel, targetX + 8, labelY);
      ctx.globalAlpha = 1;
    }

    // Dotted diagonal line from current price to 1Y DCF target (CURRENT scenario)
    ctx.strokeStyle = colorPrimary;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(xPos(lastDate), yPos(lastClose));
    ctx.lineTo(xPos(targetDate), yPos(dcfTarget));
    ctx.stroke();
    ctx.setLineDash([]);

    // DCF target dot and label
    var dcfX = xPos(targetDate);
    var dcfY = yPos(dcfTarget);
    ctx.beginPath();
    ctx.arc(dcfX, dcfY, 5, 0, Math.PI * 2);
    ctx.fillStyle = colorPrimary;
    ctx.fill();
    ctx.font = "600 10px Inter, sans-serif";
    ctx.fillStyle = colorPrimary;
    ctx.textAlign = "left";
    var dcfPct = ((dcfTarget / lastClose) - 1) * 100;
    var dcfPctStr = dcfPct >= 0 ? "+" + Math.round(dcfPct) + "%" : Math.round(dcfPct) + "%";
    var dcfLabelText = "$" + dcfTarget.toFixed(0) + " (" + dcfPctStr + ")";
    // Avoid overlap with scenario labels drawn above
    var dcfLabelY = dcfY + 4;
    for (var dli = 0; dli < drawnLabels.length; dli++) {
      if (Math.abs(dcfLabelY - drawnLabels[dli]) < 13) {
        dcfLabelY = drawnLabels[dli] + 13;
      }
    }
    drawnLabels.push(dcfLabelY);
    ctx.fillText(dcfLabelText, dcfX + 8, dcfLabelY);

    // Current price dot with glow ring
    var curX = xPos(lastDate);
    var curY = yPos(lastClose);
    ctx.shadowColor = colorPrimary;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(curX, curY, 4, 0, Math.PI * 2);
    ctx.fillStyle = colorPrimary;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.shadowColor = "transparent";
    // Outer ring
    ctx.beginPath();
    ctx.arc(curX, curY, 7, 0, Math.PI * 2);
    ctx.strokeStyle = colorPrimary;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.3;
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.font = "bold 11px Inter, sans-serif";
    ctx.fillStyle = colorText;
    ctx.textAlign = "right";
    ctx.fillText("$" + lastClose.toFixed(2), curX - 12, curY + 4);

    // Update KPIs
    setText("priceKpiCurrent", "$" + lastClose.toFixed(2));
    setText("priceKpiDCF", fmt(dcfTarget, "price"));
    // Update label dynamically
    var priceKpiLabel = document.getElementById("priceKpiDCFLabel");
    if (priceKpiLabel) {
      var tgtLabelMap = { dcf: "1Y Target (DCF)", pe: "1Y Target (P/E)", blended: "1Y Target (Blended)" };
      priceKpiLabel.textContent = (blendedOrDcf && blendedOrDcf.mode) ? (tgtLabelMap[blendedOrDcf.mode] || "1Y Target (DCF)") : "1Y Target (DCF)";
    }
    var impliedUpside = (dcfTarget / lastClose) - 1;
    var elUp = document.getElementById("priceKpiUpside");
    if (elUp) {
      elUp.textContent = (impliedUpside >= 0 ? "+" : "") + (impliedUpside * 100).toFixed(1) + "%";
      elUp.className = "kpi-value " + (impliedUpside >= 0 ? "positive" : "negative");
    }
    // Volume KPI
    var lastVol = data[data.length - 1].v;
    if (lastVol) {
      var volStr = lastVol >= 1000000 ? (lastVol / 1000000).toFixed(1) + "M" : lastVol >= 1000 ? (lastVol / 1000).toFixed(0) + "K" : String(lastVol);
      setText("priceKpiVolume", volStr);
    }
    // Updated timestamp
    var updatedEl = document.getElementById("priceUpdated");
    if (updatedEl) {
      updatedEl.textContent = "Last: " + data[data.length - 1].d;
    }
  }

  function bindPriceViewButtons() {
    var btns = document.querySelectorAll("[data-price-view]");
    for (var i = 0; i < btns.length; i++) {
      btns[i].addEventListener("click", function () {
        var view = this.getAttribute("data-price-view");
        priceChartState.view = view;
        var all = document.querySelectorAll("[data-price-view]");
        for (var j = 0; j < all.length; j++) all[j].classList.remove("active");
        this.classList.add("active");
        var d = runModel();
        var dcfR = runDCF(d);
        var peR = runPEValuation(d);
        loadPriceChart(computeBlendedPrice(dcfR, peR));
      });
    }
  }

  function bindRefreshButton() {
    var btn = document.getElementById("priceRefreshBtn");
    if (!btn) return;
    btn.addEventListener("click", function () {
      btn.classList.add("spinning");
      refreshQuote(function (err, quote) {
        if (!err && quote) {
          CURRENT_PRICE = quote.price;
          CFG.currentPrice = quote.price;
          setText("headerPrice", "$" + CURRENT_PRICE.toFixed(2));
          setText("heroCurrentPrice", "$" + CURRENT_PRICE.toFixed(2));
          setText("kpiCurrentPrice", "$" + CURRENT_PRICE.toFixed(2));
          showToast("Price updated: $" + CURRENT_PRICE.toFixed(2));
          // Reload chart with fresh bars
          var d = runModel();
          var dcfR = runDCF(d);
          var peR = runPEValuation(d);
          loadPriceChart(computeBlendedPrice(dcfR, peR));
        } else {
          showToast("Could not refresh price");
        }
        btn.classList.remove("spinning");
      });
    });
  }

  // ========== SCENARIO MANAGEMENT ==========
  function getTickerPath() {
    return "/api/scenarios/" + CFG.ticker.toLowerCase();
  }

  function saveScenario(name, caseType) {
    var scenarioData = {};
    for (var key in state) {
      if (state.hasOwnProperty(key)) {
        scenarioData[key] = state[key];
      }
    }
    // Also save lerp modes and per-year overrides
    scenarioData._lerpMode = {};
    for (var lk in lerpMode) {
      if (lerpMode.hasOwnProperty(lk)) {
        scenarioData._lerpMode[lk] = lerpMode[lk];
      }
    }
    scenarioData._perYear = {};
    for (var pk in perYear) {
      if (perYear.hasOwnProperty(pk)) {
        scenarioData._perYear[pk] = perYear[pk].slice();
      }
    }

    // Compute and store implied price (blended) for scenario visualization
    var modelData = runModel();
    var dcfResult = runDCF(modelData);
    var peResult = runPEValuation(modelData);
    var blendedResult = computeBlendedPrice(dcfResult, peResult);
    scenarioData._impliedPrice = Math.round(blendedResult.price * 100) / 100;
    if (caseType) {
      scenarioData._caseType = caseType;
    }

    var xhr = new XMLHttpRequest();
    xhr.open("POST", getTickerPath() + "/" + encodeURIComponent(name), true);
    xhr.setRequestHeader("Content-Type", "application/json");
    xhr.onload = function () {
      if (xhr.status === 200) {
        currentScenario = name;
        updateScenarioUI();
        showToast("Saved: " + name);
      } else {
        showToast("Error saving scenario");
      }
    };
    xhr.onerror = function () { showToast("Error saving scenario"); };
    xhr.send(JSON.stringify(scenarioData));
  }

  function loadScenario(name) {
    var xhr = new XMLHttpRequest();
    xhr.open("GET", getTickerPath() + "/" + encodeURIComponent(name), true);
    xhr.onload = function () {
      if (xhr.status === 200) {
        var scenarioData = JSON.parse(xhr.responseText);

        // Restore lerp modes if saved
        if (scenarioData._lerpMode) {
          for (var lk in scenarioData._lerpMode) {
            if (scenarioData._lerpMode.hasOwnProperty(lk)) {
              lerpMode[lk] = scenarioData._lerpMode[lk];
            }
          }
          delete scenarioData._lerpMode;
        }

        // Restore per-year overrides if saved
        if (scenarioData._perYear) {
          perYear = {};
          for (var pk in scenarioData._perYear) {
            if (scenarioData._perYear.hasOwnProperty(pk)) {
              perYear[pk] = scenarioData._perYear[pk];
            }
          }
          delete scenarioData._perYear;
        }

        for (var key in scenarioData) {
          if (scenarioData.hasOwnProperty(key) && state.hasOwnProperty(key)) {
            state[key] = scenarioData[key];
          }
        }
        currentScenario = name;
        var ppEl = document.getElementById("pricingPowerToggle");
        if (ppEl) ppEl.checked = state.hasPricingPower;
        updateScenarioUI();
        updateUI();
        showToast("Loaded: " + name);
      } else {
        showToast("Scenario not found");
      }
    };
    xhr.onerror = function () { showToast("Error loading scenario"); };
    xhr.send();
  }

  function deleteScenario(name) {
    var xhr = new XMLHttpRequest();
    xhr.open("DELETE", getTickerPath() + "/" + encodeURIComponent(name), true);
    xhr.onload = function () {
      if (xhr.status === 200) {
        if (currentScenario === name) currentScenario = "base";
        refreshScenarioList();
        showToast("Deleted: " + name);
      }
    };
    xhr.send();
  }

  var _scenarioRefreshPending = false;
  function refreshScenarioList() {
    if (_scenarioRefreshPending) return;
    _scenarioRefreshPending = true;
    var xhr = new XMLHttpRequest();
    xhr.open("GET", getTickerPath(), true);
    xhr.onload = function () {
      _scenarioRefreshPending = false;
      if (xhr.status === 200) {
        var list = JSON.parse(xhr.responseText);
        scenarioCache = list;
        renderScenarioBar();
        renderScenarioTags(list);
        // Re-render price chart to show scenario dots
        if (priceChartState.bars.length) {
          var d = runModel();
          var dcfR = runDCF(d);
          var peR = runPEValuation(d);
          renderPriceChart(computeBlendedPrice(dcfR, peR));
        }
      }
    };
    xhr.onerror = function () { _scenarioRefreshPending = false; };
    xhr.send();
  }

  // ========== SCENARIO COLORS ==========
  var CASE_COLORS = {
    base: { bg: "rgba(32, 128, 141, 0.15)", border: "#20808D", text: "#20808D" },
    bull: { bg: "rgba(34, 197, 94, 0.12)", border: "#22c55e", text: "#22c55e" },
    bear: { bg: "rgba(239, 68, 68, 0.12)", border: "#ef4444", text: "#ef4444" }
  };

  function getCaseColor(caseType) {
    return CASE_COLORS[caseType] || CASE_COLORS.base;
  }

  var SLOT_ORDER = ["base", "bull", "bear"];

  // ========== REVENUE DECAY PRESETS ==========
  // Decay factor applied to YoY revenue growth starting after year 2 (FY28+).
  // Each year: growth[i] = growth[i-1] * decayFactor.
  // Configurable per ticker via CFG.decayPresets, otherwise use defaults.
  var DECAY_PRESETS = CFG.decayPresets || {
    bull: { factor: 0.90, label: "0.90x decay" },
    base: { factor: 0.85, label: "0.85x decay" },
    bear: { factor: 0.80, label: "0.80x decay" }
  };

  /**
   * Apply a revenue growth decay preset for the given scenario slot.
   * Anchor year is set by settings.decayStartYear (default FY27, index 2).
   * Years before the anchor keep their current values. Anchor onward decays.
   * Switches testsYoY to manual mode, populates perYear, saves as scenario.
   */
  function applyDecayPreset(slot) {
    var preset = DECAY_PRESETS[slot];
    if (!preset) return;

    var startIdx = settings.decayStartYear; // e.g. 2 = FY27
    if (startIdx < 1) startIdx = 1;
    if (startIdx > 10) startIdx = 10;

    // Read existing per-year values (or compute from lerp) to preserve pre-anchor years
    var currentArr = getEffectivePerYear("testsYoY");

    // Build the trajectory: keep years before startIdx, decay from startIdx onward
    var arr = [null]; // index 0 = actuals
    for (var i = 1; i <= 10; i++) {
      if (i < startIdx) {
        // Keep existing value
        arr.push(currentArr[i] !== null && currentArr[i] !== undefined ? roundPrecision(currentArr[i], 0.1) : 0);
      } else if (i === startIdx) {
        // Anchor: use the value at startIdx as-is (user sets this)
        arr.push(currentArr[i] !== null && currentArr[i] !== undefined ? roundPrecision(currentArr[i], 0.1) : roundPrecision(state.volGrowth, 0.1));
      } else {
        // Decay from previous year
        var prev = arr[i - 1];
        var decayed = roundPrecision(prev * preset.factor, 0.1);
        if (decayed < 0) decayed = 0;
        arr.push(decayed);
      }
    }

    // Apply: switch testsYoY to manual mode and set the trajectory
    lerpMode.testsYoY = false;
    perYear.testsYoY = arr;

    // Update UI immediately, then save as this slot's scenario
    updateUI();
    saveScenario(slot, slot);
    var startLabel = YEARS[startIdx] || ("Y" + startIdx);
    showToast(slot.charAt(0).toUpperCase() + slot.slice(1) + ": " + preset.label + " from " + startLabel);
  }

  /**
   * Get the effective per-year array for a metric (from perYear if manual, or compute from lerp).
   * Returns array of length 11 (index 0 = null for actuals).
   */
  function getEffectivePerYear(metricKey) {
    var arr = [null];
    if (!lerpMode[metricKey] && perYear[metricKey]) {
      // Manual mode — use stored values
      for (var i = 1; i <= 10; i++) {
        arr.push(perYear[metricKey][i] !== undefined ? perYear[metricKey][i] : 0);
      }
    } else {
      // Lerp mode — compute interpolated values
      var metric = null;
      for (var m = 0; m < EDITABLE_METRICS.length; m++) {
        if (EDITABLE_METRICS[m].key === metricKey) { metric = EDITABLE_METRICS[m]; break; }
      }
      if (metric && metric.key26 && metric.key35) {
        var v26 = state[metric.key26];
        var v35 = state[metric.key35];
        for (var j = 1; j <= 10; j++) {
          var t = (j - 1) / 9;
          arr.push(v26 + (v35 - v26) * t);
        }
      } else {
        for (var k = 1; k <= 10; k++) arr.push(0);
      }
    }
    return arr;
  }

  /**
   * Copy Base scenario assumptions into the target slot, EXCEPT revenue growth.
   * Then apply the slot's decay preset to revenue growth.
   * Useful for quick scenario setup: same margins/opex as base, different rev trajectory.
   */
  function copyBaseKeepRevGrowth(slot) {
    // Find base scenario in cache
    var baseName = null;
    for (var i = 0; i < scenarioCache.length; i++) {
      if ((scenarioCache[i].caseType || "base") === "base") {
        baseName = scenarioCache[i].name;
        break;
      }
    }
    if (!baseName) {
      showToast("Save a Base scenario first");
      return;
    }

    // Load base scenario JSON, apply everything except rev growth, then apply decay
    var xhr = new XMLHttpRequest();
    xhr.open("GET", getTickerPath() + "/" + encodeURIComponent(baseName), true);
    xhr.onload = function () {
      if (xhr.status !== 200) { showToast("Could not load Base"); return; }
      var baseData = JSON.parse(xhr.responseText);

      // Save current rev growth state (perYear + lerpMode for testsYoY)
      var savedRevLerp = lerpMode.testsYoY;
      var savedRevPerYear = perYear.testsYoY ? perYear.testsYoY.slice() : null;
      var savedVolGrowth = state.volGrowth;
      var savedVolGrowth35 = state.volGrowth35;

      // Apply base scenario state (all keys)
      if (baseData._lerpMode) {
        for (var lk in baseData._lerpMode) {
          if (baseData._lerpMode.hasOwnProperty(lk)) lerpMode[lk] = baseData._lerpMode[lk];
        }
      }
      if (baseData._perYear) {
        for (var pk in baseData._perYear) {
          if (baseData._perYear.hasOwnProperty(pk)) perYear[pk] = baseData._perYear[pk];
        }
      }
      for (var key in baseData) {
        if (baseData.hasOwnProperty(key) && state.hasOwnProperty(key)) {
          state[key] = baseData[key];
        }
      }

      // Restore revenue growth state
      state.volGrowth = savedVolGrowth;
      state.volGrowth35 = savedVolGrowth35;
      lerpMode.testsYoY = savedRevLerp !== undefined ? savedRevLerp : true;
      if (savedRevPerYear) {
        perYear.testsYoY = savedRevPerYear;
      } else {
        delete perYear.testsYoY;
      }

      // Now apply the decay preset for this slot's rev growth
      applyDecayPreset(slot);
    };
    xhr.onerror = function () { showToast("Error loading Base"); };
    xhr.send();
  }
  var defaultScenarioSlot = "base";
  var _openSlotMenu = null; // tracks which slot dropdown is open

  // ========== RENDER SCENARIO BAR — 3 fixed slots ==========
  function renderScenarioBar() {
    var container = document.getElementById("scenarioBar");
    if (!container) return;

    // Build a map from caseType to scenario data from cache
    var slotMap = {};
    for (var i = 0; i < scenarioCache.length; i++) {
      var sc = scenarioCache[i];
      var ct = sc.caseType || "base";
      if (!slotMap[ct]) slotMap[ct] = sc;
    }

    // Determine which slot is active (currently loaded)
    var activeSlot = "base";
    for (var ai = 0; ai < scenarioCache.length; ai++) {
      if (scenarioCache[ai].name === currentScenario) {
        activeSlot = scenarioCache[ai].caseType || "base";
        break;
      }
    }

    var html = '<div class="sbar-inner">';

    for (var si = 0; si < SLOT_ORDER.length; si++) {
      var slot = SLOT_ORDER[si];
      var colors = getCaseColor(slot);
      var isActive = slot === activeSlot;
      var saved = slotMap[slot];
      var slotLabel = slot.charAt(0).toUpperCase() + slot.slice(1);
      var priceStr = saved && saved.impliedPrice !== undefined ? "$" + Math.round(saved.impliedPrice) : "";
      var isDefault = saved && saved.name === defaultScenarioSlot;
      var isOpen = _openSlotMenu === slot;

      // Slot wrapper — holds the button and dropdown
      html += '<div class="sbar-wrap' + (isOpen ? ' sbar-open' : '') + '">';

      // Main slot button area (tap to load)
      html += '<div class="sbar-slot' + (isActive ? ' sbar-active' : '') + (saved ? '' : ' sbar-empty') + '"';
      html += ' data-slot="' + slot + '"';
      html += ' style="';
      if (isActive) {
        html += 'background:' + colors.bg + ';';
        html += 'border-color:' + colors.border + ';';
        html += 'color:' + colors.text + ';';
      }
      html += '">';
      html += '<span class="sbar-load" data-slot="' + slot + '">';
      html += '<span class="sbar-label">' + slotLabel + '</span>';
      if (priceStr) html += '<span class="sbar-price">' + priceStr + '</span>';
      if (isDefault && saved) html += '<span class="sbar-star">\u2605</span>';
      html += '</span>';
      // Chevron toggle — opens dropdown
      html += '<span class="sbar-chevron" data-slot="' + slot + '">\u25BE</span>';
      html += '</div>';

      // Dropdown menu
      if (isOpen) {
        html += '<div class="sbar-menu" data-slot="' + slot + '" style="border-color:' + colors.border + ';">';
        var decayInfo = DECAY_PRESETS[slot];
        if (decayInfo) {
          html += '<button class="sbar-menu-item sbar-menu-decay" data-slot="' + slot + '">Quick setup <span class="sbar-decay-tag">' + decayInfo.label + '</span></button>';
          html += '<button class="sbar-menu-item sbar-menu-copybase" data-slot="' + slot + '">Copy Base + decay <span class="sbar-decay-tag">' + decayInfo.label + '</span></button>';
        }
        html += '<button class="sbar-menu-item sbar-menu-save" data-slot="' + slot + '">Save here</button>';
        html += '<button class="sbar-menu-item sbar-menu-default" data-slot="' + slot + '">Set as default</button>';
        html += '</div>';
      }

      html += '</div>'; // close sbar-wrap
    }

    html += '</div>';
    container.innerHTML = html;

    // --- BIND: tap load area to load scenario ---
    var loadAreas = container.querySelectorAll('.sbar-load');
    for (var lb = 0; lb < loadAreas.length; lb++) {
      loadAreas[lb].addEventListener('click', function (e) {
        e.stopPropagation();
        var slot = this.getAttribute('data-slot');
        _openSlotMenu = null;
        var found = null;
        for (var fi = 0; fi < scenarioCache.length; fi++) {
          if ((scenarioCache[fi].caseType || 'base') === slot) {
            found = scenarioCache[fi];
            break;
          }
        }
        if (found && found.name !== currentScenario) {
          loadScenario(found.name);
        } else if (!found) {
          // Empty slot: save current state here
          saveScenario(slot, slot);
        } else {
          // Already loaded — just close any menu
          renderScenarioBar();
        }
      });
    }

    // --- BIND: chevron toggles dropdown ---
    var chevrons = container.querySelectorAll('.sbar-chevron');
    for (var ch = 0; ch < chevrons.length; ch++) {
      chevrons[ch].addEventListener('click', function (e) {
        e.stopPropagation();
        var slot = this.getAttribute('data-slot');
        _openSlotMenu = _openSlotMenu === slot ? null : slot;
        renderScenarioBar();
      });
    }

    // --- BIND: "Save here" ---
    var saveBtns = container.querySelectorAll('.sbar-menu-save');
    for (var sv = 0; sv < saveBtns.length; sv++) {
      saveBtns[sv].addEventListener('click', function (e) {
        e.stopPropagation();
        var slot = this.getAttribute('data-slot');
        _openSlotMenu = null;
        saveScenario(slot, slot);
      });
    }

    // --- BIND: "Set as default" ---
    var defBtns = container.querySelectorAll('.sbar-menu-default');
    for (var df = 0; df < defBtns.length; df++) {
      defBtns[df].addEventListener('click', function (e) {
        e.stopPropagation();
        var slot = this.getAttribute('data-slot');
        _openSlotMenu = null;
        // Ensure we set this slot as current then save as default
        var found = null;
        for (var fi = 0; fi < scenarioCache.length; fi++) {
          if ((scenarioCache[fi].caseType || 'base') === slot) {
            found = scenarioCache[fi];
            break;
          }
        }
        if (found) {
          currentScenario = found.name;
          saveAsDefault();
          renderScenarioBar();
        } else {
          showToast('Save scenario first');
          renderScenarioBar();
        }
      });
    }

    // --- BIND: "Quick setup" (decay preset) ---
    var decayBtns = container.querySelectorAll('.sbar-menu-decay');
    for (var dc = 0; dc < decayBtns.length; dc++) {
      decayBtns[dc].addEventListener('click', function (e) {
        e.stopPropagation();
        var slot = this.getAttribute('data-slot');
        _openSlotMenu = null;
        applyDecayPreset(slot);
      });
    }

    // --- BIND: "Copy Base + decay" ---
    var copyBaseBtns = container.querySelectorAll('.sbar-menu-copybase');
    for (var cb = 0; cb < copyBaseBtns.length; cb++) {
      copyBaseBtns[cb].addEventListener('click', function (e) {
        e.stopPropagation();
        var slot = this.getAttribute('data-slot');
        _openSlotMenu = null;
        copyBaseKeepRevGrowth(slot);
      });
    }
  }

  // Close dropdown when tapping elsewhere
  document.addEventListener('click', function () {
    if (_openSlotMenu !== null) {
      _openSlotMenu = null;
      renderScenarioBar();
    }
  });

  // Legacy compatibility — renderScenarioTags also updates hero tags
  function renderScenarioTags(list) {
    var container = document.getElementById("scenarioTags");
    if (!container) return;

    var html = "";
    for (var i = 0; i < list.length; i++) {
      var s = list[i];
      var name = typeof s === "string" ? s : s.name;
      var impliedPrice = s.impliedPrice;
      var caseType = s.caseType || "base";
      var colors = getCaseColor(caseType);
      var isCurrent = name === currentScenario;

      var tagCls = "scenario-tag" + (isCurrent ? " scenario-tag-active" : "");
      var cursor = isCurrent ? "default" : "pointer";
      html += '<div class="' + tagCls + '" data-scenario="' + name + '"';
      html += ' style="';
      html += "background:" + colors.bg + ";";
      html += "border-color:" + colors.border + ";";
      html += "color:" + colors.text + ";";
      html += "cursor:" + cursor + ";";
      if (isCurrent) html += "box-shadow:0 0 0 2px " + colors.border + ";";
      html += '">';
      html += '<span class="scenario-tag-name">' + name + "</span>";
      if (impliedPrice !== undefined) {
        html += '<span class="scenario-tag-price">$' + Math.round(impliedPrice) + "</span>";
      }
      html += "</div>";
    }
    container.innerHTML = html;

    // Bind click on entire tag to load that scenario (if not current)
    var allTags = container.querySelectorAll(".scenario-tag");
    for (var t = 0; t < allTags.length; t++) {
      allTags[t].addEventListener("click", function () {
        var scenName = this.getAttribute("data-scenario");
        if (scenName !== currentScenario) {
          loadScenario(scenName);
        }
      });
    }
  }

  function updateScenarioUI() {
    refreshScenarioList();
  }

  // ========== SAVE AS DEFAULT ==========
  function saveAsDefault() {
    var xhr = new XMLHttpRequest();
    xhr.open("POST", getTickerPath() + "/_default", true);
    xhr.setRequestHeader("Content-Type", "application/json");
    xhr.onload = function () {
      if (xhr.status === 200) {
        defaultScenarioSlot = currentScenario;
        renderScenarioBar();
        showToast("Default set: " + currentScenario);
      } else {
        showToast("Error saving default");
      }
    };
    xhr.onerror = function () { showToast("Error saving default"); };
    xhr.send(JSON.stringify({ name: currentScenario }));
  }

  function loadDefaultScenario(cb) {
    var xhr = new XMLHttpRequest();
    xhr.open("GET", getTickerPath() + "/_default", true);
    xhr.onload = function () {
      if (xhr.status === 200) {
        var data = JSON.parse(xhr.responseText);
        if (data.name) {
          defaultScenarioSlot = data.name;
          loadScenario(data.name);
        }
      }
      if (cb) cb();
    };
    xhr.onerror = function () { if (cb) cb(); };
    xhr.send();
  }

  function showToast(msg) {
    var toast = document.getElementById("toast");
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add("visible");
    setTimeout(function () { toast.classList.remove("visible"); }, 2000);
  }

  // ========== SETTINGS TAB ==========
  function renderSettings() {
    var container = document.getElementById("settingsPage");
    if (!container) return;

    var baseYr = settings.dcfBaseYear;
    var baseYrLabel = YEARS[baseYr] || "FY26E";

    var html = '';
    html += '<h2 class="set-title">Settings</h2>';

    // DCF Base Year
    html += '<div class="set-section">';
    html += '<div class="set-row">';
    html += '<div class="set-row-info">';
    html += '<span class="set-label">DCF Base Year</span>';
    html += '<span class="set-desc">First year to discount cash flows from. Default is FY27E.</span>';
    html += '</div>';
    html += '<div class="set-toggle-group" id="dcfBaseYearToggle">';
    for (var yi = 1; yi <= 5; yi++) {
      var yrLbl = YEARS[yi].replace("FY", "'").replace("E", "");
      var isActive = yi === baseYr ? ' active' : '';
      html += '<button class="set-toggle-btn' + isActive + '" data-base-yr="' + yi + '">' + yrLbl + '</button>';
    }
    html += '</div>';
    html += '</div>';
    html += '</div>';

    // Stock Price
    html += '<div class="set-section">';
    html += '<div class="set-row">';
    html += '<div class="set-row-info">';
    html += '<span class="set-label">Stock Price</span>';
    html += '<span class="set-desc">Current: $' + CURRENT_PRICE.toFixed(2) + '</span>';
    html += '</div>';
    html += '<div class="set-price-controls">';
    html += '<div class="set-price-input-wrap">';
    html += '<span class="set-price-prefix">$</span>';
    html += '<input type="number" class="set-price-input" id="manualPriceInput" inputmode="decimal" step="0.01" placeholder="' + CURRENT_PRICE.toFixed(2) + '">';
    html += '</div>';
    html += '<button class="set-action-btn" id="applyPriceBtn">Set</button>';
    html += '<button class="set-action-btn set-action-secondary" id="refreshPriceBtn">Refresh</button>';
    html += '</div>';
    html += '</div>';
    html += '</div>';

    // Decay Start Year
    var decayYr = settings.decayStartYear;
    html += '<div class="set-section">';
    html += '<div class="set-row">';
    html += '<div class="set-row-info">';
    html += '<span class="set-label">Decay Start Year</span>';
    html += '<span class="set-desc">Year from which auto-decay begins. Earlier years keep their manual values.</span>';
    html += '</div>';
    html += '<div class="set-toggle-group" id="decayStartYearToggle">';
    for (var di = 1; di <= 5; di++) {
      var dLbl = YEARS[di].replace("FY", "'").replace("E", "");
      var dActive = di === decayYr ? ' active' : '';
      html += '<button class="set-toggle-btn' + dActive + '" data-decay-yr="' + di + '">' + dLbl + '</button>';
    }
    html += '</div>';
    html += '</div>';
    html += '</div>';

    // P/E Convergence Settings
    html += '<div class="set-section">';
    html += '<div class="set-row">';
    html += '<div class="set-row-info">';
    html += '<span class="set-label">P/E Growth Threshold</span>';
    html += '<span class="set-desc">Revenue growth rate that triggers P/E valuation. Default 8%.</span>';
    html += '</div>';
    html += '<div class="set-price-controls">';
    html += '<div class="set-price-input-wrap">';
    html += '<input type="number" class="set-price-input" id="peThresholdInput" inputmode="decimal" step="1" min="1" max="30" value="' + settings.peGrowthThreshold + '">';
    html += '<span class="set-price-suffix">%</span>';
    html += '</div>';
    html += '<button class="set-action-btn" id="applyPeThresholdBtn">Set</button>';
    html += '</div>';
    html += '</div>';
    html += '<div class="set-row">';
    html += '<div class="set-row-info">';
    html += '<span class="set-label">P/E Multiple</span>';
    html += '<span class="set-desc">Multiple applied at convergence year. Default 20x (S&P 500 avg).</span>';
    html += '</div>';
    html += '<div class="set-price-controls">';
    html += '<div class="set-price-input-wrap">';
    html += '<input type="number" class="set-price-input" id="peMultipleInput" inputmode="decimal" step="1" min="5" max="60" value="' + settings.peMultiple + '">';
    html += '<span class="set-price-suffix">x</span>';
    html += '</div>';
    html += '<button class="set-action-btn" id="applyPeMultipleBtn">Set</button>';
    html += '</div>';
    html += '</div>';
    html += '</div>';

    // Valuation Mode
    html += '<div class="set-section">';
    html += '<div class="set-row">';
    html += '<div class="set-row-info">';
    html += '<span class="set-label">Price Target Method</span>';
    html += '<span class="set-desc">How the hero price target is calculated. Blended averages DCF and P/E.</span>';
    html += '</div>';
    var valMode = settings.valuationMode || "blended";
    html += '<div class="set-toggle-group" id="valModeToggle">';
    var valOpts = [{key:"blended",lbl:"Blended"},{key:"dcf",lbl:"DCF"},{key:"pe",lbl:"P/E"}];
    for (var vi = 0; vi < valOpts.length; vi++) {
      var vActive = valOpts[vi].key === valMode ? ' active' : '';
      html += '<button class="set-toggle-btn' + vActive + '" data-val-mode="' + valOpts[vi].key + '">' + valOpts[vi].lbl + '</button>';
    }
    html += '</div>';
    html += '</div>';
    html += '</div>';

    // Revenue Driver Mode (only show if config has revenueBuildup data)
    if (CFG.revenueBuildup) {
      html += '<div class="set-section">';
      html += '<div class="set-row">';
      html += '<div class="set-row-info">';
      html += '<span class="set-label">Revenue Driver</span>';
      html += '<span class="set-desc">Growth Rate Decay uses the main model\'s interpolated growth. Detailed Buildup uses segment-level assumptions from the Revenue tab.</span>';
      html += '</div>';
      var rdMode = settings.revenueDriverMode || "decay";
      html += '<div class="set-toggle-group" id="revDriverModeToggle">';
      var rdOpts = [{key:"decay",lbl:"Decay"},{key:"buildup",lbl:"Buildup"}];
      for (var rdi = 0; rdi < rdOpts.length; rdi++) {
        var rdActive = rdOpts[rdi].key === rdMode ? ' active' : '';
        html += '<button class="set-toggle-btn' + rdActive + '" data-rev-driver="' + rdOpts[rdi].key + '">' + rdOpts[rdi].lbl + '</button>';
      }
      html += '</div>';
      html += '</div>';
      html += '</div>';
    }

    container.innerHTML = html;

    // Bind Revenue Driver Mode toggles
    var revDriverBtns = container.querySelectorAll("[data-rev-driver]");
    for (var rbi = 0; rbi < revDriverBtns.length; rbi++) {
      revDriverBtns[rbi].addEventListener("click", function () {
        var mode = this.getAttribute("data-rev-driver");
        settings.revenueDriverMode = mode;
        var all = container.querySelectorAll("[data-rev-driver]");
        for (var j = 0; j < all.length; j++) all[j].classList.remove("active");
        this.classList.add("active");
        updateUI();
        // Also notify the Revenue tab to refresh if it has a render function
        if (window._revTabRefresh) window._revTabRefresh();
        var modeLabels = { decay: "Growth Rate Decay", buildup: "Detailed Revenue Buildup" };
        showToast("Revenue: " + (modeLabels[mode] || mode));
      });
    }

    // Bind DCF base year toggles
    var baseYrBtns = container.querySelectorAll("[data-base-yr]");
    for (var bi = 0; bi < baseYrBtns.length; bi++) {
      baseYrBtns[bi].addEventListener("click", function () {
        var yr = parseInt(this.getAttribute("data-base-yr"), 10);
        settings.dcfBaseYear = yr;
        var all = container.querySelectorAll("[data-base-yr]");
        for (var j = 0; j < all.length; j++) all[j].classList.remove("active");
        this.classList.add("active");
        // Update description
        var descEl = container.querySelector(".set-desc");
        if (descEl) descEl.textContent = 'First year to discount cash flows from. Default is FY27E.';
        updateUI();
        showToast("DCF base year set to " + YEARS[yr]);
      });
    }

    // Bind manual price input
    var applyPriceBtn = document.getElementById("applyPriceBtn");
    var manualInput = document.getElementById("manualPriceInput");
    if (applyPriceBtn && manualInput) {
      var applyManualPrice = function () {
        var val = parseFloat(manualInput.value);
        if (!val || val <= 0) {
          showToast("Enter a valid price");
          return;
        }
        CURRENT_PRICE = val;
        CFG.currentPrice = val;
        setText("headerPrice", "$" + CURRENT_PRICE.toFixed(2));
        setText("heroCurrentPrice", "$" + CURRENT_PRICE.toFixed(2));
        setText("kpiCurrentPrice", "$" + CURRENT_PRICE.toFixed(2));
        manualInput.value = "";
        manualInput.placeholder = CURRENT_PRICE.toFixed(2);
        renderSettings();
        updateUI();
        showToast("Price set to $" + CURRENT_PRICE.toFixed(2));
      };
      applyPriceBtn.addEventListener("click", applyManualPrice);
      manualInput.addEventListener("keydown", function (e) {
        if (e.key === "Enter") applyManualPrice();
      });
    }

    // Bind refresh price
    var refreshBtn = document.getElementById("refreshPriceBtn");
    if (refreshBtn) {
      refreshBtn.addEventListener("click", function () {
        refreshBtn.textContent = "...";
        refreshBtn.disabled = true;
        syncLivePrice();
        // Also refresh chart data
        var ticker = CFG.ticker || "BLLN";
        var period = priceChartState.view || "1y";
        fetch("/api/prices/" + ticker + "?period=" + period)
          .then(function (res) { return res.json(); })
          .then(function (bars) {
            if (bars && bars.length) {
              priceChartState.bars = bars;
              priceChartState.isLive = true;
              CURRENT_PRICE = bars[bars.length - 1].c;
              CFG.currentPrice = CURRENT_PRICE;
            }
            refreshBtn.textContent = "Refresh";
            refreshBtn.disabled = false;
            renderSettings();
            updateUI();
            showToast("Price updated: $" + CURRENT_PRICE.toFixed(2));
          })
          .catch(function () {
            refreshBtn.textContent = "Refresh";
            refreshBtn.disabled = false;
            showToast("Could not refresh price");
          });
      });
    }

    // Bind decay start year toggles
    var decayYrBtns = container.querySelectorAll("[data-decay-yr]");
    for (var dbi = 0; dbi < decayYrBtns.length; dbi++) {
      decayYrBtns[dbi].addEventListener("click", function () {
        var yr = parseInt(this.getAttribute("data-decay-yr"), 10);
        settings.decayStartYear = yr;
        var all = container.querySelectorAll("[data-decay-yr]");
        for (var j = 0; j < all.length; j++) all[j].classList.remove("active");
        this.classList.add("active");
        showToast("Decay starts from " + YEARS[yr]);
      });
    }

    // Bind P/E threshold
    var peThresholdBtn = document.getElementById("applyPeThresholdBtn");
    var peThresholdInput = document.getElementById("peThresholdInput");
    if (peThresholdBtn && peThresholdInput) {
      var applyPeThreshold = function () {
        var val = parseFloat(peThresholdInput.value);
        if (isNaN(val) || val < 1 || val > 30) {
          showToast("Enter 1\u201330%");
          return;
        }
        settings.peGrowthThreshold = val;
        updateUI();
        showToast("P/E threshold set to " + val + "%");
      };
      peThresholdBtn.addEventListener("click", applyPeThreshold);
      peThresholdInput.addEventListener("keydown", function (e) {
        if (e.key === "Enter") applyPeThreshold();
      });
    }

    // Bind P/E multiple
    var peMultipleBtn = document.getElementById("applyPeMultipleBtn");
    var peMultipleInput = document.getElementById("peMultipleInput");
    if (peMultipleBtn && peMultipleInput) {
      var applyPeMultiple = function () {
        var val = parseFloat(peMultipleInput.value);
        if (isNaN(val) || val < 5 || val > 60) {
          showToast("Enter 5\u201360x");
          return;
        }
        settings.peMultiple = val;
        updateUI();
        showToast("P/E multiple set to " + val + "x");
      };
      peMultipleBtn.addEventListener("click", applyPeMultiple);
      peMultipleInput.addEventListener("keydown", function (e) {
        if (e.key === "Enter") applyPeMultiple();
      });
    }

    // Bind valuation mode toggles
    var valModeBtns = container.querySelectorAll("[data-val-mode]");
    for (var vmi = 0; vmi < valModeBtns.length; vmi++) {
      valModeBtns[vmi].addEventListener("click", function () {
        var mode = this.getAttribute("data-val-mode");
        settings.valuationMode = mode;
        var all = container.querySelectorAll("[data-val-mode]");
        for (var j = 0; j < all.length; j++) all[j].classList.remove("active");
        this.classList.add("active");
        updateUI();
        var modeLabels = { blended: "Blended (DCF + P/E)", dcf: "DCF only", pe: "P/E only" };
        showToast("Target: " + (modeLabels[mode] || mode));
      });
    }
  }

  // ========== BINDINGS ==========
  function bindTabs() {
    var tabBtns = document.querySelectorAll(".tab-btn");
    for (var i = 0; i < tabBtns.length; i++) {
      tabBtns[i].addEventListener("click", function () {
        var targetTab = this.getAttribute("data-tab");
        var allBtns = document.querySelectorAll(".tab-btn");
        for (var j = 0; j < allBtns.length; j++) {
          allBtns[j].classList.remove("active");
          allBtns[j].setAttribute("aria-selected", "false");
        }
        this.classList.add("active");
        this.setAttribute("aria-selected", "true");

        var allPanels = document.querySelectorAll(".tab-panel");
        for (var k = 0; k < allPanels.length; k++) {
          allPanels[k].classList.remove("active");
        }
        var targetPanel = document.getElementById("panel-" + targetTab);
        if (targetPanel) targetPanel.classList.add("active");

        // Close editor sheet when leaving financial tab
        var edSheet = document.getElementById("editorSheet");
        if (edSheet) edSheet.classList.remove("open");

        // Re-render canvas-based tabs when they become visible
        if (targetTab === "summary") {
          var data2 = runModel();
          var dcf2 = runDCF(data2);
          var pe2 = runPEValuation(data2);
          var blended2 = computeBlendedPrice(dcf2, pe2);
          renderSummary(data2, dcf2, pe2, blended2);
        }
        if (targetTab === "settings") {
          renderSettings();
        }
      });
    }
  }

  function bindToggleButtons() {
    document.addEventListener("click", function (e) {
      var btn = e.target.closest(".toggle-btn");
      if (!btn) return;
      var key = btn.getAttribute("data-key");
      var dir = parseInt(btn.getAttribute("data-dir"), 10);
      if (!key || !INCREMENTS[key] || !BOUNDS[key]) return;

      var increment = INCREMENTS[key];
      var newVal = state[key] + (dir * increment);
      newVal = roundPrecision(newVal, increment);
      newVal = clamp(newVal, BOUNDS[key].min, BOUNDS[key].max);

      state[key] = newVal;
      updateUI();
    });
  }

  function bindPricingPowerToggle() {
    var el = document.getElementById("pricingPowerToggle");
    if (!el) return;
    el.addEventListener("change", function () {
      state.hasPricingPower = this.checked;
      var textEl = document.getElementById("pricingPowerText");
      if (textEl) textEl.textContent = this.checked ? "Yes" : "No";
      updateUI();
    });
  }

  function bindCollapsible() {
    var headers = document.querySelectorAll("[data-collapse]");
    for (var i = 0; i < headers.length; i++) {
      headers[i].addEventListener("click", function () {
        var targetId = this.getAttribute("data-collapse");
        var body = document.getElementById(targetId);
        var isExpanded = this.getAttribute("aria-expanded") === "true";
        this.setAttribute("aria-expanded", isExpanded ? "false" : "true");
        body.classList.toggle("collapsed", isExpanded);
      });
    }
  }

  function bindThemeToggle() {
    var toggle = document.querySelector("[data-theme-toggle]");
    var root = document.documentElement;
    var theme = "dark";
    root.setAttribute("data-theme", theme);

    if (toggle) {
      toggle.addEventListener("click", function () {
        theme = theme === "dark" ? "light" : "dark";
        root.setAttribute("data-theme", theme);
        toggle.setAttribute("aria-label", "Switch to " + (theme === "dark" ? "light" : "dark") + " mode");
        toggle.innerHTML = theme === "dark"
          ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>'
          : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
        updateUI();
      });
    }
  }

  function bindReset() {
    var btn = document.getElementById("resetBtn");
    if (btn) {
      btn.addEventListener("click", function () {
        for (var key in defaults) {
          if (defaults.hasOwnProperty(key)) {
            state[key] = defaults[key];
          }
        }
        // Reset lerp modes to defaults
        for (var mk in EDITABLE_METRICS) {
          if (EDITABLE_METRICS.hasOwnProperty(mk)) {
            lerpMode[mk] = EDITABLE_METRICS[mk].lerpDefault;
          }
        }
        perYear = {};
        // Re-initialize metrics that default to manual mode
        for (var mk2 in EDITABLE_METRICS) {
          if (EDITABLE_METRICS.hasOwnProperty(mk2) && EDITABLE_METRICS[mk2].lerpDefault === false) {
            initPerYearFromLerp(mk2);
          }
        }

        var ppEl = document.getElementById("pricingPowerToggle");
        if (ppEl) ppEl.checked = defaults.hasPricingPower;
        closeEditor();
        updateUI();
        showToast("Reset to defaults");
      });
    }
  }

  function bindScenarios() {
    // Scenario bar is dynamically rendered — bindings happen in renderScenarioBar()
  }

  function bindEditor() {
    var overlay = document.getElementById("editorOverlay");
    if (overlay) {
      overlay.addEventListener("click", closeEditor);
    }

    var closeBtn = document.getElementById("editorCloseBtn");
    if (closeBtn) {
      closeBtn.addEventListener("click", closeEditor);
    }

    var upBtn = document.getElementById("editorUpBtn");
    var downBtn = document.getElementById("editorDownBtn");
    if (upBtn) upBtn.addEventListener("click", function () { editorIncrement(1); });
    if (downBtn) downBtn.addEventListener("click", function () { editorIncrement(-1); });

    var input = document.getElementById("editorInput");
    if (input) {
      input.addEventListener("keydown", function (e) {
        if (e.key === "Enter") {
          var val = parseFloat(this.value);
          if (!isNaN(val)) applyEditorValue(val);
          closeEditor();
        } else if (e.key === "Escape") {
          closeEditor();
        }
      });
      input.addEventListener("blur", function () {
        if (!activeEditor) return;
        var val = parseFloat(this.value);
        if (!isNaN(val)) applyEditorValue(val);
      });
    }

    var resetBtn = document.getElementById("editorResetBtn");
    if (resetBtn) {
      resetBtn.addEventListener("click", function () {
        if (!activeEditor) return;
        if (activeEditor.isPerYear) {
          // Reset this year to its lerp-computed value
          var metric = activeEditor.metric;
          var lerpVal = getLerpVal(metric, activeEditor.yearIndex);
          var incVal = getIncrementForMetric(activeEditor.metricKey, activeEditor.yearIndex);
          applyEditorValue(roundPrecision(lerpVal, incVal || 0.1));
        } else {
          var stateKey = activeEditor.stateKey;
          if (defaults[stateKey] !== undefined) {
            applyEditorValue(defaults[stateKey]);
          }
        }
      });
    }
  }

  // ========== INIT ==========
  function init() {
    setText("headerTicker", CFG.ticker);
    setText("headerCompany", CFG.companyName);
    setText("headerPrice", "$" + CURRENT_PRICE.toFixed(2));

    // Initialize testsYoY to manual mode by default and populate from model
    if (lerpMode.testsYoY === false) {
      initPerYearFromLerp("testsYoY");
    }

    bindThemeToggle();
    bindTabs();
    bindToggleButtons();
    bindPricingPowerToggle();
    bindCollapsible();
    bindReset();
    bindScenarios();
    bindEditor();
    bindPriceViewButtons();
    bindRefreshButton();
    refreshScenarioList();
    updateUI();

    // Load default scenario if one was set
    loadDefaultScenario();

    // Mark init as done so live price sync can trigger re-renders
    _livepriceInitDone = true;

    // Expose hooks for custom tabs (e.g., Revenue Buildup) to trigger model re-run
    window._coreUpdateUI = updateUI;
    window._coreSettings = settings;
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
