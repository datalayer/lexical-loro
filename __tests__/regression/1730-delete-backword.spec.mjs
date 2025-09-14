import {deleteBackward, moveToLineEnd} from '../keyboardShortcuts/index.mjs';
import {
  assertHTML,
  focusEditor,
  html,
  initialize,
  IS_MAC,
  test,
} from '../utils/index.mjs';

test.describe('Regression test #1730', () => {
  test.beforeEach(({isCollab, page}) => initialize({isCollab, page}));
  test(`Can delete backward with keyboard`, async ({page}) => {
    if (!IS_MAC) {
      // Do Windows/Linux have equivalent shortcuts?
      return;
    }
    await focusEditor(page);

    await page.keyboard.type('hello world');
    await assertHTML(
      page,
      html`
        <p class="PlaygroundEditorTheme__paragraph" dir="auto">
          <span data-lexical-text="true">hello world</span>
        </p>
      `,
    );

    await moveToLineEnd(page);
    await deleteBackward(page);
    await assertHTML(
      page,
      html`
        <p class="PlaygroundEditorTheme__paragraph" dir="auto">
          <span data-lexical-text="true">hello worl</span>
        </p>
      `,
    );
  });
});
