// kpiHelpers.js

// Smart rounding function for KPI values
export function formatNumber(num) {
    if (typeof num !== 'number') return num;
    if (num >= 1000000) {
      return (num / 1000000).toFixed(1) + " Mio";
    } else if (num >= 1000) {
      return (num / 1000).toFixed(1) + "k";
    } else {
      return num.toFixed(1);
    }
  }
  
  // Extract only the desired KPIs from the data
  export function extractKPIs(data) {
    const keys = {
      GFZ: null,
      GRZ: null,
      BGF: null,
      Kosten: null
    };
  
    data.rows.forEach(row => {
      const label = row[0];
      if (label.includes('GFZ') && !keys.GFZ) {
        keys.GFZ = row;
      }
      if (/GRZ/i.test(label) && !keys.GRZ) {
        keys.GRZ = row;
      }
      if (/BGF/i.test(label) && !keys.BGF) {
        keys.BGF = row;
      }
      if (/Gesamt/i.test(label) && !keys.KostenGesamt) {
        keys.Kosten = row;
      }
    });
  
    return keys;
  }
  
  // Update the DOM to display the KPI data
  export function updateKPI(kpiData) {
    const container = document.getElementById("kpiContainer");
    if (!container) {
      console.warn("KPI container element not found.");
      return;
    }
    container.innerHTML = ""; // Clear previous KPI entries.
  
    const extracted = extractKPIs(kpiData);
    const keysOrder = ["GFZ", "GRZ", "BGF", "Kosten"];
    
    keysOrder.forEach(key => {
      const row = extracted[key];
      if (row) {
        const rawValue = row[1];
        const unit = row[2];
        const value = formatNumber(rawValue) + (unit ? (" " + unit) : "");
        const card = document.createElement("div");
        card.className = "kpi-box";
        card.innerHTML = `<div class="kpi-label">${key}</div><div class="kpi-value">${value}</div>`;
        container.appendChild(card);
      }
    });
  }
  