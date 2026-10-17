# EXAM Planner

A static study-planner web app. No build step, no server.

## Put it on GitHub Pages
1. Create a new repository on GitHub and upload **all files and folders** from this folder (keep the structure).
2. Repo → Settings → Pages → Source: *Deploy from a branch* → Branch: `main` / `(root)` → Save.
3. After a minute your app is live at `https://<your-username>.github.io/<repo-name>/`.
4. On your phone, open that link and choose *Add to Home Screen* / *Install* to use it like an app (works offline).

## Your data
Edits, ticks and Grand Test results are saved in the browser you use (localStorage), not on GitHub.
Use **Back up** in the side panel regularly, and **Restore** to load it on another device.

## Editing the plan
- Subjects, dates and topics: `plan-data.js`
- Look and feel: `styles.css`
- Behaviour: `app.js`
After changing any file, change `CACHE_VERSION` in `sw.js` (e.g. `exam-planner-v2`) so installed copies update.
