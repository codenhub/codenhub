// An ES module resolving the package by its name, as Node.js resolves it.
import { email, type Infer, object, string } from "@codenhub/validation";

export const signup = object({ name: string({ min: 1 }), email: email() });
export const value: Infer<typeof signup> = { name: "Ada", email: "ada@example.com" };
