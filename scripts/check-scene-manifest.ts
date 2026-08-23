/**
 * Scene-manifest and Overworld content-contract check (ARCH-003, ARCH-014,
 * ARCH-015, ARCH-016, ARCH-022, REQ-017, REQ-035, REQ-117, REQ-136,
 * PVS-FLW-001, PVS-FLW-022, PVS-WEB-003).
 *
 * `bun run check:scene-manifest` reads the real public content catalog
 * (`src/core/content`) and proves:
 *   - the Scene catalog and startup Scene manifest contract (frozen records,
 *     unique IDs, committed authored glTF 2.0 assets);
 *   - the Overworld content contract (frozen records, 1:1 production scale,
 *     start position and settlement boundary exactly 1.5 world units apart,
 *     route representing 0.5 Overworld day at 3 world units per day, all
 *     navigation anchors on traversable ground, unique IDs, and destination
 *     schema extensibility).
 *
 * The command uses no injected or recording test collaborator: it imports
 * the real catalog and resolves the same asset source the production
 * loader fetches (REQ-136). The command exits 0 when the contract holds
 * and 1 otherwise, listing each rejection. `scripts/ci-check.py` runs it
 * in general CI.
 */
import { existsSync, readFileSync, statSync } from 'node:fs'
import { isAbsolute, relative, resolve } from 'node:path'
import { OVERWORLD, SCENES } from '../src/core/content'
import type {
  OverworldContent,
  OverworldDestinationContent,
  SceneContent,
  TraversableGround,
  WorldPosition,
} from '../src/core/content'

/** The repo directory that serves the authored asset sources to the built product. */
export const PUBLIC_ASSETS_DIR = 'public'

/**
 * Validate the authored Scene catalog contract (ARCH-016, REQ-136).
 *
 * Returns the list of rejection reasons; an empty list means the Scene
 * catalog and every Scene and asset record and list is frozen, every Scene
 * and asset ID is unique, the startup Scene `poc-overworld` contains the
 * glTF asset `poc-overworld-environment`, and every asset source resolves
 * to a committed authored glTF 2.0 file under `public/`.
 */
export function validateSceneManifest(
  scenes: readonly SceneContent[],
  resolveAsset: (source: string) => string | null,
): string[] {
  const rejections: string[] = []

  // The catalog itself must be frozen: a mutable manifest root fails the
  // content contract (ARCH-016).
  if (!Object.isFrozen(scenes)) {
    rejections.push('The Scene catalog is not frozen.')
  }

  const sceneIds = new Set<string>()
  const assetIds = new Set<string>()

  for (const scene of scenes) {
    if (!Object.isFrozen(scene)) {
      rejections.push(`Scene ${scene.id} is not frozen.`)
    }
    if (!Object.isFrozen(scene.assets)) {
      rejections.push(`Scene ${scene.id} asset list is not frozen.`)
    }
    if (sceneIds.has(scene.id)) {
      rejections.push(`Duplicate Scene ID ${scene.id}.`)
    }
    sceneIds.add(scene.id)

    for (const asset of scene.assets) {
      if (!Object.isFrozen(asset)) {
        rejections.push(`Scene ${scene.id} asset ${asset.id} is not frozen.`)
      }
      if (assetIds.has(asset.id)) {
        rejections.push(`Duplicate asset ID ${asset.id}.`)
      }
      assetIds.add(asset.id)
      if (asset.kind !== 'gltf') {
        rejections.push(`Scene ${scene.id} asset ${asset.id} is not an authored glTF asset.`)
      }
      const assetFile = resolveAsset(asset.source)
      if (assetFile === null || !isAuthoredGltfFile(assetFile)) {
        rejections.push(
          `Scene ${scene.id} asset ${asset.id} source ${asset.source} does not resolve to a committed authored glTF 2.0 file under ${PUBLIC_ASSETS_DIR}/.`,
        )
      }
    }
  }

  // The startup Scene contract (REQ-136): `poc-overworld` contains
  // `poc-overworld-environment`.
  const startupScene = scenes.find((scene) => scene.id === 'poc-overworld')
  if (startupScene === undefined) {
    rejections.push('The catalog contains no startup Scene poc-overworld.')
  } else if (!startupScene.assets.some((asset) => asset.id === 'poc-overworld-environment')) {
    rejections.push('The startup Scene poc-overworld does not contain poc-overworld-environment.')
  }

  return rejections
}

