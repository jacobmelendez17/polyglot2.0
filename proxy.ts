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
  "/admin(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  if (isProtectedRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
    "/__clerk/:path*",
  ],
};
