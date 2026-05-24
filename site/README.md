# Engram Landing Page

Static public landing page for the Engram browser extension.

## Local Build

```powershell
npm install
npm run build
```

The build output is written to `dist/`.

## Local Preview

```powershell
npm run dev
```

## Deploy On Vercel

From this folder:

```powershell
vercel
vercel --prod
```

The Vercel project should use `npm run build` and publish `dist/`.
