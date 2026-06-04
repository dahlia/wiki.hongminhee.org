import MarkdownIt from "npm:markdown-it";

interface Token {
  meta: Record<string, unknown>;
  content: string;
  type: string;
}

type Replacer = (
  match: RegExpExecArray,
  env: Record<string, unknown>,
) => string;

let counter = 0;

interface State {
  src: string;
  pos: number;
  push(id: string, tag: string, nesting: number): Token;
}

export class Plugin {
  readonly pattern: RegExp;
  readonly replacer: Replacer;
  readonly id: string;

  constructor(pattern: RegExp, replacer: Replacer) {
    this.pattern = pattern;
    this.replacer = replacer;
    this.id = `regexp-${counter++}`;
  }

  apply(_self: Plugin, [md]: [MarkdownIt], _options: unknown) {
    this.init(md);
  }

  init(md: MarkdownIt) {
    md.inline.ruler.push(this.id, this.parse.bind(this));
    // deno-lint-ignore no-explicit-any
    (md.renderer.rules as any)[this.id] = this.render.bind(this);
  }

  parse(state: State, silent: boolean): boolean {
    const match = this.pattern.exec(state.src.substring(state.pos));
    if (!match || match.index > 0) {
      return false;
    }

    state.pos += match[0].length;
    if (silent) return true;

    const token = state.push(this.id, "", 0);
    token.meta = { match };
    return true;
  }

  render(
    tokens: Token[],
    idx: number,
    _: unknown,
    env: Record<string, unknown>,
  ) {
    return this.replacer(tokens[idx].meta["match"] as RegExpExecArray, env);
  }
}
