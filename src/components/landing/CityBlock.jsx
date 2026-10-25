import { Component, Suspense, lazy, useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const HeroScene = lazy(() => import("@/components/three/HeroScene"));

/**
 * Блок с 3D-кварталом. Лениво тянет WebGL-сцену, на узких экранах и при
 * недоступном WebGL показывает статичный кадр той же сцены.
 */
class SceneBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function useMediaQuery(query) {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(query);
    setMatches(mq.matches);
    const onChange = (e) => setMatches(e.matches);
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, [query]);
  return matches;
}

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = (e) => setReduced(e.matches);
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);
  return reduced;
}

function Poster({ className = "" }) {
  return (
    <img
      src={`${import.meta.env.BASE_URL}img/hero-city.jpg`}
      alt=""
      aria-hidden="true"
      loading="lazy"
      decoding="async"
      className={cn("h-full w-full object-contain", className)}
    />
  );
}

export default function CityBlock({ className = "", height = "h-[380px] sm:h-[460px] lg:h-[520px]" }) {
  const wide = useMediaQuery("(min-width: 1024px)");
  const reduced = usePrefersReducedMotion();

  return (
    <div className={cn("relative w-full", height, className)}>
      {wide ? (
        <SceneBoundary fallback={<Poster />}>
          <Suspense fallback={<Poster />}>
            <HeroScene className="absolute inset-0" interactive={!reduced} />
          </Suspense>
        </SceneBoundary>
      ) : (
        <Poster />
      )}
    </div>
  );
}
