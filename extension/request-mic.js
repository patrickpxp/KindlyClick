function getRequestedDeviceId() {
  try {
    const url = new URL(window.location.href);
    return url.searchParams.get("deviceId") || "";
  } catch (_error) {
    return "";
  }
}

function setStatus(text) {
  const el = document.getElementById("status");
  if (el) {
    el.textContent = `Status: ${text}`;
  }
}

function stopTracks(stream) {
  if (!stream) {
    return;
  }

  stream.getTracks().forEach((track) => track.stop());
}

async function requestPermission(deviceId) {
  const exactConstraints = deviceId
    ? {
        audio: {
          deviceId: { exact: deviceId }
        }
      }
    : { audio: true };

  try {
    return {
      stream: await navigator.mediaDevices.getUserMedia(exactConstraints),
      usedFallbackDevice: false
    };
  } catch (error) {
    // Fall back to default input when the selected device is unavailable.
    if (
      deviceId &&
      (error.name === "NotFoundError" || error.name === "OverconstrainedError")
    ) {
      return {
        stream: await navigator.mediaDevices.getUserMedia({ audio: true }),
        usedFallbackDevice: true
      };
    }

    throw error;
  }
}

async function notifyMicPermissionGranted({ usedFallbackDevice = false } = {}) {
  if (!globalThis.chrome || !chrome.runtime || !chrome.runtime.sendMessage) {
    return;
  }

  try {
    await chrome.runtime.sendMessage({
      type: "kindlyclick:mic-permission-granted",
      usedFallbackDevice: Boolean(usedFallbackDevice)
    });
  } catch (_error) {
    // Ignore messaging failures.
  }
}

async function closeCurrentTab() {
  if (!globalThis.chrome || !chrome.tabs || !chrome.tabs.getCurrent || !chrome.tabs.remove) {
    window.close();
    return;
  }

  chrome.tabs.getCurrent((tab) => {
    if (chrome.runtime.lastError || !tab || typeof tab.id !== "number") {
      window.close();
      return;
    }

    chrome.tabs.remove(tab.id);
  });
}

async function bootstrap() {
  const allowBtn = document.getElementById("allowBtn");
  const closeBtn = document.getElementById("closeBtn");
  const requestedDeviceId = getRequestedDeviceId();

  if (!allowBtn || !closeBtn) {
    return;
  }

  allowBtn.addEventListener("click", async () => {
    allowBtn.disabled = true;
    setStatus("requesting microphone permission");

    try {
      const permissionResult = await requestPermission(requestedDeviceId);
      stopTracks(permissionResult.stream);
      await notifyMicPermissionGranted({
        usedFallbackDevice: permissionResult.usedFallbackDevice
      });
      setStatus("microphone allowed. Side panel should retry automatically.");
    } catch (error) {
      setStatus(`${error.name || "Error"}: ${error.message || "unable to request microphone"}`);
    } finally {
      allowBtn.disabled = false;
    }
  });

  closeBtn.addEventListener("click", () => {
    closeCurrentTab().catch(() => {});
  });
}

bootstrap();
