// @praxis/keys — shared platform-credential services. Importable by both the web
// app (admin UI) and the orchestrator (agent-spawn auth), which is why this lives
// in a package rather than apps/web/lib (ADR-0009 / STORY-09).
export {
  NoPlatformKeyError,
  deactivateActivePlatformKey,
  getActivePlatformKey,
  getActivePlatformKeyMeta,
  maskKey,
  setActivePlatformKey,
  tryGetActivePlatformKey,
  type KeyProvider,
  type PlatformKeyMeta,
} from './platform-keys';
