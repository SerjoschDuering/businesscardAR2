document.addEventListener('DOMContentLoaded', () => {
    // Elements
    const modelViewer = document.getElementById('modelViewer');
    const loadingIndicator = document.getElementById('loading-indicator');
    const loadingText = document.getElementById('loading-text');
    const errorMessage = document.getElementById('error-message');
    const nextButton = document.getElementById('nextModel');
    const prevButton = document.getElementById('prevModel');
    
    // Variables for model management
    let modelUrls = [];
    let currentModelIndex = 0;
    
    // ------------------- Fetching model data via API -------------------
    // Extract the model ID from URL parameters
    const params = new URLSearchParams(window.location.search);
    const modelId = params.get('id');
    if (!modelId) {
      showError("No model ID provided in the URL. Please add ?id=yourModelId to the URL.");
      return;
    }
    console.log("Extracted model ID:", modelId);
    
    // Define the API endpoint
    const endpoint = 'https://run8n.xyz/webhook-test/getGLTF';
    console.log("Fetching models from endpoint:", endpoint);
    
    // Create an AbortController with a timeout
    const controller = new AbortController();
    const timeoutMs = 15000;
    const timeoutID = setTimeout(() => {
      console.error(`Fetch request timed out after ${timeoutMs}ms`);
      controller.abort();
      showError("Request timed out. Please check your connection and try again.");
    }, timeoutMs);
    
    // Show loading indicator
    loadingIndicator.style.display = 'flex';
    
    // Fetch models from API
    fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ id: modelId }),
      signal: controller.signal
    })
    .then(response => {
      clearTimeout(timeoutID);
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
      
      // Create Blob URLs from the parsed glTF JSON objects
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
      
      // Load the first model
      console.log("Setting initial model URL:", modelUrls[0]);
      modelViewer.src = modelUrls[0];
      
      // Set up manual model cycling controls
      setupModelControls();
      
      // Hide loading indicator
      loadingIndicator.style.display = 'none';
      
      console.log(`Successfully loaded ${modelUrls.length} models`);
    })
    .catch(error => {
      if (error.name === 'AbortError') {
        console.error("Fetch request aborted due to timeout.");
        showError("Request timed out. Please check your connection and try again.");
      } else {
        console.error("Error fetching models:", error);
        showError(`Failed to load models: ${error.message}`);
      }
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
        modelViewer.src = modelUrls[currentModelIndex];
        console.log(`Switched to model ${currentModelIndex + 1} of ${modelUrls.length}`);
      });
      
      prevButton.addEventListener('click', () => {
        currentModelIndex = (currentModelIndex - 1 + modelUrls.length) % modelUrls.length;
        modelViewer.src = modelUrls[currentModelIndex];
        console.log(`Switched to model ${currentModelIndex + 1} of ${modelUrls.length}`);
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
      // Ensure the camera settings focus on your giant cube
      modelViewer.setAttribute('camera-orbit', '0deg 70deg 4.5m');
      modelViewer.setAttribute('camera-target', '0m 1m 0m');
      modelViewer.setAttribute('scale', '0.1 0.1 0.1');
    });
    
    modelViewer.addEventListener('error', (event) => {
      console.error("Error loading model:", event);
      showError("Error displaying 3D model. The model may be incompatible or corrupted.");
    });
  });