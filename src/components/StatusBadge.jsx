import { Badge } from "@/components/ui/badge";
import { useLang } from "@/lib/i18n/LangContext";

export default function StatusBadge({ config, value }) {
  const { lang } = useLang();
  const item = config[value];
  if (!item) return <Badge className="bg-muted text-muted-foreground">{value}</Badge>;
  return <Badge className={item.badge}>{lang === "ru" ? item.label_ru : item.label_en}</Badge>;
}
