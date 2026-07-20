# Review package Task 1
BASE: 63df325501128c4cf3f4f6b79df37eb3b03034bf
HEAD: 05d385efba6901c21b2ef203dc70521d8b060bb3

## Commits
05d385e feat: add Cubi brand constants and icon assets

## Stat
 frontend/app/icon.png         | Bin 0 -> 71918 bytes
 frontend/public/cubi-icon.png | Bin 0 -> 71918 bytes
 lib/brand.test.ts             |   9 +++++++++
 lib/brand.ts                  |   2 ++
 4 files changed, 11 insertions(+)

## Diff
```
diff --git a/frontend/app/icon.png b/frontend/app/icon.png
new file mode 100644
index 0000000..a132f63
Binary files /dev/null and b/frontend/app/icon.png differ
diff --git a/frontend/public/cubi-icon.png b/frontend/public/cubi-icon.png
new file mode 100644
index 0000000..a132f63
Binary files /dev/null and b/frontend/public/cubi-icon.png differ
diff --git a/lib/brand.test.ts b/lib/brand.test.ts
new file mode 100644
index 0000000..5fdc9cf
--- /dev/null
+++ b/lib/brand.test.ts
@@ -0,0 +1,9 @@
+import { describe, expect, it } from "vitest";
+import { APP_ICON_SRC, APP_NAME } from "./brand";
+
+describe("brand", () => {
+  it("exposes Cubi name and public icon path", () => {
+    expect(APP_NAME).toBe("Cubi");
+    expect(APP_ICON_SRC).toBe("/cubi-icon.png");
+  });
+});
diff --git a/lib/brand.ts b/lib/brand.ts
new file mode 100644
index 0000000..8922be4
--- /dev/null
+++ b/lib/brand.ts
@@ -0,0 +1,2 @@
+export const APP_NAME = "Cubi";
+export const APP_ICON_SRC = "/cubi-icon.png";

```
