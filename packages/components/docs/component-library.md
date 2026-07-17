# @codenhub/components Component Library

`@codenhub/components/lib` exports `ChButton`, a native component definition for
the `<ch-button>` custom element. Importing this entrypoint does not register it.

```ts
import { registerComponents } from "@codenhub/components";
import { ChButton } from "@codenhub/components/lib";
import "@codenhub/styles";

registerComponents([ChButton]);
document.body.append(ChButton.create({ label: "Save", variant: "primary" }));
```

The definition renders a native `<button>` in Light DOM.

| Property   | Default     | Behavior                                                                                                                                                 |
| ---------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `label`    | `""`        | Escaped visible button label.                                                                                                                            |
| `variant`  | `"primary"` | CSS class passed to the inner button; known style variants include `primary`, `secondary`, `destructive`, and `ghost`. Values are not runtime-validated. |
| `disabled` | `false`     | Adds the native `disabled` attribute to the inner button.                                                                                                |

The definition declares a `click` event for adapter metadata. Native clicks
from the inner button bubble through the custom element; the component does not
dispatch a separate custom click event.

`@codenhub/styles` is an optional package peer because the core factory can be
used without it. Import it when consumers expect the library button's `.btn`
and variant classes to have the default Codenhub appearance.
