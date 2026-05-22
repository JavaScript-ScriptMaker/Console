import { showNotification } from '../Popup.js';

export function loadLibraries() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['Libs'], (result) => {
      resolve(result.Libs || {});
    });
  });
}

export function accessSettings(newSettings = null) {
  return new Promise((resolve) => {
    chrome.storage.local.get(['Settings'], (result) => {
      let currentSettings = result.Settings || {};
      if (newSettings) {
        currentSettings = { ...currentSettings, ...newSettings };
        chrome.storage.local.set({ Settings: currentSettings }, () => resolve(currentSettings));
      } else {
        resolve(currentSettings);
      }
    });
  });
}

export async function renderDynamicTabs() {
  const libs = await loadLibraries();
  const tabsContainer = document.getElementById('Dynamic_Tabs_Container');
  const windowsContainer = document.getElementById('Dynamic_Windows_Container');
  if (!tabsContainer || !windowsContainer) return;

  tabsContainer.innerHTML = '';
  windowsContainer.innerHTML = '';
  document.querySelectorAll('.Dynamic-Injected-CSS').forEach(el => el.remove());

  for (const libKey in libs) {
    const libData = libs[libKey];
    if (libData.Tab && Array.isArray(libData.Tab)) {
      libData.Tab.forEach(customTab => {
        const uniqueTabId = `Dynamic-Tab-${libKey}-${customTab.Name}`;

        const newButton = document.createElement('button');
        newButton.className = 'Btn_Tab';
        newButton.setAttribute('data-tab', uniqueTabId);
        newButton.innerText = customTab.Name;
        tabsContainer.appendChild(newButton);

        const newTabWindow = document.createElement('div');
        newTabWindow.id = uniqueTabId;
        newTabWindow.className = 'Tab';

        let htmlContents = `<h3 style="color:#ffffff; font-size:13px; margin-bottom:12px;">Library: ${libData.Name || libKey}</h3>`;
        
        if (customTab.Contents && Array.isArray(customTab.Contents)) {
          customTab.Contents.forEach(content => {
            if (content.Names && Array.isArray(content.Names)) {
              content.Names.forEach(author => {
                htmlContents += `
                  <div style="display:flex; justify-content:space-between; font-size:11px; margin-bottom:8px; border-bottom:1px solid #2d161c; padding-bottom:6px;">
                    <span style="color:#b38690;">Creator:</span>
                    <a href="${author.Link || '#'}" target="_blank" style="color:#ffffff; font-weight:bold; text-decoration:none; border-bottom:1px dashed #d1b2ba;">${author.Name || '@unknown'}</a>
                  </div>
                `;
              });
            }
            if (content.Download) {
              htmlContents += `
                <div style="margin-top:16px;">
                  <a href="${content.Download}" target="_blank" class="Action_Btn" style="display:block; text-align:center; text-decoration:none; padding:8px; line-height:1.2;">
                    📥 Download Updates
                  </a>
                </div>
              `;
            }
          });
        }
        
        newTabWindow.innerHTML = `<div class="Tab-Content">${htmlContents}</div>`;
        windowsContainer.appendChild(newTabWindow);
      });
    }
  }
}

export async function displaySavedLibraries(filterQuery = "") {
  const libs = await loadLibraries();
  const listDiv = document.getElementById('library-list');
  if (!listDiv) return;
  listDiv.innerHTML = '';
  const lowercaseQuery = filterQuery.toLowerCase();
  
  if (Object.keys(libs).length === 0) {
    listDiv.innerHTML = `<div style="text-align:center; padding: 20px; color:#b38690; font-style:italic;">No libraries yet.</div>`;
    return;
  }

  for (const name in libs) {
    if (lowercaseQuery && !name.toLowerCase().includes(lowercaseQuery)) continue;
    
    const libRow = document.createElement('div');
    libRow.className = 'Lib_Row';
    libRow.innerHTML = `
      <span>📄 ${name}</span>
      <button class="Action_Btn delete-btn" style="width: auto; padding: 4px 8px; margin: 0; background: transparent; border-color: #3d1b22; color: #b38690;">🗑️</button>
    `;
    
    libRow.querySelector('.delete-btn').addEventListener('click', () => {
      showCustomDeleteModal(name, filterQuery);
    });
    listDiv.appendChild(libRow);
  }
}

