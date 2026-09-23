import { useEffect, useMemo, useRef, useState } from "react";
import { Building2, Download, FileText, Pencil, Plus, Search, Trash2, UploadCloud, X, FileStack } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, ConfirmDialog } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { useCollection } from "@/hooks/useCollection";
import { useNewParam } from "@/hooks/useNewParam";
import { useDemoSeed } from "@/hooks/useDemoSeed";
import { Document, Property } from "@/lib/api/entities";
import { uploadFile } from "@/lib/api/files";
import { useLang } from "@/lib/i18n/LangContext";
import { useToast } from "@/components/ui/toast";
import { DOC_TYPE_CONFIG } from "@/lib/config/statuses";
import { formatFileSize } from "@/lib/utils";

const TYPE_OPTIONS = Object.keys(DOC_TYPE_CONFIG);

// ——— Выбор файла: объект File держим до сабмита ———
function FileField({ file, existing, onSelect, onClear }) {
  const { t } = useLang();
  const inputRef = useRef(null);

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onSelect(f);
          e.target.value = "";
        }}
      />
      {file || existing?.file_name ? (
        <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2.5 text-sm">
          <FileText className="h-4 w-4 shrink-0 text-primary" />
          <span className="min-w-0 flex-1 truncate">
            {file ? file.name : existing.file_name}
            {file && <span className="ml-2 text-xs text-muted-foreground">{formatFileSize(file.size)}</span>}
          </span>
          <button type="button" onClick={onClear} className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex h-24 w-full flex-col items-center justify-center gap-2 rounded-md border border-dashed text-sm text-muted-foreground transition-colors hover:border-ring hover:bg-muted/40"
        >
          <UploadCloud className="h-5 w-5" />
          {t("documents.file")}
        </button>
      )}
    </div>
  );
}

