import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

type ExitLessonDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
};

/**
 * Normal Polyglot dialog styling (spec 07 §54's chromeless rule governs only
 * the quiz screen, not modals layered over it). Careful not to imply SRS
 * progress will be lost — none has been created yet at this point.
 */
export function ExitLessonDialog({ open, onOpenChange, onConfirm }: ExitLessonDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Exit this lesson?</DialogTitle>
          <DialogDescription>
            Your unfinished lesson progress will not be saved. These items will remain available to learn in a
            future lesson.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Keep studying
          </Button>
          <Button type="button" variant="destructive" onClick={onConfirm}>
            Exit lesson
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
