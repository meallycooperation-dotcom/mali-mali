import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, MessageCircle, X } from 'lucide-react'
import { useAuth } from '../context/useAuth'
import { supabase } from '../lib/supabase'

type ProductRecord = {
  id: string
  user_id: string | null
  name: string
  description: string | null
  price: string | number
  location: string | null
  condition: string | null
  status: string | null
  created_at: string | null
  updated_at: string | null
  image_url: string | null
}

type SellerRecord = {
  id: string
  full_name: string
  location: string | null
}

type ProductImageRecord = {
  id: string
  image_url: string
}

const CONDITION_LABELS: Record<string, string> = {
  A: 'Like new',
  B: 'Good',
  C: 'Fair',
}

export function ProductDetailsPage() {
  const { productId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [product, setProduct] = useState<ProductRecord | null>(null)
  const [seller, setSeller] = useState<SellerRecord | null>(null)
  const [images, setImages] = useState<ProductImageRecord[]>([])
  const [activeImageIndex, setActiveImageIndex] = useState(0)
  const [loading, setLoading] = useState(() => Boolean(supabase) && Boolean(productId))
  const [error, setError] = useState(() =>
    !supabase
      ? 'Supabase is not configured yet.'
      : productId
        ? ''
        : 'Product not found.',
  )
  const [showQuickMessage, setShowQuickMessage] = useState(false)
  const [quickMessageText, setQuickMessageText] = useState('')
  const [sendingQuickMessage, setSendingQuickMessage] = useState(false)
  const [quickMessageError, setQuickMessageError] = useState('')

  useEffect(() => {
    const client = supabase

    if (!client || !productId) {
      return
    }

    let isMounted = true

    const loadProduct = async () => {
      setLoading(true)
      setError('')
      const { data: productData, error: productError } = await client
        .from('products')
        .select(
          'id, user_id, name, description, price, location, condition, status, created_at, updated_at, image_url',
        )
        .eq('id', productId)
        .maybeSingle()

      if (!isMounted) {
        return
      }

      if (productError) {
        setError(productError.message)
        setLoading(false)
        return
      }

      if (!productData) {
        setError('Product not found.')
        setLoading(false)
        return
      }

      setProduct(productData as ProductRecord)

      const [{ data: sellerData, error: sellerError }, { data: imagesData, error: imagesError }] =
        await Promise.all([
          productData.user_id
            ? client
                .from('profiles')
                .select('id, full_name, location')
                .eq('id', productData.user_id)
                .maybeSingle()
            : Promise.resolve({ data: null, error: null }),
          client
            .from('product_images')
            .select('id, image_url')
            .eq('product_id', productData.id)
            .order('created_at', { ascending: true }),
        ])

      if (!isMounted) {
        return
      }

      if (sellerError) {
        setError(sellerError.message)
        setLoading(false)
        return
      }

      if (imagesError) {
        setError(imagesError.message)
        setLoading(false)
        return
      }

      setSeller((sellerData as SellerRecord | null) ?? null)
      setImages((imagesData ?? []) as ProductImageRecord[])
      setActiveImageIndex(0)
      setLoading(false)
    }

    loadProduct()

    return () => {
      isMounted = false
    }
  }, [productId])

  const priceText = product ? `KSh ${Number(product.price).toLocaleString()}` : ''
  const displayName = seller?.full_name ?? 'Unknown seller'
  const mainImageUrl = images[activeImageIndex]?.image_url ?? product?.image_url ?? ''
  const conditionLabel =
    (product?.condition && CONDITION_LABELS[product.condition]) ?? 'N/A'

  const handleQuickMessage = async () => {
    const client = supabase

    if (!client || !user || !product || !seller) {
      return
    }

    const trimmedMessage = quickMessageText.trim()
      ? `Is "${product.name}" still available?\n\n${quickMessageText.trim()}`
      : `Is "${product.name}" still available?`

    if (!trimmedMessage) {
      return
    }

    setSendingQuickMessage(true)
    setQuickMessageError('')

    try {
      const [{ data: myParticipantData, error: myParticipantError }, { data: sellerParticipantData, error: sellerParticipantError }] =
        await Promise.all([
          client
            .from('conversation_participants')
            .select('conversation_id')
            .eq('user_id', user.id),
          client
            .from('conversation_participants')
            .select('conversation_id')
            .eq('user_id', seller.id),
        ])

      if (myParticipantError || sellerParticipantError) {
        throw new Error(myParticipantError?.message ?? sellerParticipantError?.message ?? '')
      }

      const myConversationIds = new Set(
        (myParticipantData ?? []).map((row) => row.conversation_id),
      )
      const existingConversation = (sellerParticipantData ?? []).find((row) =>
        myConversationIds.has(row.conversation_id),
      )

      let conversationId: string

      if (existingConversation) {
        conversationId = existingConversation.conversation_id
      } else {
        const { data: conversationData, error: conversationError } = await client
          .from('conversations')
          .insert({ product_id: product.id })
          .select('id')
          .single()

        if (conversationError) {
          throw new Error(conversationError.message)
        }

        conversationId = conversationData.id

        const { error: participantInsertError } = await client
          .from('conversation_participants')
          .insert([
            { conversation_id: conversationId, user_id: user.id },
            { conversation_id: conversationId, user_id: seller.id },
          ])

        if (participantInsertError) {
          throw new Error(participantInsertError.message)
        }
      }

      const { error: sendError } = await client.from('messages').insert({
        conversation_id: conversationId,
        sender_id: user.id,
        content: trimmedMessage,
        image_url: null,
        is_read: false,
      })

      if (sendError) {
        throw new Error(sendError.message)
      }

      await client
        .from('conversations')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', conversationId)

      setShowQuickMessage(false)
      navigate(`/inbox/${conversationId}`)
    } catch (err) {
      setQuickMessageError(err instanceof Error ? err.message : 'Failed to send message')
    } finally {
      setSendingQuickMessage(false)
    }
  }

  return (
    <>
      {product && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'Product',
              name: product.name,
              description: product.description || '',
              image: mainImageUrl || '',
              offers: {
                '@type': 'Offer',
                price: product.price,
                priceCurrency: 'KES',
                availability: product.status === 'active' 
                  ? 'https://schema.org/InStock' 
                  : 'https://schema.org/SoldOut',
              },
              seller: {
                '@type': 'Organization',
                name: displayName || 'Mali Mali Seller',
              },
            }),
          }}
        />
      )}
      <section className="page page-product-details">
      {product && (
        <div className="breadcrumb">
          <Link to="/">Home</Link>
          <span className="breadcrumb-separator">›</span>
          <span>{product.name}</span>
        </div>
      )}
      <div className="detail-topbar">
        <Link to="/" className="back-icon-link" aria-label="Back to marketplace">
          <ArrowLeft size={20} />
        </Link>
      </div>

      {loading ? <p className="market-status">Loading product...</p> : null}
      {error ? <p className="market-status market-status-error">{error}</p> : null}

      {!loading && !error && product ? (
        <article className="detail-shell">
          <div className="detail-gallery">
            <div className="detail-hero-image">
              {mainImageUrl ? (
                <img src={mainImageUrl} alt={product.name} />
              ) : (
                <div className="market-image-placeholder">No image</div>
              )}
            </div>

            {images.length > 1 ? (
              <div className="detail-thumb-grid">
                {images.map((image, index) => (
                  <button
                    key={image.id}
                    className={`detail-thumb-button${
                      index === activeImageIndex ? ' detail-thumb-button-active' : ''
                    }`}
                    type="button"
                    onClick={() => setActiveImageIndex(index)}
                    aria-label={`Show image ${index + 1}`}
                  >
                    <img src={image.image_url} alt={product.name} />
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div className="detail-content">
            <div className="detail-header">
              <p className="eyebrow">Product details</p>
              <h1>{product.name}</h1>
              <strong>{priceText}</strong>
            </div>

            <p className="detail-description">
              {product.description || 'No description provided.'}
            </p>

            <div className="market-meta detail-meta">
              <span>{product.location ?? 'Kenya'}</span>
              <span>Condition - {conditionLabel}</span>
              <span>Status {product.status ?? 'active'}</span>
            </div>

            <div className="detail-seller-card">
              <span>Posted by</span>
              <strong>{displayName}</strong>
            </div>

            <div className="detail-actions">
              {product?.user_id && user && product.user_id !== user.id ? (
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => setShowQuickMessage(true)}
                >
                  <MessageCircle size={18} />
                  Quick message
                </button>
              ) : null}
              {product?.user_id && user && product.user_id === user.id ? (
                <Link to="/profile" className="ghost-button">Back to profile</Link>
              ) : (
                <Link to="/" className="ghost-button">Back to listings</Link>
              )}
            </div>
          </div>
        </article>
      ) : null}

      {showQuickMessage && product ? (
        <div className="comments-overlay" role="presentation" onClick={() => setShowQuickMessage(false)}>
          <div className="comments-card" role="dialog" aria-modal="true" aria-label={`Message ${displayName}`} onClick={(event) => event.stopPropagation()} style={{ display: 'flex', flexDirection: 'column', height: '60vh', width: '90%', maxWidth: 720, margin: '6vh auto' }}>
            <div className="comments-header">
              <div>
                <p className="eyebrow">Message Seller</p>
                <h2>{displayName}</h2>
              </div>
              <button className="comments-close" type="button" onClick={() => setShowQuickMessage(false)} aria-label="Close">
                <X size={18} />
              </button>
            </div>
            <div className="comments-body" style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
              <p style={{ marginBottom: 12, color: 'var(--text-secondary)' }}>About: {product.name}</p>
              <textarea
                className="comments-input"
                value={quickMessageText}
                onChange={(e) => setQuickMessageText(e.target.value)}
                placeholder="Add a personal message (optional)..."
                rows={3}
              />
              {quickMessageError ? <p className="comments-error">{quickMessageError}</p> : null}
            </div>
            <div className="comments-composer" style={{ padding: 8, borderTop: '1px solid #eee' }}>
              <button
                className="primary-button comments-submit"
                type="button"
                onClick={handleQuickMessage}
                disabled={sendingQuickMessage}
              >
                {sendingQuickMessage ? 'Sending...' : 'Send Message'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
    </>
  )
}