function DocumentFormDialog({ open, onClose, editing, properties }) {
  const { t, lang } = useLang();
  const toast = useToast();
  const [form, setForm] = useState({});
  const [file, setFile] = useState(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setError("");
      setFile(null);
      setForm({
        name: editing?.name || "",
        type: editing?.type || "other",
        property_id: editing?.property_id || "",
        notes: editing?.notes || "",
      });
    }
  }, [open, editing]);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || (!file && !editing?.file_url && !editing?.file_name)) {
      return setError(t("documents.required"));
    }
    setSaving(true);
    try {
      let file_url = editing?.file_url || "";
      let file_name = editing?.file_name || null;
      let file_size = editing?.file_size || null;
      if (file) {
        file_url = await uploadFile(file);
        file_name = file.name;
        file_size = file.size;
      }
      const property = properties.find((p) => p.id === form.property_id);
      const payload = {
        name: form.name.trim(),
        type: form.type,
        property_id: property?.id || null,
        property_name: property?.name || null,
        file_url,
        file_name,
        file_size,
        notes: form.notes || null,
      };
      if (editing) {
        await Document.update(editing.id, payload);
      } else {
        await Document.create(payload);
      }
      toast.success(t("documents.saved"));
      onClose();
    } catch (err) {
      if (err.message === "FILE_TOO_LARGE") toast.error(t("documents.fileTooLarge"));
      else if (err.message === "QUOTA_EXCEEDED") toast.error(t("documents.quota"));
      else toast.error(t("documents.uploadFailed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={editing ? t("common.edit") : t("documents.upload")}
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" form="document-form" loading={saving}>
            {t("common.save")}
          </Button>
        </>
      }
    >
      <form id="document-form" onSubmit={submit} className="space-y-4">
        <Field label={t("documents.name")} required>
          <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder={lang === "ru" ? "Договор аренды №42" : "Lease agreement #42"} autoFocus />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("documents.type")}>
            <Select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}>
              {TYPE_OPTIONS.map((ty) => (
                <option key={ty} value={ty}>
                  {DOC_TYPE_CONFIG[ty][lang === "ru" ? "label_ru" : "label_en"]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("documents.property")}>
            <Select value={form.property_id} onChange={(e) => setForm((f) => ({ ...f, property_id: e.target.value }))}>
              <option value="">—</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label={t("documents.file")} required={!editing}>
          <FileField file={file} existing={editing} onSelect={setFile} onClear={() => setFile(null)} />
        </Field>
        <Field label={t("documents.notes")}>
          <Textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={2} />
        </Field>
        {error && (
          <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-600 dark:bg-rose-500/10 dark:text-rose-400">{error}</p>
        )}
      </form>
    </Dialog>
  );
}

export default function Documents() {
  const { t, lang } = useLang();
  const toast = useToast();
  const demo = useDemoSeed();
  const { data: documents, loading } = useCollection(Document);
  const { data: properties } = useCollection(Property);

  const [q, setQ] = useState("");
  const [type, setType] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  useNewParam(() => setDialogOpen(true));
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return documents.filter((d) => {
      const matchesQ =
        !query ||
        (d.name || "").toLowerCase().includes(query) ||
        (d.property_name || "").toLowerCase().includes(query);
      return matchesQ && (type === "all" || d.type === type);
    });
  }, [documents, q, type]);

  const confirmDelete = async () => {
    if (!deleting) return;
    await Document.delete(deleting.id);
    toast.success(t("documents.deleted"));
    setDeleting(null);
  };

  return (
    <div className="animate-fade-in">
      <PageHeader
        title={t("documents.title")}
        subtitle={t("documents.subtitle")}
        actions={
          <Button
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
          >
            <Plus className="h-4 w-4" />
            {t("documents.upload")}
          </Button>
        }
      />

      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("common.searchPlaceholder")} className="pl-9" />
        </div>
        <Select value={type} onChange={(e) => setType(e.target.value)} className="sm:w-52">
          <option value="all">{t("common.type")}: {t("common.all")}</option>
          {TYPE_OPTIONS.map((ty) => (
            <option key={ty} value={ty}>
              {DOC_TYPE_CONFIG[ty][lang === "ru" ? "label_ru" : "label_en"]}
            </option>
          ))}
        </Select>
      </div>

      {loading ? (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="h-36 animate-pulse" />
          ))}
        </div>
      ) : documents.length === 0 ? (
        <EmptyState
          icon={FileStack}
          title={t("documents.emptyTitle")}
          description={t("documents.emptySubtitle")}
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button
                onClick={() => {
                  setEditing(null);
                  setDialogOpen(true);
                }}
              >
                <Plus className="h-4 w-4" />
                {t("documents.upload")}
              </Button>
              <Button variant="outline" onClick={demo.run} loading={demo.loading}>
                {t("common.demoData")}
              </Button>
            </div>
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Search}
          title={t("common.noResults")}
          action={
            <Button
              variant="outline"
              onClick={() => {
                setQ("");
                setType("all");
              }}
            >
              {t("common.clearFilters")}
            </Button>
          }
        />
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((d) => {
            const typeConf = DOC_TYPE_CONFIG[d.type] || DOC_TYPE_CONFIG.other;
            const TypeIcon = typeConf.icon;
            return (
              <Card key={d.id} className="group p-4 hover:shadow-card-hover">
                <div className="flex items-start gap-3">
                  <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-white ${typeConf.tile}`}>
                    <TypeIcon className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate font-semibold">{d.name}</h3>
                    <Badge className="mt-1 bg-muted text-muted-foreground">
                      {lang === "ru" ? typeConf.label_ru : typeConf.label_en}
                    </Badge>
                  </div>
                  <div className="flex shrink-0 gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => {
                        setEditing(d);
                        setDialogOpen(true);
                      }}
                      title={t("common.edit")}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => setDeleting(d)} className="text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10" title={t("common.delete")}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {d.property_name && (
                  <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Building2 className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{d.property_name}</span>
                  </p>
                )}

                <div className="mt-3 flex items-center justify-between gap-2 border-t pt-3">
                  <span className="min-w-0 truncate text-xs text-muted-foreground">
                    {d.file_name || "—"}
                    {d.file_size ? ` · ${formatFileSize(d.file_size, lang)}` : ""}
                  </span>
                  {d.file_url ? (
                    <a
                      href={d.file_url}
                      target="_blank"
                      rel="noreferrer"
                      download={d.file_name || true}
                      className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-primary hover:underline"
                    >
                      <Download className="h-3.5 w-3.5" />
                      {t("documents.open")}
                    </a>
                  ) : (
                    <span className="shrink-0 text-xs text-muted-foreground">—</span>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <DocumentFormDialog open={dialogOpen} onClose={() => setDialogOpen(false)} editing={editing} properties={properties} />

      <ConfirmDialog open={!!deleting} onClose={() => setDeleting(null)} onConfirm={confirmDelete} description={deleting?.name} />
    </div>
  );
}
