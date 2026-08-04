import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import "./styles/tokens.css";
import "./app/app.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("未找到应用根节点");
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
);
