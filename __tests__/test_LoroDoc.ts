import { LoroDoc, LoroText } from 'loro-crdt';

describe('Loro Doc', () => {
  test('shoul have container id', () => {
    const doc = new LoroDoc();
    const textId = 'text1@peer1';
    const text = doc.getText(textId);
    expect(text.id).toBeDefined();
    expect(text.id).toBe(`cid:root-${textId}:Text`);
    const text2 = doc.getContainerById(`cid:root-${textId}:Text`) as LoroText;
    expect(text2.id).toBe(text.id);
  });

});
