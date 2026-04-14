# routesentinel-skill

Official skill package for Sentinel Agent / RouteSentinel (OKX Build X).

## Folder Layout

- `plugin.yaml` (required)
- `.claude-plugin/plugin.json` (required)
- `SKILL.md` (required)
- `references/` (optional docs)
- `LICENSE` (recommended)

## Local Usage

Run from repository root:

```bash
npm run demo
npm run agent -- --wallet <wallet> --mode dry --iterations 3
npm run judge -- --wallet <wallet> --chain xlayer
```

## Why This Skill

- Acts as an autonomous trade firewall before swap execution.
- Uses route-quality + token + tx risk checks with fail-closed decisions.
- Produces transparent machine logs and proofboard artifacts.
