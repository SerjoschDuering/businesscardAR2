// modelManager.js

import { fetchUSDZConversion } from './dataFetcher.js';
import { updateKPI } from './kpiHelpers.js';

// Simple cache for USDZ conversion results
const usdzCache = {};

// Helper to check if device is iOS
export function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
}

/**
 * Load a specific model by index into the <model-viewer>.
 * - Sets the src.
 * - Throws an error if no KPI data.
 * - Updates KPI in the DOM.
 * - Handles iOS USDZ conversion if needed.
 */
export function loadModel(index, modelsData, modelViewer, userInteractedRef) {
  // Set flag so that auto camera events are ignored during model load.
  userInteractedRef.isLoading = true;
  
  const modelData = modelsData[index];
  console.log("Loading model at index", index, "URL:", modelData.url);
  
  modelViewer.src = modelData.url;

  // Crash the app if no KPI data is provided
  if (!modelData.kpi || !modelData.kpi.rows || modelData.kpi.rows.length === 0) {
    throw new Error("No KPI data found for model: " + modelData.name);
  }
  updateKPI(modelData.kpi);

  // If iOS, set or fetch a USDZ
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
  
  // Listen for model load success.
  // Using { once: true } to prevent duplicate listeners.
  modelViewer.addEventListener('load', () => {
    console.log("Model loaded successfully.");
    // Reapply stored camera settings if they exist.
    if (userInteractedRef.orbit && userInteractedRef.target && userInteractedRef.fov) {
      console.log("Reapplying stored camera settings:", {
        orbit: userInteractedRef.orbit,
        target: userInteractedRef.target,
        fov: userInteractedRef.fov
      });
      modelViewer.setAttribute('camera-orbit', userInteractedRef.orbit);
      modelViewer.setAttribute('camera-target', userInteractedRef.target);
      modelViewer.setAttribute('field-of-view', userInteractedRef.fov);
    } else {
      console.log("No stored camera settings; applying default camera settings.");
      modelViewer.setAttribute('camera-orbit', '0deg 50deg 0.25m');
      modelViewer.setAttribute('camera-target', '0m 0.01m 0m');
      modelViewer.setAttribute('field-of-view', '45deg');
    }
    // Clear the loading flag now that the model is loaded.
    userInteractedRef.isLoading = false;
  }, { once: true });
}

/**
 * Set up Next/Prev UI for multiple models.
 * This wires button clicks and calls your provided loadModel callback
 * after adjusting the current model index.
 */
export function setupModelControls(nextBtn, prevBtn, modelViewerControls) {
  // If there's only 1 model, hide the controls.
  if (modelViewerControls.modelUrls.length <= 1) {
    const ctrls = document.getElementById('model-controls');
    if (ctrls) ctrls.style.display = 'none';
    return;
  }

  // Next
  nextBtn.addEventListener('click', () => {
    modelViewerControls.currentModelIndex =
      (modelViewerControls.currentModelIndex + 1) % modelViewerControls.modelUrls.length;
    modelViewerControls.loadModelFn(modelViewerControls.currentModelIndex);
    console.log(
      `Switched to model ${modelViewerControls.currentModelIndex + 1} of ${modelViewerControls.modelUrls.length}`
    );
  });

  // Prev
  prevBtn.addEventListener('click', () => {
    modelViewerControls.currentModelIndex =
      (modelViewerControls.currentModelIndex - 1 + modelViewerControls.modelUrls.length) %
      modelViewerControls.modelUrls.length;
    modelViewerControls.loadModelFn(modelViewerControls.currentModelIndex);
    console.log(
      `Switched to model ${modelViewerControls.currentModelIndex + 1} of ${modelViewerControls.modelUrls.length}`
    );
  });
}