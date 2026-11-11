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

// Service worker — сразу при старте, а не только при включении push
// (раньше его ставил enablePush, поэтому оффлайн-оболочка и push-подписка
// появлялись только у включивших уведомления). Ошибка регистрации не
// критична: приложение работает и как обычный сайт.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch((err) => {
      console.warn("SW registration failed:", err?.message || err);
    });
  });
}
