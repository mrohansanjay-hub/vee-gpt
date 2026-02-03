import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

// import { GoogleOAuthProvider } from "@react-oauth/google";

// ==================== GLOBAL ERROR HANDLERS ====================
// Prevent page auto-refresh on errors
window.addEventListener("error", (event) => {
  // Log error but don't reload
  console.error("Global error caught:", event.error);
  // Prevent default error handling that might cause reload
  event.preventDefault();
});

window.addEventListener("unhandledrejection", (event) => {
  // Log promise rejection but don't reload
  console.error("Unhandled promise rejection:", event.reason);
  // Prevent default error handling
  event.preventDefault();
});

// Prevent accidental navigation away
const navigationAttempts = {};
const resetNavigationTimer = () => {
  Object.keys(navigationAttempts).forEach(key => {
    delete navigationAttempts[key];
  });
};

setInterval(resetNavigationTimer, 60000); // Reset every minute

ReactDOM.createRoot(document.getElementById("root")).render(
  <>
      <App />
  </>
);
