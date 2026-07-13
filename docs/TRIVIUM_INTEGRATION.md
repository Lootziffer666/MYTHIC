# MYTHIC ↔ TRIVIUM Integration Contract

## Role

TRIVIUM plans how a source becomes a target realization. MYTHIC provisions and executes the required toolchain, builds the resulting runtime modules and deploys them.

TRIVIUM is usually a build stage, not a long-running service. MYTHIC should support both embedded CLI execution and an optional future TRIVIUM service.

## Toolchain execution

A TRIVIUM plan may request:

- Blender headless
- Unity or Unreal editor commandlets/plugins
- Godot headless
- FFmpeg, image and atlas tools
- rig, shader, terrain, voxel, SDF or scene converters
- commercial tools with local license requirements

MYTHIC should resolve these from a capability manifest rather than hardcoded project scripts.

```yaml
tool:
  id: blender
  version: 4.x
  capabilities: [import_gltf, render_frames, bake, export_fbx]
  execution: container_or_host
  license: GPL
```

## Reproducibility requirements

Every job must record:

- tool versions and image hashes
- exact commands/configuration
- source and output hashes
- environment requirements
- exit status and logs
- produced evidence bundle

Secrets and commercial licenses remain runtime concerns and must not be written into TRIVIUM contracts or repositories.

## Multi-engine builds

MYTHIC must permit one project manifest to build multiple scene runners or chapters. Each runtime may be packaged independently and connected through ANVIL handoff contracts.

```text
shared world state / launcher
├── Unreal scene module
├── Unity scene module
├── Godot scene module
└── audio or narrative module
```

A deployment does not require all engines to run simultaneously. Preload, launch, suspend and handoff strategies are target-platform decisions.

## Failure behavior

- Missing capability: return `unavailable`, never silently substitute.
- Tool execution failure: preserve inputs and partial evidence.
- Contract not satisfied: do not mark deployment complete.
- Commercial tool unavailable: offer an explicitly lower-confidence open route if registered.

## Boundaries

MYTHIC does not:

- choose creative meaning
- invent conversion mappings
- judge semantic equivalence
- place credentials in generated artifacts

## Canonical references

- Tool candidates: https://github.com/Lootziffer666/TRIVIUM/blob/docs/semantic-realization-direction/docs/tool-candidate-catalog.md
- Architecture: https://github.com/Lootziffer666/TRIVIUM/blob/docs/semantic-realization-direction/docs/architecture-v1.1.md
- Realization contracts: https://github.com/Lootziffer666/TRIVIUM/blob/docs/semantic-realization-direction/docs/realization-contracts.md
