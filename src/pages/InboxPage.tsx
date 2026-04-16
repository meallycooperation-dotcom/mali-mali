import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MessageSquareText, ArrowRight } from 'lucide-react'
import { useAuth } from '../context/useAuth'
import { supabase } from '../lib/supabase'

type ConversationRecord = {
  id: string
  product_id: string | null
  created_at: string | null
  updated_at: string | null
}

type ParticipantRecord = {
  conversation_id: string
  user_id: string
}

type MessageRecord = {
  conversation_id: string
  sender_id: string
  content: string | null
  is_read: boolean | null
  created_at: string | null
}

type ProfileRecord = {
  id: string
  full_name: string
}

type ProductRecord = {
  id: string
  name: string
}

type InboxItem = {
  conversationId: string
  title: string
  subtitle: string
  preview: string
  timestamp: string
  unreadCount: number
  productId: string | null
}

const formatInboxTime = (value: string | null) => {
  if (!value) {
    return 'Recently'
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return 'Recently'
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
  }).format(date)
}

export function InboxPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [items, setItems] = useState<InboxItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const client = supabase

    if (!client || !user) {
      setLoading(false)
      return
    }

    let isMounted = true

    const loadInbox = async () => {
      setLoading(true)
      setError('')

      const { data: participantData, error: participantError } = await client
        .from('conversation_participants')
        .select('conversation_id')
        .eq('user_id', user.id)

      if (!isMounted) {
        return
      }

      if (participantError) {
        setError(participantError.message)
        setLoading(false)
        return
      }

      const conversationIds = Array.from(
        new Set(((participantData ?? []) as ParticipantRecord[]).map((row) => row.conversation_id)),
      )

      if (conversationIds.length === 0) {
        setItems([])
        setLoading(false)
        return
      }

      const { data: conversationData, error: conversationError } = await client
        .from('conversations')
        .select('id, product_id, created_at, updated_at')
        .in('id', conversationIds)
        .order('updated_at', { ascending: false })

      if (!isMounted) {
        return
      }

      if (conversationError) {
        setError(conversationError.message)
        setLoading(false)
        return
      }

      const conversationProductIds = Array.from(
        new Set(
          ((conversationData ?? []) as ConversationRecord[])
            .map((conversation) => conversation.product_id)
            .filter((productId): productId is string => Boolean(productId)),
        ),
      )

      const [
        { data: messageData, error: messageError },
        { data: otherParticipantData, error: otherParticipantError },
        { data: productData, error: productError },
      ] = await Promise.all([
        client
          .from('messages')
          .select('conversation_id, sender_id, content, is_read, created_at')
          .in('conversation_id', conversationIds)
          .order('created_at', { ascending: true }),
        client
          .from('conversation_participants')
          .select('conversation_id, user_id')
          .in('conversation_id', conversationIds)
          .neq('user_id', user.id),
        conversationProductIds.length
          ? client.from('products').select('id, name').in('id', conversationProductIds)
          : Promise.resolve({ data: [], error: null }),
      ])

      if (!isMounted) {
        return
      }

      if (messageError) {
        setError(messageError.message)
        setLoading(false)
        return
      }

      if (otherParticipantError) {
        setError(otherParticipantError.message)
        setLoading(false)
        return
      }

      if (productError) {
        setError(productError.message)
        setLoading(false)
        return
      }

      const conversations = (conversationData ?? []) as ConversationRecord[]
      const messages = (messageData ?? []) as MessageRecord[]
      const otherParticipants = (otherParticipantData ?? []) as ParticipantRecord[]
      const products = (productData ?? []) as ProductRecord[]

      const otherIds = Array.from(
        new Set(otherParticipants.map((participant) => participant.user_id).filter(Boolean)),
      ) as string[]

      const { data: profileData, error: profileError } = otherIds.length
        ? await client.from('profiles').select('id, full_name').in('id', otherIds)
        : { data: [], error: null }

      if (!isMounted) {
        return
      }

      if (profileError) {
        setError(profileError.message)
        setLoading(false)
        return
      }

      const profileMap = new Map(
        ((profileData ?? []) as ProfileRecord[]).map((profile) => [
          profile.id,
          profile.full_name,
        ]),
      )

      const otherParticipantMap = new Map<string, string>(
        otherParticipants.map((participant) => [
          participant.conversation_id,
          participant.user_id,
        ]),
      )

      const messageMap = messages.reduce<Map<string, MessageRecord[]>>((map, message) => {
        const existing = map.get(message.conversation_id) ?? []
        existing.push(message)
        map.set(message.conversation_id, existing)
        return map
      }, new Map<string, MessageRecord[]>())

      const productMap = new Map(products.map((product) => [product.id, product.name]))

      setItems(
        conversations.map((conversation) => {
          const conversationMessages = messageMap.get(conversation.id) ?? []
          const lastMessage = conversationMessages.at(-1)
          const otherUserId = otherParticipantMap.get(conversation.id)
          const otherName =
            (otherUserId && profileMap.get(otherUserId)) ?? 'Conversation'
          const unreadCount = conversationMessages.filter(
            (message) => !message.is_read && message.sender_id !== user.id,
          ).length
          const productName = conversation.product_id
            ? productMap.get(conversation.product_id)
            : null

          return {
            conversationId: conversation.id,
            title: otherName,
            subtitle: productName ? `About ${productName}` : 'Direct message',
            preview: lastMessage?.content ?? 'No messages yet',
            timestamp: formatInboxTime(conversation.updated_at ?? conversation.created_at),
            unreadCount,
            productId: conversation.product_id,
          }
        }),
      )
      setLoading(false)
    }

    void loadInbox()

    return () => {
      isMounted = false
    }
  }, [user])

  return (
    <section className="page page-inbox">
      

      {loading ? <p className="market-status">Loading conversations...</p> : null}
      {error ? <p className="market-status market-status-error">{error}</p> : null}

      {!loading && !error && items.length === 0 ? (
        <div className="market-empty">
          <MessageSquareText size={24} />
          <h2>No conversations yet</h2>
          <p>When you message a seller or buyer, the conversation will appear here.</p>
        </div>
      ) : null}

      <div className="inbox-list">
        {items.map((item) => (
          <button
            key={item.conversationId}
            className="inbox-item"
            type="button"
            onClick={() => navigate(`/inbox/${item.conversationId}`)}
          >
            <div className="inbox-item-main">
              <strong>{item.title}</strong>
              <span>{item.subtitle}</span>
              <p>{item.preview}</p>
            </div>
            <div className="inbox-item-meta">
              <small>{item.timestamp}</small>
              {item.unreadCount > 0 ? (
                <span className="inbox-badge">{item.unreadCount}</span>
              ) : null}
              <ArrowRight size={16} />
            </div>
          </button>
        ))}
      </div>
    </section>
  )
}
