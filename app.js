document.addEventListener('DOMContentLoaded', () => {
  // Elements
  const modelViewer = document.getElementById('modelViewer');
  const loadingIndicator = document.getElementById('loading-indicator');
  const loadingText = document.getElementById('loading-text');
  const errorMessage = document.getElementById('error-message');
  const nextButton = document.getElementById('nextModel');
  const prevButton = document.getElementById('prevModel');
  const autoPlayButton = document.getElementById('toggleAutoPlay');

  // Assume the KPI modal’s container exists in the HTML with id "kpiContainer"

  // Lighting controls elements (inside the settings modal)
  const exposureControl = document.getElementById('exposureControl');
  const shadowControl = document.getElementById('shadowControl');

  // Variables for model management and auto play
  let modelUrls = [];
  let modelsData = []; // Array to store blob URLs plus additional metadata
  let activeModelData = null; // Currently active model metadata
  let currentModelIndex = 0;
  let autoPlayActive = false;
  let autoPlayInterval = null;
  const autoPlayDelay = 750; // in milliseconds
  const timeoutMs = 30000;   // Fetch timeout

  // Cache for USDZ conversion results
  const usdzCache = {};

  // Helper to check if device is iOS
  function isIOS() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  }

  // Function that performs a fetch call on a given endpoint with a timeout
  function tryFetchEndpoint(endpoint, modelId, timeoutMs) {
    const controller = new AbortController();
    const timeoutID = setTimeout(() => {
      console.error(`Fetch request to ${endpoint} timed out after ${timeoutMs}ms`);
      controller.abort();
    }, timeoutMs);

    return fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ id: modelId }),
      signal: controller.signal
    }).then(response => {
      clearTimeout(timeoutID);
      if (!response.ok) {
        return Promise.reject(new Error(`HTTP error! status: ${response.status}`));
      }
      return response;
    });
  }

  // Function to fetch GLTF data with a fallback mechanism
  function fetchGLTFData(modelId) {
    const primaryEndpoint = 'https://run8n.xyz/webhook-test/getGLTF';
    const fallbackEndpoint = 'https://run8n.xyz/webhook/getGLTF';
    return tryFetchEndpoint(primaryEndpoint, modelId, timeoutMs)
      .catch(error => {
        console.error(`Primary endpoint failed: ${error}. Trying fallback endpoint...`);
        return tryFetchEndpoint(fallbackEndpoint, modelId, timeoutMs);
      });
  }

  // Function to fetch USDZ conversion using a live conversion API
  function fetchUSDZConversion(gltfUrl) {
    const conversionApi = "https://your-usdz-api.com/convert?url=" + encodeURIComponent(gltfUrl);
    return fetch(conversionApi)
      .then(response => {
        if (!response.ok) {
          throw new Error("Conversion API request failed");
        }
        return response.json();
      })
      .then(data => {
        if (data.usdzUrl) {
          return data.usdzUrl;
        }
        throw new Error("USDZ URL not found in conversion API response");
      });
  }

  // --- KPI Helper Functions ---

  // Smart rounding function for KPI values
  function formatNumber(num) {
    if (typeof num !== 'number') return num;
    if (num >= 1000000) {
      return (num / 1000000).toFixed(1) + " Mio";
    } else if (num >= 1000) {
      return (num / 1000).toFixed(1) + "k";
    } else {
      return num.toFixed(1);
    }
  }

  // Extract only the desired KPIs from the data (GRZ, BMZ, BGF, Kosten)
  function extractKPIs(data) {
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

  function updateKPI(kpiData) {
    const container = document.getElementById("kpiContainer");
    if (!container) {
      console.warn("KPI container element not found.");
      return;
    }
    container.innerHTML = ""; // Clear previous KPI entries.
    const extracted = extractKPIs(kpiData);
    // Updated keysOrder to include the new GFZ KPI.
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

  // --- Updated loadModel Function ---
  function loadModel(index) {
    const modelData = modelsData[index];
    console.log("Loading model at index", index, "URL:", modelData.url);
    modelViewer.src = modelData.url;
    activeModelData = modelData; // Update currently active model metadata

    // Crash the app if no KPI data is provided.
    if (!activeModelData.kpi || !activeModelData.kpi.rows || activeModelData.kpi.rows.length === 0) {
      throw new Error("No KPI data found for model: " + activeModelData.name);
    }
    // Update the KPI view with the current model’s KPI data.
    updateKPI(activeModelData.kpi);

    if (isIOS()) {
      if (usdzCache[modelData.url]) {
        modelViewer.setAttribute('ios-src', usdzCache[modelData.url]);
      } else {
        fetchUSDZConversion(modelData.url)
          .then(usdzUrl => {
            usdzCache[modelData.url] = usdzUrl;
            modelViewer.setAttribute('ios-src', usdzUrl);
            console.log("Set ios-src for model index", index, usdzUrl);
          })
          .catch(error => {
            console.error("USDZ conversion failed for model index", index, error);
          });
      }
    }
  }

  // ------------------- Fetching Model Data via API -------------------
  const params = new URLSearchParams(window.location.search);
  const modelId = params.get('id') || '10';
  console.log("Extracted model ID:", modelId);

  // Show loading indicator
  loadingIndicator.style.display = 'flex';

  fetchGLTFData(modelId)
    .then(response => {
      console.log("HTTP response status:", response.status);
      return response.json();
    })
    .then(data => {
      console.log("Raw webhook response data:", data);
      
      // Parse each entry's 'data' property with the new nested structure.
      const parsedModels = data.map((entry, index) => {
        if (!entry.data) {
          console.error(`Entry at index ${index} missing 'data' property.`);
          return null;
        }
        const modelData = entry.data;
        try {
          // Parse fileContent (a JSON string) to get glTF content.
          const gltf = JSON.parse(modelData.fileContent);
          console.log(`Parsed model at index ${index}:`, gltf);
          return {
            name: modelData.name,
            gltf: gltf,
            kpi: modelData.kpi,  // updated property name to lower-case to match payload
            active_variant: modelData.active_variant
          };
        } catch (error) {
          console.error(`Error parsing fileContent for model at index ${index}:`, error);
          return null;
        }
      }).filter(model => model !== null);

      if (parsedModels.length === 0) {
        console.error("No valid model JSON found.");
        showError("No valid model data found.");
        return;
      }

      // Create Blob URLs from parsed glTF JSON objects and store additional metadata.
      const modelsDataArr = parsedModels.map((model, index) => {
        try {
          const blob = new Blob([JSON.stringify(model.gltf)], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          console.log(`Created blob URL for model at index ${index}:`, url);
          return {
            url: url,
            name: model.name,
            kpi: model.kpi,  // updated property name
            active_variant: model.active_variant
          };
        } catch (error) {
          console.error(`Error creating blob URL for model at index ${index}:`, error);
          return null;
        }
      }).filter(item => item !== null);

      if (modelsDataArr.length === 0) {
        console.error("No valid blob URLs generated.");
        showError("Failed to prepare models for display.");
        return;
      }

      // Update global data.
      modelsData = modelsDataArr;
      modelUrls = modelsData.map(item => item.url);

      // Load the first model.
      loadModel(0);
      setupModelControls();
      // Hide loading indicator.
      loadingIndicator.style.display = 'none';
      console.log(`Successfully loaded ${modelUrls.length} models`);

      // Start auto play by default if more than one model exists.
      if (modelUrls.length > 1) {
        autoPlayActive = true;
        autoPlayButton.textContent = "Stop Auto Play";
        autoPlayInterval = setInterval(() => {
          currentModelIndex = (currentModelIndex + 1) % modelUrls.length;
          loadModel(currentModelIndex);
          console.log(`Auto Play switched to model ${currentModelIndex + 1} of ${modelUrls.length}`);
        }, autoPlayDelay);
      }
    })
    .catch(error => {
      console.error("Error fetching models:", error);
      showError(`Failed to load models: ${error.message}`);
      loadingIndicator.style.display = 'none';
    });

  // Set up model cycling controls.
  function setupModelControls() {
    if (modelUrls.length <= 1) {
      document.getElementById('model-controls').style.display = 'none';
      return;
    }

    nextButton.addEventListener('click', () => {
      currentModelIndex = (currentModelIndex + 1) % modelUrls.length;
      loadModel(currentModelIndex);
      console.log(`Switched to model ${currentModelIndex + 1} of ${modelUrls.length}`);
    });

    prevButton.addEventListener('click', () => {
      currentModelIndex = (currentModelIndex - 1 + modelUrls.length) % modelUrls.length;
      loadModel(currentModelIndex);
      console.log(`Switched to model ${currentModelIndex + 1} of ${modelUrls.length}`);
    });
  }

  // Set up auto play toggling via the button.
  if (autoPlayButton) {
    autoPlayButton.addEventListener('click', () => {
      if (modelUrls.length <= 1) {
        console.warn("Auto play is disabled because there is only one model.");
        return;
      }
      autoPlayActive = !autoPlayActive;
      if (autoPlayActive) {
        autoPlayButton.textContent = "Stop Auto Play";
        autoPlayInterval = setInterval(() => {
          currentModelIndex = (currentModelIndex + 1) % modelUrls.length;
          loadModel(currentModelIndex);
          console.log(`Auto Play switched to model ${currentModelIndex + 1} of ${modelUrls.length}`);
        }, autoPlayDelay);
      } else {
        autoPlayButton.textContent = "Start Auto Play";
        clearInterval(autoPlayInterval);
        autoPlayInterval = null;
      }
    });
  }

  // Helper function to display error messages.
  function showError(message) {
    errorMessage.textContent = message;
    errorMessage.style.display = 'block';
    loadingIndicator.style.display = 'none';
  }

  // Listen for AR session events.
  modelViewer.addEventListener('ar-status', (event) => {
    console.log(`AR Status: ${event.detail.status}`);
  });

  // Listen for model loading events.
  modelViewer.addEventListener('load', () => {
    console.log("Model loaded successfully");
    modelViewer.setAttribute('camera-orbit', '0deg 60deg 0.25m');
    modelViewer.setAttribute('camera-target', '0m 0.01m 0m');
    modelViewer.setAttribute('scale', '0.01 0.01 0.01');
  });

  modelViewer.addEventListener('error', (event) => {
    console.error("Error loading model:", event);
    showError("Error displaying 3D model. The model may be incompatible or corrupted.");
  });

  // Set up lighting controls event listeners.
  if (exposureControl) {
    exposureControl.addEventListener('input', () => {
      modelViewer.setAttribute('exposure', exposureControl.value);
      console.log(`Updated exposure to: ${exposureControl.value}`);
    });
  }

  if (shadowControl) {
    shadowControl.addEventListener('input', () => {
      modelViewer.setAttribute('shadow-intensity', shadowControl.value);
      console.log(`Updated shadow intensity to: ${shadowControl.value}`);
    });
  }
});