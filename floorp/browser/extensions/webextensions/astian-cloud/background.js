chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "apiRequest") {
      fetch(message.url, {
        method: message.method || "GET",
        headers: {
          "Authorization": `Bearer ${message.token}`,
          "Content-Type": "application/json"
        },
        body: message.body ? JSON.stringify(message.body) : null
      })
        .then(response => response.json())
        .then(data => sendResponse({ success: true, data }))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true; // Mantener el canal abierto para `sendResponse`
    }
  });