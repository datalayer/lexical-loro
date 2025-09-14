import {
  moveToLineEnd,
  selectAll,
  selectCharacters,
} from '../keyboardShortcuts/index.mjs';
import {
  assertHTML,
  click,
  focusEditor,
  html,
  initialize,
  test,
} from '../utils/index.mjs';

test.describe('Regression test #1083', () => {
  test.beforeEach(({isCollab, page}) => initialize({isCollab, page}));
  test(`Backspace with ElementNode at the front of the paragraph`, async ({
    page,
    isPlainText,
  }) => {
    test.skip(isPlainText);
    await focusEditor(page);

    await page.keyboard.type('Hello');
    await selectAll(page);
    await click(page, '.link');
    await click(page, '.link-confirm');

    await moveToLineEnd(page);
    await page.keyboard.type('World');

    await assertHTML(
      page,
      html`
        <p class="PlaygroundEditorTheme__paragraph" dir="auto">
          <a
            class="PlaygroundEditorTheme__link"
            href="https://"
            rel="noreferrer">
            <span data-lexical-text="true">Hello</span>
          </a>
          <span data-lexical-text="true">World</span>
        </p>
      `,
    );

    await selectAll(page);
    await page.keyboard.press('Backspace');

    await assertHTML(
      page,
      html`
        <p class="PlaygroundEditorTheme__paragraph" dir="auto"><br /></p>
      `,
    );
  });

  test(`Backspace with ElementNode at the front of the selection`, async ({
    page,
    isPlainText,
  }) => {
    test.skip(isPlainText);
    await focusEditor(page);

    await page.keyboard.type('Say');

    await page.keyboard.type('Hello');
    await selectCharacters(page, 'left', 'Hello'.length);
    await click(page, '.link');
    await click(page, '.link-confirm');

    await moveToLineEnd(page);
    await page.keyboard.type('World');

    await assertHTML(
      page,
      html`
        <p class="PlaygroundEditorTheme__paragraph" dir="auto">
          <span data-lexical-text="true">Say</span>
          <a
            class="PlaygroundEditorTheme__link"
            href="https://"
            rel="noreferrer">
            <span data-lexical-text="true">Hello</span>
          </a>
          <span data-lexical-text="true">World</span>
        </p>
      `,
    );

    await selectCharacters(page, 'left', 'HelloWorld'.length);
    await page.keyboard.press('Backspace');

    await assertHTML(
      page,
      html`
        <p class="PlaygroundEditorTheme__paragraph" dir="auto">
          <span data-lexical-text="true">Say</span>
        </p>
      `,
    );
  });
});
