/**
 * The width of the onboarding content column, shared by the slide content and
 * the Back / Next controls so the two can never drift apart.
 *
 * Back and Next sit at the left and right edges of *this* column rather than
 * the viewport's corners, so they read as belonging to the slide they
 * navigate. Below this width — every phone, most tablets — the column is the
 * full viewport minus its padding, which keeps both controls comfortably
 * reachable on a small screen.
 */
export const ONBOARDING_CONTENT_WIDTH = "max-w-xl";
