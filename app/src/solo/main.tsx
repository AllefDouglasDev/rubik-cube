import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { SoloApp } from "./SoloApp";
import "../styles.css";
import "./solo.css";
import { registerServiceWorker } from "../registerServiceWorker";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <SoloApp />
  </StrictMode>,
);

registerServiceWorker();
