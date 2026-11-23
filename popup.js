const countEl = document.getElementById("count");
const captureBtn = document.getElementById("capture");
const statusEl = document.getElementById("status");
const progressEl = document.getElementById("progress");
const progressFillEl = document.getElementById("progress-fill");
let captureInProgress = false;

function updateProgress(progress) {
  if (!captureInProgress) return;

  progressEl.hidden = false;
  progressEl.classList.toggle("indeterminate", progress.phase === "preparing" || progress.phase === "initializing");

  if (progress.phase === "preparing") {
    statusEl.textContent = "Preparing capture…";
    progressEl.removeAttribute("aria-valuenow");
    progressEl.removeAttribute("aria-valuetext");
  } else if (progress.phase === "initializing") {
    statusEl.textContent = "Preparing screenshot…";
    progressEl.removeAttribute("aria-valuenow");
    progressEl.removeAttribute("aria-valuetext");
  } else if (progress.phase === "capturing") {
    const percent = Math.floor((progress.completed / progress.total) * 90) + 5;
    statusEl.textContent = `Capturing viewport ${progress.completed} of ${progress.total} (${percent}%)…`;
    progressEl.setAttribute("aria-valuenow", percent);
    progressEl.setAttribute("aria-valuemax", "100");
    progressEl.setAttribute("aria-valuetext", `Viewport ${progress.completed} of ${progress.total}`);
    progressFillEl.style.width = `${percent}%`;
  } else if (progress.phase === "finishing") {
    statusEl.textContent = "Finishing screenshot…";
    progressEl.classList.remove("indeterminate");
    progressEl.setAttribute("aria-valuenow", "95");
    progressEl.setAttribute("aria-valuetext", "Finishing screenshot");
    progressFillEl.style.width = "95%";
  } else if (progress.phase === "downloading") {
    statusEl.textContent = "Preparing download…";
    progressEl.classList.remove("indeterminate");
    progressEl.setAttribute("aria-valuenow", "99");
    progressEl.setAttribute("aria-valuetext", "Preparing download");
    progressFillEl.style.width = "99%";
  }
}

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function sendToPage(message) {
  const tab = await activeTab();
  if (!tab?.id) throw new Error("No active tab found.");
  try {
    return await chrome.tabs.sendMessage(tab.id, message);
  } catch {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content.js"]
    });
    return await chrome.tabs.sendMessage(tab.id, message);
  }
}

async function refresh() {
  try {
    const result = await sendToPage({ type: "FES_STATUS" });
    const count = result?.count || 0;
    countEl.textContent = `${count} element${count === 1 ? "" : "s"} selected`;
    captureBtn.disabled = count === 0;
  } catch {
    countEl.textContent = "Open a regular webpage to begin";
    captureBtn.disabled = true;
  }
}

document.getElementById("select").addEventListener("click", async () => {
  try {
    await sendToPage({ type: "FES_START_SELECTION" });
    statusEl.textContent = "Selection mode enabled. Click elements on the page.";
    window.close();
  } catch (error) {
    statusEl.textContent = error.message;
  }
});

document.getElementById("clear").addEventListener("click", async () => {
  try {
    await sendToPage({ type: "FES_CLEAR" });
    await refresh();
    statusEl.textContent = "Selection cleared.";
  } catch (error) {
    statusEl.textContent = error.message;
  }
});

captureBtn.addEventListener("click", async () => {
  captureBtn.disabled = true;
  captureInProgress = true;
  progressFillEl.style.width = "0";
  progressEl.removeAttribute("aria-valuenow");
  updateProgress({ phase: "preparing" });
  try {
    const tab = await activeTab();
    const result = await chrome.runtime.sendMessage({
      type: "FES_CAPTURE",
      tabId: tab.id,
      windowId: tab.windowId
    });
    if (!result?.ok) throw new Error(result?.error || "Capture failed.");
    statusEl.textContent = "Screenshot downloaded.";
    progressEl.classList.remove("indeterminate");
    progressEl.setAttribute("aria-valuenow", "100");
    progressEl.setAttribute("aria-valuetext", "Screenshot downloaded");
    progressFillEl.style.width = "100%";
  } catch (error) {
    statusEl.textContent = error.message || "Capture failed.";
    progressEl.hidden = true;
  } finally {
    captureInProgress = false;
    await refresh();
  }
});

chrome.runtime.onMessage.addListener(message => {
  if (message.type === "FES_CAPTURE_PROGRESS") updateProgress(message);
});

refresh();
