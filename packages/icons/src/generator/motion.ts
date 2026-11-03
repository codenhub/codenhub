/**
 * Shared whole-element motion definitions for CSS and Tailwind.
 * @internal
 */
export const ICON_MOTIONS: Record<
  string,
  { duration: string; easing: string; keyframes: Record<string, Record<string, string>> }
> = {
  spin: {
    duration: "1s",
    easing: "linear",
    keyframes: { from: { transform: "rotate(0deg)" }, to: { transform: "rotate(360deg)" } },
  },
  pulse: {
    duration: "2s",
    easing: "ease-in-out",
    keyframes: { "0%, 100%": { opacity: "1" }, "50%": { opacity: "0.55" } },
  },
  beat: {
    duration: "1s",
    easing: "ease-in-out",
    keyframes: {
      "0%, 40%, 100%": { transform: "scale(1)" },
      "10%, 25%": { transform: "scale(1.1)" },
      "17.5%, 32.5%": { transform: "scale(1)" },
    },
  },
  bounce: {
    duration: "1s",
    easing: "ease-in-out",
    keyframes: { "0%, 100%": { transform: "translateY(0)" }, "50%": { transform: "translateY(-15%)" } },
  },
  wiggle: {
    duration: "1s",
    easing: "ease-in-out",
    keyframes: {
      "0%, 100%": { transform: "rotate(0deg)" },
      "25%": { transform: "rotate(-6deg)" },
      "75%": { transform: "rotate(6deg)" },
    },
  },
};

/**
 * Selector suffix matching an `ic-on-hover` icon at rest: neither it nor its
 * parent is hovered, its parent has no visible focus, and no `ic-trigger`
 * ancestor is hovered or has visible focus. See docs/internal/motion.md.
 * @param prefix - Class prefix.
 * @internal
 */
export function motionRestSelector(prefix: string): string {
  return `:not(:hover):not(:hover > *):not(:focus-visible > *):not(.${prefix}-trigger:hover *):not(.${prefix}-trigger:focus-visible *)`;
}
