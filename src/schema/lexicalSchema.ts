import { schema } from '@loro-mirror/core';

// Minimal schema for Lexical JSON structure inspired by the example
export const lexicalSchema = schema({
  editorState: schema.LoroMap({
    root: schema.LoroMap({
      type: schema.String(),
      version: schema.Number({ defaultValue: 1 }),
      direction: schema.String({ defaultValue: 'ltr' }),
      format: schema.String({ defaultValue: '' }),
      indent: schema.Number({ defaultValue: 0 }),
      children: schema.LoroList(
        schema.LoroMap({
          // children are recursive maps - we model as map of primitives and nested children
          type: schema.String(),
        }),
      ),
    }),
  }),
  document: schema.LoroMap({
    lastSaved: schema.Number({ defaultValue: () => Date.now() }),
    source: schema.String({ defaultValue: 'LexicalModel' }),
    version: schema.String({ defaultValue: '0.34.0' }),
  }),
});

export default lexicalSchema;
