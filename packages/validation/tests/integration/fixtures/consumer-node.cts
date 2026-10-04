// A CommonJS module requiring the ES module package, as Node.js 22.12 and later load it.
import { email, type Infer, object, string } from "@codenhub/validation";

export const signup = object({ name: string({ min: 1 }), email: email() });
export const value: Infer<typeof signup> = { name: "Ada", email: "ada@example.com" };
