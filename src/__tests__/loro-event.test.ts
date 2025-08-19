import { describe, it, expect } from 'vitest'
import { LoroDoc } from 'loro-crdt'

describe('Loro Event', () => {

  it('listens', async () => {
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

});
