// Helper to toggle forms
function toggleForms(showLogin) {
  document.getElementById("loginForm").style.display = showLogin ? "block" : "none";
  document.getElementById("registerForm").style.display = showLogin ? "none" : "block";

  document.getElementById("loginTab").classList.toggle("active", showLogin);
  document.getElementById("registerTab").classList.toggle("active", !showLogin);
}

// Switch to Login tab
document.getElementById("loginTab").addEventListener("click", () => {
  toggleForms(true);
});

// Switch to Register tab
document.getElementById("registerTab").addEventListener("click", () => {
  toggleForms(false);
});

// Handle Login
document.getElementById("loginButton").addEventListener("click", () => {
  const email = document.getElementById("loginEmail").value;
  const password = document.getElementById("loginPassword").value;

  if (!email || !password) {
    alert("Please fill in both fields.");
    return;
  }

  const apiUrl = "https://cloud.astian.org/auth/login"; // Cambia por tu endpoint de login

  fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ email, password })
  })
    .then(async (response) => {
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Login failed");
      }
      return response.json();
    })
    .then((data) => {
      if (data.token) {
        chrome.storage.local.set({ token: data.token }, () => {
          alert("Login successful!");
        });
      } else {
        alert("Login failed: Token not received.");
      }
    })
    .catch((error) => {
      console.error("Error during login:", error.message);
      alert(`Error: ${error.message}`);
    });
});

// Handle Register
document.getElementById("registerButton").addEventListener("click", () => {
  const email = document.getElementById("registerEmail").value;
  const password = document.getElementById("registerPassword").value;

  if (!email || !password) {
    alert("Please fill in both fields.");
    return;
  }

  const apiUrl = "https://cloud.astian.org/auth/register"; // Cambia por tu endpoint de registro

  fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ email, password })
  })
    .then(response => response.json())
    .then(data => {
      if (data.success) {
        alert("Registration successful! You can now log in.");
      } else {
        alert(`Registration failed: ${data.message || "Unknown error"}`);
      }
    })
    .catch(error => console.error("Error:", error));
});