import { redirect } from "next/navigation";

/** Spec 20 "Routes": `/settings` redirects to `/settings/account`. */
export default function SettingsIndexPage() {
  redirect("/settings/account");
}
