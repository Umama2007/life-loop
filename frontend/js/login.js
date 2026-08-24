// API_BASE_URL is now defined in config.js

const form = document.getElementById("loginForm");
const loginButton = document.getElementById("loginButton");
const passwordInput = document.getElementById("password");
const togglePassword = document.getElementById("togglePassword");
const formMessage = document.getElementById("formMessage");
const nameField = document.getElementById("nameField");
const nameInput = document.getElementById("name");
const modeToggle = document.getElementById("modeToggle");
const modeHeading = document.getElementById("login-title");
const modeSubtext = document.getElementById("modeSubtext");

let mode = "signin"; // "signin" | "signup"

// If already signed in, skip the login page entirely.
(async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/auth/me`, { credentials: "include" });
    if (response.ok) window.location.replace("index.html");
  } catch {
    // Ignore — if the check fails, just show the login form.
  }
})();

function setMode(nextMode) {
  mode = nextMode;
  const isSignup = mode === "signup";

  nameField.hidden = !isSignup;
  nameInput.required = isSignup;
  passwordInput.autocomplete = isSignup ? "new-password" : "current-password";
  loginButton.textContent = isSignup ? "Create account" : "Sign in";
  modeHeading.textContent = isSignup ? "Create your LifeLoop account" : "Sign in to LifeLoop";
  modeSubtext.textContent = isSignup
    ? "Use your name, email, and a password with at least 6 characters."
    : "Sign in with the email and password you registered with.";
  modeToggle.textContent = isSignup
    ? "Already have an account? Sign in"
    : "New to LifeLoop? Create an account";
  clearErrors();
}

modeToggle.addEventListener("click", () => setMode(mode === "signin" ? "signup" : "signin"));

togglePassword.addEventListener("click", () => {
  const showing = passwordInput.type === "text";
  passwordInput.type = showing ? "password" : "text";
  togglePassword.textContent = showing ? "Show" : "Hide";
  togglePassword.setAttribute("aria-label", showing ? "Show password" : "Hide password");
});



function setError(id, message) {
  const el = document.getElementById(id);
  if (el) el.textContent = message;
}

function clearErrors() {
  setError("nameError", "");
  setError("emailError", "");
  setError("passwordError", "");
  formMessage.textContent = "";
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearErrors();

  const name = nameInput.value.trim();
  const email = document.getElementById("email").value.trim();
  const password = passwordInput.value;
  const rememberMe = document.getElementById("rememberMe").checked;
  let valid = true;

  if (mode === "signup" && name.length < 2) {
    setError("nameError", "Enter at least 2 characters for your name.");
    valid = false;
  }

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    setError("emailError", "Enter a valid email address.");
    valid = false;
  }

  if (password.length < 6) {
    setError("passwordError", "Password must be at least 6 characters.");
    valid = false;
  }

  if (!valid) return;

  loginButton.disabled = true;
  loginButton.textContent = mode === "signup" ? "Creating account..." : "Signing in...";

  try {
    const endpoint = mode === "signup" ? "register" : "login";
    const response = await fetch(`${API_BASE_URL}/auth/${endpoint}`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password, rememberMe }),
    });
    const data = await response.json();

    if (!response.ok) {
      formMessage.textContent = data.message || data.error || "Something went wrong. Please try again.";
      loginButton.disabled = false;
      loginButton.textContent = mode === "signup" ? "Create account" : "Sign in";
      return;
    }

    window.location.replace("index.html");
  } catch {
    formMessage.textContent = "Could not reach the LifeLoop server. Is it running?";
    loginButton.disabled = false;
    loginButton.textContent = mode === "signup" ? "Create account" : "Sign in";
  }
});
