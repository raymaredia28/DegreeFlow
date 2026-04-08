import { env } from "./config/env.js";
import { createApp } from "./app.js";
import { catalogStorage } from "./storage/catalogStorage.js";

const app = createApp();

app.listen(env.port, () => {
  // eslint-disable-next-line no-console
  console.log(`Server listening on port ${env.port}`);

  catalogStorage.getFullCatalog().then(
    (courses) => console.log(`[startup] Catalog cache warmed (${courses.length} courses)`),
    (err) => console.warn("[startup] Failed to warm catalog cache:", err)
  );
});
