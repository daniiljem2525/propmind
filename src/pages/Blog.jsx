import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, FileText } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import { useLang } from "@/lib/i18n/LangContext";

// Материалы контент-завода: собираются в бандл при сборке из папки content/
const files = import.meta.glob("/content/*.md", { query: "?raw", import: "default", eager: true });

function getPosts() {
  return Object.entries(files)
    .map(([path, raw]) => {
      const slug = (path.split("/").pop() || "").replace(/\.md$/, "");
      const text = String(raw);
      const fallbackTitles = { "email-newsletter": "Email-письмо для базы собственников" };
      const h1 = text.match(/^#\s+(.+)$/m)?.[1] || fallbackTitles[slug] || slug;
      const body = text.replace(/^#\s+.+\n+/, "").trim();
      const excerpt =
        body
          .replace(/[#*_>`\-]/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 180) + "…";
      return { slug, title: h1, excerpt, body, words: body.split(/\s+/).length };
    })
    .sort((a, b) => b.words - a.words);
}

export function Blog() {
  const { t } = useLang();
  const posts = getPosts();

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
                  <p className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary">
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
  const { t } = useLang();
  const { slug } = useParams();
  const post = getPosts().find((p) => p.slug === slug);
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

  return (
    <div className="min-h-screen bg-background">
      <article className="mx-auto max-w-3xl px-4 py-14 lg:px-8">
        <Link to="/blog" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
          {t("blog.back")}
        </Link>
        <h1 className="mt-6 text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl">{post.title}</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          {post.words} {t("blog.words")} · Arendora
        </p>
        <div className="prose-p:leading-relaxed mt-8 space-y-4 text-[15px] leading-relaxed [&_a]:text-primary [&_h2]:mt-8 [&_h2]:text-2xl [&_h2]:font-bold [&_h3]:mt-6 [&_h3]:text-xl [&_h3]:font-bold [&_li]:ml-5 [&_li]:list-disc [&_strong]:font-bold">
          <ReactMarkdown>{post.body}</ReactMarkdown>
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
      </article>
    </div>
  );
}
