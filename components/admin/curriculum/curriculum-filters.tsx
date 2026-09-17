"use client";

import { useRouter, usePathname } from "next/navigation";
import { useState } from "react";
import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CurriculumStatus } from "@/domains/curriculum";

const ALL_VALUE = "all";

type CurriculumFiltersProps = {
  languages: { id: string; name: string }[];
  levels: { id: string; levelNumber: number }[];
  groups: { id: string; name: string; levelNumber: number }[];
  value: {
    languageId: string;
    levelId?: string;
    type?: "vocabulary" | "grammar";
    status?: CurriculumStatus;
    groupId?: string;
    search?: string;
  };
};

const STATUS_OPTIONS: { value: CurriculumStatus; label: string }[] = [
  { value: "draft", label: "Draft" },
  { value: "pending", label: "Pending" },
  { value: "published", label: "Published" },
  { value: "archived", label: "Archived" },
];

/**
 * Spec 11 §9/§10 — search plus five filters. Filter/search state is
 * navigable URL state (code-standards.md's "use URL/search parameters for
 * navigable/shareable state") rather than component state, so a filtered
 * view is bookmarkable and survives a refresh. Changing any filter other
 * than search resets `cursor` — starting a new filter combination always
 * begins at the first page.
 */
export function CurriculumFilters({
  languages,
  levels,
  groups,
  value,
}: CurriculumFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [searchDraft, setSearchDraft] = useState(value.search ?? "");

  function navigate(overrides: Record<string, string | undefined>) {
    const params = new URLSearchParams();
    const next = { ...value, ...overrides };
    if (next.languageId) params.set("language", next.languageId);
    if (next.levelId) params.set("level", next.levelId);
    if (next.type) params.set("type", next.type);
    if (next.status) params.set("status", next.status);
    if (next.groupId) params.set("group", next.groupId);
    if (next.search) params.set("search", next.search);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
      <form
        className="relative flex-1 sm:min-w-48"
        onSubmit={(event) => {
          event.preventDefault();
          navigate({ search: searchDraft.trim() || undefined });
        }}
      >
        <Search
          className="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          type="search"
          placeholder="Search..."
          aria-label="Search curriculum"
          className="pl-8"
          value={searchDraft}
          onChange={(event) => setSearchDraft(event.target.value)}
        />
      </form>

      <Select
        value={value.languageId}
        onValueChange={(languageId) =>
          navigate({ languageId, levelId: undefined, groupId: undefined })
        }
      >
        <SelectTrigger aria-label="Language" className="sm:w-40">
          <SelectValue placeholder="Language" />
        </SelectTrigger>
        <SelectContent>
          {languages.map((language) => (
            <SelectItem key={language.id} value={language.id}>
              {language.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={value.levelId ?? ALL_VALUE}
        onValueChange={(levelId) =>
          navigate({ levelId: levelId === ALL_VALUE ? undefined : levelId })
        }
      >
        <SelectTrigger aria-label="Level" className="sm:w-32">
          <SelectValue placeholder="Level" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_VALUE}>All levels</SelectItem>
          {levels.map((level) => (
            <SelectItem key={level.id} value={level.id}>
              Level {level.levelNumber}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={value.type ?? ALL_VALUE}
        onValueChange={(type) =>
          navigate({
            type:
              type === ALL_VALUE
                ? undefined
                : (type as "vocabulary" | "grammar"),
          })
        }
      >
        <SelectTrigger aria-label="Type" className="sm:w-32">
          <SelectValue placeholder="Type" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_VALUE}>All types</SelectItem>
          <SelectItem value="vocabulary">Vocabulary</SelectItem>
          <SelectItem value="grammar">Grammar</SelectItem>
        </SelectContent>
      </Select>

      <Select
        value={value.status ?? ALL_VALUE}
        onValueChange={(status) =>
          navigate({
            status:
              status === ALL_VALUE ? undefined : (status as CurriculumStatus),
          })
        }
      >
        <SelectTrigger aria-label="Status" className="sm:w-36">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_VALUE}>All statuses</SelectItem>
          {STATUS_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={value.groupId ?? ALL_VALUE}
        onValueChange={(groupId) =>
          navigate({ groupId: groupId === ALL_VALUE ? undefined : groupId })
        }
      >
        <SelectTrigger aria-label="Group" className="sm:w-44">
          <SelectValue placeholder="Group" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_VALUE}>All groups</SelectItem>
          {groups.map((group) => (
            <SelectItem key={group.id} value={group.id}>
              L{group.levelNumber} — {group.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
