# Motion Studio

A **studio for quick videos, GIFs and device mockups** that runs on your own
machine. Drop in images or video, pick one of **224 motion presets**, tweak live
controls, stack motion tracks on one timeline, and export MP4 / WebM / GIF —
encoded in the browser, no upload, no account.

**Live demo:** https://akshayxktp.github.io/3D-Mockup-Tool/

## Credits

Forked from [appariciojunior/motion-studio-open](https://github.com/appariciojunior/motion-studio-open),
which is the work of Davi Mattos, Quefreen Almeida, appariciojunior and other
contributors, and is licensed under Apache-2.0. The git history in this
repository was squashed to a single commit; the original history lives in the
upstream project.

This copy adds, in the Mockup section:

- PNG image export at 1K–8K, with an optional transparent background
- Radial defocus with bokeh and click-to-focus
- Body and Glass exposure as separate controls
- Light Softness for the key light
- Extra device finishes (iPhone 17 Pro in Sky Blue, Plum and Black; iPhone Air in Black)
- 3×3 and 6×6 composition guides

See [MODIFICATIONS.md](MODIFICATIONS.md) for the per-file breakdown required by
Apache-2.0 section 4(b), and [NOTICE](NOTICE) for third-party attributions.

## Running locally

```bash
npm install
npm run dev
```

## Licence

Apache-2.0 — see [LICENSE](LICENSE).
