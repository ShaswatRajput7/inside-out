import { supabase } from './supabase'

const MESSAGE_FIELDS = 'id,conversation_id,sender_id,content,created_at,kind,edited_at,deleted_at,updated_at,sender:profiles!messages_sender_id_fkey(display_name,username),image:chat_image_uploads!messages_image_id_fkey(id,storage_path,mime_type,width,height,state,uploaded_at,expires_at)'

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
  let query = supabase.from('messages').select(MESSAGE_FIELDS).eq('conversation_id', id)
  const cursor = before || after
  if (cursor) {
    const op = before ? 'lt' : 'gt'
    query = query.or(`created_at.${op}.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.${op}.${cursor.id})`)
  }
  const ascending = Boolean(after) || forward
  return unwrap(query.order('created_at', { ascending }).order('id', { ascending }).limit(limit))
}
export const sendMessage = (conversationId, senderId, content, id) => unwrap(supabase.from('messages').insert({ id, conversation_id: conversationId, sender_id: senderId, content }).select(MESSAGE_FIELDS).single())

export const editMessage = (id, content) => unwrap(supabase.rpc('edit_message', { target_message: id, new_content: content }))
export const deleteMessage = (id) => unwrap(supabase.rpc('delete_message', { target_message: id }))
export const toggleReaction = (id, emoji) => unwrap(supabase.rpc('toggle_reaction', { target_message: id, reaction_emoji: emoji }))
export const getUnreadCounts = () => unwrap(supabase.rpc('conversation_unreads'))
export const markRead = (conversationId, messageId) => unwrap(supabase.rpc('mark_conversation_read', { target_conversation: conversationId, through_message: messageId }))
export async function getReactions(conversationId, messageIds) {
  if (!messageIds.length) return []
  const rows = []
  for (let chunk = 0; chunk < messageIds.length; chunk += 100) {
    for (let offset = 0; ; offset += 1000) {
      const page = await unwrap(supabase.from('message_reactions').select('*').eq('conversation_id', conversationId).in('message_id', messageIds.slice(chunk, chunk + 100)).is('removed_at', null).order('message_id').order('user_id').order('emoji').range(offset, offset + 999))
      rows.push(...page)
      if (page.length < 1000) break
    }
  }
  return rows
}
export const getMessage = (id) => unwrap(supabase.from('messages').select(MESSAGE_FIELDS).eq('id', id).single())
export const getMessagesByIds = (ids) => unwrap(supabase.from('messages').select(MESSAGE_FIELDS).in('id', ids))
