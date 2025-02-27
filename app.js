document.addEventListener('DOMContentLoaded', () => {
  // Elements
  const modelViewer = document.getElementById('modelViewer');
  const loadingIndicator = document.getElementById('loading-indicator');
  const loadingText = document.getElementById('loading-text');
  const errorMessage = document.getElementById('error-message');
  const nextButton = document.getElementById('nextModel');
  const prevButton = document.getElementById('prevModel');
  const autoPlayButton = document.getElementById('toggleAutoPlay');

  // Lighting controls elements (inside the settings modal)
  const exposureControl = document.getElementById('exposureControl');
  const shadowControl = document.getElementById('shadowControl');

  // Variables for model management and auto play
  let modelUrls = [];
  let currentModelIndex = 0;
  let autoPlayActive = false;
  let autoPlayInterval = null;
  const autoPlayDelay = 750; // delay in milliseconds between auto model switches
  const timeoutMs = 20000;   // fetch timeout

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

  // Helper function to load a model and update ios-src if needed
  function loadModel(index) {
    const url = modelUrls[index];
    console.log("Loading model at index", index, "URL:", url);
    modelViewer.src = url;

    if (isIOS()) {
      if (usdzCache[url]) {
        modelViewer.setAttribute('ios-src', usdzCache[url]);
      } else {
        fetchUSDZConversion(url)
          .then(usdzUrl => {
            usdzCache[url] = usdzUrl;
            modelViewer.setAttribute('ios-src', usdzUrl);
            console.log("Set ios-src for model index", index, usdzUrl);
          })
          .catch(error => {
            console.error("USDZ conversion failed for model index", index, error);
          });
      }
    }
  }

  // ------------------- Fetching model data via API -------------------
  const params = new URLSearchParams(window.location.search);
  const modelId = params.get('id');
  if (!modelId) {
    showError("No model ID provided in the URL. Please add ?id=yourModelId to the URL.");
    return;
  }
  console.log("Extracted model ID:", modelId);

  // Show loading indicator
  loadingIndicator.style.display = 'flex';

  // Fetch models from API
  fetchGLTFData(modelId)
    .then(response => {
      console.log("HTTP response status:", response.status);
      return response.json();
    })
    .then(data => {
      console.log("Raw webhook response data:", data);

      // Parse each entry's 'data' property
      const parsedModels = data.map((entry, index) => {
        if (!entry.data) {
          console.error(`Entry at index ${index} missing 'data' property.`);
          return null;
        }
        try {
          const parsed = JSON.parse(entry.data);
          console.log(`Parsed model at index ${index}:`, parsed);
          return parsed;
        } catch (error) {
          console.error(`Error parsing JSON for model at index ${index}:`, error);
          return null;
        }
      }).filter(model => model !== null);

      if (parsedModels.length === 0) {
        console.error("No valid model JSON found.");
        showError("No valid model data found.");
        return;
      }

      // Create Blob URLs from parsed glTF JSON objects
      modelUrls = parsedModels.map((gltf, index) => {
        try {
          const blob = new Blob([JSON.stringify(gltf)], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          console.log(`Created blob URL for model index ${index}:`, url);
          return url;
        } catch (error) {
          console.error(`Error creating blob URL for model index ${index}:`, error);
          return null;
        }
      }).filter(url => url !== null);

      if (modelUrls.length === 0) {
        console.error("No valid blob URLs generated.");
        showError("Failed to prepare models for display.");
        return;
      }

      // Load the first model using our helper function
      loadModel(0);

      // Set up manual model cycling controls
      setupModelControls();

      // Hide loading indicator
      loadingIndicator.style.display = 'none';

      console.log(`Successfully loaded ${modelUrls.length} models`);

      // Start auto play by default if more than one model exists
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

  // Set up model cycling controls
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

  // Set up auto play toggling via the button
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

  // Helper function to display error messages
  function showError(message) {
    errorMessage.textContent = message;
    errorMessage.style.display = 'block';
    loadingIndicator.style.display = 'none';
  }

  // Listen for AR session events
  modelViewer.addEventListener('ar-status', (event) => {
    console.log(`AR Status: ${event.detail.status}`);
  });

  // Listen for model loading events
  modelViewer.addEventListener('load', () => {
    console.log("Model loaded successfully");
    modelViewer.setAttribute('camera-orbit', '0deg 70deg 4.5m');
    modelViewer.setAttribute('camera-target', '0m 1m 0m');
    modelViewer.setAttribute('scale', '0.1 0.1 0.1');
  });

  modelViewer.addEventListener('error', (event) => {
    console.error("Error loading model:", event);
    showError("Error displaying 3D model. The model may be incompatible or corrupted.");
  });

  // Set up lighting controls event listeners
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