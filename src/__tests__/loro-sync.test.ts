import { describe, it, expect } from 'vitest'
import { LoroDoc } from 'loro-crdt'

describe('LoroDoc sync via update export/import', () => {
  it('synchronizes two docs to the same state', () => {
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
  })
})
