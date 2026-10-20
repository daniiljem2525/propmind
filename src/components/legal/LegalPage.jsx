import { Link } from "react-router-dom";
import { ArrowLeft, House } from "lucide-react";

export const H = ({ children }) => (
  <h2 className="mt-8 text-lg font-bold text-foreground">{children}</h2>
);

export const P = ({ children }) => (
  <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{children}</p>
);

export const LI = ({ children }) => (
  <li className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{children}</li>
);

export const UL = ({ children }) => (
  <ul className="mt-2 list-disc pl-5">{children}</ul>
);

/**
 * Общий макет правовых документов: шапка с брендом, заголовок,
 * редакция и контент. Используется всеми страницами из /terms, /privacy
 * и раздела «Документы».
 */
export default function LegalPage({ title, edition, children }) {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-4 py-10">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> На главную
        </Link>

        <div className="mt-4 flex items-center gap-2.5">
          <span className="brand-gradient flex h-8 w-8 items-center justify-center rounded-lg">
            <House className="h-4 w-4 text-white" />
          </span>
          <span className="text-lg font-extrabold tracking-tight">Arendora</span>
        </div>

        <h1 className="mt-6 text-2xl font-extrabold tracking-tight">{title}</h1>
        {edition && <p className="mt-2 text-sm text-muted-foreground">{edition}</p>}

        {children}
      </div>
    </div>
  );
}
