// Frontend Javascript for Meridian DLMM Agent Dashboard

document.addEventListener("DOMContentLoaded", () => {
  // --- Constants & Config ---
  const API_BASE = ""; // local endpoints relative to origin
  const POLL_INTERVAL = 5000; // 5 seconds
  
  // --- App State ---
  let appState = {
    wallet: null,
    positions: [],
    history: { summary: {}, positions: [] },
    decisions: [],
    config: {},
    logs: [],
    charts: {} // stores ChartJS instances
  };

  // --- DOM Elements ---
  const elBotModeBadge = document.getElementById("bot-mode-badge");
  const elBotModeText = document.getElementById("bot-mode-text");
  const elSolPriceText = document.getElementById("sol-price-text");
  const elWalletBalanceText = document.getElementById("wallet-balance-text");
  
  // Stat values
  const elStatTotalPnl = document.getElementById("stat-total-pnl");
  const elStatAvgPnlPct = document.getElementById("stat-avg-pnl-pct");
  const elStatWinrate = document.getElementById("stat-winrate");
  const elStatClosedCount = document.getElementById("stat-closed-count");
  const elStatActivePositions = document.getElementById("stat-active-positions");
  const elStatOpenValue = document.getElementById("stat-open-value");
  const elStatTotalFees = document.getElementById("stat-total-fees");
  const elStatAvgEfficiency = document.getElementById("stat-avg-efficiency");
  
  // Active positions
  const elActivePositionsList = document.getElementById("active-positions-list");
  const elActivePositionsBadge = document.getElementById("active-positions-badge");
  
  // Tables & Filters
  const elHistoryTableBody = document.getElementById("history-table-body");
  const elHistorySearch = document.getElementById("history-search");
  const elHistoryFilterStrategy = document.getElementById("history-filter-strategy");
  const elHistoryFilterReason = document.getElementById("history-filter-reason");
  
  // Tabs
  const tabButtons = document.querySelectorAll(".tab-btn");
  const tabContents = document.querySelectorAll(".tab-content");
  const subTabButtons = document.querySelectorAll(".sub-tab-btn");
  const subTabContents = document.querySelectorAll(".sub-tab-content");
  
  // Decisions, Config, Logs
  const elDecisionTimeline = document.getElementById("decision-timeline");
  const elConfigSettingsGrid = document.getElementById("config-settings-grid");
  const elConsoleLogsBody = document.getElementById("console-logs-body");
  const elBtnRefreshLogs = document.getElementById("btn-refresh-logs");
  const elBtnRunScreening = document.getElementById("btn-run-screening");
  
  // Modal Elements
  const elModal = document.getElementById("position-modal");
  const elBtnCloseModal = document.getElementById("btn-close-modal");
  const elModalPosTitle = document.getElementById("modal-position-title");
  const elDetailPosAddress = document.getElementById("detail-position-address");
  const elDetailPoolAddress = document.getElementById("detail-pool-address");
  const elDetailStrategy = document.getElementById("detail-strategy");
  const elDetailBinRange = document.getElementById("detail-bin-range");
  const elDetailAge = document.getElementById("detail-age");
  const elDetailInitial = document.getElementById("detail-initial");
  const elPositionInstruction = document.getElementById("position-instruction");
  const elBtnSaveInstruction = document.getElementById("btn-save-instruction");
  const elCloseReasonInput = document.getElementById("close-reason-input");
  const elBtnClosePositionAction = document.getElementById("btn-close-position-action");
  
  // Toast
  const elToast = document.getElementById("toast");
  const elToastMessage = document.getElementById("toast-message");

  let activeModalPositionAddress = null;

  // --- Initializers ---
  initTabs();
  initSubTabs();
  fetchInitialData();
  startPolling();

  // --- Event Listeners ---
  elBtnRefreshLogs.addEventListener("click", fetchLogs);
  elBtnRunScreening.addEventListener("click", triggerScreening);
  elBtnCloseModal.addEventListener("click", closeModal);
  elBtnSaveInstruction.addEventListener("click", saveInstruction);
  elBtnClosePositionAction.addEventListener("click", closePositionAction);

  // Close modal clicking outside
  window.addEventListener("click", (e) => {
    if (e.target === elModal) closeModal();
  });

  // History Filter listeners
  [elHistorySearch, elHistoryFilterStrategy, elHistoryFilterReason].forEach(el => {
    el.addEventListener("input", renderHistoryTable);
  });

  // --- API & Fetch Operations ---

  async function apiFetch(endpoint, options = {}) {
    try {
      const response = await fetch(`${API_BASE}${endpoint}`, options);
      if (!response.ok) {
        throw new Error(`HTTP Error: ${response.status}`);
      }
      return await response.json();
    } catch (e) {
      console.error(`API Fetch Error [${endpoint}]:`, e);
      return null;
    }
  }

  async function fetchInitialData() {
    await Promise.all([
      fetchStatus(true),
      fetchHistory(true),
      fetchDecisions(),
      fetchConfig(),
      fetchLogs()
    ]);
  }

  function startPolling() {
    setInterval(async () => {
      await Promise.all([
        fetchStatus(false),
        fetchHistory(false)
      ]);
    }, POLL_INTERVAL);
  }

  // Fetch bot status (active positions, balances)
  async function fetchStatus(isFirstLoad = false) {
    const data = await apiFetch("/api/status");
    if (!data) return;

    appState.wallet = data.wallet;
    appState.positions = data.positions;

    updateHeader(data.dry_run);
    renderActivePositions(isFirstLoad);
    updateStatsGrid();
  }

  // Fetch closed positions history
  async function fetchHistory(isFirstLoad = false) {
    const data = await apiFetch("/api/history");
    if (!data) return;

    appState.history = data;
    renderHistoryTable();
    updateStatsGrid();
    renderCharts(isFirstLoad);
  }

  // Fetch decisions log
  async function fetchDecisions() {
    const data = await apiFetch("/api/decisions");
    if (!data) return;

    appState.decisions = data.decisions || [];
    renderDecisionsTimeline();
  }

  // Fetch config thresholds
  async function fetchConfig() {
    const data = await apiFetch("/api/config");
    if (!data) return;

    appState.config = data;
    renderConfigThresholds();
  }

  // Fetch logs
  async function fetchLogs() {
    elConsoleLogsBody.innerHTML = '<div class="loader"></div>';
    const data = await apiFetch("/api/logs");
    if (!data || !data.logs) {
      elConsoleLogsBody.textContent = "Failed to load logs.";
      return;
    }

    appState.logs = data.logs;
    elConsoleLogsBody.innerHTML = "";
    data.logs.forEach(line => {
      const elLine = document.createElement("div");
      elLine.className = "log-line";
      elLine.textContent = line;
      
      // Color coding logs
      if (line.includes("[ERROR]") || line.includes("failed") || line.includes("error")) {
        elLine.style.color = "var(--error)";
      } else if (line.includes("[WARN]") || line.includes("warn")) {
        elLine.style.color = "var(--warning)";
      } else if (line.includes("[STATE]") || line.includes("deploy") || line.includes("close")) {
        elLine.style.color = "var(--accent-cyan)";
      }
      
      elConsoleLogsBody.appendChild(elLine);
    });

    // Scroll to bottom
    elConsoleLogsBody.scrollTop = elConsoleLogsBody.scrollHeight;
  }

  // Trigger Screening
  async function triggerScreening() {
    const btnIcon = elBtnRunScreening.querySelector("i");
    btnIcon.classList.add("fa-spin");
    elBtnRunScreening.disabled = true;

    const data = await apiFetch("/api/run-screening", { method: "POST" });
    
    if (data && data.success) {
      showToast("Screening cycle triggered in background!");
    } else {
      showToast("Failed to trigger screening cycle.", "error");
    }

    setTimeout(() => {
      btnIcon.classList.remove("fa-spin");
      elBtnRunScreening.disabled = false;
      fetchLogs();
    }, 2500);
  }

  // Save Note / Instruction
  async function saveInstruction() {
    if (!activeModalPositionAddress) return;
    const note = elPositionInstruction.value.trim();

    const data = await apiFetch("/api/set-position-note", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ positionAddress: activeModalPositionAddress, note })
    });

    if (data && data.success) {
      showToast("Instruction note updated successfully!");
      closeModal();
      fetchStatus(false);
    } else {
      showToast("Failed to update instruction note.", "error");
    }
  }

  // Close Position
  async function closePositionAction() {
    if (!activeModalPositionAddress) return;
    const reason = elCloseReasonInput.value.trim() || "Manual dashboard close";

    if (!confirm("Are you sure you want to CLOSE this position? (This is fully simulated in dry run)")) {
      return;
    }

    elBtnClosePositionAction.disabled = true;
    elBtnClosePositionAction.textContent = "Closing...";

    const data = await apiFetch("/api/close-position", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ positionAddress: activeModalPositionAddress, reason })
    });

    elBtnClosePositionAction.disabled = false;
    elBtnClosePositionAction.textContent = "Close Position";

    if (data && data.success) {
      showToast(`Position closed successfully! PnL: $${data.pnl_usd || 0}`);
      closeModal();
      await Promise.all([
        fetchStatus(true),
        fetchHistory(true),
        fetchDecisions()
      ]);
    } else {
      showToast(data?.error || "Failed to close position.", "error");
    }
  }

  // --- UI Renderers ---

  function updateHeader(isDryRun) {
    if (isDryRun) {
      elBotModeBadge.className = "widget-badge";
      elBotModeText.textContent = "DRY RUN MODE";
    } else {
      elBotModeBadge.className = "widget-badge live";
      elBotModeText.textContent = "LIVE TRADING";
    }

    if (appState.wallet) {
      elSolPriceText.textContent = `$${parseFloat(appState.wallet.sol_price || 0).toFixed(2)}`;
      elWalletBalanceText.textContent = `${parseFloat(appState.wallet.sol || 0).toFixed(3)} SOL ($${parseFloat(appState.wallet.sol_usd || 0).toFixed(2)})`;
    }
  }

  function updateStatsGrid() {
    const summary = appState.history.summary || {};
    const openValue = appState.positions.reduce((s, p) => s + (p.total_value_usd || 0), 0);
    const openFees = appState.positions.reduce((s, p) => s + (p.unclaimed_fees_usd || 0), 0);
    const totalPnlUsd = parseFloat(summary.total_pnl_usd || 0);

    // Total PnL
    elStatTotalPnl.textContent = `${totalPnlUsd >= 0 ? "+" : ""}$${totalPnlUsd.toFixed(2)}`;
    elStatTotalPnl.className = `stat-value ${totalPnlUsd >= 0 ? "positive" : "negative"}`;
    elStatAvgPnlPct.textContent = `Avg PnL: ${parseFloat(summary.avg_pnl_pct || 0).toFixed(2)}%`;

    // Win Rate
    const winRate = parseInt(summary.win_rate_pct || 0);
    elStatWinrate.textContent = `${winRate}%`;
    elStatClosedCount.textContent = `${summary.total_positions_closed || 0} positions closed`;

    // Active Positions
    elStatActivePositions.textContent = appState.positions.length;
    elStatOpenValue.textContent = `Value: $${openValue.toFixed(2)}`;

    // Fees Card
    elStatTotalFees.textContent = `$${openFees.toFixed(2)}`;
    elStatAvgEfficiency.textContent = `Avg Efficiency: ${parseFloat(summary.avg_range_efficiency_pct || 0).toFixed(1)}%`;
  }

  function renderActivePositions(isFirstLoad) {
    elActivePositionsBadge.textContent = appState.positions.length;

    if (appState.positions.length === 0) {
      elActivePositionsList.innerHTML = `
        <div class="empty-positions">
          <i class="fa-solid fa-folder-open"></i>
          <p>No active positions at the moment.</p>
        </div>
      `;
      return;
    }

    elActivePositionsList.innerHTML = "";
    appState.positions.forEach(pos => {
      const pnlVal = parseFloat(pos.pnl_usd || 0);
      const pnlPct = parseFloat(pos.pnl_pct || 0);
      const ageHours = (pos.age_minutes / 60).toFixed(1);
      const isOOR = !pos.in_range;

      const card = document.createElement("div");
      card.className = "position-card";
      card.dataset.address = pos.position;

      card.innerHTML = `
        <div class="position-card-header">
          <div class="pair-info">
            <span class="pair-name">${pos.pair}</span>
            <span class="strategy-tag">${pos.strategy}</span>
          </div>
          <div class="pnl-tag ${pnlVal >= 0 ? "positive" : "negative"}">
            ${pnlVal >= 0 ? "+" : ""}$${pnlVal.toFixed(2)} (${pnlPct.toFixed(2)}%)
          </div>
        </div>
        
        <div class="position-metrics">
          <div class="metric-item">
            <span class="metric-label">Liquidity</span>
            <span class="metric-value">$${parseFloat(pos.total_value_usd || 0).toFixed(2)}</span>
          </div>
          <div class="metric-item">
            <span class="metric-label">Claimable Fees</span>
            <span class="metric-value">$${parseFloat(pos.unclaimed_fees_usd || 0).toFixed(2)}</span>
          </div>
          <div class="metric-item">
            <span class="metric-label">Age</span>
            <span class="metric-value">${ageHours} hours</span>
          </div>
        </div>

        <div class="position-footer">
          <div class="range-indicator ${isOOR ? "out-range" : "in-range"}">
            <span class="pulse-dot"></span>
            <span>${isOOR ? "OUT OF RANGE" : "IN RANGE"}</span>
          </div>
          <span class="held-time">${pos.lower_bin} ↔ ${pos.upper_bin}</span>
        </div>
      `;

      card.addEventListener("click", () => openModal(pos));
      elActivePositionsList.appendChild(card);
    });
  }

  function renderHistoryTable() {
    const search = elHistorySearch.value.trim().toLowerCase();
    const strategy = elHistoryFilterStrategy.value;
    const reason = elHistoryFilterReason.value;

    const filtered = appState.history.positions.filter(pos => {
      const matchSearch = pos.pool_name?.toLowerCase().includes(search) || pos.pool?.toLowerCase().includes(search);
      const matchStrategy = !strategy || pos.strategy === strategy;
      
      let matchReason = true;
      if (reason) {
        const rText = String(pos.close_reason || "").toLowerCase();
        if (reason === "stop_loss") matchReason = rText.includes("stop loss");
        else if (reason === "trailing_tp") matchReason = rText.includes("trailing");
        else if (reason === "out_of_range") matchReason = rText.includes("range");
        else if (reason === "low_yield") matchReason = rText.includes("yield");
        else if (reason === "manual") matchReason = rText.includes("manual");
      }

      return matchSearch && matchStrategy && matchReason;
    });

    if (filtered.length === 0) {
      elHistoryTableBody.innerHTML = `
        <tr>
          <td colspan="10" class="text-center text-muted">No matching trade history found.</td>
        </tr>
      `;
      return;
    }

    elHistoryTableBody.innerHTML = "";
    filtered.forEach(pos => {
      const pnlVal = parseFloat(pos.pnl_usd || 0);
      const pnlPct = parseFloat(pos.pnl_pct || 0);
      const ageHours = (pos.minutes_held / 60).toFixed(1);
      const closedDate = new Date(pos.closed_at).toLocaleString();

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td class="font-bold">${pos.pool_name}</td>
        <td><span class="badge">${pos.strategy}</span></td>
        <td>${parseFloat(pos.amount_sol || 0).toFixed(2)} SOL</td>
        <td>$${parseFloat(pos.final_value_usd || 0).toFixed(2)}</td>
        <td>$${parseFloat(pos.fees_earned_usd || 0).toFixed(2)}</td>
        <td class="${pnlVal >= 0 ? "positive font-bold" : "negative font-bold"}">${pnlVal >= 0 ? "+" : ""}$${pnlVal.toFixed(2)}</td>
        <td class="${pnlVal >= 0 ? "positive" : "negative"}">${pnlVal >= 0 ? "+" : ""}${pnlPct.toFixed(2)}%</td>
        <td>${ageHours}h</td>
        <td class="text-muted">${closedDate}</td>
        <td><span class="text-muted" style="font-size: 11px;">${pos.close_reason}</span></td>
      `;
      elHistoryTableBody.appendChild(tr);
    });
  }

  function renderDecisionsTimeline() {
    if (appState.decisions.length === 0) {
      elDecisionTimeline.innerHTML = '<div class="text-center pad-20 text-muted">No decisions logged yet.</div>';
      return;
    }

    elDecisionTimeline.innerHTML = "";
    appState.decisions.forEach(dec => {
      const time = new Date(dec.ts).toLocaleString();
      const div = document.createElement("div");
      
      let typeClass = "skip";
      let icon = "fa-info-circle";
      if (dec.type === "deploy") {
        typeClass = "deploy";
        icon = "fa-rocket";
      } else if (dec.type === "close") {
        typeClass = "close";
        icon = "fa-door-open";
      } else if (dec.type === "skip") {
        typeClass = "skip";
        icon = "fa-forward";
      }

      div.className = `timeline-item ${typeClass}`;
      div.innerHTML = `
        <div class="timeline-time">${time}</div>
        <div class="timeline-header">
          <i class="fa-solid ${icon}"></i>
          <span>[${dec.actor}] ${dec.type.toUpperCase()}: ${dec.pool_name || dec.pool || "system"}</span>
        </div>
        <div class="timeline-body">
          <p><strong>Summary:</strong> ${dec.summary || "-"}</p>
          <p><strong>Reason:</strong> ${dec.reason || "-"}</p>
          ${dec.risks?.length ? `<p class="negative"><strong>Risks:</strong> ${dec.risks.join(", ")}</p>` : ""}
        </div>
      `;
      elDecisionTimeline.appendChild(div);
    });
  }

  function renderConfigThresholds() {
    const c = appState.config;
    if (!c || !c.screening) {
      elConfigSettingsGrid.innerHTML = '<div class="text-center pad-20 text-muted">Configuration not loaded.</div>';
      return;
    }

    elConfigSettingsGrid.innerHTML = `
      <div class="config-card">
        <h4>Screening Filter</h4>
        <div class="config-item"><span class="config-key">Timeframe</span><span class="config-val">${c.screening.timeframe || "-"}</span></div>
        <div class="config-item"><span class="config-key">Min fee/TVL ratio</span><span class="config-val">${c.screening.minFeeActiveTvlRatio}%</span></div>
        <div class="config-item"><span class="config-key">Min TVL</span><span class="config-val">$${c.screening.minTvl || "0"}</span></div>
        <div class="config-item"><span class="config-key">Max TVL</span><span class="config-val">$${c.screening.maxTvl || "0"}</span></div>
        <div class="config-item"><span class="config-key">Min Volume 24h</span><span class="config-val">$${c.screening.minVolume || "0"}</span></div>
        <div class="config-item"><span class="config-key">Max Top 10% Holders</span><span class="config-val">${c.screening.maxTop10Pct}%</span></div>
      </div>

      <div class="config-card">
        <h4>Management Strategy</h4>
        <div class="config-item"><span class="config-key">Stop Loss</span><span class="config-val">${c.management.stopLossPct}%</span></div>
        <div class="config-item"><span class="config-key">Take Profit</span><span class="config-val">${c.management.takeProfitPct}%</span></div>
        <div class="config-item"><span class="config-key">Trailing TP</span><span class="config-val">${c.management.trailingTakeProfit ? "Enabled" : "Disabled"}</span></div>
        <div class="config-item"><span class="config-key">Trailing Trigger</span><span class="config-val">${c.management.trailingTriggerPct}%</span></div>
        <div class="config-item"><span class="config-key">Trailing Drop Limit</span><span class="config-val">${c.management.trailingDropPct}%</span></div>
        <div class="config-item"><span class="config-key">OOR Exit Wait</span><span class="config-val">${c.management.outOfRangeWaitMinutes} min</span></div>
      </div>

      <div class="config-card">
        <h4>Position Risk</h4>
        <div class="config-item"><span class="config-key">Max Positions</span><span class="config-val">${c.risk.maxPositions}</span></div>
        <div class="config-item"><span class="config-key">Min Age yield check</span><span class="config-val">${c.management.minAgeBeforeYieldCheck || "60"} min</span></div>
        <div class="config-item"><span class="config-key">Default Deploy size</span><span class="config-val">${c.management.deployAmountSol} SOL</span></div>
        <div class="config-item"><span class="config-key">Gas Reserve</span><span class="config-val">${c.management.gasReserve} SOL</span></div>
      </div>
    `;
  }

  // --- Chart.js Visualizations ---

  function renderCharts(isFirstLoad) {
    const historyPositions = [...appState.history.positions].reverse(); // cronological order
    
    // --- Chart 1: Cumulative PnL ---
    const pnlCtx = document.getElementById("chart-pnl").getContext("2d");
    
    let cumulative = 0;
    const pnlData = historyPositions.map(pos => {
      cumulative += parseFloat(pos.pnl_usd || 0);
      return {
        x: new Date(pos.closed_at).toLocaleDateString(),
        y: cumulative
      };
    });

    if (appState.charts.pnl) {
      appState.charts.pnl.data.labels = pnlData.map(d => d.x);
      appState.charts.pnl.data.datasets[0].data = pnlData.map(d => d.y);
      appState.charts.pnl.update();
    } else {
      appState.charts.pnl = new Chart(pnlCtx, {
        type: "line",
        data: {
          labels: pnlData.map(d => d.x),
          datasets: [{
            label: "Cumulative PnL ($)",
            data: pnlData.map(d => d.y),
            borderColor: "#06b6d4",
            backgroundColor: "rgba(6, 182, 212, 0.1)",
            fill: true,
            tension: 0.3,
            borderWidth: 2
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false }
          },
          scales: {
            x: { grid: { color: "#1e293b" }, ticks: { color: "#94a3b8" } },
            y: { grid: { color: "#1e293b" }, ticks: { color: "#94a3b8" } }
          }
        }
      });
    }

    // --- Chart 2: Strategies Count ---
    const stratCtx = document.getElementById("chart-strategies").getContext("2d");
    
    const strats = { spot: 0, curve: 0, bid_ask: 0 };
    historyPositions.forEach(pos => {
      const s = String(pos.strategy).toLowerCase();
      if (s.includes("spot")) strats.spot++;
      else if (s.includes("curve")) strats.curve++;
      else if (s.includes("bid")) strats.bid_ask++;
    });

    if (appState.charts.strategies) {
      appState.charts.strategies.data.datasets[0].data = [strats.spot, strats.curve, strats.bid_ask];
      appState.charts.strategies.update();
    } else {
      appState.charts.strategies = new Chart(stratCtx, {
        type: "doughnut",
        data: {
          labels: ["Spot", "Curve", "Bid/Ask"],
          datasets: [{
            data: [strats.spot, strats.curve, strats.bid_ask],
            backgroundColor: ["#06b6d4", "#3b82f6", "#a855f7"],
            borderWidth: 0
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { 
              position: "bottom",
              labels: { color: "#94a3b8", boxWidth: 12 } 
            }
          }
        }
      });
    }

    // --- Chart 3: Close Reasons ---
    const exitsCtx = document.getElementById("chart-exits").getContext("2d");
    
    const reasons = { stop_loss: 0, trailing_tp: 0, out_of_range: 0, low_yield: 0, manual: 0 };
    historyPositions.forEach(pos => {
      const r = String(pos.close_reason || "").toLowerCase();
      if (r.includes("stop loss")) reasons.stop_loss++;
      else if (r.includes("trailing")) reasons.trailing_tp++;
      else if (r.includes("range")) reasons.out_of_range++;
      else if (r.includes("yield")) reasons.low_yield++;
      else reasons.manual++;
    });

    if (appState.charts.exits) {
      appState.charts.exits.data.datasets[0].data = [reasons.stop_loss, reasons.trailing_tp, reasons.out_of_range, reasons.low_yield, reasons.manual];
      appState.charts.exits.update();
    } else {
      appState.charts.exits = new Chart(exitsCtx, {
        type: "bar",
        data: {
          labels: ["Stop Loss", "Trailing TP", "Out of Range", "Low Yield", "Manual"],
          datasets: [{
            data: [reasons.stop_loss, reasons.trailing_tp, reasons.out_of_range, reasons.low_yield, reasons.manual],
            backgroundColor: "#a855f7",
            borderRadius: 6
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false }
          },
          scales: {
            x: { grid: { display: false }, ticks: { color: "#94a3b8" } },
            y: { grid: { color: "#1e293b" }, ticks: { color: "#94a3b8" } }
          }
        }
      });
    }
  }

  // --- Modal Operations ---

  function openModal(pos) {
    activeModalPositionAddress = pos.position;
    elModalPosTitle.textContent = `${pos.pair} Details`;
    elDetailPosAddress.textContent = pos.position;
    elDetailPoolAddress.textContent = pos.pool;
    elDetailStrategy.textContent = pos.strategy;
    elDetailBinRange.textContent = `${pos.lower_bin} ↔ ${pos.upper_bin} (active: ${pos.active_bin})`;
    elDetailAge.textContent = `${(pos.age_minutes / 60).toFixed(1)} hours`;
    elDetailInitial.textContent = `${parseFloat(pos.amount_sol || 0).toFixed(2)} SOL`;
    elPositionInstruction.value = pos.instruction || "";
    elCloseReasonInput.value = "";

    elModal.classList.add("active");
  }

  function closeModal() {
    elModal.classList.remove("active");
    activeModalPositionAddress = null;
  }

  // --- Tab Switchers ---

  function initTabs() {
    tabButtons.forEach(btn => {
      btn.addEventListener("click", () => {
        const tabId = btn.dataset.tab;
        
        tabButtons.forEach(b => b.classList.remove("active"));
        tabContents.forEach(c => c.classList.remove("active"));
        
        btn.classList.add("active");
        document.getElementById(tabId).classList.add("active");
      });
    });
  }

  function initSubTabs() {
    subTabButtons.forEach(btn => {
      btn.addEventListener("click", () => {
        const subTabId = btn.dataset.subtab;
        
        subTabButtons.forEach(b => b.classList.remove("active"));
        subTabContents.forEach(c => c.classList.remove("active"));
        
        btn.classList.add("active");
        document.getElementById(subTabId).classList.add("active");
      });
    });
  }

  // --- Toast Handler ---

  function showToast(message, type = "success") {
    elToastMessage.textContent = message;
    
    if (type === "success") {
      elToast.style.borderColor = "var(--success)";
      elToast.querySelector("i").className = "fa-solid fa-check-circle";
      elToast.querySelector("i").style.color = "var(--success)";
    } else {
      elToast.style.borderColor = "var(--error)";
      elToast.querySelector("i").className = "fa-solid fa-times-circle";
      elToast.querySelector("i").style.color = "var(--error)";
    }

    elToast.classList.add("active");
    setTimeout(() => {
      elToast.classList.remove("active");
    }, 4000);
  }

});
