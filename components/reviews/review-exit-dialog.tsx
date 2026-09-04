import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

type ReviewExitDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
};

/**
 * Spec 09 §6/§11 — deliberately different wording from the lesson exit
 * dialog: completed items in this session have already saved
 * transactionally, so exiting never loses them. Only the item currently
 * in progress (not yet fully answered) remains due, unchanged.
 */
export function ReviewExitDialog({ open, onOpenChange, onConfirm }: ReviewExitDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Exit this review session?</DialogTitle>
          <DialogDescription>
            Every item you&apos;ve already completed is saved. The item you&apos;re currently answering hasn&apos;t
            been fully completed yet, so it will remain due for review — nothing about it changes.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Keep reviewing
          </Button>
          <Button type="button" variant="destructive" onClick={onConfirm}>
            Exit review
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
