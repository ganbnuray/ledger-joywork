import type { NextConfig } from "next";

const config: NextConfig = {
  // The example emails are read from disk, so ship them with the email page.
  outputFileTracingIncludes: {
    "/email": ["./data/emails/**"],
    // Committed labels are loaded as reviews when a database has none, on whichever page loads first.
    "/**": ["./data/labels.json"],
  },
};

export default config;
