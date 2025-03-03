// dataFetcher.js

// Helper to perform a fetch call on a given endpoint with a timeout
export async function tryFetchEndpoint(endpoint, modelId, timeoutMs) {
    const controller = new AbortController();
    const timeoutID = setTimeout(() => {
      console.error(`Fetch request to ${endpoint} timed out after ${timeoutMs}ms`);
      controller.abort();
    }, timeoutMs);
  
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ id: modelId }),
        signal: controller.signal
      });
      clearTimeout(timeoutID);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return response;
    } catch (error) {
      clearTimeout(timeoutID);
      throw error;
    }
  }
  
  // Function to fetch GLTF data with a fallback mechanism
  export async function fetchGLTFData(modelId, timeoutMs = 60000) {
    const primaryEndpoint = 'https://run8n.xyz/webhook-test/getGLTF';
    const fallbackEndpoint = 'https://run8n.xyz/webhook/getGLTF';
    try {
      return await tryFetchEndpoint(primaryEndpoint, modelId, timeoutMs);
    } catch (error) {
      console.error(`Primary endpoint failed: ${error}. Trying fallback endpoint...`);
      return tryFetchEndpoint(fallbackEndpoint, modelId, timeoutMs);
    }
  }
  
  // Function to fetch USDZ conversion using a live conversion API
  export async function fetchUSDZConversion(gltfUrl) {
    const conversionApi = "https://your-usdz-api.com/convert?url=" + encodeURIComponent(gltfUrl);
    const response = await fetch(conversionApi);
    if (!response.ok) {
      throw new Error("Conversion API request failed");
    }
    const data = await response.json();
    if (data.usdzUrl) {
      return data.usdzUrl;
    }
    throw new Error("USDZ URL not found in conversion API response");
  }
  