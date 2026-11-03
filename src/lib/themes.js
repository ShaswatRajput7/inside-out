// Artwork is bundled locally. Stable keys are persisted in SQL, never asset URLs.
export const BUILTIN_THEMES = [
  { key: 'grand-line', name: 'Grand Line', inspiration: 'One Piece inspired', description: 'Moonlit seas & a little adventure', image: new URL('../assets/themes/grand-line.svg', import.meta.url).href, color: '#93c9d5' },
  { key: 'purple-hour', name: 'Purple Hour', inspiration: 'BTS inspired', description: 'Seven lights, one purple sky', image: new URL('../assets/themes/purple-hour.svg', import.meta.url).href, color: '#cfb0ed' },
  { key: 'sakura-dream', name: 'Sakura Dream', inspiration: 'Anime · soft fantasy', description: 'Petals drifting into the evening', image: new URL('../assets/themes/sakura-dream.svg', import.meta.url).href, color: '#e9b4c6' },
  { key: 'neon-rain', name: 'Neon Rain', inspiration: 'Anime · city nights', description: 'Quiet streets, electric reflections', image: new URL('../assets/themes/neon-rain.svg', import.meta.url).href, color: '#9ab8ed' },
  { key: 'sky-meadow', name: 'Sky Meadow', inspiration: 'Anime · cinematic nature', description: 'A deep breath above the clouds', image: new URL('../assets/themes/sky-meadow.svg', import.meta.url).href, color: '#a9d4be' },
]
export const DEFAULT_THEME = Object.freeze({ kind: 'default', builtin_key: null, custom_path: null })
export const findBuiltinTheme = (key) => BUILTIN_THEMES.find((theme) => theme.key === key)
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const CUSTOM_PATH = new RegExp(`^${UUID}/${UUID}/${UUID}\\.(webp|jpg|png)$`)
export function normalizeTheme(value, conversationId) {
  if (!value || (conversationId && value.conversation_id !== conversationId)) return DEFAULT_THEME
  if (value.kind === 'builtin' && findBuiltinTheme(value.builtin_key) && !value.custom_path) return value
  if (value.kind === 'custom' && !value.builtin_key && typeof value.custom_path === 'string' &&
    CUSTOM_PATH.test(value.custom_path) &&
    (!conversationId || value.custom_path.startsWith(`${conversationId}/`))) return value
  return DEFAULT_THEME
}
