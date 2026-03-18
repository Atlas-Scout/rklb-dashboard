/* ===== RKLB — Rocket Lab USA Ticker Config ===== */
window.TICKER_CONFIG = {
  ticker: "RKLB",
  companyName: "Rocket Lab USA",
  companyDescription: "End-to-end space company: Electron/HASTE launch, Neutron dev, satellites, components & solar",
  currentPrice: 69.48,

  // Year structure: FY25A actual + 10 years of estimates
  years: ["FY25A","FY26E","FY27E","FY28E","FY29E","FY30E","FY31E","FY32E","FY33E","FY34E","FY35E"],

  // ========== LAST ACTUAL YEAR (FY2025, all in $K) ==========
  actuals: {
    revenue: 601799,
    cogs: 394618,
    grossProfit: 207181,
    grossMargin: 0.344,
    rd: 270716,
    sga: 165303,
    opIncome: -228838,
    otherIncome: 2941,
    tax: -27688,
    netIncome: -198209,
    shares: 530665,
    eps: -0.37,
    da: 43935,
    sbc: 71099,
    capex: -156285,
    wcChange: -58777,
    // Revenue driver: tests = revenue in $K, asp = $1
    tests: 601799,
    asp: 1
  },

  // ========== REVENUE DRIVER ==========
  // RKLB uses revenue-direct model (not volume x ASP)
  // "tests" = total revenue in $K, asp = 1, ASP rows hidden
  revenueDriver: "volume_x_asp",
  baseTests: 601799,
  defaultVolGrowth: 41,
  defaultVolTrajectory: [1232000, 1560000, 1870000, 2244000, 2693000, 3150000, 3560000, 3880000, 4110000],
  terminalGrossMargin: 0.50,

  revenueDriverLabels: {
    volumeLabel: "Revenue ($K)",
    volumeYoYLabel: "Rev Growth %",
    hideAspRows: true
  },

  // ========== REVENUE BUILDUP (custom — shown in Revenue Tab) ==========
  // This data is consumed by a custom Revenue Tab added in index.html
  revenueBuildup: {
    segments: ["Electron/HASTE", "Neutron", "Space Systems"],
    segmentColors: ["#20808D", "#22c55e", "#f59e0b"],
    // FY25A actuals
    actual: {
      electronLaunches: 21,
      electronASP: 9476,    // $9.476M per launch = $199M / 21 launches (in $K per launch)
      electronRevenue: 199042,
      neutronLaunches: 0,
      neutronASP: 0,
      neutronRevenue: 0,
      spaceSystemsRevenue: 402757,
      totalRevenue: 601799
    },
    // FY26E-FY35E (10 years) — base case assumptions
    projections: [
      // FY26E: 25 Electron launches, 0 Neutron (test flight Q4), SS grows with SDA T3 ramp
      { electronLaunches: 25, electronASP: 9900, neutronLaunches: 0, neutronASP: 0, ssGrowthPct: 36 },
      // FY27E: 28 Electron, 3 Neutron commercial, SS accelerates with SDA T2/T3 peak rev rec
      { electronLaunches: 28, electronASP: 10200, neutronLaunches: 3, neutronASP: 55000, ssGrowthPct: 42 },
      // FY28E: 30 Electron, 8 Neutron, SS strong growth from diversified programs
      { electronLaunches: 30, electronASP: 10500, neutronLaunches: 8, neutronASP: 57000, ssGrowthPct: 22 },
      // FY29E: 30 Electron steady state, 14 Neutron ramp, SS mid-growth
      { electronLaunches: 30, electronASP: 10800, neutronLaunches: 14, neutronASP: 58000, ssGrowthPct: 18 },
      // FY30E: 30 Electron, 20 Neutron, SS continues
      { electronLaunches: 30, electronASP: 11000, neutronLaunches: 20, neutronASP: 59000, ssGrowthPct: 15 },
      // FY31E: 28 Electron (some cannibalization), 26 Neutron
      { electronLaunches: 28, electronASP: 11200, neutronLaunches: 26, neutronASP: 60000, ssGrowthPct: 12 },
      // FY32E: 26 Electron, 30 Neutron
      { electronLaunches: 26, electronASP: 11400, neutronLaunches: 30, neutronASP: 61000, ssGrowthPct: 10 },
      // FY33E: 24 Electron, 34 Neutron, SS matures
      { electronLaunches: 24, electronASP: 11600, neutronLaunches: 34, neutronASP: 62000, ssGrowthPct: 8 },
      // FY34E: 22 Electron, 36 Neutron
      { electronLaunches: 22, electronASP: 11800, neutronLaunches: 36, neutronASP: 62500, ssGrowthPct: 6 },
      // FY35E: 20 Electron, 38 Neutron
      { electronLaunches: 20, electronASP: 12000, neutronLaunches: 38, neutronASP: 63000, ssGrowthPct: 5 }
    ]
  },

  // ========== SCHEDULES (FY26-FY35, 10 entries, in $K) ==========
  schedule: {
    otherIncome: [8000, 10000, 12000, 14000, 16000, 18000, 20000, 22000, 24000, 26000],
    wcChange: [-40000, -35000, -30000, -25000, -20000, -15000, -12000, -10000, -8000, -6000]
  },

  // ========== BALANCE SHEET (for DCF bridge, in $K) ==========
  cashEquivalents: 1016577,
  debtOutstanding: 253955,

  // ========== TOGGLE INCREMENTS ==========
  increments: {
    volGrowth: 2,
    volGrowth35: 2,
    asp26: 1,
    asp35: 1,
    gm26: 1,
    gm35: 1,
    opex26: 1,
    opex35: 1,
    discountRate: 1,
    recurringRevPct: 5,
    taxRate: 1,
    rdPct26: 1,
    rdPct35: 1,
    sbcPct26: 0.5,
    sbcPct35: 0.5,
    daPct26: 0.5,
    daPct35: 0.5,
    capexPct26: 1,
    capexPct35: 1,
    shares26: 5,
    shares35: 5
  },

  // ========== BOUNDS ==========
  bounds: {
    volGrowth: { min: 20, max: 70 },
    volGrowth35: { min: 0, max: 20 },
    asp26: { min: 1, max: 1 },
    asp35: { min: 1, max: 1 },
    gm26: { min: 28, max: 50 },
    gm35: { min: 35, max: 60 },
    opex26: { min: 30, max: 60 },
    opex35: { min: 12, max: 30 },
    discountRate: { min: 6, max: 18 },
    recurringRevPct: { min: 0, max: 100 },
    taxRate: { min: 15, max: 28 },
    rdPct26: { min: 15, max: 45 },
    rdPct35: { min: 5, max: 15 },
    sbcPct26: { min: 5, max: 18 },
    sbcPct35: { min: 2, max: 8 },
    daPct26: { min: 4, max: 12 },
    daPct35: { min: 2, max: 6 },
    capexPct26: { min: 8, max: 28 },
    capexPct35: { min: 3, max: 10 },
    shares26: { min: 580, max: 680 },
    shares35: { min: 650, max: 850 }
  },

  // ========== DEFAULT STATE ==========
  defaults: {
    volGrowth: 41,
    volGrowth35: 6,
    asp26: 1,
    asp35: 1,
    gm26: 37,
    gm35: 50,
    opex26: 42,
    opex35: 18,
    discountRate: 10,
    hasPricingPower: false,
    recurringRevPct: 60,
    taxRate: 21,
    rdPct26: 28,
    rdPct35: 8,
    sbcPct26: 9,
    sbcPct35: 3,
    daPct26: 6,
    daPct35: 3,
    capexPct26: 16,
    capexPct35: 5,
    shares26: 620,
    shares35: 750
  },

  // ========== COMPANY KPI TABLE ROWS ==========
  companyKpiRows: [
    {
      label: "R&D % of Rev",
      key26: "rdPct26", key35: "rdPct35",
      actualLabel: "45.0%", actualId: "kpiRdPctA",
      commentary: "FY25 R&D $271M (45% rev). Neutron dev dominant driver. \"Q1 to mark peak Neutron R&D spending.\" Shift to Flight 2 inventory in 2026. Drops significantly as Neutron enters production."
    },
    {
      label: "SBC % of Rev",
      key26: "sbcPct26", key35: "sbcPct35",
      actualLabel: "11.8%", actualId: "kpiSbcPctA",
      commentary: "FY25 SBC $71M. Deducted from EBIT in Adj FCF calc. Elevated due to Neutron hiring ramp."
    },
    {
      label: "D&A % of Rev",
      key26: "daPct26", key35: "daPct35",
      actualLabel: "7.3%", actualId: "kpiDaPctA",
      commentary: "FY25 D&A $44M. Increasing as launch pad, production facilities, and AFP machine depreciate."
    },
    {
      label: "CapEx % of Rev",
      key26: "capexPct26", key35: "capexPct35",
      actualLabel: "26.0%", actualId: "kpiCapexPctA",
      commentary: "FY25 CapEx $156M. \"CapEx to remain elevated\" for Neutron, LC-3, recovery barge, engine test complex. Moderates post-first flight."
    },
    {
      label: "Shares Out (M)",
      key26: "shares26", key35: "shares35",
      actualLabel: "531M", actualId: "kpiSharesA",
      commentary: "Q1'26 guided ~605M diluted. Includes ~46M convertible preferred. Only 7.5M convert note shares remain (11% of original $355M)."
    }
  ],

  // ========== COMPANY KPI OUTPUT TABLE ROWS ==========
  companyKpiOutputRows: [
    { label: "R&D", key: "rd", format: "dollarM" },
    { label: "SBC", key: "sbc", format: "dollarM" },
    { label: "D&A", key: "da", format: "dollarM" },
    { label: "CapEx", key: "capex", format: "dollarM" },
    { label: "Shares (M)", key: "shares", format: "sharesM" }
  ],

  // ========== KEY ASSUMPTIONS TABLE ==========
  assumptionRows: [
    {
      label: "Rev Growth %", key26: "volGrowth", key35: "volGrowth35",
      suffix26: "%", prefix26: "", suffix35: "%", prefix35: "",
      autoDetail: { id: "detailVolGrowth", type: "volTests" },
      commentary: "FY25 revenue grew 38% to $602M. Q1'26 guidance $185-200M implies ~57% YoY. \"20% growth\" target for Electron launch business alone. Neutron contribution from FY27."
    },
    {
      label: "Gross Margin", key26: "gm26", key35: "gm35",
      suffix26: "%", prefix26: "", suffix35: "%", prefix35: "",
      commentary: "Q4'25 GAAP GM 38%, non-GAAP 44%. FY25 GAAP GM 34.4% (+780bp YoY). \"Slight dip in Q1 to 34-36% GAAP\" from space systems mix. Electron margin expanding with cadence. Neutron will start low, ramp over several years."
    },
    {
      label: "OpEx % of Rev", key26: "opex26", key35: "opex35",
      suffix26: "%", prefix26: "", suffix35: "%", prefix35: "",
      commentary: "FY25 total opex 72% of rev. Neutron R&D peaked Q1'26 per Adam Spice. \"Shift from R&D into Flight 2 inventory throughout 2026.\" SG&A trending down as % rev. Expect significant operating leverage as Neutron transitions to production."
    },
    {
      label: "LT Tax Rate", key26: null, key35: "taxRate",
      suffix26: "", prefix26: "", suffix35: "%", prefix35: "",
      autoDetail: { type: "static", text: "0% near-term (NOL)" },
      commentary: "Significant accumulated NOLs. $41M tax benefit in Q3'25 from Geost deferred tax liabilities. No material tax expected until profitable."
    }
  ],

  // ========== CATALYSTS ==========
  catalysts: [
    { name: "Neutron First Flight", timeline: "Q4 2026", description: "\"Neutron's first launch is now targeted for Q4 2026.\" Stage 1 tank in production on AFP machine. Thrust structure, Hungry Hippo fairing, interstage all qualified. Archimedes engines in extensive \"boot camp\" testing." },
    { name: "SDA Tranche 3 Revenue Ramp", timeline: "2026-2029", description: "\"$816M contract for 18 spacecraft with advanced missile tracking sensors. Largest single contract in Rocket Lab's history.\" ~10% rev rec in first 12mo, 40%/40%/10% over next 3 years." },
    { name: "Golden Dome Participation", timeline: "2026+", description: "\"Multiple fronts... launch, satellites, optical terminals, optical payloads.\" Selected by MDA for Shield program ($151B contract ceiling). HASTE hypersonic testing supports program." },
    { name: "Mynaric Acquisition", timeline: "Pending", description: "German regulatory review ongoing. \"Don't believe everything you read in the media.\" Would add optical terminal manufacturing to vertical integration." },
    { name: "Mars Telecom Network", timeline: "2027+", description: "NASA RFP for Mars telecommunications network (~$700-750M). \"Rocket Lab has more hardware on and orbiting Mars than just about any other company today.\" ESCAPADE mission success strengthens position." },
    { name: "Space Data Centers", timeline: "Long-term", description: "\"Companies are beginning to seriously explore moving data centers to orbit.\" Rocket Lab introducing space-optimized silicon solar arrays for gigawatt-class power at kilometer scale." },
    { name: "HASTE/Hypersonics Growth", timeline: "2026", description: "\"HASTE mission on the pad, days away from launch.\" Only credible provider for rapid hypersonic testing. Critical for Golden Dome. 3 HASTE missions in FY25, pipeline growing." },
    { name: "Electron 20%+ Launch Growth", timeline: "2026", description: "\"Nominally 20% growth\" in launch business (excl Neutron). FY25: 21 launches, booked 30+ new missions. Build rate now every 11-13 days." }
  ],

  // ========== BUSINESS ATTRIBUTES ==========
  pricingPowerNote: "Rocket Lab is the only proven small launch provider globally. No successful new US/EU small launch vehicle in 2025. If enabled, applies 15% monopoly premium to terminal valuation yield.",
  recurringRevNote: "Government contracts and multi-launch agreements provide recurring revenue base. $1.85B backlog with 37% converting in next 12 months.",

  // ========== ANALYST CONSENSUS REVENUE (in $K) ==========
  consensusRevenue: {
    1: 850307,   // FY26E
    2: 1232664,  // FY27E
    3: 1557380   // FY28E
  },

  // ========== HISTORICAL PRICE DATA ==========
  priceHistory: [
    {d:"2025-11-17",o:45.15,h:45.68,l:42.23,c:43.31,v:17583509},
    {d:"2025-11-18",o:42.22,h:43.61,l:41.23,c:42.78,v:16982022},
    {d:"2025-11-19",o:42.50,h:44.53,l:42.43,c:43.62,v:15304000},
    {d:"2025-11-20",o:43.78,h:44.50,l:42.15,c:43.87,v:14200000},
    {d:"2025-11-21",o:43.90,h:44.80,l:42.90,c:44.52,v:13800000},
    {d:"2025-11-24",o:44.60,h:45.30,l:43.80,c:44.10,v:12500000},
    {d:"2025-11-25",o:44.20,h:45.50,l:44.00,c:45.23,v:11900000},
    {d:"2025-11-26",o:45.30,h:46.80,l:45.10,c:46.55,v:14300000},
    {d:"2025-11-28",o:46.60,h:47.20,l:45.80,c:46.10,v:8200000},
    {d:"2025-12-01",o:46.20,h:48.50,l:46.00,c:48.12,v:18600000},
    {d:"2025-12-02",o:48.20,h:49.30,l:47.50,c:48.90,v:16400000},
    {d:"2025-12-03",o:49.00,h:50.20,l:48.30,c:49.85,v:19200000},
    {d:"2025-12-04",o:49.90,h:51.00,l:49.20,c:50.45,v:17800000},
    {d:"2025-12-05",o:50.50,h:52.30,l:50.10,c:51.80,v:21300000},
    {d:"2025-12-08",o:51.90,h:53.00,l:50.80,c:51.20,v:18900000},
    {d:"2025-12-09",o:51.30,h:52.80,l:50.50,c:52.40,v:16700000},
    {d:"2025-12-10",o:52.50,h:54.80,l:52.00,c:54.30,v:22100000},
    {d:"2025-12-11",o:54.40,h:56.20,l:53.80,c:55.80,v:24600000},
    {d:"2025-12-12",o:55.90,h:57.50,l:55.00,c:56.90,v:21800000},
    {d:"2025-12-15",o:57.00,h:58.30,l:55.80,c:56.20,v:19500000},
    {d:"2025-12-16",o:56.30,h:58.90,l:56.00,c:58.50,v:23400000},
    {d:"2025-12-17",o:58.60,h:60.20,l:57.80,c:59.40,v:25800000},
    {d:"2025-12-18",o:59.50,h:62.30,l:59.00,c:61.80,v:28900000},
    {d:"2025-12-19",o:62.00,h:64.50,l:61.00,c:63.20,v:31200000},
    {d:"2025-12-22",o:63.30,h:65.80,l:62.50,c:64.90,v:27500000},
    {d:"2025-12-23",o:65.00,h:66.20,l:63.50,c:64.10,v:22300000},
    {d:"2025-12-24",o:64.20,h:65.00,l:63.00,c:64.50,v:12800000},
    {d:"2025-12-26",o:64.60,h:66.30,l:64.20,c:65.80,v:14500000},
    {d:"2025-12-29",o:66.00,h:67.50,l:65.00,c:66.20,v:18200000},
    {d:"2025-12-30",o:66.30,h:68.00,l:65.50,c:67.40,v:19800000},
    {d:"2025-12-31",o:67.50,h:69.80,l:66.80,c:68.90,v:24100000},
    {d:"2026-01-02",o:69.00,h:72.50,l:68.50,c:71.80,v:28500000},
    {d:"2026-01-05",o:72.00,h:74.80,l:71.00,c:73.50,v:26300000},
    {d:"2026-01-06",o:73.60,h:76.20,l:72.50,c:75.30,v:29800000},
    {d:"2026-01-07",o:75.40,h:78.50,l:74.80,c:77.20,v:32100000},
    {d:"2026-01-08",o:77.30,h:80.00,l:76.50,c:79.40,v:34500000},
    {d:"2026-01-09",o:79.50,h:82.30,l:78.00,c:81.50,v:36200000},
    {d:"2026-01-12",o:81.60,h:85.50,l:81.00,c:84.90,v:29800000},
    {d:"2026-01-13",o:85.00,h:88.20,l:84.50,c:87.30,v:31500000},
    {d:"2026-01-14",o:87.40,h:90.00,l:86.00,c:88.50,v:28700000},
    {d:"2026-01-15",o:89.27,h:92.46,l:86.65,c:90.76,v:24810300},
    {d:"2026-01-16",o:92.53,h:99.58,l:92.40,c:96.30,v:36105306},
    {d:"2026-01-20",o:93.70,h:98.27,l:88.30,c:89.16,v:29300928},
    {d:"2026-01-21",o:89.20,h:92.50,l:87.00,c:91.30,v:25600000},
    {d:"2026-01-22",o:91.40,h:93.80,l:89.50,c:90.20,v:22300000},
    {d:"2026-01-23",o:90.30,h:91.50,l:87.00,c:87.80,v:24100000},
    {d:"2026-01-26",o:87.90,h:89.00,l:84.50,c:85.20,v:26800000},
    {d:"2026-01-27",o:85.30,h:87.50,l:83.00,c:86.40,v:23400000},
    {d:"2026-01-28",o:86.50,h:88.00,l:82.50,c:83.10,v:28900000},
    {d:"2026-01-29",o:83.20,h:84.50,l:80.00,c:80.50,v:31200000},
    {d:"2026-01-30",o:80.60,h:82.00,l:78.50,c:79.30,v:27500000},
    {d:"2026-02-02",o:79.40,h:81.50,l:78.00,c:80.80,v:22100000},
    {d:"2026-02-03",o:80.90,h:83.00,l:79.50,c:82.30,v:24800000},
    {d:"2026-02-04",o:82.40,h:84.50,l:81.00,c:83.70,v:21600000},
    {d:"2026-02-05",o:83.80,h:85.00,l:82.50,c:84.20,v:20300000},
    {d:"2026-02-06",o:84.30,h:86.50,l:83.00,c:85.90,v:23100000},
    {d:"2026-02-09",o:86.00,h:87.80,l:84.50,c:85.20,v:21800000},
    {d:"2026-02-10",o:85.30,h:87.00,l:83.80,c:84.50,v:19500000},
    {d:"2026-02-11",o:84.60,h:86.20,l:82.50,c:83.00,v:22400000},
    {d:"2026-02-12",o:83.10,h:84.80,l:81.50,c:82.20,v:20100000},
    {d:"2026-02-13",o:82.30,h:83.50,l:80.00,c:80.50,v:23600000},
    {d:"2026-02-17",o:80.60,h:82.00,l:78.50,c:79.10,v:21200000},
    {d:"2026-02-18",o:79.20,h:81.50,l:77.80,c:80.30,v:24500000},
    {d:"2026-02-19",o:80.40,h:82.00,l:78.00,c:78.50,v:22800000},
    {d:"2026-02-20",o:78.60,h:79.80,l:76.50,c:77.20,v:25300000},
    {d:"2026-02-23",o:77.30,h:78.50,l:73.00,c:73.80,v:28900000},
    {d:"2026-02-24",o:73.90,h:75.50,l:71.00,c:72.50,v:31200000},
    {d:"2026-02-25",o:72.60,h:74.00,l:70.50,c:71.80,v:27800000},
    {d:"2026-02-26",o:71.90,h:76.50,l:71.00,c:75.80,v:34500000},
    {d:"2026-02-27",o:75.90,h:78.00,l:74.50,c:76.30,v:26200000},
    {d:"2026-03-02",o:76.40,h:78.50,l:74.00,c:74.50,v:23800000},
    {d:"2026-03-03",o:74.60,h:76.80,l:73.00,c:75.90,v:21500000},
    {d:"2026-03-04",o:76.00,h:77.50,l:73.50,c:74.20,v:22800000},
    {d:"2026-03-05",o:74.30,h:75.80,l:71.50,c:72.80,v:25100000},
    {d:"2026-03-06",o:72.90,h:74.50,l:70.00,c:71.50,v:27400000},
    {d:"2026-03-09",o:71.60,h:73.00,l:69.50,c:70.20,v:24600000},
    {d:"2026-03-10",o:70.30,h:72.50,l:68.80,c:71.80,v:22900000},
    {d:"2026-03-11",o:71.90,h:73.50,l:70.00,c:70.50,v:21300000},
    {d:"2026-03-12",o:70.60,h:72.00,l:68.50,c:69.80,v:23700000},
    {d:"2026-03-13",o:69.90,h:71.50,l:67.50,c:68.20,v:26100000},
    {d:"2026-03-16",o:69.33,h:72.38,l:68.67,c:71.31,v:16946721},
    {d:"2026-03-17",o:71.47,h:78.67,l:71.27,c:78.59,v:29734943},
    {d:"2026-03-18",o:76.04,h:76.88,l:69.40,c:69.48,v:33073547}
  ]
};
