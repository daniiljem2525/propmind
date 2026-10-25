import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, CalendarDays, FileText } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import { useLang } from "@/lib/i18n/LangContext";
import { usePageMeta, usePageJsonLd } from "@/lib/usePageMeta";

// Статьи блога собираются в бандл при сборке из content/blog/.
// Черновики соцсетей и рассылок лежат в content/ и в блог не попадают —
// иначе тонкий нерелевантный контент размывает тематичность раздела.
const files = import.meta.glob("/content/blog/*.md", { query: "?raw", import: "default", eager: true });

// Простой front-matter: ---\ndate: 2026-10-24\ndescription: …\n---
function parseFrontMatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n*/);
  if (!m) return { meta: {}, body: text };
  const meta = {};
  for (const line of m[1].split(/\r?\n/)) {
    const idx = line.indexOf(":");
    if (idx > 0) meta[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return { meta, body: text.slice(m[0].length) };
}

function getPosts() {
  return Object.entries(files)
    .map(([path, raw]) => {
      const slug = (path.split("/").pop() || "").replace(/\.md$/, "");
      const { meta, body: text } = parseFrontMatter(String(raw));
      const h1 = text.match(/^#\s+(.+)$/m)?.[1] || meta.title || slug;
      const body = text.replace(/^#\s+.+\n+/, "").trim();
      const excerpt =
        meta.description ||
        (body
          .replace(/[#*_>`\-]/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 180) + "…");
      const words = body.split(/\s+/).length;
      return { slug, title: h1, excerpt, body, words, date: meta.date || "" };
    })
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.words - a.words));
}

const SITE_NAME = "Arendora";

// Schema.org требует абсолютные URL; SPA работает на одном origin, так что
// абсолют собираем из адресной строки
function absUrl(path) {
  const base = import.meta.env.BASE_URL.replace(/\/+$/, "");
  return `${window.location.origin}${base}${path}`;
}

function formatDate(iso, lang) {
  if (!iso) return null;
  try {
    return new Intl.DateTimeFormat(lang === "ru" ? "ru-RU" : "en-US", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(new Date(iso));
  } catch {
    return null;
  }
}

export function Blog() {
  const { t, lang } = useLang();
  const posts = useMemo(getPosts, []);
  usePageMeta(`${t("blog.title")} — Arendora`, t("blog.subtitle"), "/blog");

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-5xl px-4 py-14 lg:px-8">
        <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
          Arendora
        </Link>
        <PageHeader title={t("blog.title")} subtitle={t("blog.subtitle")} />

        {posts.length === 0 ? (
          <EmptyState icon={FileText} title={t("blog.empty")} />
        ) : (
          <div className="grid gap-5 md:grid-cols-2">
            {posts.map((p) => (
              <Link key={p.slug} to={`/blog/${p.slug}`}>
                <Card className="h-full p-5 transition-shadow hover:shadow-card-hover">
                  <h3 className="font-bold leading-snug">{p.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{p.excerpt}</p>
                  <p className="mt-4 flex items-center gap-3 text-xs text-muted-foreground">
                    {p.date && (
                      <span className="inline-flex items-center gap-1.5">
                        <CalendarDays className="h-3.5 w-3.5" />
                        {formatDate(p.date, lang)}
                      </span>
                    )}
                    <span>
                      {Math.max(1, Math.round(p.words / 200))} {t("blog.minRead")}
                    </span>
                  </p>
                  <p className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-primary">
                    {t("blog.read")}
                    <ArrowRight className="h-3.5 w-3.5" />
                  </p>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function BlogPost() {
  const { t, lang } = useLang();
  const { slug } = useParams();
  const post = useMemo(() => getPosts().find((p) => p.slug === slug), [slug]);
  // Хук до условного возврата: правила хуков не зависят от того, найден ли пост
  usePageMeta(post ? `${post.title} — Arendora` : null, post?.excerpt, post ? `/blog/${post.slug}` : null);

  // Article — расширенный сниппет в Google; Яндекс его игнорирует, но не
  // наказывает. BreadcrumbList поддерживают оба поисковика.
  usePageJsonLd(
    post
      ? {
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "Article",
              headline: post.title,
              description: post.excerpt,
              datePublished: post.date || undefined,
              dateModified: post.date || undefined,
              inLanguage: lang,
              author: { "@type": "Organization", name: SITE_NAME, url: absUrl("/") },
              publisher: { "@type": "Organization", name: SITE_NAME },
            },
            {
              "@type": "BreadcrumbList",
              itemListElement: [
                { "@type": "ListItem", position: 1, name: SITE_NAME, item: absUrl("/") },
                { "@type": "ListItem", position: 2, name: t("blog.title"), item: absUrl("/blog") },
                { "@type": "ListItem", position: 3, name: post.title },
              ],
            },
          ],
        }
      : null
  );

  if (!post) {
    return (
      <div className="min-h-screen bg-background">
        <div className="mx-auto max-w-3xl px-4 py-20 lg:px-8">
          <EmptyState icon={FileText} title={t("blog.notFound")} />
          <div className="mt-6 text-center">
            <Button asChild variant="outline">
              <Link to="/blog">{t("blog.back")}</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const related = getPosts().filter((p) => p.slug !== post.slug).slice(0, 2);
  const updated = formatDate(post.date, lang);

  return (
    <div className="min-h-screen bg-background">
      <article className="mx-auto max-w-3xl px-4 py-14 lg:px-8">
        <Link to="/blog" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
          {t("blog.back")}
        </Link>
        <h1 className="mt-6 text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl">{post.title}</h1>
        <p className="mt-3 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          {updated && (
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays className="h-4 w-4" />
              {t("blog.updated")} {updated}
            </span>
          )}
          <span>
            {Math.max(1, Math.round(post.words / 200))} {t("blog.minRead")} · Arendora
          </span>
        </p>
        <div className="prose-p:leading-relaxed mt-8 space-y-4 text-[15px] leading-relaxed [&_a]:text-primary [&_h2]:mt-8 [&_h2]:text-2xl [&_h2]:font-bold [&_h3]:mt-6 [&_h3]:text-xl [&_h3]:font-bold [&_li]:ml-5 [&_li]:list-disc [&_strong]:font-bold">
          {/* Внутренние ссылки статей ведут через роутер — без перезагрузки SPA */}
          <ReactMarkdown
            components={{
              a: ({ href, children }) =>
                href && href.startsWith("/") ? (
                  <Link to={href}>{children}</Link>
                ) : (
                  <a href={href} target="_blank" rel="noopener noreferrer">
                    {children}
                  </a>
                ),
            }}
          >
            {post.body}
          </ReactMarkdown>
        </div>
        <div className="mt-12 rounded-lg border bg-card p-6">
          <p className="font-bold">{t("blog.ctaTitle")}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t("blog.ctaText")}</p>
          <Button asChild variant="gradient" className="mt-4">
            <Link to="/register">
              {t("land.ctaStart")}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>

        {related.length > 0 && (
          <div className="mt-10">
            <h2 className="text-lg font-bold">{t("blog.more")}</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {related.map((p) => (
                <Link key={p.slug} to={`/blog/${p.slug}`}>
                  <Card className="h-full p-4 transition-shadow hover:shadow-card-hover">
                    <p className="text-sm font-bold leading-snug">{p.title}</p>
                    <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{p.excerpt}</p>
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        )}
      </article>
    </div>
  );
}
