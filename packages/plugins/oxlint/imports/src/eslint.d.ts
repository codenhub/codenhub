declare module "eslint" {
  export namespace Rule {
    export interface RuleModule {
      meta?: {
        type?: string;
        docs?: {
          description?: string;
          category?: string;
          recommended?: boolean;
          url?: string;
        };
        schema?: any[];
        messages?: Record<string, string>;
      };
      create(context: any): any;
    }
  }
}