/**
 * Whether a 3D position falls within the authored traversable ground bounds (ARCH-015, ARCH-016).
 */
export function isPositionInTraversableGround(
  position: WorldPosition,
  bounds: TraversableGround,
): boolean {
  return (
    position.x >= bounds.minX &&
    position.x <= bounds.maxX &&
    position.z >= bounds.minZ &&
    position.z <= bounds.maxZ
  )
}

/**
 * Calculate Euclidean distance between two 3D world positions (ARCH-016).
 */
export function distanceBetween(a: WorldPosition, b: WorldPosition): number {
  const dx = a.x - b.x
  const dy = a.y - b.y
  const dz = a.z - b.z
  return Math.hypot(dx, dy, dz)
}

/**
 * Validate one destination record according to the generic destination schema (ARCH-016, REQ-035).
 *
 * Confirms that the record and its nested structures are deeply frozen, has
 * valid non-empty string identifiers, valid 3D coordinates, and a positive
 * entry boundary radius without requiring destination-specific fields.
 */
export function validateDestinationRecord(destination: OverworldDestinationContent): string[] {
  const rejections: string[] = []

  if (!Object.isFrozen(destination)) {
    rejections.push(`Destination ${destination.id ?? 'unknown'} is not frozen.`)
  }
  if (!destination.id || typeof destination.id !== 'string') {
    rejections.push('Destination ID must be a non-empty string.')
  }
  if (!destination.name || typeof destination.name !== 'string') {
    rejections.push(`Destination ${destination.id} name must be a non-empty string.`)
  }
  if (!destination.targetSceneId || typeof destination.targetSceneId !== 'string') {
    rejections.push(`Destination ${destination.id} targetSceneId must be a non-empty string.`)
  }
  if (!destination.position || !Object.isFrozen(destination.position)) {
    rejections.push(`Destination ${destination.id} position must be a frozen object.`)
  } else if (
    !Number.isFinite(destination.position.x) ||
    !Number.isFinite(destination.position.y) ||
    !Number.isFinite(destination.position.z)
  ) {
    rejections.push(`Destination ${destination.id} position must contain finite numbers.`)
  }
  if (!destination.entryBoundary || !Object.isFrozen(destination.entryBoundary)) {
    rejections.push(`Destination ${destination.id} entryBoundary must be a frozen object.`)
  } else {
    if (!destination.entryBoundary.position || !Object.isFrozen(destination.entryBoundary.position)) {
      rejections.push(`Destination ${destination.id} entryBoundary.position must be a frozen object.`)
    } else if (
      !Number.isFinite(destination.entryBoundary.position.x) ||
      !Number.isFinite(destination.entryBoundary.position.y) ||
      !Number.isFinite(destination.entryBoundary.position.z)
    ) {
      rejections.push(`Destination ${destination.id} entryBoundary.position must contain finite numbers.`)
    }
    if (!Number.isFinite(destination.entryBoundary.radius) || destination.entryBoundary.radius <= 0) {
      rejections.push(`Destination ${destination.id} entryBoundary.radius must be a positive number.`)
    }
  }

  return rejections
}

/**
 * Validate the authored Overworld content record contract (ARCH-003, ARCH-014,
 * ARCH-015, ARCH-016, REQ-017, REQ-035, REQ-117, PVS-FLW-001, PVS-FLW-022).
 *
 * Returns the list of rejection reasons; an empty list means:
 *   - the Overworld record and all nested records and arrays are deeply frozen;
 *   - the production scale is exactly 1.0 (1:1 scale);
 *   - the start position and settlement entry boundary are exactly 1.5 world units apart;
 *   - the route represents exactly 0.5 Overworld day at 3 world units per day;
 *   - every coordinate and camera value uses the one production scale;
 *   - every navigation anchor belongs to traversable ground;
 *   - all IDs are unique and stable;
 *   - destinations are stored as a collection that validates through the generic schema.
 */
