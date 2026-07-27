"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type Phase = "idle" | "loading" | "finishing";

function isInternalNavigation(anchor: HTMLAnchorElement) {
  if (anchor.target && anchor.target !== "_self") return false;
  if (anchor.hasAttribute("download")) return false;
  const href = anchor.getAttribute("href");
  if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) {
    return false;
  }
  try {
    const url = new URL(href, window.location.href);
    if (url.origin !== window.location.origin) return false;
    if (
      url.pathname === window.location.pathname &&
      url.search === window.location.search &&
      url.hash !== window.location.hash
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export default function NavigationProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const routeKey = `${pathname}?${searchParams.toString()}`;
  const activeRouteRef = useRef(routeKey);
  const tickRef = useRef<number | null>(null);

  useEffect(() => {
    activeRouteRef.current = routeKey;
    if (phase === "loading" || phase === "finishing") {
      setPhase("finishing");
      setProgress(100);
      const done = window.setTimeout(() => {
        setPhase("idle");
        setProgress(0);
      }, 220);
      return () => window.clearTimeout(done);
    }
    return undefined;
  }, [routeKey]); // eslint-disable-line react-hooks/exhaustive-deps -- complete on route change only

  useEffect(() => {
    function start() {
      if (tickRef.current) window.clearInterval(tickRef.current);
      setPhase("loading");
      setProgress(12);
      tickRef.current = window.setInterval(() => {
        setProgress((value) => {
          if (value >= 90) return value;
          const step = value < 40 ? 8 : value < 70 ? 4 : 1.5;
          return Math.min(90, value + step);
        });
      }, 180);
    }

    function onClick(event: MouseEvent) {
      if (event.defaultPrevented) return;
      if (event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target as Element | null;
      const anchor = target?.closest?.("a");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (!isInternalNavigation(anchor)) return;
      start();
    }

    function onPopState() {
      start();
    }

    document.addEventListener("click", onClick, true);
    window.addEventListener("popstate", onPopState);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("popstate", onPopState);
      if (tickRef.current) window.clearInterval(tickRef.current);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (tickRef.current) window.clearInterval(tickRef.current);
    };
  }, []);

  if (phase === "idle") return null;

  return (
    <div className="nav-progress" aria-hidden>
      <div
        className={`nav-progress-bar ${phase === "finishing" ? "nav-progress-bar-done" : ""}`}
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}
