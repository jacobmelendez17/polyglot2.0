import {
  Dialog,
  DialogContent,
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
 * Spec 09 §6/§11 — completed items in this session have already saved
 * transactionally, so ending never loses them; the item currently in
 * progress simply remains due. Deliberately just the question, no
 * explanatory paragraph (product direction) — confirming shows the session
 * summary.
 */
export function ReviewExitDialog({
  open,
  onOpenChange,
  onConfirm,
}: ReviewExitDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-2xl">End review session?</DialogTitle>
        </DialogHeader>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Keep reviewing
          </Button>
          <Button type="button" variant="destructive" onClick={onConfirm}>
            End session
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
