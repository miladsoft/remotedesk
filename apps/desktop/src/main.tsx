import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { installDesktopGuards } from "./lib/disableInspect";
import { initSplash } from "./lib/splash";
import "./index.css";

installDesktopGuards();
initSplash();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
