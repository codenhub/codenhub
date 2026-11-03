/// <reference types="astro/client" />

// One rendered icon per module, from `@codenhub/icons/vite`. See its docs,
// "Vite plugin § One module per icon".
declare module "virtual:@codenhub/icons/*" {
  export const icon: { prefix: string; iconName: string };
  export const svg: string;
  export default svg;
}
