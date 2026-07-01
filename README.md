# Voxel Game

Browser foundation for a voxel PWA survival shooter prototype.

## Local Development

Install dependencies:

```sh
npm install
```

Start the Vite dev server:

```sh
npm run dev
```

Create a production build:

```sh
npm run build
```

Preview the production build locally:

```sh
npm run preview
```

Run TypeScript checks without building:

```sh
npm run typecheck
```

## Project Shape

- Vite + TypeScript app shell without a UI framework.
- Three.js renders a full-screen WebGL canvas.
- PWA manifest, placeholder icons, and service worker plumbing live in `public/`.
