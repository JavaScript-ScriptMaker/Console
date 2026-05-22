import { showNotification } from '../Popup.js';
import { displaySavedLibraries, refreshTabsList, renderDynamicTabs } from './LoadLibs.js';

function validateSchema(data) {
  if (!data || typeof data !== "object") return false;
  if (typeof data.Name !== "string") return false;
  if (data.Tab && !Array.isArray(data.Tab)) return false;
  
  if (data.Functions && Array.isArray(data.Functions)) {
    for (const fn of data.Functions) {
      if (typeof fn.Name !== "string") return false;
      if (typeof fn.Payload !== "string") return false;
      if (fn.Tabs && !Array.isArray(fn.Tabs)) return false;
      if (fn.Args && !Array.isArray(fn.Args)) return false;
    }
  }
  return true;
}

export function handleFileUpload(fileList, callback) {
  const file = fileList[0]; 
  if (!file) {
    showNotification("Error: No file selected.");
    return;
  }

  const reader = new FileReader();
  reader.onload = function(event) {
    try {
      const base64Payload = event.target.result.trim();
      
      // Decodes Base64 array directly into text memory profiles
      const decryptedJsonStr = atob(base64Payload);
      const jsonData = JSON.parse(decryptedJsonStr);
      
      if (!validateSchema(jsonData)) {
        showNotification("Error: Invalid .ConsoleLib structure.");
        return;
      }

      const profileName = file.name.replace('.ConsoleLib', '');
      chrome.storage.local.get(['Libs'], (result) => {
        const currentLibs = result.Libs || {};
        currentLibs[profileName] = jsonData;
        
        chrome.storage.local.set({ Libs: currentLibs }, async () => {
          showNotification(`Library "${profileName}" saved.`);
          displaySavedLibraries();
          refreshTabsList();
          await renderDynamicTabs();
          if (callback) callback();
        });
      });
    } catch (e) {
      showNotification("Error: Failed to decode .ConsoleLib bundle.");
    }
  };
  reader.readAsText(file);
}
