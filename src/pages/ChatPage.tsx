import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Send } from 'lucide-react'
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
  id: string
  conversation_id: string
  sender_id: string
  content: string | null
  image_url: string | null
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

const formatMessageTime = (value: string | null) => {
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
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

export function ChatPage() {
  const { conversationId } = useParams()
  const { user } = useAuth()
  const [conversation, setConversation] = useState<ConversationRecord | null>(null)
  const [messages, setMessages] = useState<MessageRecord[]>([])
  const [otherName, setOtherName] = useState('Conversation')
  const [productName, setProductName] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [messageText, setMessageText] = useState('')
  const [sending, setSending] = useState(false)
  const messageInputRef = useRef<HTMLTextAreaElement | null>(null)

  const loadConversation = useCallback(async () => {
    const client = supabase

    if (!client || !conversationId || !user) {
      setLoading(false)
      return
    }

    setLoading(true)
    setError('')

    const { data: conversationData, error: conversationError } = await client
      .from('conversations')
      .select('id, product_id, created_at, updated_at')
      .eq('id', conversationId)
      .maybeSingle()

    if (conversationError) {
      setError(conversationError.message)
      setLoading(false)
      return
    }

    if (!conversationData) {
      setError('Conversation not found.')
      setLoading(false)
      return
    }

    const [{ data: participantData, error: participantError }, { data: messageData, error: messageError }] =
      await Promise.all([
        client
          .from('conversation_participants')
          .select('conversation_id, user_id')
          .eq('conversation_id', conversationData.id),
        client
          .from('messages')
          .select('id, conversation_id, sender_id, content, image_url, is_read, created_at')
          .eq('conversation_id', conversationData.id)
          .order('created_at', { ascending: true }),
      ])

    if (participantError) {
      setError(participantError.message)
      setLoading(false)
      return
    }

    if (messageError) {
      setError(messageError.message)
      setLoading(false)
      return
    }

    const participants = (participantData ?? []) as ParticipantRecord[]
    const messagesData = (messageData ?? []) as MessageRecord[]
    const otherParticipantIds = participants
      .map((participant) => participant.user_id)
      .filter((participantUserId) => participantUserId !== user.id)

    const [{ data: profileData, error: profileError }, { data: productData, error: productError }] =
      await Promise.all([
        otherParticipantIds.length
          ? client.from('profiles').select('id, full_name').in('id', otherParticipantIds)
          : Promise.resolve({ data: [], error: null }),
        conversationData.product_id
          ? client
              .from('products')
              .select('id, name')
              .eq('id', conversationData.product_id)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ])

    if (profileError) {
      setError(profileError.message)
      setLoading(false)
      return
    }

    if (productError) {
      setError(productError.message)
      setLoading(false)
      return
    }

    const profileMap = new Map(
      ((profileData ?? []) as ProfileRecord[]).map((profile) => [
        profile.id,
        profile.full_name,
      ]),
    )

    const otherParticipantName =
      otherParticipantIds.map((participantId) => profileMap.get(participantId)).find(Boolean) ??
      'Conversation'

    setConversation(conversationData as ConversationRecord)
    setMessages(messagesData)
    setOtherName(otherParticipantName)
    setProductName((productData as ProductRecord | null)?.name ?? '')
    setLoading(false)

    await client
      .from('messages')
      .update({ is_read: true })
      .eq('conversation_id', conversationData.id)
      .neq('sender_id', user.id)
      .eq('is_read', false)
  }, [conversationId, user])

  useEffect(() => {
    void loadConversation()
  }, [loadConversation])

  const handleSendMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const client = supabase

    if (!client || !conversation || !user) {
      return
    }

    const trimmedMessage = messageText.trim()

    if (!trimmedMessage) {
      return
    }

    setSending(true)

    const { error: sendError } = await client.from('messages').insert({
      conversation_id: conversation.id,
      sender_id: user.id,
      content: trimmedMessage,
      image_url: null,
      is_read: false,
    })

    if (sendError) {
      setError(sendError.message)
      setSending(false)
      return
    }

    await client
      .from('conversations')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', conversation.id)

    setMessageText('')
    setSending(false)
    await loadConversation()
  }

  const handleMessageChange = (value: string) => {
    setMessageText(value)

    const input = messageInputRef.current

    if (!input) {
      return
    }

    input.style.height = '0px'
    input.style.height = `${Math.min(input.scrollHeight, 160)}px`
  }

  return (
    <section className="page page-chat">
      <div className="chat-shell">
        <div className="chat-header">
          <Link to="/inbox" className="back-icon-link" aria-label="Back to inbox">
            <ArrowLeft size={20} />
          </Link>
          <div className="chat-header-copy">
            <p className="eyebrow">Chat</p>
            <h1>{otherName}</h1>
            {productName ? <p>About {productName}</p> : <p>Direct message</p>}
          </div>
        </div>

        {loading ? <p className="market-status">Loading conversation...</p> : null}
        {error ? <p className="market-status market-status-error">{error}</p> : null}

        {!loading && !error ? (
          <>
            <div className="chat-messages">
              {messages.length === 0 ? (
                <div className="market-empty chat-empty">
                  <h2>No messages yet</h2>
                  <p>Send the first message to start the conversation.</p>
                </div>
              ) : (
                messages.map((message) => {
                  const isMine = message.sender_id === user?.id

                  return (
                    <article
                      key={message.id}
                      className={`chat-message${isMine ? ' chat-message-mine' : ''}`}
                    >
                      <div className="chat-bubble">
                        {message.content ? <p>{message.content}</p> : <p>Image message</p>}
                        <small>{formatMessageTime(message.created_at)}</small>
                      </div>
                    </article>
                  )
                })
              )}
            </div>

            <form className="chat-composer" onSubmit={handleSendMessage}>
              <textarea
                ref={messageInputRef}
                className="comments-input chat-input"
                value={messageText}
                onChange={(event) => handleMessageChange(event.target.value)}
                placeholder="Write a message..."
                rows={1}
              />
              <button className="primary-button chat-submit" type="submit" disabled={sending}>
                {sending ? (
                  'Sending...'
                ) : (
                  <>
                    <Send size={18} />
                    Send
                  </>
                )}
              </button>
            </form>
          </>
        ) : null}
      </div>
    </section>
  )
}
