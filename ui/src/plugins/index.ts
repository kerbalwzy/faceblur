/**
 * plugins/index.ts
 *
 * Automatically included in `./src/main.ts`
 */

// Plugins
import vuetify from "./vuetify";
import i18n from "./i18n";
import router from "./router";
import pinia from "./pinia";

// Types
import type { App } from "vue";

export function registerPlugins(app: App) {
  app.use(vuetify);
  app.use(i18n);
  app.use(pinia);
  app.use(router);
}

// export all util functions
export * from "./utils";
