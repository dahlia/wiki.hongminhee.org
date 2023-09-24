import { Options } from "$fresh/plugins/twind.ts";
import typography from "npm:@twind/typography";

export default {
  selfURL: import.meta.url,
  plugins: {
    ...(typography as unknown as () => Record<string, unknown>)(),
  },
} as Options;
