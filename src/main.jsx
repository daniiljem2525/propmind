import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import ErrorBoundary from "./components/ErrorBoundary";
import { captureUtm } from "@/lib/utm";
import "./index.css";

// UTM-атрибуция: фиксируем метки до первого рендера, чтобы визит из
// Директа не потерялся ни на одном маршруте (регистрация прикрепит их
// к аккаунту — см. src/lib/utm.js). Внутренние переходы не затирают.
captureUtm();

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
