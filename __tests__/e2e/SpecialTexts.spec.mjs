import {
  assertHTML,
  focusEditor,
  html,
  initialize,
  test,
  waitForSelector,
} from '../utils/index.mjs';

test.describe('Special Text', () => {
  test.use({shouldAllowHighlightingWithBrackets: true});
  test.beforeEach(({isCollab, page, shouldAllowHighlightingWithBrackets}) =>
    initialize({
      isCollab,
      page,
      shouldAllowHighlightingWithBrackets,
    }),
  );
  test('should handle a single special text', async ({page, isCollab}) => {
    await focusEditor(page);
    await page.keyboard.type('[MLH Fellowship]');
    await waitForSelector(page, '.PlaygroundEditorTheme__specialText');

    await assertHTML(
      page,
      html`
        <p class="PlaygroundEditorTheme__paragraph" dir="auto">
          <span
            class="PlaygroundEditorTheme__specialText"
            data-lexical-text="true">
            MLH Fellowship
          </span>
        </p>
      `,
    );
  });
  test('should handle multiple special texts', async ({page, isCollab}) => {
    await focusEditor(page);
    await page.keyboard.type('[MLH Fellowship] [MLH Fellowship]');
    await waitForSelector(page, '.PlaygroundEditorTheme__specialText');
    await assertHTML(
      page,
      html`
        <p class="PlaygroundEditorTheme__paragraph" dir="auto">
          <span
            class="PlaygroundEditorTheme__specialText"
            data-lexical-text="true">
            MLH Fellowship
          </span>
          <span data-lexical-text="true"></span>
          <span
            class="PlaygroundEditorTheme__specialText"
            data-lexical-text="true">
            MLH Fellowship
          </span>
        </p>
      `,
    );
  });

  test('should not work when the option to use brackets for highlighting is disabled', async ({
    page,
    isCollab,
    shouldAllowHighlightingWithBrackets,
  }) => {
    await initialize({
      isCollab,
      page,
      shouldAllowHighlightingWithBrackets: false,
    });
    await focusEditor(page);
    await page.keyboard.type('[MLH Fellowship]');
    await assertHTML(
      page,
      html`
        <p class="PlaygroundEditorTheme__paragraph" dir="auto">
          <span data-lexical-text="true">[MLH Fellowship]</span>
        </p>
      `,
    );
  });
});
