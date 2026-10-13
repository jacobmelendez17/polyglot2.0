import { CURRICULUM_STATUSES } from "@/domains/admin";

/** What a status select offers (every status, in the contract's order), with the labels people read. */
export const STATUS_CHOICES = CURRICULUM_STATUSES.map((status) => ({
  id: status,
  name: status.charAt(0).toUpperCase() + status.slice(1),
}));

/** A status as people read it ("published" → "Published"); anything unrecognised is shown as it came. */
export const statusLabel = (status: string) =>
  STATUS_CHOICES.find((choice) => choice.id === status)?.name ?? status;
