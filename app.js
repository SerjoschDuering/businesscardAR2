// app.js

import { fetchGLTFData } from './dataFetcher.js';
import { loadModel, setupModelControls, isIOS } from './modelManager.js';

document.addEventListener('DOMContentLoaded', () => {
  // --- 1. Grab DOM Elements ---
  const modelViewer = document.getElementById('modelViewer');
  const loadingIndicator = document.getElementById('loading-indicator');
  const loadingText = document.getElementById('loading-text');  // Might remain unused
  const errorMessage = document.getElementById('error-message');
  const nextButton = document.getElementById('nextModel');
  const prevButton = document.getElementById('prevModel');
  const autoPlayButton = document.getElementById('toggleAutoPlay');
  const customARButton = document.getElementById('customARButton');
  const exposureControl = document.getElementById('exposureControl');
  const shadowControl = document.getElementById('shadowControl');

  // --- 2. Variables for model management and auto-play ---
  let modelUrls = [];
  let modelsData = [];
  let currentModelIndex = 0;
  let autoPlayActive = false;
  let autoPlayInterval = null;
  const autoPlayDelay = 750; // ms

  // Shared object to hold user camera settings and flags.
  const userInteractedRef = { 
    value: false,
    isLoading: false,  // This flag prevents capturing during model load
    orbit: null,
    target: null,
    fov: null,
    timeoutId: null
  };

  // Helper function to display error messages
  function showError(message) {
    errorMessage.textContent = message;
    errorMessage.style.display = 'block';
    loadingIndicator.style.display = 'none';
  }

  // -----------------------------
  // 3. User Camera Interaction Tracking
  // -----------------------------

  // 3.1) Helper to check if user only rotated vs. zoom/pan
  function isPureRotation(oldOrbit, newOrbit, oldTarget, newTarget) {
    if (!oldOrbit || !newOrbit || !oldTarget || !newTarget) return false;

    // If radius is the same, no zoom
    const sameRadius = Math.abs(oldOrbit.radius - newOrbit.radius) < 0.0001;

    // If target is the same, no pan
    const sameTarget = (
      Math.abs(oldTarget.x - newTarget.x) < 0.0001 &&
      Math.abs(oldTarget.y - newTarget.y) < 0.0001 &&
      Math.abs(oldTarget.z - newTarget.z) < 0.0001
    );

    return (sameRadius && sameTarget);
  }

  // 3.2) Listen for camera changes
  modelViewer.addEventListener('camera-change', (event) => {
    // Ignore if model is still loading
    if (userInteractedRef.isLoading) {
      console.log("Ignoring camera-change event during model load.");
      return;
    }

    // Capture old orbit/target
    const oldOrbit = userInteractedRef.orbit;
    const oldTarget = userInteractedRef.target;

    // Capture new orbit/target/fov
    const newOrbit = modelViewer.getCameraOrbit();
    const newTarget = modelViewer.getCameraTarget();
    const newFov = modelViewer.getFieldOfView();

    // Store them
    userInteractedRef.orbit = newOrbit;
    userInteractedRef.target = newTarget;
    userInteractedRef.fov = newFov;

    userInteractedRef.value = true;
    clearTimeout(userInteractedRef.timeoutId);
    userInteractedRef.timeoutId = setTimeout(() => {
      userInteractedRef.value = false;
      console.log("User interaction flag reset after timeout.");
    }, 5000);

    console.log("Camera changed. Stored settings:", {
      orbit: userInteractedRef.orbit,
      target: userInteractedRef.target,
      fov: userInteractedRef.fov
    });

    // Only proceed if it's actual user interaction (not programmatic)
    if (!event.detail || event.detail.source !== 'user-interaction') return;

    // Determine if user only rotated or also zoomed/panned
    if (isPureRotation(oldOrbit, newOrbit, oldTarget, newTarget)) {
      // It's just rotation => keep autoPlay
      console.log('User only rotated the camera. Keeping autoPlay active.');
    } else {
      // The user zoomed or panned => stop autoPlay
      if (autoPlayActive) {
        autoPlayActive = false;
        autoPlayButton.classList.add('inactive');
        autoPlayButton.classList.remove('active');
        clearInterval(autoPlayInterval);
        autoPlayInterval = null;
        console.log('User zoomed/panned. Stopping autoPlay slideshow.');
      }
    }
  });

  // -----------------------------
  // 4. Fetch model data
  // -----------------------------
  const params = new URLSearchParams(window.location.search);
  const modelId = params.get('id') || '0';

  console.log("Extracted model ID:", modelId);
  loadingIndicator.style.display = 'flex';

  fetchGLTFData(modelId)
    .then(response => {
      console.log("HTTP response status:", response.status);
      return response.json();
    })
    .then(data => {
      console.log("Raw webhook response data:", data);

      // NEW: Use the new response structure.
      // n8n now returns an array with one object.
      // Each key is a filename and its value is a JSON string with model info.
      let parsedModels = [];
      if (data && Array.isArray(data) && data.length > 0) {
        const modelsObject = data[0];
        Object.keys(modelsObject).forEach(key => {
          try {
            const modelData = JSON.parse(modelsObject[key]);
            console.log(`Parsed model for key "${key}":`, modelData);
            parsedModels.push({
              name: modelData.name,
              url: modelData.fileUrl, // Use the Azure Blob URL directly
              kpi: modelData.kpi,
              active_variant: modelData.active_variant
            });
          } catch (error) {
            console.error(`Error parsing JSON for model key "${key}":`, error);
          }
        });
      } else {
        console.error("Invalid response format from n8n");
        showError("No valid model data found.");
        return;
      }

      if (parsedModels.length === 0) {
        console.error("No valid models parsed.");
        showError("Failed to prepare models for display.");
        return;
      }

      // Update our modelsData and modelUrls arrays based on the new structure.
      modelsData = parsedModels;
      modelUrls = modelsData.map(item => item.url);

      // --- 5. Load the first model ---
      loadModel(0, modelsData, modelViewer, userInteractedRef);

      // Hide loading indicator
      loadingIndicator.style.display = 'none';
      console.log(`Successfully loaded ${modelUrls.length} models`);

      // --- 6. Set up model controls (next/prev) ---
      setupModelControls(nextButton, prevButton, {
        modelUrls: modelUrls,
        currentModelIndex,
        loadModelFn: (newIndex) => {
          currentModelIndex = newIndex;
          loadModel(currentModelIndex, modelsData, modelViewer, userInteractedRef);
        }
      });

      // --- 7. Start auto play if multiple models ---
      if (modelUrls.length > 1) {
        autoPlayActive = true;
        autoPlayButton.classList.add('active');
        autoPlayInterval = setInterval(() => {
          currentModelIndex = (currentModelIndex + 1) % modelUrls.length;
          loadModel(currentModelIndex, modelsData, modelViewer, userInteractedRef);
          console.log(`Auto Play switched to model ${currentModelIndex + 1} of ${modelUrls.length}`);
        }, autoPlayDelay);
      }
    })
    .catch(error => {
      console.error("Error fetching models:", error);
      showError(`Failed to load models: ${error.message}`);
      loadingIndicator.style.display = 'none';
    });

  // -----------------------------
  // 8. Set up Auto Play Toggling
  // -----------------------------
  if (autoPlayButton) {
    autoPlayButton.addEventListener('click', () => {
      if (modelUrls.length <= 1) {
        console.warn("Auto play is disabled because there is only one model.");
        return;
      }
      autoPlayActive = !autoPlayActive;
      if (autoPlayActive) {
        autoPlayButton.classList.add('active');
        autoPlayButton.classList.remove('inactive');
        autoPlayInterval = setInterval(() => {
          currentModelIndex = (currentModelIndex + 1) % modelUrls.length;
          loadModel(currentModelIndex, modelsData, modelViewer, userInteractedRef);
          console.log(`Auto Play switched to model ${currentModelIndex + 1} of ${modelUrls.length}`);
        }, autoPlayDelay);
      } else {
        autoPlayButton.classList.add('inactive');
        autoPlayButton.classList.remove('active');
        clearInterval(autoPlayInterval);
        autoPlayInterval = null;
      }
    });
  }

  // -----------------------------
  // 9. Custom AR Button
  // -----------------------------
  if (customARButton) {
    customARButton.addEventListener('click', () => {
      modelViewer.activateAR();
    });
  }

  // --- 10. AR Session events (optional logging) ---
  modelViewer.addEventListener('ar-status', (event) => {
    console.log(`AR Status: ${event.detail.status}`);
  });

  // --- 11. Model error event ---
  modelViewer.addEventListener('error', (event) => {
    console.error("Error loading model:", event);
    showError("Error displaying 3D model. The model may be incompatible or corrupted.");
  });

  // --- 12. Lighting Controls ---
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