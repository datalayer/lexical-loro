import { Delta, LoroDoc, LoroText } from 'loro-crdt';

describe('Loro Text', () => {

  test('should have container id', () => {
    const doc = new LoroDoc();
    const textId = 'text1@peer1';
    const text = doc.getText(textId);
    expect(text.id).toBeDefined();
    expect(text.id).toBe(`cid:root-${textId}:Text`);
    const text2 = doc.getContainerById(`cid:root-${textId}:Text`) as LoroText;
    expect(text2.id).toBe(text.id);
  });

  test('should mark', () => {
    const doc = new LoroDoc();
    doc.configTextStyle({bold: {expand: "after"}});
    const text = doc.getText("text");
    text.insert(0, "Hello World!");
    text.mark({ start: 0, end: 5 }, "bold", true);
    const delta = text.toDelta();
    expect(delta).toStrictEqual([
      {
        "insert": "Hello",
        "attributes": {
          "bold": true
        }
      },
      {
        "insert": " World!"
      }
    ] as Delta<string>[]);
  });

});
