/*
 * Copyright (c) 2023-2025 Datalayer, Inc.
 * Distributed under the terms of the MIT License.
 */

import { describe, it, expect } from 'vitest'
import { LoroDoc, LoroList, LoroText } from 'loro-crdt'

describe('Loro Event', () => {

  it('listens for text changes', async () => {
    const doc = new LoroDoc();
    const text = doc.getText("text");
    text.insert(0, "Hello world!");
    doc.commit();
    let ran = false;
    text.subscribe((e) => {
      for (const event of e.events) {
        if (event.diff.type === "text") {
          expect(event.diff.diff).toStrictEqual([
            {
              retain: 5,
              attributes: { bold: true },
            },
          ]);
          ran = true;
        }
      }
    });
    text.mark({ start: 0, end: 5 }, "bold", true);
    doc.commit();
    await new Promise((r) => setTimeout(r, 1));
    expect(ran).toBeTruthy();
  });

  it('listens for text changes in sub constainers', async () => {
    const doc = new LoroDoc();
    const map = doc.getMap("map");
    let callTimes = 0;
    // Events from a child are propagated to all ancestor nodes.
    map.subscribe((event) => {
      console.log(event);
      callTimes++;
    });
    
    // Create a sub container for map
    // { map: { list: [] } }
    const list = map.setContainer("list", new LoroList());
    list.push(0);
    list.push(1);
    
    // Create a sub container for list
    // { map: { list: [0, 1, LoroText] } }
    const text = list.insertContainer(2, new LoroText());
    expect(doc.toJSON()).toStrictEqual({ map: { list: [0, 1, ""] } });
    {
      // Commit will trigger the event, because list is a sub container of map
      doc.commit();
      await new Promise((resolve) => setTimeout(resolve, 1));
      expect(callTimes).toBe(1);
    }
    
    text.insert(0, "Hello, ");
    text.insert(7, "World!");
    expect(doc.toJSON()).toStrictEqual({ map: { list: [0, 1, "Hello, World!"] } });
    {
      // Commit will trigger the event, because text is a descendant of map
      doc.commit();
      await new Promise((resolve) => setTimeout(resolve, 1));
      expect(callTimes).toBe(2);
    }
  });

});
