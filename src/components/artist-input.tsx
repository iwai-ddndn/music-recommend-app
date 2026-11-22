"use client";

import { useId, useState } from "react";
import useSWR from "swr";
import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { fetcher } from "@/lib/client/api";
import { cn } from "@/lib/utils";

/** アーティスト名の入力（候補つき）。Enter / 候補クリックで追加 */
export function ArtistInput({
  value,
  onAdd,
  onRemove,
  max,
  placeholder = "アーティスト名を入力",
  id,
}: {
  value: { key: string; name: string }[];
  onAdd: (name: string) => void;
  onRemove: (key: string) => void;
  max?: number;
  placeholder?: string;
  id?: string;
}) {
  const [q, setQ] = useState("");
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();
  const { data } = useSWR<{ artists: { id: string; name: string }[] }>(
    q.trim() ? `/api/artists?q=${encodeURIComponent(q.trim())}` : null,
    fetcher,
    { keepPreviousData: true },
  );
  const taken = new Set(value.map((v) => v.name.toLowerCase()));
  const suggestions = (data?.artists ?? []).filter((a) => !taken.has(a.name.toLowerCase())).slice(0, 6);
  const full = max !== undefined && value.length >= max;
  const add = (name: string) => {
    const n = name.trim();
    if (!n || taken.has(n.toLowerCase()) || full) return;
    onAdd(n);
    setQ("");
    setActive(0);
  };
  const open = focused && q.trim().length > 0 && !full;

  return (
    <div className="space-y-2">
      {value.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="選択済み">
          {value.map((v) => (
            <li key={v.key}>
              <Badge variant="secondary" className="gap-1 py-1 pr-1 pl-2 text-sm font-normal">
                {v.name}
                <button
                  type="button"
                  className="hover:bg-background/60 rounded-sm p-0.5"
                  aria-label={`${v.name} を外す`}
                  onClick={() => onRemove(v.key)}
                >
                  <X className="size-3" />
                </button>
              </Badge>
            </li>
          ))}
        </ul>
      )}
      <div className="relative">
        <Input
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          placeholder={full ? `最大${max}件まで` : placeholder}
          disabled={full}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setActive(0);
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return;
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, suggestions.length));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              add(active > 0 && suggestions[active - 1] ? suggestions[active - 1].name : q);
            }
          }}
        />
        {open && (
          <ul
            id={listId}
            role="listbox"
            className="bg-popover text-popover-foreground absolute z-20 mt-1 w-full overflow-hidden rounded-md border shadow-md"
          >
            {suggestions.map((s, i) => (
              <li
                key={s.id}
                role="option"
                aria-selected={active === i + 1}
                className={cn("cursor-pointer px-3 py-2 text-sm", active === i + 1 && "bg-accent")}
                onMouseDown={(e) => {
                  e.preventDefault();
                  add(s.name);
                }}
              >
                {s.name}
              </li>
            ))}
            {!suggestions.some((s) => s.name.toLowerCase() === q.trim().toLowerCase()) && (
              <li
                role="option"
                aria-selected={active === 0}
                className={cn("text-muted-foreground cursor-pointer px-3 py-2 text-sm", active === 0 && "bg-accent")}
                onMouseDown={(e) => {
                  e.preventDefault();
                  add(q);
                }}
              >
                「{q.trim()}」を追加
              </li>
            )}
          </ul>
        )}
      </div>
    </div>
  );
}