export function validateOverworldContent(overworld: OverworldContent): string[] {
  const rejections: string[] = []

  // 1. Deep freezing checks
  if (!Object.isFrozen(overworld)) {
    rejections.push('The Overworld content record is not frozen.')
  }
  if (!overworld.startPosition || !Object.isFrozen(overworld.startPosition)) {
    rejections.push('The Overworld startPosition is not frozen.')
  }
  if (!overworld.travel || !Object.isFrozen(overworld.travel)) {
    rejections.push('The Overworld travel tuning record is not frozen.')
  }
  if (!overworld.traversableGround || !Object.isFrozen(overworld.traversableGround)) {
    rejections.push('The Overworld traversableGround record is not frozen.')
  }
  if (!overworld.navigationAnchors || !Object.isFrozen(overworld.navigationAnchors)) {
    rejections.push('The Overworld navigationAnchors collection is not frozen.')
  }
  if (!overworld.destinations || !Object.isFrozen(overworld.destinations)) {
    rejections.push('The Overworld destinations collection is not frozen.')
  }
  if (!overworld.cameraBounds || !Object.isFrozen(overworld.cameraBounds)) {
    rejections.push('The Overworld cameraBounds record is not frozen.')
  }
  if (!overworld.presentationNodes || !Object.isFrozen(overworld.presentationNodes)) {
    rejections.push('The Overworld presentationNodes record is not frozen.')
  }

  // 2. Production scale check (ARCH-016)
  if (overworld.productionScale !== 1.0) {
    rejections.push(
      `The Overworld production scale must be exactly 1.0 (found ${overworld.productionScale}).`,
    )
  }

  // 3. Stable ID and name checks (ARCH-016)
  if (overworld.id !== 'poc-overworld') {
    rejections.push(
      `The Overworld ID must be the stable root Scene ID poc-overworld (found ${overworld.id}).`,
    )
  }
  if (!overworld.name || typeof overworld.name !== 'string') {
    rejections.push('The Overworld name must be a non-empty string.')
  }

  // 4. Traversable ground boundaries
  const ground = overworld.traversableGround
  if (
    !ground ||
    !Number.isFinite(ground.minX) ||
    !Number.isFinite(ground.maxX) ||
    !Number.isFinite(ground.minZ) ||
    !Number.isFinite(ground.maxZ) ||
    ground.minX >= ground.maxX ||
    ground.minZ >= ground.maxZ
  ) {
    rejections.push('The Overworld traversableGround must define valid finite min/max bounds.')
  }

  // 5. Start position validation
  const start = overworld.startPosition
  if (
    !start ||
    !Number.isFinite(start.x) ||
    !Number.isFinite(start.y) ||
    !Number.isFinite(start.z)
  ) {
    rejections.push('The Overworld startPosition must contain finite numeric coordinates.')
  } else if (ground && !isPositionInTraversableGround(start, ground)) {
    rejections.push(
      `The Overworld startPosition (${start.x}, ${start.y}, ${start.z}) is outside traversable ground.`,
    )
  }

  // 6. Navigation anchors validation (ARCH-014, ARCH-015, REQ-117)
  const anchorIds = new Set<string>()
  if (!overworld.navigationAnchors || overworld.navigationAnchors.length === 0) {
    rejections.push('The Overworld navigationAnchors collection must not be empty.')
  } else {
    for (const anchor of overworld.navigationAnchors) {
      if (!Object.isFrozen(anchor)) {
        rejections.push(`Navigation anchor ${anchor.id ?? 'unknown'} is not frozen.`)
      }
      if (!anchor.id || typeof anchor.id !== 'string') {
        rejections.push('Navigation anchor ID must be a non-empty string.')
      } else if (anchorIds.has(anchor.id)) {
        rejections.push(`Duplicate navigation anchor ID ${anchor.id}.`)
      } else {
        anchorIds.add(anchor.id)
      }

      if (!anchor.position || !Object.isFrozen(anchor.position)) {
        rejections.push(`Navigation anchor ${anchor.id} position must be a frozen object.`)
      } else if (
        !Number.isFinite(anchor.position.x) ||
        !Number.isFinite(anchor.position.y) ||
        !Number.isFinite(anchor.position.z)
      ) {
        rejections.push(`Navigation anchor ${anchor.id} position must contain finite numbers.`)
      } else if (ground && !isPositionInTraversableGround(anchor.position, ground)) {
        rejections.push(
          `Navigation anchor ${anchor.id} position (${anchor.position.x}, ${anchor.position.y}, ${anchor.position.z}) is outside traversable ground.`,
        )
      }
    }
  }

  // 7. Destinations collection and schema validation (REQ-035, PVS-FLW-022)
  const destinationIds = new Set<string>()
  if (!overworld.destinations || overworld.destinations.length === 0) {
    rejections.push('The Overworld destinations collection must not be empty.')
  } else {
    for (const destination of overworld.destinations) {
      if (destinationIds.has(destination.id)) {
        rejections.push(`Duplicate destination ID ${destination.id}.`)
      }
      destinationIds.add(destination.id)

      const destRejections = validateDestinationRecord(destination)
      rejections.push(...destRejections)

      if (
        ground &&
        destination.entryBoundary?.position &&
        !isPositionInTraversableGround(destination.entryBoundary.position, ground)
      ) {
        rejections.push(
          `Destination ${destination.id} entry boundary position is outside traversable ground.`,
        )
      }
    }
  }

  // 8. Settlement entry boundary and start distance check (REQ-017, PVS-FLW-001)
  const settlement = overworld.destinations?.find((d) => d.id === 'poc-settlement')
  if (!settlement) {
    rejections.push('The Overworld destinations must contain the settlement destination poc-settlement.')
  } else if (start && settlement.entryBoundary?.position) {
    const dist = distanceBetween(start, settlement.entryBoundary.position)
    if (Math.abs(dist - 1.5) > 1e-9) {
      rejections.push(
        `The start position and settlement entry boundary must be exactly 1.5 world units apart (found ${dist}).`,
      )
    }
  }

  // 9. Travel tuning and route duration check (REQ-017, REQ-018, REQ-082, PVS-FLW-004)
  const travel = overworld.travel
  if (!travel) {
    rejections.push('The Overworld travel tuning record is missing.')
  } else {
    if (travel.speedWorldUnitsPerDay !== 3.0) {
      rejections.push(
        `Normal travel speed must be exactly 3.0 world units per Overworld day (found ${travel.speedWorldUnitsPerDay}).`,
      )
    }
    if (travel.realSecondsPerOverworldHour !== 5.0) {
      rejections.push(
        `Real seconds per Overworld hour at 1× speed must be 5.0 (found ${travel.realSecondsPerOverworldHour}).`,
      )
    }
    if (travel.hoursPerOverworldDay !== 24) {
      rejections.push(
        `Hours per Overworld day must be 24 (found ${travel.hoursPerOverworldDay}).`,
      )
    }
    if (travel.provisionsPerMemberPerDay !== 0.2) {
      rejections.push(
        `Provisions consumption rate must be 0.2 per member per day (found ${travel.provisionsPerMemberPerDay}).`,
      )
    }

    if (start && settlement?.entryBoundary?.position && travel.speedWorldUnitsPerDay > 0) {
      const dist = distanceBetween(start, settlement.entryBoundary.position)
      const routeDays = dist / travel.speedWorldUnitsPerDay
      if (Math.abs(routeDays - 0.5) > 1e-9) {
        rejections.push(
          `The route must represent exactly 0.5 Overworld day at 3 world units per day (calculated ${routeDays} day(s)).`,
        )
      }
    }
  }

  // 10. Camera bounds validation (ARCH-016, PVS-FLW-002)
  const camera = overworld.cameraBounds
  if (!camera) {
    rejections.push('The Overworld cameraBounds record is missing.')
  } else {
    if (
      !Number.isFinite(camera.minDistance) ||
      !Number.isFinite(camera.maxDistance) ||
      !Number.isFinite(camera.defaultDistance) ||
      camera.minDistance <= 0 ||
      camera.minDistance > camera.defaultDistance ||
      camera.defaultDistance > camera.maxDistance
    ) {
      rejections.push(
        'The Overworld cameraBounds distance must satisfy 0 < minDistance <= defaultDistance <= maxDistance.',
      )
    }
    if (
      !Number.isFinite(camera.minPitch) ||
      !Number.isFinite(camera.maxPitch) ||
      !Number.isFinite(camera.defaultPitch) ||
      camera.minPitch <= 0 ||
      camera.minPitch > camera.defaultPitch ||
      camera.defaultPitch > camera.maxPitch
    ) {
      rejections.push(
        'The Overworld cameraBounds pitch must satisfy 0 < minPitch <= defaultPitch <= maxPitch.',
      )
    }
    if (!Number.isFinite(camera.fov) || camera.fov <= 0 || camera.fov >= 180) {
      rejections.push('The Overworld cameraBounds fov must be between 0 and 180 degrees.')
    }
  }

  // 11. Presentation node IDs validation (ARCH-016, REQ-170)
  const nodes = overworld.presentationNodes
  if (!nodes) {
    rejections.push('The Overworld presentationNodes record is missing.')
  } else {
    if (nodes.bandPawnNodeId !== 'poc-band-pawn') {
      rejections.push(
        `The Overworld presentationNodes bandPawnNodeId must be poc-band-pawn (found ${nodes.bandPawnNodeId}).`,
      )
    }
    if (nodes.idleAnimationClip !== 'poc-band-idle') {
      rejections.push(
        `The Overworld presentationNodes idleAnimationClip must be poc-band-idle (found ${nodes.idleAnimationClip}).`,
      )
    }
    if (nodes.travelAnimationClip !== 'poc-band-travel') {
      rejections.push(
        `The Overworld presentationNodes travelAnimationClip must be poc-band-travel (found ${nodes.travelAnimationClip}).`,
      )
    }
    if (nodes.terrainNodeId !== 'poc-overworld-terrain') {
      rejections.push(
        `The Overworld presentationNodes terrainNodeId must be poc-overworld-terrain (found ${nodes.terrainNodeId}).`,
      )
    }
    if (nodes.settlementLandmarkNodeId !== 'poc-settlement-landmark') {
      rejections.push(
        `The Overworld presentationNodes settlementLandmarkNodeId must be poc-settlement-landmark (found ${nodes.settlementLandmarkNodeId}).`,
      )
    }

    const presentationNodeIds = [
      nodes.bandPawnNodeId,
      nodes.terrainNodeId,
      nodes.settlementLandmarkNodeId,
    ].filter((id) => typeof id === 'string')
    const uniqueNodeIds = new Set(presentationNodeIds)
    if (uniqueNodeIds.size !== presentationNodeIds.length) {
      rejections.push('The Overworld presentation node IDs must be unique.')
    }

    if (nodes.idleAnimationClip === nodes.travelAnimationClip) {
      rejections.push('The Overworld idle and travel animation clip names must be distinct.')
    }
  }
  return rejections
}

