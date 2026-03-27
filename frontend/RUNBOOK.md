# Jaffa Frontend Runbook

Run the frontend from `c:\Users\pc\Desktop\ipl\jaffa\frontend`.

Use these commands on this Windows machine:

```powershell
npm.cmd run dev
npm.cmd run typecheck
npm.cmd run build
```

Notes:

- The default `dev` script uses webpack for stability.
- `npm.cmd run dev:turbo` is available only for later validation.
- Do not start the frontend from the parent `jaffa` folder.
- The frontend needs a healthy backend on `http://localhost:5000` for `/api/*` and `/socket.io/*` to work.
- If the backend is already running, starting only the frontend is enough for local testing.
- Do not run backend and frontend watch commands together until frontend-only startup is stable.
