document.addEventListener("DOMContentLoaded", function () {
  const NUM_SAMPLES = 30000;

  function getThemeColor(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function isMobile() {
    return window.innerWidth < 640;
  }

  function colors() {
    return {
      A: getThemeColor("--accent-blue") || "#2563eb",
      B: getThemeColor("--accent-red") || "#dc2626",
      aFill: getThemeColor("--accent-blue-fill") || "rgba(37,99,235,0.12)",
      bFill: getThemeColor("--accent-red-fill") || "rgba(220,38,38,0.12)",
      aFillStrong: getThemeColor("--accent-blue-fill-strong") || "rgba(37,99,235,0.35)",
      bFillStrong: getThemeColor("--accent-red-fill-strong") || "rgba(220,38,38,0.35)",
      ropeMid: getThemeColor("--rope-mid") || "#cbd5e1",
      chartMuted: getThemeColor("--chart-muted") || "#475569",
      textStrong: getThemeColor("--text-strong") || "#0f172a",
    };
  }

  const PRIORS = {
    uniform: { alpha: 1, beta: 1 },
    jeffreys: { alpha: 0.5, beta: 0.5 },
    weak: { alpha: 2, beta: 2 },
  };

  const PRIOR_HINTS = {
    uniform: "Default. All rates 0–100% equally plausible before data.",
    jeffreys: "Use when observed rates are near 0% or 100%, or n is very small.",
    weak: "Conservative. Pulls estimates gently toward 50% when n is tiny.",
    custom: "Custom prior — only use when you have real prior data or expert estimates.",
  };

  const state = {
    posteriors: null,
    priorParams: null,
    diffSamples: null,
    samplesA: null,
    samplesB: null,
  };

  const $ = (id) => document.getElementById(id);
  const radios = () => document.querySelectorAll('input[name="prior"]');
  const customInputs = () => document.querySelectorAll(".custom-inputs input");

  function getSelectedPrior() {
    const selected = document.querySelector('input[name="prior"]:checked');
    return selected ? selected.value : "uniform";
  }

  function getPriorParams() {
    const choice = getSelectedPrior();
    if (choice === "custom") {
      return {
        A: {
          alpha: parseFloat($("alpha_A").value),
          beta: parseFloat($("beta_A").value),
        },
        B: {
          alpha: parseFloat($("alpha_B").value),
          beta: parseFloat($("beta_B").value),
        },
      };
    }
    const p = PRIORS[choice];
    return { A: { ...p }, B: { ...p } };
  }

  function syncCustomInputState() {
    const isCustom = getSelectedPrior() === "custom";
    customInputs().forEach((input) => {
      input.disabled = !isCustom;
    });
    const hintEl = $("prior-hint");
    if (hintEl) hintEl.textContent = PRIOR_HINTS[getSelectedPrior()] || "";
  }

  function validateAndRead() {
    document.querySelectorAll(".error-message").forEach((el) => (el.textContent = ""));
    let valid = true;

    const successes_A = parseInt($("successes_A").value);
    const trials_A = parseInt($("trials_A").value);
    const successes_B = parseInt($("successes_B").value);
    const trials_B = parseInt($("trials_B").value);

    if (isNaN(successes_A) || successes_A < 0 || isNaN(trials_A) || trials_A <= 0) {
      $("error_A").textContent = "Enter valid successes and trials.";
      valid = false;
    } else if (successes_A > trials_A) {
      $("error_A").textContent = "Successes cannot exceed trials.";
      valid = false;
    }

    if (isNaN(successes_B) || successes_B < 0 || isNaN(trials_B) || trials_B <= 0) {
      $("error_B").textContent = "Enter valid successes and trials.";
      valid = false;
    } else if (successes_B > trials_B) {
      $("error_B").textContent = "Successes cannot exceed trials.";
      valid = false;
    }

    if (getSelectedPrior() === "custom") {
      const params = ["alpha_A", "beta_A", "alpha_B", "beta_B"].map((id) =>
        parseFloat($(id).value)
      );
      if (params.some((v) => isNaN(v) || v <= 0)) {
        $("error_custom").textContent = "All custom prior values must be positive.";
        valid = false;
      }
    }

    if (!valid) return null;
    return { successes_A, trials_A, successes_B, trials_B };
  }

  function computePosteriors(data, prior) {
    return {
      A: {
        alpha: prior.A.alpha + data.successes_A,
        beta: prior.A.beta + (data.trials_A - data.successes_A),
      },
      B: {
        alpha: prior.B.alpha + data.successes_B,
        beta: prior.B.beta + (data.trials_B - data.successes_B),
      },
    };
  }

  function sampleBeta(alpha, beta, n) {
    const out = new Float64Array(n);
    for (let i = 0; i < n; i++) out[i] = jStat.beta.sample(alpha, beta);
    return out;
  }

  function quantile(sortedArr, q) {
    const idx = (sortedArr.length - 1) * q;
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    if (lo === hi) return sortedArr[lo];
    return sortedArr[lo] + (idx - lo) * (sortedArr[hi] - sortedArr[lo]);
  }

  function fmtPct(v, digits = 1) {
    return (v * 100).toFixed(digits) + "%";
  }

  function fmtPP(v, digits = 1) {
    const sign = v >= 0 ? "+" : "−";
    return sign + Math.abs(v * 100).toFixed(digits) + "pp";
  }

  function fmtPPRange(lo, hi, digits = 1) {
    return `${fmtPP(lo, digits)} to ${fmtPP(hi, digits)}`;
  }

  function pdStrengthLabel(p) {
    const m = Math.max(p, 1 - p);
    if (m >= 0.99) return "near-certain";
    if (m >= 0.95) return "very strong";
    if (m >= 0.85) return "strong";
    if (m >= 0.7) return "moderate";
    if (m >= 0.55) return "weak";
    return "essentially no";
  }

  function renderPosteriorChart(post, prior) {
    const c = colors();
    const x = Array.from({ length: 501 }, (_, i) => i / 500);
    const yPostA = x.map((v) => jStat.beta.pdf(v, post.A.alpha, post.A.beta));
    const yPostB = x.map((v) => jStat.beta.pdf(v, post.B.alpha, post.B.beta));
    const yPriorA = x.map((v) => jStat.beta.pdf(v, prior.A.alpha, prior.A.beta));
    const yPriorB = x.map((v) => jStat.beta.pdf(v, prior.B.alpha, prior.B.beta));

    const traces = [
      {
        x, y: yPriorA, mode: "lines", name: "Prior A",
        line: { color: c.A, width: 1.5, dash: "dot" },
        opacity: 0.45, hoverinfo: "skip", showlegend: true,
      },
      {
        x, y: yPriorB, mode: "lines", name: "Prior B",
        line: { color: c.B, width: 1.5, dash: "dot" },
        opacity: 0.45, hoverinfo: "skip", showlegend: true,
      },
      {
        x, y: yPostA, mode: "lines", name: "Posterior A",
        line: { color: c.A, width: 2.5 },
        fill: "tozeroy", fillcolor: c.aFill,
      },
      {
        x, y: yPostB, mode: "lines", name: "Posterior B",
        line: { color: c.B, width: 2.5 },
        fill: "tozeroy", fillcolor: c.bFill,
      },
    ];

    const m = isMobile();
    Plotly.newPlot("chart", traces, {
      margin: m ? { l: 24, r: 8, t: 6, b: 36 } : { l: 50, r: 20, t: 10, b: 50 },
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "rgba(0,0,0,0)",
      font: { size: m ? 10 : 12 },
      xaxis: { title: m ? "" : "Success rate", range: [0, 1], tickformat: ".0%", color: c.chartMuted, gridcolor: getThemeColor("--border"), zerolinecolor: getThemeColor("--border"), tickfont: { size: m ? 10 : 12 } },
      yaxis: { title: m ? "" : "Density", rangemode: "tozero", color: c.chartMuted, gridcolor: getThemeColor("--border"), zerolinecolor: getThemeColor("--border"), showticklabels: !m },
      legend: { orientation: "h", y: -0.2, font: { color: c.chartMuted, size: m ? 10 : 12 } },
      hovermode: "x unified",
    }, { displayModeBar: false, responsive: true });
  }

  function smoothedDensity(samples, xGrid, bandwidth) {
    const nBins = xGrid.length;
    const xMin = xGrid[0];
    const xMax = xGrid[nBins - 1];
    const binWidth = (xMax - xMin) / (nBins - 1);
    const counts = new Float64Array(nBins);
    for (let i = 0; i < samples.length; i++) {
      const idx = Math.round((samples[i] - xMin) / binWidth);
      if (idx >= 0 && idx < nBins) counts[idx]++;
    }
    const norm = samples.length * binWidth;
    for (let i = 0; i < nBins; i++) counts[i] /= norm;

    const kernelSigma = bandwidth / binWidth;
    const kernelRadius = Math.max(1, Math.ceil(3 * kernelSigma));
    const kernel = new Float64Array(2 * kernelRadius + 1);
    let kernelSum = 0;
    for (let k = -kernelRadius; k <= kernelRadius; k++) {
      const w = Math.exp(-0.5 * (k / kernelSigma) ** 2);
      kernel[k + kernelRadius] = w;
      kernelSum += w;
    }
    for (let i = 0; i < kernel.length; i++) kernel[i] /= kernelSum;

    const smoothed = new Float64Array(nBins);
    for (let i = 0; i < nBins; i++) {
      let v = 0;
      for (let k = -kernelRadius; k <= kernelRadius; k++) {
        const j = i + k;
        if (j >= 0 && j < nBins) v += counts[j] * kernel[k + kernelRadius];
      }
      smoothed[i] = v;
    }
    return smoothed;
  }

  function renderDiffChart(diffs, sortedDiff, pAgtB) {
    const lo = quantile(sortedDiff, 0.0005);
    const hi = quantile(sortedDiff, 0.9995);
    const span = Math.max(Math.abs(lo), Math.abs(hi), 0.02);
    const xMax = span * 1.15;
    const xMin = -xMax;

    let mean = 0;
    for (let i = 0; i < diffs.length; i++) mean += diffs[i];
    mean /= diffs.length;
    let variance = 0;
    for (let i = 0; i < diffs.length; i++) {
      const d = diffs[i] - mean;
      variance += d * d;
    }
    variance /= diffs.length;
    const std = Math.sqrt(variance);
    const bandwidth = Math.max(0.9 * std * Math.pow(diffs.length, -0.2), 0.0005);

    const N_GRID = 401;
    const half = (N_GRID - 1) / 2;
    const step = xMax / half;
    const xGrid = new Float64Array(N_GRID);
    for (let i = 0; i < N_GRID; i++) xGrid[i] = (i - half) * step;
    const density = smoothedDensity(diffs, xGrid, bandwidth);

    const xNeg = [], yNeg = [];
    const xPos = [], yPos = [];
    for (let i = 0; i < N_GRID; i++) {
      if (xGrid[i] <= 0) {
        xNeg.push(xGrid[i]);
        yNeg.push(density[i]);
      }
      if (xGrid[i] >= 0) {
        xPos.push(xGrid[i]);
        yPos.push(density[i]);
      }
    }

    const c = colors();
    const traces = [
      {
        x: xNeg, y: yNeg, mode: "lines", name: "B &gt; A",
        line: { color: c.B, width: 2, shape: "spline" },
        fill: "tozeroy", fillcolor: c.bFillStrong,
        hovertemplate: "Δ = %{x:+.1%}<extra></extra>",
      },
      {
        x: xPos, y: yPos, mode: "lines", name: "A &gt; B",
        line: { color: c.A, width: 2, shape: "spline" },
        fill: "tozeroy", fillcolor: c.aFillStrong,
        hovertemplate: "Δ = %{x:+.1%}<extra></extra>",
      },
    ];

    let posSum = 0, posCount = 0, negSum = 0, negCount = 0;
    for (let i = 0; i < diffs.length; i++) {
      if (diffs[i] >= 0) { posSum += diffs[i]; posCount++; }
      else { negSum += diffs[i]; negCount++; }
    }
    const posMean = posCount > 0 ? posSum / posCount : xMax * 0.5;
    const negMean = negCount > 0 ? negSum / negCount : xMin * 0.5;

    const m = isMobile();
    const badgeFontSize = m ? 13 : 18;
    const badgePad = m ? 5 : 7;

    const annotations = [];
    if (pAgtB >= 0.03) {
      annotations.push({
        x: posMean, y: 0.55, xref: "x", yref: "paper",
        text: `<b>${fmtPct(pAgtB, 0)}</b><br>A &gt; B`,
        showarrow: false, align: "center",
        font: { color: "#fff", size: badgeFontSize, family: "Inter, sans-serif" },
        bgcolor: c.A, borderpad: badgePad, bordercolor: c.A,
      });
    }
    if (1 - pAgtB >= 0.03) {
      annotations.push({
        x: negMean, y: 0.55, xref: "x", yref: "paper",
        text: `<b>${fmtPct(1 - pAgtB, 0)}</b><br>B &gt; A`,
        showarrow: false, align: "center",
        font: { color: "#fff", size: badgeFontSize, family: "Inter, sans-serif" },
        bgcolor: c.B, borderpad: badgePad, bordercolor: c.B,
      });
    }

    Plotly.newPlot("diff-chart", traces, {
      margin: m ? { l: 12, r: 12, t: 6, b: 36 } : { l: 50, r: 20, t: 10, b: 50 },
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "rgba(0,0,0,0)",
      xaxis: { title: m ? "" : "p_A − p_B (percentage points)", range: [xMin, xMax], tickformat: "+.1%", zeroline: false, color: c.chartMuted, gridcolor: getThemeColor("--border"), tickfont: { size: m ? 10 : 12 } },
      yaxis: { title: m ? "" : "Density", rangemode: "tozero", showticklabels: false, color: c.chartMuted, gridcolor: getThemeColor("--border") },
      showlegend: false,
      annotations,
      shapes: [
        {
          type: "line", x0: 0, x1: 0, yref: "paper", y0: 0, y1: 1,
          line: { color: c.textStrong, width: 2 },
        },
      ],
    }, { displayModeBar: false, responsive: true });
  }

  function renderCIChart(divId, posterior, qLow, qHigh, color, fillColor, sharedXMin, sharedXMax) {
    const N = 401;
    const x = new Array(N);
    const y = new Array(N);
    for (let i = 0; i < N; i++) {
      x[i] = sharedXMin + i * (sharedXMax - sharedXMin) / (N - 1);
      y[i] = jStat.beta.pdf(x[i], posterior.alpha, posterior.beta);
    }

    const xCI = [qLow];
    const yCI = [jStat.beta.pdf(qLow, posterior.alpha, posterior.beta)];
    for (let i = 0; i < N; i++) {
      if (x[i] > qLow && x[i] < qHigh) {
        xCI.push(x[i]);
        yCI.push(y[i]);
      }
    }
    xCI.push(qHigh);
    yCI.push(jStat.beta.pdf(qHigh, posterior.alpha, posterior.beta));

    const mutedText = getThemeColor("--chart-muted");

    const traces = [
      {
        x, y, mode: "lines",
        line: { color, width: 1.5 },
        hoverinfo: "skip", showlegend: false,
        opacity: 0.45,
      },
      {
        x: xCI, y: yCI, mode: "lines",
        line: { color, width: 2 },
        fill: "tozeroy", fillcolor: fillColor,
        hoverinfo: "skip", showlegend: false,
      },
    ];

    Plotly.newPlot(divId, traces, {
      margin: { l: 8, r: 8, t: 8, b: 28 },
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "rgba(0,0,0,0)",
      xaxis: {
        range: [sharedXMin, sharedXMax],
        showticklabels: false, showgrid: false, zeroline: false, ticks: "",
      },
      yaxis: { rangemode: "tozero", showticklabels: false, showgrid: false, zeroline: false, ticks: "" },
      annotations: [
        {
          x: qLow, y: 0, xref: "x", yref: "paper",
          text: fmtPct(qLow, 1),
          showarrow: false, yshift: -10, yanchor: "top",
          font: { size: 11, color: mutedText, family: "Inter, sans-serif" },
        },
        {
          x: qHigh, y: 0, xref: "x", yref: "paper",
          text: fmtPct(qHigh, 1),
          showarrow: false, yshift: -10, yanchor: "top",
          font: { size: 11, color: mutedText, family: "Inter, sans-serif" },
        },
      ],
      shapes: [
        { type: "line", x0: qLow, x1: qLow, y0: 0, y1: 1, yref: "paper", line: { color, width: 1, dash: "dot" } },
        { type: "line", x0: qHigh, x1: qHigh, y0: 0, y1: 1, yref: "paper", line: { color, width: 1, dash: "dot" } },
      ],
    }, { displayModeBar: false, responsive: true });
  }

  function renderCredibleIntervals(post, sortedA, sortedB, sortedDiff, level) {
    const tail = (1 - level) / 2;
    const qLow = tail;
    const qHigh = 1 - tail;

    const obsA = parseInt($("successes_A").value) / parseInt($("trials_A").value);
    const obsB = parseInt($("successes_B").value) / parseInt($("trials_B").value);
    const meanA = post.A.alpha / (post.A.alpha + post.A.beta);
    const meanB = post.B.alpha / (post.B.alpha + post.B.beta);

    const qLowA = jStat.beta.inv(qLow, post.A.alpha, post.A.beta);
    const qHighA = jStat.beta.inv(qHigh, post.A.alpha, post.A.beta);
    const qLowB = jStat.beta.inv(qLow, post.B.alpha, post.B.beta);
    const qHighB = jStat.beta.inv(qHigh, post.B.alpha, post.B.beta);

    $("obsP_A").textContent = fmtPct(obsA, 1);
    $("obsP_B").textContent = fmtPct(obsB, 1);
    $("bestP_A").textContent = fmtPct(meanA, 1);
    $("bestP_B").textContent = fmtPct(meanB, 1);
    $("ciLow_A").textContent = fmtPct(qLowA, 1);
    $("ciUp_A").textContent = fmtPct(qHighA, 1);
    $("ciLow_B").textContent = fmtPct(qLowB, 1);
    $("ciUp_B").textContent = fmtPct(qHighB, 1);

    const meanDiff = meanA - meanB;
    $("bestP_diff").textContent = fmtPP(meanDiff, 1);
    $("ciLow_diff").textContent = fmtPP(quantile(sortedDiff, qLow), 1);
    $("ciUp_diff").textContent = fmtPP(quantile(sortedDiff, qHigh), 1);

    const levelPct = Math.round(level * 100) + "%";
    $("ci-level-label").textContent = levelPct;

    const tailLow = jStat.beta.inv(0.0005, post.A.alpha, post.A.beta);
    const tailHigh = jStat.beta.inv(0.9995, post.A.alpha, post.A.beta);
    const tailLowB = jStat.beta.inv(0.0005, post.B.alpha, post.B.beta);
    const tailHighB = jStat.beta.inv(0.9995, post.B.alpha, post.B.beta);
    const sharedLo = Math.max(0, Math.min(tailLow, tailLowB));
    const sharedHi = Math.min(1, Math.max(tailHigh, tailHighB));
    const padding = (sharedHi - sharedLo) * 0.08;
    const sharedXMin = Math.max(0, sharedLo - padding);
    const sharedXMax = Math.min(1, sharedHi + padding);

    const c = colors();
    renderCIChart("ci-chart-A", post.A, qLowA, qHighA, c.A, c.aFillStrong, sharedXMin, sharedXMax);
    renderCIChart("ci-chart-B", post.B, qLowB, qHighB, c.B, c.bFillStrong, sharedXMin, sharedXMax);
    $("ci-chart-A-caption").textContent = `${levelPct} credible interval`;
    $("ci-chart-B-caption").textContent = `${levelPct} credible interval`;
  }

  function renderRope(diffs, ropeHalfWidth) {
    let nBelow = 0, nIn = 0, nAbove = 0;
    for (let i = 0; i < diffs.length; i++) {
      const d = diffs[i];
      if (d < -ropeHalfWidth) nBelow++;
      else if (d > ropeHalfWidth) nAbove++;
      else nIn++;
    }
    const total = diffs.length;
    const pBelow = nBelow / total;
    const pIn = nIn / total;
    const pAbove = nAbove / total;

    const c = colors();
    const segs = [
      { width: pBelow, color: c.B, textColor: "#fff", label: pBelow >= 0.05 ? fmtPct(pBelow, 0) : "" },
      { width: pIn, color: c.ropeMid, textColor: c.textStrong, label: pIn >= 0.05 ? fmtPct(pIn, 0) : "" },
      { width: pAbove, color: c.A, textColor: "#fff", label: pAbove >= 0.05 ? fmtPct(pAbove, 0) : "" },
    ];

    const ropePP = (ropeHalfWidth * 100).toFixed(1).replace(/\.0$/, "");
    $("rope-bar").innerHTML = `
      <div class="rope-bar-row">
        ${segs.map((s) =>
          `<div class="rope-seg" style="flex: ${s.width || 0.0001}; background: ${s.color}; color: ${s.textColor};">${s.label}</div>`
        ).join("")}
      </div>
      <div class="rope-axis">
        <span>B better by &gt; ${ropePP}pp</span>
        <span>Within ±${ropePP}pp (equivalent)</span>
        <span>A better by &gt; ${ropePP}pp</span>
      </div>
    `;

    let verdict = "";
    let verdictClass = "verdict-neutral";
    const fmt = (p) => fmtPct(p, 0);
    if (pAbove >= 0.95) {
      verdict = `<strong>Adopt A.</strong> ${fmt(pAbove)} of the posterior shows A meaningfully better than B (the difference exceeds +${ropePP}pp). You can act with high confidence.`;
      verdictClass = "verdict-A";
    } else if (pBelow >= 0.95) {
      verdict = `<strong>Adopt B.</strong> ${fmt(pBelow)} of the posterior shows B meaningfully better than A (the difference exceeds −${ropePP}pp). You can act with high confidence.`;
      verdictClass = "verdict-B";
    } else if (pIn >= 0.95) {
      verdict = `<strong>Treat as equivalent.</strong> ${fmt(pIn)} of the posterior falls within ±${ropePP}pp. The two groups may differ slightly, but the difference is very unlikely to be big enough to matter for your decision — pick on other criteria.`;
      verdictClass = "verdict-equiv";
    } else {
      let lean = "";
      if (pAbove >= 0.5) lean = `the data lean toward A being meaningfully better (${fmt(pAbove)})`;
      else if (pBelow >= 0.5) lean = `the data lean toward B being meaningfully better (${fmt(pBelow)})`;
      else if (pIn >= 0.5) lean = `the data lean toward equivalence (${fmt(pIn)})`;
      else lean = `no single outcome is dominant`;
      verdict = `
        <strong>Inconclusive.</strong> No outcome has reached the 95% threshold needed to commit, but ${lean}.
        <div class="verdict-breakdown">
          <span>A meaningfully better: <strong>${fmt(pAbove)}</strong></span>
          <span>Equivalent: <strong>${fmt(pIn)}</strong></span>
          <span>B meaningfully better: <strong>${fmt(pBelow)}</strong></span>
        </div>
        <span class="verdict-guidance">Options: collect more data to tighten the posterior; widen the ROPE if you've set it stricter than your decision actually requires; or accept the leaning region if your context tolerates more risk.</span>
      `;
      verdictClass = "verdict-neutral";
    }
    const verdictEl = $("rope-verdict");
    verdictEl.innerHTML = verdict;
    verdictEl.className = "rope-verdict " + verdictClass;
  }

  function renderSummary(post, sortedDiff, pAgtB) {
    const meanA = post.A.alpha / (post.A.alpha + post.A.beta);
    const meanB = post.B.alpha / (post.B.alpha + post.B.beta);
    const meanDiff = meanA - meanB;
    const ciLow = quantile(sortedDiff, 0.025);
    const ciHigh = quantile(sortedDiff, 0.975);

    const winner = pAgtB >= 0.5 ? "A" : "B";
    const winProb = Math.max(pAgtB, 1 - pAgtB);
    const strength = pdStrengthLabel(pAgtB);

    let leadLine;
    if (winProb >= 0.55) {
      leadLine = `Group <strong>${winner}</strong> is probably better than ${winner === "A" ? "B" : "A"} (${fmtPct(winProb, 0)} probability — ${strength} evidence).`;
    } else {
      leadLine = `The two groups look essentially tied — neither shows meaningful evidence of being better.`;
    }

    const diffLine = `The most likely difference is <strong>${fmtPP(meanDiff, 1)}</strong> (95% CI: ${fmtPPRange(ciLow, ciHigh, 1)}).`;

    $("summary").innerHTML = `<p class="summary-lead">${leadLine}</p><p class="summary-diff">${diffLine}</p>`;
  }

  function renderAlphaBeta(post) {
    $("alpha_beta").innerHTML = `
      <table>
        <thead>
          <tr><th>Group</th><th>α</th><th>β</th><th>Posterior mean</th></tr>
        </thead>
        <tbody>
          <tr><td>A</td><td>${post.A.alpha.toFixed(2)}</td><td>${post.A.beta.toFixed(2)}</td><td>${fmtPct(post.A.alpha / (post.A.alpha + post.A.beta), 1)}</td></tr>
          <tr><td>B</td><td>${post.B.alpha.toFixed(2)}</td><td>${post.B.beta.toFixed(2)}</td><td>${fmtPct(post.B.alpha / (post.B.alpha + post.B.beta), 1)}</td></tr>
        </tbody>
      </table>
    `;
  }

  function renderFisher(data) {
    const failA = data.trials_A - data.successes_A;
    const failB = data.trials_B - data.successes_B;
    const p = fisherExact(data.successes_A, failA, data.successes_B, failB);
    $("p_value").textContent = p.toFixed(4);
  }

  function recompute() {
    const data = validateAndRead();
    if (!data) return;

    const prior = getPriorParams();
    const post = computePosteriors(data, prior);

    const samplesA = sampleBeta(post.A.alpha, post.A.beta, NUM_SAMPLES);
    const samplesB = sampleBeta(post.B.alpha, post.B.beta, NUM_SAMPLES);
    const diffs = new Float64Array(NUM_SAMPLES);
    let countAgtB = 0;
    for (let i = 0; i < NUM_SAMPLES; i++) {
      diffs[i] = samplesA[i] - samplesB[i];
      if (samplesA[i] > samplesB[i]) countAgtB++;
    }
    const pAgtB = countAgtB / NUM_SAMPLES;
    const sortedDiff = Float64Array.from(diffs).sort();
    const sortedA = Float64Array.from(samplesA).sort();
    const sortedB = Float64Array.from(samplesB).sort();

    state.posteriors = post;
    state.priorParams = prior;
    state.diffSamples = diffs;
    state.sortedDiff = sortedDiff;
    state.samplesA = sortedA;
    state.samplesB = sortedB;
    state.pAgtB = pAgtB;

    renderSummary(post, sortedDiff, pAgtB);
    renderPosteriorChart(post, prior);
    renderDiffChart(diffs, sortedDiff, pAgtB);
    renderCredibleIntervals(post, sortedA, sortedB, sortedDiff, parseFloat($("ci-level").value));
    renderRope(diffs, parseFloat($("rope-value").value) / 100);
    renderAlphaBeta(post);
    renderFisher(data);
  }

  function rerenderCI() {
    if (!state.posteriors) return;
    renderCredibleIntervals(
      state.posteriors,
      state.samplesA,
      state.samplesB,
      state.sortedDiff,
      parseFloat($("ci-level").value)
    );
  }

  function rerenderRope() {
    if (!state.diffSamples) return;
    renderRope(state.diffSamples, parseFloat($("rope-value").value) / 100);
  }

  let debounceTimer = null;
  function debouncedRecompute() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(recompute, 150);
  }

  document.querySelectorAll('input[type="number"]').forEach((input) => {
    if (input.id === "rope-value") return;
    input.addEventListener("input", debouncedRecompute);
  });

  radios().forEach((r) =>
    r.addEventListener("change", () => {
      syncCustomInputState();
      debouncedRecompute();
    })
  );

  $("ci-level").addEventListener("change", rerenderCI);

  const ropeSlider = $("rope-slider");
  const ropeNumber = $("rope-value");
  ropeSlider.addEventListener("input", () => {
    ropeNumber.value = ropeSlider.value;
    rerenderRope();
  });
  ropeNumber.addEventListener("input", () => {
    const v = parseFloat(ropeNumber.value);
    if (!isNaN(v) && v >= 0 && v <= 20) {
      ropeSlider.value = v;
      rerenderRope();
    }
  });

  document.querySelector(".custom-prior").addEventListener("toggle", (e) => {
    const customRadio = document.querySelector('input[name="prior"][value="custom"]');
    if (e.target.open) {
      if (customRadio) customRadio.checked = true;
    } else if (customRadio && customRadio.checked) {
      const uniformRadio = document.querySelector('input[name="prior"][value="uniform"]');
      if (uniformRadio) uniformRadio.checked = true;
    }
    syncCustomInputState();
    debouncedRecompute();
  });

  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    try { localStorage.setItem("theme", theme); } catch (e) {}
  }

  const savedTheme = (() => { try { return localStorage.getItem("theme"); } catch (e) { return null; } })();
  if (savedTheme === "dark" || savedTheme === "light") {
    applyTheme(savedTheme);
  } else {
    const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    applyTheme(prefersDark ? "dark" : "light");
  }

  $("theme-toggle").addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-theme") || "light";
    applyTheme(current === "dark" ? "light" : "dark");
    if (state.posteriors) recompute();
  });

  function applyPinned(pinned) {
    const pane = $("inputPane");
    const btn = $("input-pin");
    const label = btn.querySelector(".input-pin-label");
    if (pinned) pane.setAttribute("data-pinned", "true");
    else pane.removeAttribute("data-pinned");
    if (label) label.textContent = pinned ? "Pinned" : "Pin to top";
    btn.setAttribute("aria-pressed", pinned ? "true" : "false");
    try { localStorage.setItem("inputPinned", pinned ? "1" : "0"); } catch (e) {}
  }

  const savedPinned = (() => { try { return localStorage.getItem("inputPinned"); } catch (e) { return null; } })();
  if (savedPinned === "1") applyPinned(true);

  $("input-pin").addEventListener("click", () => {
    const isPinned = $("inputPane").getAttribute("data-pinned") === "true";
    applyPinned(!isPinned);
  });

  let lastMobile = isMobile();
  let resizeTimer = null;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      const nowMobile = isMobile();
      if (nowMobile !== lastMobile && state.posteriors) {
        lastMobile = nowMobile;
        recompute();
      }
    }, 200);
  });

  syncCustomInputState();
  recompute();

  function fisherExact(successA, failA, successB, failB) {
    const comb = (n, k) => {
      if (k > n || k < 0) return 0;
      if (k === 0 || k === n) return 1;
      k = Math.min(k, n - k);
      let result = 1;
      for (let i = 1; i <= k; i++) result *= (n - i + 1) / i;
      return result;
    };
    const total = successA + failA + successB + failB;
    const row1 = successA + failA;
    const row2 = successB + failB;
    const col1 = successA + successB;
    const hypergeometricProb = (sA) => {
      const sB = col1 - sA;
      const fA_current = row1 - sA;
      const fB_current = row2 - sB;
      if (fA_current < 0 || fB_current < 0) return 0;
      return (comb(row1, sA) * comb(row2, sB)) / comb(total, col1);
    };
    const pObserved = hypergeometricProb(successA);
    const minSuccessA = Math.max(0, col1 - row2);
    const maxSuccessA = Math.min(row1, col1);
    let pValue = 0;
    for (let sA = minSuccessA; sA <= maxSuccessA; sA++) {
      const currentProb = hypergeometricProb(sA);
      if (currentProb <= pObserved) pValue += currentProb;
    }
    return pValue;
  }
});
