/*
 * Copyright (c) 2023-2025 Datalayer, Inc.
 * Distributed under the terms of the MIT License.
 */

import { describe, it, expect } from 'vitest'
import { LoroDoc } from 'loro-crdt'

describe('Loro Sync', () => {

  it('synchronizes two docs to the same state via update export/import', () => {
    const docA = new LoroDoc()
    const docB = new LoroDoc()
    docA.getText('text').insert(0, 'Hello world!')
    docB.getText('text').insert(0, 'Hi!')
    const bytesA = docA.export({ mode: 'update' })
    docB.import(bytesA)
    const bytesB = docB.export({ mode: 'update' })
    docA.import(bytesB)
    const aText = docA.getText('text').toString()
    const bText = docB.getText('text').toString()
    expect(aText).toEqual(bText)
    expect(aText).toContain('Hello world!')
    expect(aText).toContain('Hi!')
  });

  it('export and import versions', () => {
    const doc = new LoroDoc();
    doc.getText("text").insert(0, "Hello world!");
    const data = doc.export({ mode: "snapshot" });
    let lastSavedVersion = doc.version();
    doc.getText("text").insert(0, "✨");
    const update0 = doc.export({ mode: "update", from: lastSavedVersion });
    lastSavedVersion = doc.version();
    doc.getText("text").insert(0, "😶‍🌫️");
    const update1 = doc.export({ mode: "update", from: lastSavedVersion });
    {
      // You can import the snapshot and the updates to get the latest version of the document.
      // import the snapshot
      const newDoc = new LoroDoc();
      newDoc.import(data);
      expect(newDoc.toJSON()).toStrictEqual({
        text: "Hello world!",
      });
      // import update0
      newDoc.import(update0);
      expect(newDoc.toJSON()).toStrictEqual({
        text: "✨Hello world!",
      });
      // import update1
      newDoc.import(update1);
      expect(newDoc.toJSON()).toStrictEqual({
        text: "😶‍🌫️✨Hello world!",
      });
    }
    {
      // You may also import them in a batch
      const newDoc = new LoroDoc();
      newDoc.importBatch([update1, update0, data]);
      expect(newDoc.toJSON()).toStrictEqual({
        text: "😶‍🌫️✨Hello world!",
      });
    }
  });

});
