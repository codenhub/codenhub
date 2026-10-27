# Interaction

## Contents

- States
- Feedback
- Forms
- Actions And Confirmation
- Navigation
- Targets And Input
- Interface Text
- Accessibility
- On The Web
- Checking Interaction

## States

Every view and component that shows data has more states than the one in the mockup. Design each that can occur before styling the full one.

- **Empty:** say what will appear here and give the action that fills it, such as "No invoices yet" with "Create invoice". A blank area or a bare "No data" reads as broken. Distinguish a first-use empty state from a filter that matched nothing, which needs a way to clear the filter.
- **Loading:** keep the layout the loaded content will have, so nothing jumps when it arrives. Use a skeleton shaped like the content for areas that load as a page, and a spinner inside the control for an action. Show no indicator for waits under about 300ms; a flash of spinner is worse than none.
- **Error:** say what failed and what the person can do, keep everything they entered, and offer the retry next to the failure. A failed section should not blank the whole page.
- **Partial and overflowing:** one item, very many items, a missing image, a missing optional field, and text far longer than the sample.
- **Disabled:** prefer leaving a control enabled and explaining what is missing when it is used. When a control must be disabled, show why near it. Hide a control only when the person can never use it, such as one their role does not permit.

## Feedback

- Every action gets a visible response within about 100ms: a pressed state, a spinner in the button, or the result itself.
- Put feedback where the person is looking. A success message in a corner toast is missed when the change happened in the middle of the page; update the thing itself, and use a toast only for results with no visible place, such as "Link copied".
- For actions that almost always succeed and are cheap to reverse, such as starring, reordering, or toggling, update the interface immediately and roll back with a message if the request fails.
- Prevent double submission: a submit button shows progress and ignores further presses until the request settles.

## Forms

- Every field has a visible label outside the input. A placeholder is not a label: it disappears on typing and fails contrast. Use placeholders only for example formats, or not at all.
- Ask for the least. Every optional field is a reason to abandon. Mark the minority: label optional fields when most are required, and required fields when most are optional.
- One column. Fields side by side get skipped, except tightly related short pairs such as city and postal code.
- Size fields to their expected input: a postal code field is short, an address field is long.
- Validate a field when the person leaves it, not on every keystroke, and clear the error as soon as it is fixed. On submit, validate everything, move focus to the first invalid field, and when there are several errors, list them at the top as links to the fields.
- Place each error message next to its field and say how to fix it: "Enter a date after today", not "Invalid input".
- Accept input in the forms people type it, such as phone numbers with spaces or dashes, and normalize it yourself.
- Never clear what the person entered because of an error on another field or on the server.
- The submit button names the outcome, such as "Create account" or "Send invoice", and sits at the end of the form, aligned with the fields.

## Actions And Confirmation

- Prefer undo to confirmation. Delete immediately, then offer "Undo" for several seconds. Confirmation dialogs get clicked through by habit and protect little.
- Confirm only what cannot be undone and costs something: deleting an account, sending to many people, charging money. The dialog names the object and the consequence ("Delete the project Atlas and its 214 files?"), and the confirming button repeats the verb ("Delete project"), never "OK" or "Yes".
- Put destructive actions apart from frequent ones, and never make one the default button.
- Use a dialog only for a short task that must be finished or dismissed before continuing. Content people read, compare against the page, or return to belongs in the page or a side panel.

## Navigation

- Show where the person is: the current item in the navigation is marked, and the page title matches the item that led there.
- Keep the structure stable. Navigation that reorders, hides items by usage, or changes between pages forces people to search every time.
- Back returns to the previous view with its scroll position, filters, and selection intact.
- State a person would share or return to, such as a search, a filter, a tab, an open item, or a page of results, lives in the address so a link or a reload restores it.
- Seven or fewer top-level destinations. Past that, group them, or the navigation becomes a list people scan instead of a map they know.

## Targets And Input

- Interactive targets are at least 24 by 24px with spacing around them, and about 44 by 44px on touch screens. Make the whole row or card the target when the whole thing does one action.
- Never put essential information or actions only on hover. Touch screens have no hover, and keyboard users never trigger it. Hover may reveal secondary shortcuts that also exist elsewhere.
- Tooltips explain icons and add detail. They never hold the only copy of information the person needs to finish the task.
- Everything a pointer can do, a keyboard can do: drag to reorder also has move up and move down, a canvas also has selectable items.

## Interface Text

- Buttons and links say what happens, with a verb and, when needed, the object: "Save changes", "Export CSV", "View invoice". Avoid "Submit", "OK", "Click here", and "Learn more" repeated down a page.
- Use one term per concept across the product. If it is a "workspace" in navigation, it is not a "project" in a dialog.
- Error messages state what happened and what to do, in the person's terms, without blame or codes. Keep technical detail behind a disclosure when support needs it.
- Use sentence case for buttons, labels, and headings. It reads faster and avoids deciding which words are important.
- Write the real text while designing. Layouts built for "Lorem ipsum" break on real labels and translations.

## Accessibility

- Every control has an accessible name that matches its visible label, so speech users can say what they see.
- Focus is always visible and follows reading order. When anything opens over or beside the page, such as a dialog, a side panel, a drawer, or a menu, focus moves into it; a modal one keeps focus inside until it closes. When it closes, focus returns to what opened it.
- Escape closes dialogs, side panels, drawers, menus, and popovers.
- Announce changes that appear away from focus, such as a saved status or a result count, to screen readers.
- Content still works at 200% zoom and at 320px width without scrolling in two directions.
- Time limits can be extended or turned off, and nothing moves, blinks, or auto-advances without a way to pause it.

## On The Web

- Use the native element for the job: `button` for actions, `a` with an `href` for navigation, `label` tied to every input, `fieldset` and `legend` for groups of options, `dialog` for modal dialogs. A `div` with a click handler has no keyboard support, no role, and no focus.
- Use native form controls before custom ones; style them instead of rebuilding them. A custom select, date picker, or combobox must implement the full keyboard and screen-reader pattern, which is easy to get wrong.
- Add ARIA only where no native element expresses the role. Wrong ARIA is worse than none.
- Give inputs the right `type`, `inputmode`, and `autocomplete` values, such as `type="email"` and `autocomplete="one-time-code"`, so phones show the right keyboard and browsers can fill them.
- Style focus with `:focus-visible`. Never remove the outline without a replacement that meets 3:1 contrast.
- Never disable zoom in the viewport meta tag.
- Respect `prefers-reduced-motion` and `prefers-color-scheme` when the product supports a dark theme, and set `color-scheme` so native controls and scrollbars match.
- Lay out by content, not by device: let components respond to the space they have, with container queries where a component appears at several widths.

## Checking Interaction

Operate the interface, not just its screenshot:

- Complete the main task with the keyboard alone: Tab through every control in order, operate each one, and confirm focus is always visible.
- Submit each form empty, with invalid values, and twice quickly.
- Load each view with no data, one item, and many, and with the network slowed and failing.
- Use it at a narrow phone width with touch emulation, and at 200% zoom.
- Read every button, label, and message on its own and confirm it says what happens or what to do.
