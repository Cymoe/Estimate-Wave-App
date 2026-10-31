import React from "react";
import ReactDOM from "react-dom/client";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import App from "./App";
import { AppErrorBoundary } from "./components/common/AppErrorBoundary";
import { convex } from "./lib/convex";
import "./index.css";
import "./styles/light-theme.css";

const element = document.getElementById("root");
if (!element) throw new Error("Root element not found");

ReactDOM.createRoot(element).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <ConvexAuthProvider client={convex}>
        <App />
      </ConvexAuthProvider>
    </AppErrorBoundary>
  </React.StrictMode>
);