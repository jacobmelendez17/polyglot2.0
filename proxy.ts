import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Public by default — see progress-tracker.md. Each authenticated route
// group (`(app)`, `(focus)`) lists its real URL prefix here as it ships —
// Next.js route groups don't appear in the URL, so the matcher can't
// reference the group name itself.
const isProtectedRoute = createRouteMatcher([
  "/dashboard(.*)",
  "/lessons(.*)",
  "/reviews(.*)",
  "/levels(.*)",
  "/items(.*)",
  "/decks(.*)",
  "/practice(.*)",
  "/settings(.*)",
  "/onboarding(.*)",
  "/admin(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  if (isProtectedRoute(req)) {
    await auth.protect();
  }
});

// Spec 27 Unit 27.7: the health probes (`/api/health`, `/api/health/ready`) are
// kept out of Clerk's middleware. A liveness check that passes through an
// authentication layer measures that layer, and on a Clerk development instance
// an HTML-accepting request to any page that runs through it is answered with a
// handshake redirect instead of the page (see scripts/smoke-test.mjs). The
// probes are public and need none of it.
export const config = {
  matcher: [
    "/((?!_next|api/health(?:/|$)|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api(?!/health(?:/|$))|trpc)(.*)",
    "/__clerk/:path*",
  ],
};
