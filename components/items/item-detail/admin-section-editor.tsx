"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { Pencil } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

type AdminSectionEditorProps = {
  /** The control's label and the dialog's title — name the section it edits, e.g. "Edit item fields". */
  title: string;
  description?: string;
  children: ReactNode;
};

/**
 * The admin affordance attached to one section of the item page (spec 18:
 * "place actions beneath their relevant sections rather than in one
 * unrelated toolbar").
 *
 * It is only the container. Every editor inside it is the same component the
 * Admin curriculum pages use, calling the same server actions — spec 18's
 * "do not maintain separate Item-page and Admin-page versions of the same
 * business logic" is satisfied by reuse, not by a parallel implementation.
 *
 * Rendering this is never authorization. The page decides whether to render
 * it from the server-resolved role, and every action inside re-checks
 * `canManageCurriculum` server-side regardless — hiding a button has never
 * been a permission check.
 */
export function AdminSectionEditor({ title, description, children }: AdminSectionEditorProps) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="mt-3">
          <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
          {title}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}
