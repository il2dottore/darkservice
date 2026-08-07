# LoadService Backend Development Scripts

The `dev-scripts` directory contains helper programs for building or watching multiple NestJS applications in the LoadService backend monorepo. Both scripts discover application names from `backend/nest-cli.json`, so newly registered Nest applications are picked up automatically.

## Project Map

| File | Responsibility |
|---|---|
| `build.js` | Build all applications, or a selected list, one after another |
| `watch.js` | Start all applications, or a selected list, concurrently in watch mode |

## Prerequisites

- Node.js `>=24`.
- Backend dependencies installed with `pnpm install`.
- Every target registered as an `application` under `projects` in `nest-cli.json`.
- Run commands from the `backend` directory so the Nest configuration and dependencies are available.

The currently discovered applications are:

```text
attack
common
payment
gateway
node-router
```

## Build Applications

Build every registered application sequentially:

```bash
node dev-scripts/build.js
```

Build only selected applications:

```bash
node dev-scripts/build.js common attack
```

For each target, `build.js` runs:

```text
npx nest build <application>
```

The Nest CLI selects the target application's project and TypeScript configuration from `nest-cli.json`. The script stops immediately when one build fails.

The package-level `pnpm build`, `pnpm run build:common`, `pnpm run build:attack`, `pnpm run build:payment`, `pnpm run build:gateway`, and `pnpm run build:node-router` scripts delegate to this helper.

## Watch Applications

Start every registered application in parallel with file watching:

```bash
node dev-scripts/watch.js
```

Start only selected applications:

```bash
node dev-scripts/watch.js common attack
```

The script composes one command per application:

```text
npx nest start <application> --watch
```

It then runs them through `concurrently` with named output streams. The `-k` option stops the remaining processes when one process exits.

## Target Validation

Both scripts validate every command-line target against `nest-cli.json`. An unknown name exits before running any build or service and prints the available applications.

Example:

```bash
node dev-scripts/build.js unknown-service
```

## Useful Checks

```bash
node dev-scripts/build.js common
node dev-scripts/build.js attack
node dev-scripts/build.js payment
node dev-scripts/build.js gateway
node dev-scripts/build.js node-router
```

To verify automatic discovery after editing the Nest configuration, run the script with an invalid target and inspect the printed application list.

## Troubleshooting

- `Unknown application`: add the application to `projects` in `nest-cli.json` or correct the command-line name.
- `npx` or `nest` is unavailable: run `pnpm install` in `backend` and execute the helper from that project.
- A build uses the wrong TypeScript configuration: confirm the application is registered in `nest-cli.json` and that its `tsconfig.app.json` exists.
- Watch mode stops all services: this is expected when one child exits because `concurrently` is invoked with `-k`.
- Watch commands pass the application name directly to `nest start`; Nest selects the matching project configuration.

## Notes For Development

- These helpers are exposed through `package.json` build and development scripts; direct `node dev-scripts/<script>.js` invocation is also supported.
- `build.js` is sequential, while `watch.js` is concurrent.
- Keep application discovery driven by `nest-cli.json` rather than duplicating a service list in these scripts.
- `execSync` receives application names only after allow-list validation against the Nest configuration.