/**
 * Resolve an authored asset source to its committed file under `public/`.
 *
 * Returns `null` when the source escapes the `public/` assets directory —
 * a relative `..` segment, an absolute path, or an empty source — so the
 * content contract can never resolve an asset outside the served assets.
 */
export function resolvePublicAsset(projectRoot: string, source: string): string | null {
  const publicRoot = resolve(projectRoot, PUBLIC_ASSETS_DIR)
  const resolved = resolve(publicRoot, source)
  const rest = relative(publicRoot, resolved)
  if (rest === '' || rest.startsWith('..') || isAbsolute(rest)) {
    return null
  }
  return resolved
}

/**
 * Whether `file` is a committed authored glTF 2.0 file, not an arbitrary
 * existing file (ARCH-016, REQ-136).
 *
 * The authored startup asset is a glTF 2.0 JSON document declaring exactly
 * the asset version `2.0`; a file that does not exist, is not a file, does
 * not parse, or declares any other asset version (`1.0`, `2.1`, `20.0`,
 * `2.0.0`, `2evil`) is rejected, so a placeholder file can never satisfy
 * the content contract.
 */
export function isAuthoredGltfFile(file: string): boolean {
  if (!existsSync(file) || !statSync(file).isFile()) {
    return false
  }
  try {
    const gltf = JSON.parse(readFileSync(file, 'utf8')) as {
      asset?: { version?: unknown }
    }
    // glTF 2.0 assets declare exactly the asset version `2.0`.
    return gltf.asset?.version === '2.0'
  } catch {
    return false
  }
}

/** Run the Scene-manifest and Overworld content-contract checks against the real catalog. */
async function main(): Promise<void> {
  const projectRoot = process.cwd()
  const sceneRejections = validateSceneManifest(SCENES, (source) =>
    resolvePublicAsset(projectRoot, source),
  )
  const overworldRejections = validateOverworldContent(OVERWORLD)

  const allRejections = [...sceneRejections, ...overworldRejections]

  for (const rejection of allRejections) {
    console.error(`Manifest contract rejected: ${rejection}`)
  }

  if (allRejections.length > 0) {
    console.error(`Scene-manifest check failed: ${allRejections.length} rejection(s).`)
    process.exit(1)
  }

  console.log(
    `Scene-manifest check OK: ${SCENES.length} Scene(s), Overworld record at 1:1 scale, 1.5-world-unit route (0.5 day at 3 units/day), traversable anchors, unique IDs, and committed authored glTF assets.`,
  )
}

if (import.meta.main) {
  await main()
}
