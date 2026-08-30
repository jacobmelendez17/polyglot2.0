import type { Metadata } from "next";
import { SignIn } from "@clerk/nextjs";

export const metadata: Metadata = {
  title: "Sign in — Polyglot",
};

export default function SignInPage() {
  return <SignIn />;
}
