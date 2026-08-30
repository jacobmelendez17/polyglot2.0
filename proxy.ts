import { clerkMiddleware } from "@clerk/nextjs/server";

// Public by default. No authenticated routes exist yet (no /dashboard), so
// there is nothing to gate with `auth.protect()` — see progress-tracker.md.
// Add route protection here when the first authenticated page ships.
export default clerkMiddleware();

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
    "/__clerk/:path*",
  ],
};
