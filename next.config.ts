import type { NextConfig } from "next";

const config: NextConfig = {
  // The example emails are read from disk, so ship them with the email page.
  outputFileTracingIncludes: {
    "/email": ["./data/emails/**"],
  },
};

export default config;
