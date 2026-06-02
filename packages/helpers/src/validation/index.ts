export { ok, err } from "../result";
export type { Result, Ok, Err } from "../result";

export { coerce } from "./coerce";
export { custom } from "./custom";

import { string } from "./string";
import { number } from "./number";
import { object } from "./object";
import { array } from "./array";

export const val = { string, number, object, array };
