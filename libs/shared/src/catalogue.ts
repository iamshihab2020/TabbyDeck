export type ParamFieldType = 'string' | 'text' | 'number' | 'boolean' | 'enum' | 'hotkey' | 'path' | 'profile' | 'folder' | 'variable' | 'screen' | 'window' | 'audioOutput';

export interface ParamField {
  type: ParamFieldType;
  title: string;
  required?: boolean;
  options?: string[];
  /** What the editor shows for each option, in the same order (options are the saved values). */
  labels?: string[];
  default?: string | number | boolean;
  min?: number;
  max?: number;
}

export type ParamSchema = Record<string, ParamField>;

/** What the editor sees about an action; the host-side definition adds run(). */
export interface ActionDefPublic {
  id: string;
  name: string;
  group: string;
  description?: string;
  danger?: boolean;
  schema: ParamSchema;
}
