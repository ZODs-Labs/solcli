/** Interactive prompts. Refused in non-interactive mode. Implemented by S2. */
export interface PromptsService {
  text(opts: { message: string; placeholder?: string; initial?: string }): Promise<string>;
  password(opts: { message: string }): Promise<string>;
  confirm(opts: { message: string; initial?: boolean }): Promise<boolean>;
  select<V extends string>(opts: {
    message: string;
    options: { value: V; label: string; hint?: string }[];
    initial?: V;
  }): Promise<V>;
}
