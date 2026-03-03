function collectHints() {
  const headings = Array.from(document.querySelectorAll("h1, h2, h3"))
    .map((node) => node.textContent || "")
    .map((text) => text.trim())
    .filter(Boolean)
    .slice(0, 5);

  const buttons = Array.from(document.querySelectorAll("button, [role='button'], input[type='submit']"))
    .map((node) => {
      const text = node.textContent || node.value || "";
      return String(text).trim();
    })
    .filter(Boolean)
    .slice(0, 8);

  return {
    pageTitle: document.title || "",
    headingHints: headings,
    buttonHints: buttons
  };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.type !== "kindlyclick:get-content-hints") {
    return;
  }

  sendResponse(collectHints());
});
