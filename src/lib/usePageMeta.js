import { useEffect } from "react";

// Title и description на каждый маршрут. В index.html лежит дефолтный
// <title>; без этого хука вся SPA жила бы с одним заголовком — и поисковик,
// и вкладка браузера видели бы «Arendora — управление недвижимостью»
// на блоге, оферте и входе одинаково.
//
// Третий аргумент — путь страницы (например "/blog"). По нему ставится
// self-canonical и og:url: без канонического URL каждая копия страницы
// с utm-метками выглядела для поисковика отдельным документом.
// absoluteUrl берёт origin из адресной строки — на боевом домене это
// домен сайта, в сборке для GitHub Pages — адрес Pages.

function absoluteUrl(path) {
  const base = import.meta.env.BASE_URL.replace(/\/+$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${window.location.origin}${base}${p.split(/[?#]/)[0]}`;
}

function setMeta(attr, key, content) {
  let el = document.head.querySelector(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function setCanonical(href) {
  let el = document.head.querySelector('link[rel="canonical"]');
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", "canonical");
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
}

export function usePageMeta(title, description, path) {
  useEffect(() => {
    if (title) {
      document.title = title;
      setMeta("property", "og:title", title);
    }
    if (description) {
      let el = document.querySelector('meta[name="description"]');
      if (!el) {
        el = document.createElement("meta");
        el.setAttribute("name", "description");
        document.head.appendChild(el);
      }
      el.setAttribute("content", description);
      setMeta("property", "og:description", description);
    }
    if (path) {
      const url = absoluteUrl(path);
      setCanonical(url);
      setMeta("property", "og:url", url);
    }
  }, [title, description, path]);
}

// JSON-LD для конкретной страницы (Article, BreadcrumbList и т.п.):
// скрипт ставится при монтировании и снимается при уходе со страницы,
// чтобы разметка одной страницы не прилипала к другой.
export function usePageJsonLd(data) {
  useEffect(() => {
    if (!data) return undefined;
    const el = document.createElement("script");
    el.type = "application/ld+json";
    el.dataset.pageJsonLd = "1";
    el.textContent = JSON.stringify(data);
    document.head.appendChild(el);
    return () => el.remove();
  }, [data]);
}
