// Global configuration for the LifeLoop frontend.
// This file is loaded first in the HTML so that all other scripts can use API_BASE_URL.

// For local development, it falls back to a relative path '/api'.
// Set this to your deployed backend URL on Render (e.g., 'https://lifeloop-backend.onrender.com/api').
// When running locally, leave it as '/api'.
const API_BASE_URL = window.ENV_API_BASE_URL || '/api';
