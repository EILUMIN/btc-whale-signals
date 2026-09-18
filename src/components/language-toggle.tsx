"use client";

import { useLanguage } from "@/components/language-provider";
import { buttonVariants } from "@/components/ui/button";
import type { Language } from "@/lib/i18n";
import { cn } from "@/lib/utils";

function LanguageOption({
  value,
  label,
  active,
  onSelect,
}: {
  value: Language;
  label: string;
  active: boolean;
  onSelect: (value: Language) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(value)}
      className={cn(
        buttonVariants({ variant: active ? "default" : "ghost", size: "sm" }),
        "min-w-20"
      )}
      aria-pressed={active}
    >
      {label}
    </button>
  );
}

export function LanguageToggle() {
  const { language, setLanguage, t } = useLanguage();

  return (
    <div
      className="inline-flex items-center gap-1 rounded-lg border border-border/70 bg-card p-1"
      role="group"
      aria-label={t.language}
    >
      <LanguageOption
        value="en"
        label={t.english}
        active={language === "en"}
        onSelect={setLanguage}
      />
      <LanguageOption
        value="fil"
        label={t.tagalog}
        active={language === "fil"}
        onSelect={setLanguage}
      />
    </div>
  );
}
