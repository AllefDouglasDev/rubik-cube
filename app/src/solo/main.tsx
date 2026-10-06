import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { SoloApp } from "./SoloApp";
import "../styles.css";
import "./solo.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <SoloApp />
  </StrictMode>,
);
