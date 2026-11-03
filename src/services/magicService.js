import { supabase } from './supabase'
import { findMagicEffect, validMagicDuration } from '../lib/magic'

async function checked(request) {
  const { data, error } = await request
  if (error) {
    if (error.code === 'PGRST202' || error.code === '42P01') throw new Error('Chat Magic is not configured yet. Ask the app owner to apply migration 005.')
    throw error
  }
  if (!data?.[0]?.server_now) throw new Error('Chat Magic could not sync. Please try again.')
  return data[0]
}
export const getConversationMagic = (id) => checked(supabase.rpc('get_conversation_magic', { target_conversation: id }))
export function setConversationMagic(id, effectId, seconds = 3600) {
  if (effectId !== null && (!findMagicEffect(effectId) || !validMagicDuration(seconds))) throw new Error('Choose an atmosphere and a duration from 1 minute to 24 hours.')
  return checked(supabase.rpc('set_conversation_magic', { target_conversation: id, effect_key: effectId, duration_seconds: seconds }))
}
