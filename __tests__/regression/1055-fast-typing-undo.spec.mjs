import {undo} from '../keyboardShortcuts/index.mjs';
import {
  assertHTML,
  focusEditor,
  html,
  initialize,
  test,
} from '../utils/index.mjs';

test.describe('Regression test #1055', () => {
  test.beforeEach(({isCollab, page}) => initialize({isCollab, page}));
  test(`Adds new editor state into undo stack right after undo was done`, async ({
    isCollab,
    page,
  }) => {
    test.skip(isCollab);
    await focusEditor(page);
    await page.keyboard.type('hello');
    await undo(page);
    await assertHTML(
      page,
      html`
        <p class="PlaygroundEditorTheme__paragraph" dir="auto"><br /></p>
      `,
    );
    await page.keyboard.type('hello');
    await assertHTML(
      page,
      html`
        <p class="PlaygroundEditorTheme__paragraph" dir="auto">
          <span data-lexical-text="true">hello</span>
        </p>
      `,
    );
    await undo(page);
    await assertHTML(
      page,
      html`
        <p class="PlaygroundEditorTheme__paragraph" dir="auto"><br /></p>
      `,
    );
  });
});
