# Backend Runbook

Start from [jaffa](c:/Users/pc/Desktop/ipl/jaffa), not from a parent folder.

## Normal Startup

Use:

```powershell
npm.cmd run dev
```

That command checks `http://localhost:5000/api/health` first.

- If a healthy JAFFA backend is already running on port `5000`, it prints a reuse message and exits cleanly.
- If nothing healthy is serving on port `5000`, it starts the backend with `nodemon`.
- The reuse message is a success state, not an error. You do not need a second backend terminal.

## Check Health Manually

```powershell
npm.cmd run health:check
```

Or directly:

```powershell
Invoke-WebRequest -UseBasicParsing http://localhost:5000/api/health
```

Expected payload:

```json
{"status":"ok","timestamp":"..."}
```

## Restart The Backend

If you changed backend code and want a fresh process, stop the current backend first.

Find the port owner:

```powershell
netstat -ano | findstr :5000
```

Inspect the process:

```powershell
Get-Process -Id <PID>
```

Stop it:

```powershell
taskkill /PID <PID> /F
```

Then start one clean backend instance:

```powershell
npm.cmd run dev
```

## Workflow Rule

Use one backend and one frontend during local development.

- Reuse the backend already serving on `5000` when it is healthy.
- Do not launch a second `nodemon` process against the same repo and port.
- Restart only when you actually need fresh backend code to load.
