import esbuild from "esbuild";

const production = process.argv[2] === "production";

const context = await esbuild.context({
  banner: {
    js: "/* Azhen Memory for Obsidian. Built from local TypeScript sources. */",
  },
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: ["obsidian"],
  format: "cjs",
  target: "es2020",
  platform: "browser",
  outfile: "main.js",
  logLevel: "info",
  legalComments: production ? "eof" : "inline",
  minify: production,
  sourcemap: false,
  treeShaking: true,
});

if (production) {
  await context.rebuild();
  await context.dispose();
} else {
  await context.watch();
}
