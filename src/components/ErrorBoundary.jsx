import React from "react";

// Ловит падения рендера: вместо белого экрана — карточка с текстом
// ошибки и кнопкой перезагрузки. Текст ошибки = точный диагноз.
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // В заголовок вкладки — кратко, для скринов
    try {
      document.title = "ERR: " + String(error?.message || error).slice(0, 120);
    } catch {}
    console.error("Render error:", error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div
        dir="auto"
        style={{
          margin: "16px",
          padding: "16px",
          background: "#FEF2F2",
          border: "1px solid #FCA5A5",
          borderRadius: "10px",
          color: "#B91C1C",
          fontFamily: "13px/1.5 monospace",
          wordBreak: "break-all",
        }}
      >
        <b>Ошибка интерфейса</b>
        <p style={{ margin: "8px 0" }}>
          {String(this.state.error?.message || this.state.error)}
        </p>
        <pre style={{ maxHeight: "30vh", overflow: "auto", fontSize: 11, whiteSpace: "pre-wrap" }}>
          {String(this.state.error?.stack || "").slice(0, 2000)}
        </pre>
        <button
          onClick={() => window.location.reload()}
          style={{
            marginTop: 8,
            padding: "8px 14px",
            borderRadius: 8,
            border: "1px solid #FCA5A5",
            background: "#fff",
            cursor: "pointer",
          }}
        >
          Перезагрузить
        </button>
      </div>
    );
  }
}
