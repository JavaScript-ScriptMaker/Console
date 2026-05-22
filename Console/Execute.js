import { showNotification } from '../Popup.js';
import { loadLibraries } from '../Upload/LoadLibs.js';

/**
 * Parses and processes multi-line text input, executing each command sequentially line-by-line.
 * Respects quoted strings as single arguments.
 * @param {HTMLTextAreaElement} inputElement - The text area tracking the execution inputs.
 * @param {HTMLElement} consoleOutput - The DOM text container used to print syntax reports.
 */
export async function processCommand(inputElement, consoleOutput) {
  const commandRaw = inputElement.value;
  const lines = commandRaw.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  
  if (lines.length === 0) {
    consoleOutput.innerText = "Error: No commands found to execute.";
    showNotification("Execution Cancelled.");
    return;
  }

  inputElement.value = "";
  consoleOutput.innerText = "Processing batch execution...";
  const libraries = await loadLibraries();
  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // FIXED: Splittar på mellanslag MEN ignorerar mellanslag som är inuti citationstecken ("...")
    const tokens = line.match(/(?:[^\s"]+|"[^"]*")+/g);
    
    if (!tokens || tokens[0].toLowerCase() !== "inject" || tokens.length < 4) {
      consoleOutput.innerText += `\nLine ${i + 1} Error: Invalid syntax format.`;
      failCount++;
      continue;
    }

    const libName = tokens[1];
    const funcName = tokens[2];
    const tabId = tokens[3];
    const rawArgsArray = tokens.slice(4);
    const libraryData = libraries[libName];

    if (!libraryData) {
      consoleOutput.innerText += `\nLine ${i + 1} Error: Library "${libName}" not found.`;
      failCount++;
      continue;
    }

    const targetFunction = libraryData.Functions?.find(f => f.Name === funcName);
    if (!targetFunction) {
      consoleOutput.innerText += `\nLine ${i + 1} Error: Function "${funcName}" missing.`;
      failCount++;
      continue;
    }

    const expectedArgsConfig = targetFunction.Args || [];
    const parsedArgs = rawArgsArray.map((val, idx) => {
      const config = expectedArgsConfig[idx];
      
      // FIXED: Rensa bort de yttre citationstecknen om argumentet var en omsluten sträng
      if (val.startsWith('"') && val.endsWith('"')) {
        val = val.slice(1, -1);
      }

      if (!config) return val;
      if (config.Type?.toLowerCase() === "number") return Number(val);
      if (config.Type?.toLowerCase() === "boolean") return val === "true" || val === "1";
      return val;
    });

    const targetTabId = parseInt(tabId);
    
    try {
      await chrome.scripting.executeScript({
        target: { tabId: targetTabId },
        world: "MAIN",
        func: (prefix, code, argsSpec, values) => {
          try {
            console.log(`[Expandable Console] [${prefix}] Executing payload...`);
            const paramNames = argsSpec.map(a => a.Name);
            const execFn = new Function(...paramNames, code);
            execFn(...values);
          } catch (err) { console.error(`[Expandable Console] Runtime Error:`, err); }
        },
        args: ["Console", targetFunction.Payload, expectedArgsConfig, parsedArgs]
      });
      successCount++;
    } catch (err) {
      consoleOutput.innerText += `\nLine ${i + 1} Injection Failed: ${err.message}`;
      failCount++;
    }
  }

  consoleOutput.innerText = `Execution complete. Passed: ${successCount} | Failed: ${failCount}`;
  showNotification("Batch processed.");
}

/**
 * Robust Minecraft-like auto-complete engine targeting the cursor's active line.
 */
export async function handleAutocomplete(inputElement, suggestionsDiv) {
  const text = inputElement.value;
  const cursorPosition = inputElement.selectionStart;

  const textBeforeCursor = text.substring(0, cursorPosition);
  const lastNewlineIndex = textBeforeCursor.lastIndexOf('\n');
  const activeLineStartIndex = lastNewlineIndex === -1 ? 0 : lastNewlineIndex + 1;
  
  const currentLineText = textBeforeCursor.substring(activeLineStartIndex);
  
  // Plockar ut ord och respekterar citationstecken för tokens
  const wordsOnly = currentLineText.match(/(?:[^\s"]+|"[^"]*")+/g) || [];
  const endsWithSpace = currentLineText.endsWith(" ") || currentLineText.endsWith("\t");
  
  let currentTokenIndex = wordsOnly.length - 1;
  if (endsWithSpace) {
    currentTokenIndex = wordsOnly.length;
  }
  
  const currentToken = endsWithSpace ? "" : (wordsOnly[wordsOnly.length - 1] || "");

  const rect = inputElement.getBoundingClientRect();
  suggestionsDiv.style.left = `${rect.left}px`;
  suggestionsDiv.style.width = `${rect.width}px`;
  suggestionsDiv.style.bottom = `${window.innerHeight - rect.top + 4}px`;

  if (currentTokenIndex === 0) {
    renderSuggestions([{ text: "inject" }], currentToken, inputElement, suggestionsDiv, activeLineStartIndex, textBeforeCursor, text);
    return;
  }

  if (!wordsOnly[0] || wordsOnly[0].toLowerCase() !== "inject") {
    suggestionsDiv.style.display = "none";
    return;
  }

  const libraries = await loadLibraries();

  // Argument 1: Val av Library
  if (currentTokenIndex === 1) {
    const libChoices = Object.keys(libraries).map(name => ({ text: name }));
    renderSuggestions(libChoices, currentToken, inputElement, suggestionsDiv, activeLineStartIndex, textBeforeCursor, text);
  } 
  // Argument 2: Val av Funktion
  else if (currentTokenIndex === 2) {
    const activeLib = wordsOnly[1];
    const targetLib = libraries[activeLib];
    if (targetLib && targetLib.Functions) {
      const funcChoices = targetLib.Functions.map(f => ({ text: f.Name }));
      renderSuggestions(funcChoices, currentToken, inputElement, suggestionsDiv, activeLineStartIndex, textBeforeCursor, text);
    } else {
      suggestionsDiv.style.display = "none";
    }
  } 
  // Argument 3: Val av Tab ID
  else if (currentTokenIndex === 3) {
    const activeLib = wordsOnly[1];
    const activeFunc = wordsOnly[2];
    const targetLib = libraries[activeLib];
    const targetFunc = targetLib?.Functions?.find(f => f.Name === activeFunc);

    const activeTabs = await chrome.tabs.query({});
    let matchingTabs = activeTabs;

    if (targetFunc && targetFunc.Tabs && Array.isArray(targetFunc.Tabs)) {
      matchingTabs = activeTabs.filter(tab => {
        if (!tab.url) return false;
        return targetFunc.Tabs.some(keyword => tab.url.toLowerCase().includes(keyword.toLowerCase()));
      });
    }

    const tabChoices = matchingTabs.map(t => ({
      text: String(t.id),
      icon: t.favIconUrl && (t.favIconUrl.startsWith('http') || t.favIconUrl.startsWith('data:image')) ? t.favIconUrl : null
    }));

    renderSuggestions(tabChoices, currentToken, inputElement, suggestionsDiv, activeLineStartIndex, textBeforeCursor, text);
  } 
  // Argument 4+: Typhjälp för parametrar (args)
  else if (currentTokenIndex >= 4) {
    const activeLib = wordsOnly[1];
    const activeFunc = wordsOnly[2];
    const targetLib = libraries[activeLib];
    const targetFunc = targetLib?.Functions?.find(f => f.Name === activeFunc);
    
    if (targetFunc && targetFunc.Args) {
      const argIdx = currentTokenIndex - 4;
      const expectedArg = targetFunc.Args[argIdx];
      if (expectedArg) {
        renderSuggestions([{ text: `<${expectedArg.Name}:${expectedArg.Type}>` }], currentToken, inputElement, suggestionsDiv, activeLineStartIndex, textBeforeCursor, text, true);
      } else {
        suggestionsDiv.style.display = "none";
      }
    } else {
      suggestionsDiv.style.display = "none";
    }
  }
}

function renderSuggestions(choices, currentToken, inputElement, suggestionsDiv, activeLineStartIndex, textBeforeCursor, fullText, isHelper = false) {
  const matches = choices.filter(c => c.text.toLowerCase().includes(currentToken.toLowerCase()));
  if (matches.length === 0) {
    suggestionsDiv.style.display = "none";
    return;
  }

  suggestionsDiv.innerHTML = "";
  suggestionsDiv.style.display = "block";

  matches.forEach((match, index) => {
    const item = document.createElement("div");
    item.className = "Suggestion_Item";
    item.style.display = "flex";
    item.style.alignItems = "center";
    item.style.gap = "8px";
    
    if (index === 0) item.classList.add("selected");

    let iconHTML = "";
    if (match.icon) {
      iconHTML = `<img src="${match.icon}" style="width: 12px; height: 12px; border-radius: 2px; flex-shrink: 0;" alt="" />`;
    } else if (match.text.match(/^\d+$/)) {
      iconHTML = `<span style="font-size: 11px; line-height: 1; flex-shrink: 0; width: 12px; text-align: center;">🌐</span>`;
    }

    const safeText = match.text.replace(/</g, "&lt;").replace(/>/g, "&gt;");
    item.innerHTML = `${iconHTML}<span>${safeText}</span>`;

    if (!isHelper) {
      item.addEventListener("click", () => {
        const trailingText = fullText.substring(inputElement.selectionStart);
        const currentLineText = textBeforeCursor.substring(activeLineStartIndex);
        
        const words = currentLineText.match(/(?:[^\s"]+|"[^"]*")+/g) || [];
        const endsWithSpace = currentLineText.endsWith(" ");
        
        if (endsWithSpace || words.length === 0) {
          words.push(match.text);
        } else {
          words[words.length - 1] = match.text;
        }
        
        const updatedLineText = words.join(" ") + " ";
        const leadText = fullText.substring(0, activeLineStartIndex) + updatedLineText;
        
        inputElement.value = leadText + trailingText;
        inputElement.selectionStart = inputElement.selectionEnd = leadText.length;
        
        suggestionsDiv.style.display = "none";
        inputElement.focus();
        
        const event = new Event('input', { bubbles: true });
        inputElement.dispatchEvent(event);
      });
    }
    suggestionsDiv.appendChild(item);
  });
}
