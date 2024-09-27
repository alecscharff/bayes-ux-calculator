document.addEventListener("DOMContentLoaded", function () {
  // Function to enable or disable informative prior inputs
  const priorCheckbox = document.getElementById("informativePrior");
  const informativeInputs = document.querySelectorAll(
    "#informative-prior-inputs input"
  );

  priorCheckbox.addEventListener("change", function () {
    informativeInputs.forEach((input) => {
      input.disabled = !priorCheckbox.checked;
      if (!priorCheckbox.checked) {
        input.value = 1; // Reset to default value
        input.classList.remove("input-error");
      }
    });
    validateInputs();
  });

  // Real-time validation for inputs
  const inputs = document.querySelectorAll('input[type="number"]');
  const calculateButton = document.getElementById("calculate");

  inputs.forEach((input) => {
    input.addEventListener("input", function () {
      validateInputs();
    });
  });

  function validateInputs() {
    let valid = true;

    // Clear previous error messages
    document
      .querySelectorAll(".error-message")
      .forEach((el) => (el.textContent = ""));

    // Validate successes and trials for Group A
    const successes_A = parseInt(document.getElementById("successes_A").value);
    const trials_A = parseInt(document.getElementById("trials_A").value);

    if (isNaN(successes_A) || successes_A < 0) {
      document.getElementById("error_successes_A").textContent =
        "Please enter a valid number of successes.";
      valid = false;
    } else if (isNaN(trials_A) || trials_A <= 0) {
      document.getElementById("error_trials_A").textContent =
        "Please enter a valid number of trials.";
      valid = false;
    } else if (successes_A > trials_A) {
      document.getElementById("error_successes_A").textContent =
        "Successes cannot exceed trials.";
      valid = false;
    }

    // Validate successes and trials for Group B
    const successes_B = parseInt(document.getElementById("successes_B").value);
    const trials_B = parseInt(document.getElementById("trials_B").value);

    if (isNaN(successes_B) || successes_B < 0) {
      document.getElementById("error_successes_B").textContent =
        "Please enter a valid number of successes.";
      valid = false;
    } else if (isNaN(trials_B) || trials_B <= 0) {
      document.getElementById("error_trials_B").textContent =
        "Please enter a valid number of trials.";
      valid = false;
    } else if (successes_B > trials_B) {
      document.getElementById("error_successes_B").textContent =
        "Successes cannot exceed trials.";
      valid = false;
    }

    // Validate informative priors if enabled
    if (priorCheckbox.checked) {
      const alpha_A = parseFloat(document.getElementById("alpha_A").value);
      const beta_A = parseFloat(document.getElementById("beta_A").value);
      const alpha_B = parseFloat(document.getElementById("alpha_B").value);
      const beta_B = parseFloat(document.getElementById("beta_B").value);

      if (isNaN(alpha_A) || alpha_A <= 0) {
        document.getElementById("error_alpha_A").textContent =
          "Alpha A must be a positive number.";
        valid = false;
      }

      if (isNaN(beta_A) || beta_A <= 0) {
        document.getElementById("error_beta_A").textContent =
          "Beta A must be a positive number.";
        valid = false;
      }

      if (isNaN(alpha_B) || alpha_B <= 0) {
        document.getElementById("error_alpha_B").textContent =
          "Alpha B must be a positive number.";
        valid = false;
      }

      if (isNaN(beta_B) || beta_B <= 0) {
        document.getElementById("error_beta_B").textContent =
          "Beta B must be a positive number.";
        valid = false;
      }
    }

    calculateButton.disabled = !valid;
  }

  validateInputs(); // Initial validation

  // Calculate Button Event Listener
  calculateButton.addEventListener("click", function () {
    // Retrieve input values
    const successes_A = parseInt(document.getElementById("successes_A").value);
    const trials_A = parseInt(document.getElementById("trials_A").value);
    const successes_B = parseInt(document.getElementById("successes_B").value);
    const trials_B = parseInt(document.getElementById("trials_B").value);

    const failures_A = trials_A - successes_A;
    const failures_B = trials_B - successes_B;

    // Retrieve or set default priors
    let alpha_prior_A = 1,
      beta_prior_A = 1;
    let alpha_prior_B = 1,
      beta_prior_B = 1;

    if (priorCheckbox.checked) {
      alpha_prior_A = parseFloat(document.getElementById("alpha_A").value);
      beta_prior_A = parseFloat(document.getElementById("beta_A").value);
      alpha_prior_B = parseFloat(document.getElementById("alpha_B").value);
      beta_prior_B = parseFloat(document.getElementById("beta_B").value);
    }

    // Calculate Posterior Parameters
    const alpha_post_A = alpha_prior_A + successes_A;
    const beta_post_A = beta_prior_A + failures_A;
    const alpha_post_B = alpha_prior_B + successes_B;
    const beta_post_B = beta_prior_B + failures_B;

    // Calculate Point Estimates
    const point_estimate_A = alpha_post_A / (alpha_post_A + beta_post_A);
    const point_estimate_B = alpha_post_B / (alpha_post_B + beta_post_B);

    // Calculate 95% Credible Intervals
    const credible_interval_A = [
      jStat.beta.inv(0.025, alpha_post_A, beta_post_A),
      jStat.beta.inv(0.975, alpha_post_A, beta_post_A)
    ];
    const credible_interval_B = [
      jStat.beta.inv(0.025, alpha_post_B, beta_post_B),
      jStat.beta.inv(0.975, alpha_post_B, beta_post_B)
    ];

    // P-Direction Calculation using Monte Carlo Simulation
    const p_A_gt_B = calculateP_A_gt_B_MC(
      alpha_post_A,
      beta_post_A,
      alpha_post_B,
      beta_post_B,
      100000 // Number of simulations
    );
    const p_B_gt_A = 1 - p_A_gt_B;

    // Interpretation based on p_A_gt_B
    let interpretation = "";
    if (p_A_gt_B > 0.99) {
      interpretation =
        "Decisive evidence that Group A has a higher completion rate than Group B.";
    } else if (p_A_gt_B > 0.95) {
      interpretation =
        "Very strong evidence that Group A has a higher completion rate than Group B.";
    } else if (p_A_gt_B > 0.9) {
      interpretation =
        "Strong evidence that Group A has a higher completion rate than Group B.";
    } else if (p_A_gt_B > 0.75) {
      interpretation =
        "Moderate evidence that Group A has a higher completion rate than Group B.";
    } else if (p_A_gt_B > 0.5) {
      interpretation =
        "Anecdotal evidence that Group A has a higher completion rate than Group B.";
    } else if (p_A_gt_B === 0.5) {
      interpretation = "No evidence favoring either group.";
    } else if (p_A_gt_B > 0.25) {
      interpretation =
        "Anecdotal evidence that Group B has a higher completion rate than Group A.";
    } else if (p_A_gt_B > 0.1) {
      interpretation =
        "Moderate evidence that Group B has a higher completion rate than Group A.";
    } else if (p_A_gt_B > 0.05) {
      interpretation =
        "Strong evidence that Group B has a higher completion rate than Group A.";
    } else if (p_A_gt_B > 0.01) {
      interpretation =
        "Very strong evidence that Group B has a higher completion rate than Group A.";
    } else {
      interpretation =
        "Decisive evidence that Group B has a higher completion rate than Group A.";
    }

    // Calculate Fisher's Exact Test p-value
    const fisher_p_value = fisherExact(
      successes_A,
      failures_A,
      successes_B,
      failures_B
    );

    // Update Parameter Estimates
    document.getElementById("obsP_A").textContent = (
      successes_A / trials_A
    ).toFixed(2);
    document.getElementById("bestP_A").textContent = point_estimate_A.toFixed(
      2
    );
    document.getElementById(
      "ciLow_A"
    ).textContent = credible_interval_A[0].toFixed(3);
    document.getElementById(
      "ciUp_A"
    ).textContent = credible_interval_A[1].toFixed(3);

    document.getElementById("obsP_B").textContent = (
      successes_B / trials_B
    ).toFixed(2);
    document.getElementById("bestP_B").textContent = point_estimate_B.toFixed(
      2
    );
    document.getElementById(
      "ciLow_B"
    ).textContent = credible_interval_B[0].toFixed(3);
    document.getElementById(
      "ciUp_B"
    ).textContent = credible_interval_B[1].toFixed(3);

    // Update P-Direction Test
    document.getElementById("p_A_gt_B").textContent =
      (p_A_gt_B * 100).toFixed(2) + "%";
    document.getElementById("p_B_gt_A").textContent =
      (p_B_gt_A * 100).toFixed(2) + "%";
    document.getElementById(
      "evidence"
    ).textContent = `There is ${interpretation}`;

    document.getElementById("p_value").textContent = fisher_p_value.toFixed(4);

    // Update Alpha/Beta Table
    document.getElementById("alpha_beta").innerHTML = `
      <h3>Posterior Alpha and Beta Parameters</h3>
      <table>
        <thead>
          <tr>
            <th>Group</th>
            <th>Alpha (α)</th>
            <th>Beta (β)</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Group A</td>
            <td>${alpha_post_A.toFixed(2)}</td>
            <td>${beta_post_A.toFixed(2)}</td>
          </tr>
          <tr>
            <td>Group B</td>
            <td>${alpha_post_B.toFixed(2)}</td>
            <td>${beta_post_B.toFixed(2)}</td>
          </tr>
        </tbody>
      </table>
    `;

    // Plot Posterior Distributions
    const plotData = {
      x: Array.from({ length: 1001 }, (_, i) => i / 1000),
      y_A: Array.from({ length: 1001 }, (_, i) =>
        jStat.beta.pdf(i / 1000, alpha_post_A, beta_post_A)
      ),
      y_B: Array.from({ length: 1001 }, (_, i) =>
        jStat.beta.pdf(i / 1000, alpha_post_B, beta_post_B)
      )
    };

    const traceA = {
      x: plotData.x,
      y: plotData.y_A,
      mode: "lines",
      name: "Group A",
      line: {
        color: "blue"
      }
    };
    const traceB = {
      x: plotData.x,
      y: plotData.y_B,
      mode: "lines",
      name: "Group B",
      line: {
        color: "red"
      }
    };

    Plotly.newPlot("chart", [traceA, traceB], {
      title: "Posterior Distributions for Groups A and B",
      xaxis: { title: "Success Probability" },
      yaxis: { title: "Density" },
      showlegend: true,
      responsive: true
    });
  });

  /**
   * Fisher's Exact Test Implementation
   * Calculates the two-tailed p-value for a 2x2 contingency table.
   * @param {number} successA - Number of successes in Group A
   * @param {number} failA - Number of failures in Group A
   * @param {number} successB - Number of successes in Group B
   * @param {number} failB - Number of failures in Group B
   * @returns {number} p-value
   */
  function fisherExact(successA, failA, successB, failB) {
    // Combination function optimized to handle large numbers
    const comb = (n, k) => {
      if (k > n || k < 0) return 0;
      if (k === 0 || k === n) return 1;
      k = Math.min(k, n - k); // Take advantage of symmetry
      let result = 1;
      for (let i = 1; i <= k; i++) {
        result *= (n - i + 1) / i;
      }
      return result;
    };

    const total = successA + failA + successB + failB;
    const row1 = successA + failA;
    const row2 = successB + failB;
    const col1 = successA + successB;
    const col2 = failA + failB;

    // Hypergeometric probability of a table
    const hypergeometricProb = (sA) => {
      const sB = col1 - sA;
      const fA_current = row1 - sA;
      const fB_current = row2 - sB;
      if (fA_current < 0 || fB_current < 0) return 0;
      return (comb(row1, sA) * comb(row2, sB)) / comb(total, col1);
    };

    // Calculate observed probability
    const pObserved = hypergeometricProb(successA);

    // Determine the possible range of successA
    const minSuccessA = Math.max(0, col1 - row2);
    const maxSuccessA = Math.min(row1, col1);

    // Calculate p-value by summing probabilities of tables as or more extreme
    let pValue = 0;
    for (let sA = minSuccessA; sA <= maxSuccessA; sA++) {
      const currentProb = hypergeometricProb(sA);
      if (currentProb <= pObserved) {
        pValue += currentProb;
      }
    }

    return pValue;
  }

  /**
   * Calculates P(p_A > p_B) using Monte Carlo Simulation
   * @param {number} alphaA - Alpha parameter of Group A's Beta distribution
   * @param {number} betaA - Beta parameter of Group A's Beta distribution
   * @param {number} alphaB - Alpha parameter of Group B's Beta distribution
   * @param {number} betaB - Beta parameter of Group B's Beta distribution
   * @param {number} numSimulations - Number of Monte Carlo simulations
   * @returns {number} Probability that p_A > p_B
   */
  function calculateP_A_gt_B_MC(
    alphaA,
    betaA,
    alphaB,
    betaB,
    numSimulations = 100000
  ) {
    let count = 0;

    for (let i = 0; i < numSimulations; i++) {
      const pA = jStat.beta.sample(alphaA, betaA);
      const pB = jStat.beta.sample(alphaB, betaB);
      if (pA > pB) count++;
    }

    return count / numSimulations;
  }
});