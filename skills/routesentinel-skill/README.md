# routesentinel-skill

Official skill package for RouteSentinel (OKX Build X / SkillArena).

## Folder Layout

- `plugin.yaml` (required)
- `.claude-plugin/plugin.json` (required)
- `SKILL.md` (required)
- `references/` (optional docs)
- `LICENSE` (recommended)

## Local Usage

Run from repository root:

```bash
npm run judge -- --wallet <wallet> --chain xlayer
npm run phasec -- --from <from_token> --amount <ui_amount> --chain xlayer --wallet <wallet>
```

## Why This Skill

- Protects users with pre-trade and pre-execution risk checks.
- Uses route-quality checks to avoid poor liquidity paths.
- Produces transparent evidence artifacts for judges and users.
