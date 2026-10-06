import React from "react";
import ReactDOM from "react-dom/client";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import App from "./App";
import { convex } from "./lib/convex";
import "./index.css";

const element = document.getElementById("root");
if (!element) throw new Error("Root element not found");

ReactDOM.createRoot(element).render(
  <React.StrictMode>
    <ConvexAuthProvider client={convex}>
      <App />
    </ConvexAuthProvider>
  </React.StrictMode>
);