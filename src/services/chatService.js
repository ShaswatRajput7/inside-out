import { supabase } from './supabase'

async function unwrap(request) {
  const { data, error } = await request
  if (error) throw error
  return data
}
export const getProfile = (id) => unwrap(supabase.from('profiles').select('*').eq('id', id).single())
export async function findUser(username) {
  const data = await unwrap(supabase.rpc('lookup_username', { exact_username: username.trim() }))
  return data[0] || null
}
export const createDirect = (id) => unwrap(supabase.rpc('create_direct', { other_user_id: id }))
export const createGroup = (name, ids) => unwrap(supabase.rpc('create_group', { group_name: name, member_ids: ids }))
export const addMember = (id, username) => unwrap(supabase.rpc('add_group_member', { target_conversation: id, exact_username: username }))
export const removeMember = (id, userId) => unwrap(supabase.rpc('remove_group_member', { target_conversation: id, target_user: userId }))
export async function getConversations() {
  const data = await unwrap(supabase.from('conversations').select('id,type,name,created_by,created_at,members:conversation_members(user_id,role,profile:profiles!conversation_members_user_id_fkey(id,username,display_name))').order('created_at', { ascending: false }))
  return data || []
}
export async function getMessages(id, { before, after, forward = false, limit = 50 } = {}) {
  let query = supabase.from('messages').select('id,conversation_id,sender_id,content,created_at,sender:profiles!messages_sender_id_fkey(display_name,username)').eq('conversation_id', id)
  const cursor = before || after
  if (cursor) {
    const op = before ? 'lt' : 'gt'
    query = query.or(`created_at.${op}.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.${op}.${cursor.id})`)
  }
  const ascending = Boolean(after) || forward
  return unwrap(query.order('created_at', { ascending }).order('id', { ascending }).limit(limit))
}
export const sendMessage = (conversationId, senderId, content, id) => unwrap(supabase.from('messages').insert({ id, conversation_id: conversationId, sender_id: senderId, content }).select('id,conversation_id,sender_id,content,created_at,sender:profiles!messages_sender_id_fkey(display_name,username)').single())
