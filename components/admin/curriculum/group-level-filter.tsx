"use client";

import { useRouter } from "next/navigation";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type GroupLevelFilterProps = {
  languageId: string;
  levels: { id: string; levelNumber: number }[];
  value: string;
};

/** Reordering only ever applies within one level, so (unlike the Curriculum table) the Groups page always has exactly one level selected — never an "all levels" option. */
export function GroupLevelFilter({ languageId, levels, value }: GroupLevelFilterProps) {
  const router = useRouter();

  return (
    <Select value={value} onValueChange={(levelId) => router.push(`/admin/curriculum/groups?language=${languageId}&level=${levelId}`)}>
      <SelectTrigger aria-label="Level" className="w-40">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {levels.map((level) => (
          <SelectItem key={level.id} value={level.id}>
            Level {level.levelNumber}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
