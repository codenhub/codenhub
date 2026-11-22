// Shared by the jsdom suite and the browser suite, which passes `findEscapingContainers` to `page.evaluate`, so the
// function reads only its argument and the page's globals.

/** Every element name the HTML standard defines or lists as obsolete, including those its parser still treats specially. */
export const HTML_ELEMENT_NAMES: readonly string[] = `
  a abbr acronym address applet area article aside audio b base basefont bdi bdo bgsound big blink blockquote body
  br button canvas caption center cite code col colgroup data datalist dd del details dfn dialog dir div dl dt em
  embed fieldset figcaption figure font footer form frame frameset h1 h2 h3 h4 h5 h6 head header hgroup hr html i
  iframe image img input ins isindex kbd keygen label legend li link listing main map mark marquee math menu
  menuitem meta meter multicol nav nextid nobr noembed noframes noscript object ol optgroup option output p param
  picture plaintext pre progress q rb rp rt rtc ruby s samp script search section select selectedcontent slot small
  source spacer span strike strong style sub summary sup svg table tbody td template textarea tfoot th thead time
  title tr track tt u ul var video wbr xmp
`
  .trim()
  .split(/\s+/u);

/**
 * The elements whose content the binding skips. `findEscapingContainers` found all of them but `plaintext`, which reads
 * the rest of the page as text, and `template`, which serializes its `content` rather than its children.
 */
export const BLOCKED_ANCESTOR_NAMES: readonly string[] = [
  "iframe",
  "noembed",
  "noframes",
  "noscript",
  "plaintext",
  "script",
  "style",
  "template",
  "textarea",
  "title",
  "xmp",
];

/** The attribute value a translation would need to close `containerName` and start markup of its own. */
export const breakOutOf = (containerName: string): string => `</${containerName}><img id=escaped>`;

/**
 * The element names whose content lets a nested element's attribute become markup once serialized with `innerHTML`
 * and parsed again, by the page's document (scripting on in a browser) or by `DOMParser` (scripting off).
 */
export const findEscapingContainers = (names: readonly string[]): string[] =>
  names.filter((name) => {
    const container = document.createElement("div");
    const outer = document.createElement(name);
    const inner = document.createElement("span");
    inner.setAttribute("title", `</${name}><img id=escaped>`);
    outer.append(inner);
    container.append(outer);
    const html = container.innerHTML;
    const fragment = document.createElement("div");
    fragment.innerHTML = html;
    const parsed = new DOMParser().parseFromString(`<body>${html}`, "text/html");
    return fragment.querySelector("#escaped") !== null || parsed.querySelector("#escaped") !== null;
  });
