// Shared session helpers. The backend issues an httpOnly session cookie on
// login/register, so the frontend never touches passwords or tokens — it
// just asks the backend "who am I?" and acts on the answer.

let cachedUser = null;

async function fetchCurrentUser() {
  try {
    const response = await fetch(`${API_BASE_URL}/auth/me`, { credentials: "include" });
    if (!response.ok) {
      cachedUser = null;
      return null;
    }
    const data = await response.json();
    cachedUser = data.user;
    return cachedUser;
  } catch {
    cachedUser = null;
    return null;
  }
}

function getCurrentUser() {
  return cachedUser;
}

// Runs on protected pages. Hides the page content until we know whether the
// person is signed in, then either reveals the page or redirects to login.
async function requireLogin() {
  const user = await fetchCurrentUser();
  if (!user) {
    window.location.replace("login.html");
    return null;
  }
  document.documentElement.classList.remove("auth-pending");
  return user;
}

async function logout() {
  try {
    await fetch(`${API_BASE_URL}/auth/logout`, { method: "POST", credentials: "include" });
  } finally {
    cachedUser = null;
    window.location.replace("login.html");
  }
}