function showCustomDeleteModal(libraryName, filterQuery) {
  if (document.activeElement) document.activeElement.blur();
  if (document.getElementById('custom-delete-overlay')) return;

  const overlay = document.createElement('div');
  overlay.id = 'custom-delete-overlay';
  overlay.style.position = 'fixed';
  overlay.style.top = '0';
  overlay.style.left = '0';
  overlay.style.width = '100vw';
  overlay.style.height = '100vh';
  overlay.style.backgroundColor = 'rgba(12, 7, 8, 0.8)';
  overlay.style.zIndex = '999999';
  overlay.style.display = 'flex';
  overlay.style.alignItems = 'center';
  overlay.style.justifyContent = 'center';
  overlay.style.padding = '20px';

  const modalBox = document.createElement('div');
  modalBox.style.backgroundColor = '#120a0d';
  modalBox.style.border = '1px solid #3d1b22';
  modalBox.style.borderRadius = '8px';
  modalBox.style.padding = '15px';
  modalBox.style.width = '100%';
  modalBox.style.maxWidth = '280px';
  modalBox.style.textAlign = 'center';
  modalBox.style.boxShadow = '0 4px 16px rgba(0,0,0,0.8)';

  modalBox.innerHTML = `
    <div style="font-size: 12px; font-weight: bold; color: #ffffff; margin-bottom: 6px;">Delete Library</div>
    <div style="font-size: 11px; color: #b38690; margin-bottom: 15px; word-break: break-all;">Are you sure you want to delete "${libraryName}"?</div>
    <div style="display: flex; gap: 8px;">
      <button id="modal-cancel" class="Action_Btn" style="flex: 1; padding: 6px; border-color: #3d1b22;">Cancel</button>
      <button id="modal-confirm" class="Action_Btn" style="flex: 1; padding: 6px; border-color: #d1b2ba; color: #ffffff; background-color: #1f1115;">Delete</button>
    </div>
  `;

  overlay.appendChild(modalBox);
  document.body.appendChild(overlay);

  const cleanUpModal = () => {
    document.removeEventListener('keydown', handleModalKeys);
    overlay.remove();
  };

  const executeDeletion = () => {
    confirmBtn.disabled = true;
    confirmBtn.style.opacity = '0.5';
    chrome.storage.local.get(['Libs'], (result) => {
      const updatedLibs = result.Libs || {};
      delete updatedLibs[libraryName];
      chrome.storage.local.set({ Libs: updatedLibs }, async () => {
        showNotification(`Deleted library: ${libraryName}`);
        cleanUpModal();
        displaySavedLibraries(filterQuery);
        refreshTabsList();
        await renderDynamicTabs();
      });
    });
  };

  const handleModalKeys = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); executeDeletion(); }
    else if (e.key === 'Escape') { e.preventDefault(); cleanUpModal(); }
  };

  document.addEventListener('keydown', handleModalKeys);
  overlay.querySelector('#modal-cancel').addEventListener('click', cleanUpModal);
  const confirmBtn = overlay.querySelector('#modal-confirm');
  confirmBtn.addEventListener('click', executeDeletion);
}

export async function refreshTabsList() {
  const tabsContainer = document.getElementById('chrome-tabs-list');
  if (!tabsContainer) return;
  tabsContainer.innerHTML = '';
  
  const activeTabs = await chrome.tabs.query({});
  const libraries = await loadLibraries();

  const usefulKeywords = [];
  for (const libName in libraries) {
    if (libraries[libName].Functions) {
      libraries[libName].Functions.forEach(fn => {
        if (fn.Tabs && Array.isArray(fn.Tabs)) usefulKeywords.push(...fn.Tabs);
      });
    }
  }

  activeTabs.forEach(tab => {
    if (!tab.url) return;
    const isUseful = usefulKeywords.some(kw => tab.url.toLowerCase().includes(kw.toLowerCase()));
    const row = document.createElement('div');
    row.className = 'Item_Row';
    
    const isExternalIcon = tab.favIconUrl && (tab.favIconUrl.startsWith('http') || tab.favIconUrl.startsWith('data:image'));
    const iconElement = isExternalIcon 
      ? `<img src="${tab.favIconUrl}" style="width: 14px; height: 14px; border-radius: 2px; flex-shrink: 0;" alt="" />`
      : `<span style="font-size: 12px; line-height: 1; flex-shrink: 0; width: 14px; text-align: center;">🌐</span>`;

    row.innerHTML = `
      <div style="max-width: 70%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: flex; align-items: center; gap: 8px;">
        ${iconElement}
        <span>${tab.title}</span>
        ${isUseful ? '<span class="Useful"> (Useful)</span>' : ''}
      </div>
      <button class="Action_Btn copy-btn" style="width: auto; padding: 2px 6px; margin:0;">Copy</button>
    `;
    
    row.querySelector('.copy-btn').addEventListener('click', () => {
      navigator.clipboard.writeText(tab.id);
      showNotification(`Copied Tab ID: ${tab.id}`);
    });
    tabsContainer.appendChild(row);
  });
}
