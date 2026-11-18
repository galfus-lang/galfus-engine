# Galfus Engine Release Package

Each native release archive is scoped to one operating system, CPU architecture, and Linux C library ABI. Extract the archive as a whole; the generated SDKs load the native libraries from the adjacent `lib/` directory.

```text
galfus-engine-<version>-<target>/
├── LICENSE-NotoSans.txt
├── LICENSE-NotoColorEmoji.txt
├── lib/
│   ├── libgalfus_native.so | libgalfus_native.dylib | galfus_native.dll
│   └── galfus.node
└── sdk/
    ├── bun/
    ├── c/
    ├── csharp/
    ├── lua/
    ├── node/
    ├── python/
    └── typescript/
```

The Bun, Node.js, Python, and Lua SDKs locate the bundled library automatically. C and C# applications must copy the matching native library from `lib/` beside their executable or configure their platform's normal dynamic-library search path.

The browser archive contains the `wasm-bindgen` web output in `browser/` and the Noto font licenses in its root. Serve those generated files from a web server and import the generated JavaScript module.

All builds embed Noto Sans and Noto Color Emoji, distributed under the SIL Open Font License 1.1. Include both accompanying font licenses and copyright notices when redistributing binaries containing them.

Every archive has an adjacent `.md5` file in the GitHub Release. Verify it after downloading:

```bash
md5sum -c galfus-engine-<version>-<target>.tar.gz.md5
```
