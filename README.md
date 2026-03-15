# Big Book Search (Mobile Web)

A simple mobile-first website that:

- Stores a sobriety date and shows elapsed sober time.
- Loads Big Book text from the provided PDF URL.
- Builds an in-browser search index and caches it in local storage.
- Shows predictive search suggestions while typing.
- Displays searchable matches and allows opening the full paragraph with light-blue highlighted terms.

## Run locally

```bash
python -m http.server 4173
```

Then open `http://localhost:4173`.

## Notes

- The first load can take time because the PDF must be downloaded and indexed.
- Indexed content is cached in `localStorage` for faster subsequent use.

- If UI changes do not appear immediately in the browser, do a hard refresh to bypass cached static assets.
- If the remote PDF host is blocked by network/CORS, the app now falls back to a built-in local recovery index so predictive search still works.
