import React from "react";
import ReactDOM from "react-dom/client";
import "@/index.css";
import App from "@/App";
import { HelmetProvider } from "react-helmet-async";
import { silenceConsoleInProd } from "@/lib/imageHelpers";

// Section 58 — Production hygiene: silence console.log/info/debug in prod
silenceConsoleInProd();

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <HelmetProvider>
      <App />
    </HelmetProvider>
  </React.StrictMode>,
);
