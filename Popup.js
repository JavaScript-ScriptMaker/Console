import { handleFileUpload } from './Upload/Upload.js';
import { renderDynamicTabs, displaySavedLibraries, refreshTabsList } from './Upload/LoadLibs.js';
import { processCommand, handleAutocomplete } from './Console/Execute.js';

let lastNotificationMessage = "";
let notificationCount = 1;
let stackWindowActive = false;
let stackWindowTimeout = null;

document.addEventListener('DOMContentLoaded', async () => {
  setupTabs();
  initCSPBypass(); // Disable security headers to allow dynamic execution loops
  showNotification("System Initialized.");
  initLibraryTab();
  await refreshTabsList();
  setupConsole();
  await renderDynamicTabs();
});

function setupTabs() {
  document.getElementById('Tabs').addEventListener('click', (e) => {
    const btn = e.target.closest('.Btn_Tab');
    if (!btn) return;
    document.querySelectorAll('.Btn_Tab').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.Tab').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    const tabId = btn.getAttribute('data-tab');
    document.getElementById(tabId)?.classList.add('active');
  });
}

function initCSPBypass() {
  if (chrome.declarativeNetRequest) {
    chrome.declarativeNetRequest.updateSessionRules({
      removeRuleIds: [9999],
      addRules: [{
        id: 9999,
        priority: 1,
        action: {
          type: "modifyHeaders",
          responseHeaders: [{ header: "content-security-policy", operation: "remove" }]
        },
        condition: { urlFilter: "*", resourceTypes: ["main_frame", "sub_frame"] }
      }]
    });
  }
}

export function showNotification(message) {
  const textField = document.getElementById('Notification_Text');
  const timeField = document.getElementById('Notification_Time');
  if (!textField || !timeField) return;

  if (message === lastNotificationMessage && stackWindowActive) {
    notificationCount++;
    textField.innerText = `${message} x${notificationCount}`;
    return;
  }

  if (stackWindowTimeout) clearTimeout(stackWindowTimeout);
  notificationCount = 1;
  textField.innerText = message;
  lastNotificationMessage = message;
  stackWindowActive = true;

  const now = new Date();
  timeField.innerText = `[${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}]`;
  stackWindowTimeout = setTimeout(() => { stackWindowActive = false; }, 1000);
}

function initLibraryTab() {
  const uploadBtn = document.getElementById('upload-btn');
  const fileInput = document.getElementById('json-file-input');
  const searchInput = document.getElementById('lib-search-input');
  const fileLabelText = document.getElementById('file-label-text');

  if (fileInput && fileLabelText) {
    fileInput.addEventListener('change', () => {
      if (fileInput.files.length > 0) {
        // FIXED: Explicitly target index 0 to grab the file name string
        fileLabelText.innerText = fileInput.files[0].name;
        fileLabelText.style.color = "#ffffff";
      }
    });
  }

  if (uploadBtn && fileInput) {
    uploadBtn.addEventListener('click', () => {
      if (fileInput.files.length > 0) {
        handleFileUpload(fileInput.files, () => {
          fileLabelText.innerText = "No file chosen";
          fileLabelText.style.color = "#b38690";
        });
      } else { showNotification("Error: No file selected."); }
    });
  }

  if (searchInput) {
    searchInput.addEventListener('input', () => displaySavedLibraries(searchInput.value.trim()));
  }
  displaySavedLibraries();
}

function setupConsole() {
  const executeBtn = document.getElementById('execute-btn');
  const consoleInput = document.getElementById('console-input');
  const clearBtn = document.getElementById('console-clear-btn');
  const suggestionsDiv = document.getElementById('autocomplete-suggestions');

  if (executeBtn && consoleInput && suggestionsDiv) {
    executeBtn.addEventListener('click', () => processCommand(consoleInput, document.getElementById('console-output')));
    consoleInput.addEventListener('input', () => handleAutocomplete(consoleInput, suggestionsDiv));
    
    consoleInput.addEventListener('keydown', (e) => {
      if (e.key === 'Tab' && suggestionsDiv.style.display === 'block') {
        e.preventDefault();
        const topSuggestion = suggestionsDiv.querySelector('.Suggestion_Item');
        if (topSuggestion && !topSuggestion.innerText.startsWith('<')) {
          topSuggestion.click();
        }
      }
    });
  }

  if (clearBtn && consoleInput) {
    clearBtn.addEventListener('click', () => {
      consoleInput.value = "";
      if (suggestionsDiv) suggestionsDiv.style.display = "none";
      consoleInput.focus();
    });
  }
}
