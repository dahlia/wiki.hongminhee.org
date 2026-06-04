import { createDefine } from "fresh";

export interface State {
  title?: string;
  page?: string;
  canonicalUrl?: string;
}

export const define = createDefine<State>();
