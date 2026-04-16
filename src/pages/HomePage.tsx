import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { MessageCircle, ThumbsUp, X } from 'lucide-react'
import { useAuth } from '../context/useAuth'
import { supabase } from '../lib/supabase'

type ProductRow = {
  id: string
  user_id: string | null
  name: string
  description: string | null
  price: string | number
  location: string | null
  condition: string | null
  status: string | null
  created_at: string | null
  image_url: string | null
}

type SellerRow = {
  id: string
  full_name: string
  avatar_url: string | null
}

type MarketplaceProduct = ProductRow & {
  seller_name: string
  seller_avatar_url: string | null
  comments_count: number
  likes_count: number
  liked_by_me: boolean
  gallery_images: string[]
  image_count: number
}

type LikeRow = {
  product_id: string | null
  user_id: string | null
}

type CommentRow = {
  id: string
  product_id: string | null
  user_id: string | null
  content: string
  parent_id: string | null
  created_at: string | null
}

type CommentProfileRow = {
  id: string
  full_name: string
}

type MarketplaceComment = CommentRow & {
  commenter_name: string
}

const CONDITION_LABELS: Record<string, string> = {
  A: 'Like new',
  B: 'Good',
  C: 'Fair',
}

const formatPostedAt = (value: string | null) => {
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
    year: 'numeric',
  }).format(date)
}

const getInitials = (name: string) =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')

const formatCommentTime = (value: string | null) => {
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

export function HomePage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [products, setProducts] = useState<MarketplaceProduct[]>([])
  const [loading, setLoading] = useState(() => Boolean(supabase))
  const [error, setError] = useState(() =>
    supabase ? '' : 'Supabase is not configured yet.',
  )
  const [commentProduct, setCommentProduct] = useState<MarketplaceProduct | null>(
    null,
  )
  const [comments, setComments] = useState<MarketplaceComment[]>([])
  const [commentsLoading, setCommentsLoading] = useState(false)
  const [commentText, setCommentText] = useState('')
  const [commentError, setCommentError] = useState('')
  const [commentSubmitting, setCommentSubmitting] = useState(false)
  const [likeError, setLikeError] = useState('')
  const [followedSellerIds, setFollowedSellerIds] = useState<string[]>([])
  const query = searchParams.get('q')?.trim().toLowerCase() ?? ''

  // Toggle follow a seller
  const toggleFollowSeller = async (sellerId: string) => {
    if (!user?.id) return
    if (followedSellerIds.includes(sellerId)) {
      const { error } = await (supabase as any).from('follows').delete().match({ follower_id: user.id, following_id: sellerId })
      if (!error) setFollowedSellerIds((prev) => prev.filter((id) => id !== sellerId))
    } else {
      const { error } = await (supabase as any).from('follows').insert({ follower_id: user.id, following_id: sellerId })
      if (!error) setFollowedSellerIds((prev) => [...prev, sellerId])
    }
  }

  useEffect(() => {
    const client = supabase

    if (!client) {
      return
    }

    let isMounted = true

    const loadProducts = async () => {
      const { data: productData, error: productError } = await client
        .from('products')
        .select(
          'id, user_id, name, description, price, location, condition, status, created_at, image_url',
        )
        .eq('status', 'active')
        .order('created_at', { ascending: false })

      if (!isMounted) {
        return
      }

      if (productError) {
        setError(productError.message)
        setLoading(false)
        return
      }

      const rows = (productData ?? []) as ProductRow[]
      const productIds = rows.map((product) => product.id)

      const { data: commentData, error: commentCountError } = productIds.length
        ? await client
            .from('comments')
            .select('product_id')
            .in('product_id', productIds)
            .is('parent_id', null)
        : { data: [], error: null }

      if (!isMounted) {
        return
      }

      if (commentCountError) {
        setError(commentCountError.message)
        setLoading(false)
        return
      }

      const commentCounts = (commentData ?? []).reduce<Record<string, number>>(
        (counts, comment) => {
          if (comment.product_id) {
            counts[comment.product_id] = (counts[comment.product_id] ?? 0) + 1
          }

          return counts
        },
        {},
      )

      const { data: imageData, error: imageError } = productIds.length
        ? await client
            .from('product_images')
            .select('product_id, image_url')
            .in('product_id', productIds)
        : { data: [], error: null }

      if (!isMounted) {
        return
      }

      if (imageError) {
        setError(imageError.message)
        setLoading(false)
        return
      }

      const imageMap = (imageData ?? []).reduce<Map<string, string[]>>(
        (map, image) => {
          const productId = image.product_id

          if (!productId) {
            return map
          }

          const currentImages = map.get(productId) ?? []
          currentImages.push(image.image_url)
          map.set(productId, currentImages)
          return map
        },
        new Map<string, string[]>(),
      )

      const { data: likeData, error: likeCountError } = productIds.length
        ? await client
            .from('likes')
            .select('product_id, user_id')
            .in('product_id', productIds)
        : { data: [], error: null }

      if (!isMounted) {
        return
      }

      if (likeCountError) {
        setError(likeCountError.message)
        setLoading(false)
        return
      }

      const likeCounts = (likeData ?? []).reduce<Record<string, number>>(
        (counts, like) => {
          if (like.product_id) {
            counts[like.product_id] = (counts[like.product_id] ?? 0) + 1
          }

          return counts
        },
        {},
      )

      const likedProductIds = new Set(
        ((likeData ?? []) as LikeRow[])
          .filter((like) => like.user_id === user?.id)
          .map((like) => like.product_id)
          .filter((productId): productId is string => Boolean(productId)),
      )

      const sellerIds = Array.from(
        new Set(rows.map((product) => product.user_id).filter(Boolean)),
      ) as string[]

      let sellerMap = new Map<string, string>()
      let avatarMap = new Map<string, string | null>()

      if (sellerIds.length > 0) {
        const { data: sellerData, error: sellerError } = await client
          .from('profiles')
          .select('id, full_name, avatar_url')
          .in('id', sellerIds)

        if (!isMounted) {
          return
        }

        if (sellerError) {
          setError(sellerError.message)
          setLoading(false)
          return
        }

        sellerMap = new Map(
          ((sellerData ?? []) as SellerRow[]).map((seller) => [
            seller.id,
            seller.full_name,
          ]),
        )

        // Also build avatar map
        avatarMap = new Map(
          ((sellerData ?? []) as SellerRow[]).map((seller) => [
            seller.id,
            seller.avatar_url,
          ]),
        )
      }

      setProducts(
        rows.map((product) => ({
          ...product,
          seller_name:
            (product.user_id && sellerMap.get(product.user_id)) ?? 'Unknown seller',
          seller_avatar_url:
            (product.user_id && avatarMap.get(product.user_id)) ?? null,
          comments_count: commentCounts[product.id] ?? 0,
          likes_count: likeCounts[product.id] ?? 0,
          liked_by_me: likedProductIds.has(product.id),
          gallery_images: Array.from(
            new Set([
              ...(product.image_url ? [product.image_url] : []),
              ...(imageMap.get(product.id) ?? []),
            ]),
          ).filter(Boolean),
          image_count: Array.from(
            new Set([
              ...(product.image_url ? [product.image_url] : []),
              ...(imageMap.get(product.id) ?? []),
            ]),
          ).filter(Boolean).length,
        })),
      )

      // Load current user's follows to know which sellers they're already following
      if (user?.id && sellerIds.length > 0) {
        const { data: followData } = await client
          .from('follows')
          .select('following_id')
          .eq('follower_id', user.id)
        if (followData) {
          const followedIds = (followData as any[]).map((f: any) => f.following_id).filter((id: string) => sellerIds.includes(id))
          setFollowedSellerIds(followedIds)
        }
      }

      setLoading(false)
    }

    loadProducts()

    return () => {
      isMounted = false
    }
  }, [user?.id])

  useEffect(() => {
    const client = supabase

    if (!client || !commentProduct) {
      return
    }

    let isMounted = true

    const loadComments = async () => {
      setCommentsLoading(true)
      setCommentError('')

      const { data: commentData, error: commentError } = await client
        .from('comments')
        .select('id, product_id, user_id, content, parent_id, created_at')
        .eq('product_id', commentProduct.id)
        .is('parent_id', null)
        .order('created_at', { ascending: true })

      if (!isMounted) {
        return
      }

      if (commentError) {
        setCommentError(commentError.message)
        setCommentsLoading(false)
        return
      }

      const rows = (commentData ?? []) as CommentRow[]
      const commenterIds = Array.from(
        new Set(rows.map((comment) => comment.user_id).filter(Boolean)),
      ) as string[]

      let commenterMap = new Map<string, string>()

      if (commenterIds.length > 0) {
        const { data: profileData, error: profileError } = await client
          .from('profiles')
          .select('id, full_name')
          .in('id', commenterIds)

        if (!isMounted) {
          return
        }

        if (profileError) {
          setCommentError(profileError.message)
          setCommentsLoading(false)
          return
        }

        commenterMap = new Map(
          ((profileData ?? []) as CommentProfileRow[]).map((profile) => [
            profile.id,
            profile.full_name,
          ]),
        )
      }

      setComments(
        rows.map((comment) => ({
          ...comment,
          commenter_name:
            (comment.user_id && commenterMap.get(comment.user_id)) ??
            'Community member',
        })),
      )
      setCommentsLoading(false)
    }

    void loadComments()

    return () => {
      isMounted = false
    }
  }, [commentProduct])

  const openComments = (product: MarketplaceProduct) => {
    setCommentProduct(product)
    setCommentText('')
    setCommentError('')
    setComments([])
  }

  const closeComments = () => {
    setCommentProduct(null)
    setCommentText('')
    setCommentError('')
    setComments([])
  }

  const handleLikeClick = async (product: MarketplaceProduct) => {
    const client = supabase

    if (!client) {
      return
    }

    if (!user) {
      navigate('/login')
      return
    }

    setLikeError('')

    const nextLikedByMe = !product.liked_by_me
    const nextLikeCount = nextLikedByMe
      ? product.likes_count + 1
      : Math.max(product.likes_count - 1, 0)

    setProducts((currentProducts) =>
      currentProducts.map((item) =>
        item.id === product.id
          ? {
              ...item,
              likes_count: nextLikeCount,
              liked_by_me: nextLikedByMe,
            }
          : item,
      ),
    )

    const query = client.from('likes').delete().eq('product_id', product.id).eq('user_id', user.id)

    const { error } = nextLikedByMe
      ? await client.from('likes').insert({
          product_id: product.id,
          user_id: user.id,
        })
      : await query

    if (error) {
      setLikeError(error.message)
      setProducts((currentProducts) =>
        currentProducts.map((item) =>
          item.id === product.id
            ? {
                ...item,
                likes_count: product.likes_count,
                liked_by_me: product.liked_by_me,
              }
            : item,
        ),
      )
    }
  }

  const handleSubmitComment = async () => {
    const client = supabase

    if (!client || !commentProduct) {
      return
    }

    if (!user) {
      setCommentError('You need to sign in before posting a comment.')
      return
    }

    const trimmedText = commentText.trim()

    if (!trimmedText) {
      setCommentError('Write a comment before posting.')
      return
    }

    setCommentSubmitting(true)
    setCommentError('')

    const { error: insertError } = await client.from('comments').insert({
      product_id: commentProduct.id,
      user_id: user.id,
      content: trimmedText,
      parent_id: null,
    })

    if (insertError) {
      setCommentError(insertError.message)
      setCommentSubmitting(false)
      return
    }

    setCommentText('')
    setCommentSubmitting(false)

    setProducts((currentProducts) =>
      currentProducts.map((product) =>
        product.id === commentProduct.id
          ? { ...product, comments_count: product.comments_count + 1 }
          : product,
      ),
    )

    const { data: refreshedComments, error: refreshError } = await client
      .from('comments')
      .select('id, product_id, user_id, content, parent_id, created_at')
      .eq('product_id', commentProduct.id)
      .is('parent_id', null)
      .order('created_at', { ascending: true })

    if (refreshError) {
      setCommentError(refreshError.message)
      return
    }

    const rows = (refreshedComments ?? []) as CommentRow[]
    const commenterIds = Array.from(
      new Set(rows.map((comment) => comment.user_id).filter(Boolean)),
    ) as string[]

    let commenterMap = new Map<string, string>()

    if (commenterIds.length > 0) {
      const { data: profileData } = await client
        .from('profiles')
        .select('id, full_name')
        .in('id', commenterIds)

      commenterMap = new Map(
        ((profileData ?? []) as CommentProfileRow[]).map((profile) => [
          profile.id,
          profile.full_name,
        ]),
      )
    }

    setComments(
      rows.map((comment) => ({
        ...comment,
        commenter_name:
          (comment.user_id && commenterMap.get(comment.user_id)) ??
          'Community member',
      })),
    )
  }

  const filteredProducts = query
    ? products.filter((product) => {
        const conditionLabel = product.condition
          ? CONDITION_LABELS[product.condition] ?? product.condition
          : ''
        const haystack = [
          product.name,
          product.description ?? '',
          product.location ?? '',
          product.seller_name,
          conditionLabel,
        ]
          .join(' ')
          .toLowerCase()

        return haystack.includes(query)
      })
    : products

  return (
    <section className="page page-home">
      <div className="market-header">
        <p className="eyebrow">Available products</p>
      </div>

      {loading ? <p className="market-status">Loading products...</p> : null}
      {error ? <p className="market-status market-status-error">{error}</p> : null}

      {!loading && !error && products.length === 0 ? (
        <div className="market-empty">
          <h2>No products yet</h2>
          <p>When sellers post refurbished items, they will appear here.</p>
          <Link className="primary-button" to="/signup">
            Start selling
          </Link>
        </div>
      ) : null}

      {query && !loading && !error ? (
        <p className="market-status">
          Showing {filteredProducts.length} result
          {filteredProducts.length === 1 ? '' : 's'} for &quot;{query}&quot;
        </p>
      ) : null}

      <div className="market-grid">
        {filteredProducts.map((product) => (
          <article className="market-card market-feed-card" key={product.id}>
            <div className="market-post-header">
                <div className="market-post-author" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {product.seller_avatar_url ? (
                      <img
                        className="market-post-avatar"
                        src={product.seller_avatar_url}
                        alt={product.seller_name}
                        style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover' }}
                      />
                    ) : (
                      <div className="market-post-avatar" aria-hidden="true">
                        {getInitials(product.seller_name) || 'M'}
                      </div>
                    )}
                    <div className="market-post-author-copy">
                      <span className="market-post-time" style={{ marginRight: 6 }}>{formatPostedAt(product.created_at)}</span>
                      {product.user_id ? (
                        <Link className="market-author-link" to={`/profile/${product.user_id}`}>
                          {product.seller_name}
                        </Link>
                      ) : (
                        <strong>{product.seller_name}</strong>
                      )}
                    </div>
                  </div>
                  {product.user_id && product.user_id !== user?.id && (
                    product.user_id && followedSellerIds.includes(product.user_id) ? (
                      <button
                        className="follow-pill following"
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleFollowSeller(product.user_id!) }}
                        style={{ padding: '3px 8px', fontSize: '0.7rem', flexShrink: 0 }}
                      >
                        Following
                      </button>
                    ) : product.user_id ? (
                      <button
                        className="follow-pill"
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleFollowSeller(product.user_id!) }}
                        style={{ padding: '3px 8px', fontSize: '0.7rem', flexShrink: 0 }}
                      >
                        Follow
                      </button>
                    ) : null
                  )}
                </div>
              </div>

            <Link className="market-post-content" to={`/product/${product.id}`}>
              <div className="market-image-wrap">
                {product.image_count > 1 ? (
                  <div
                    className={`market-image-grid market-image-grid-${Math.min(
                      product.gallery_images.length,
                      4,
                    )}`}
                  >
                    {product.gallery_images.slice(0, 4).map((imageUrl, index) => {
                      const extraCount = product.image_count - 4
                      const showExtraBadge =
                        index === 3 && product.image_count > 4 && extraCount > 0

                      return (
                        <div className="market-image-tile" key={`${product.id}-${imageUrl}-${index}`}>
                          <img className="market-image" src={imageUrl} alt={product.name} />
                          {showExtraBadge ? (
                            <span className="market-image-more">+{extraCount}</span>
                          ) : null}
                        </div>
                      )
                    })}
                  </div>
                ) : product.gallery_images[0] ? (
                  <img
                    className="market-image"
                    src={product.gallery_images[0]}
                    alt={product.name}
                  />
                ) : (
                  <div className="market-image market-image-placeholder">
                    No image
                  </div>
                )}
              </div>

              <div className="market-card-body">
                <div className="market-card-top">
                  <h2>{product.name}</h2>
                  <strong>KSh {Number(product.price).toLocaleString()}</strong>
                </div>

                <p className="market-description">
                  {product.description || 'No description provided.'}
                </p>

                <div className="market-meta">
                  <span>{product.location ?? 'Kenya'}</span>
                  <span>
                    Condition -{' '}
                    {product.condition
                      ? CONDITION_LABELS[product.condition] ?? product.condition
                      : 'N/A'}
                  </span>
                </div>
              </div>
            </Link>

            <div className="market-post-actions">
              <button
                className={`market-post-icon market-post-icon-button${
                  product.liked_by_me ? ' market-post-icon-active' : ''
                }`}
                type="button"
                disabled={!user}
                onClick={() => handleLikeClick(product)}
                aria-label={
                  product.liked_by_me
                    ? `Unlike ${product.name}`
                    : `Like ${product.name}`
                }
                title={user ? undefined : 'Sign in to like products'}
              >
                <ThumbsUp size={15} fill={product.liked_by_me ? 'currentColor' : 'none'} />
              </button>
              <span className="market-like-count" aria-label={`${product.likes_count} likes`}>
                {product.likes_count}
              </span>
              <button
                className="market-post-icon market-post-icon-button"
                type="button"
                onClick={() => openComments(product)}
                aria-label={`Open comments for ${product.name}`}
              >
                <MessageCircle size={15} />
              </button>
              <span className="market-comment-count" aria-label={`${product.comments_count} comments`}>
                {product.comments_count}
              </span>
            </div>
          </article>
        ))}
      </div>

      {!loading && !error && query && filteredProducts.length === 0 ? (
        <div className="market-empty">
          <h2>No matching products</h2>
          <p>Try a different search term or clear the search box in the header.</p>
        </div>
      ) : null}

      {likeError ? <p className="market-status market-status-error">{likeError}</p> : null}

      {commentProduct ? (
        <div
          className="comments-overlay"
          role="presentation"
          onClick={closeComments}
        >
          <div
            className="comments-card"
            role="dialog"
            aria-modal="true"
            aria-label={`Comments for ${commentProduct.name}`}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="comments-header">
              <div>
                <p className="eyebrow">Comments</p>
                <h2>{commentProduct.name}</h2>
              </div>
              <button
                className="comments-close"
                type="button"
                onClick={closeComments}
                aria-label="Close comments"
              >
                <X size={18} />
              </button>
            </div>

            <div className="comments-body">
              {commentsLoading ? (
                <p className="comments-empty">Loading comments...</p>
              ) : comments.length === 0 ? (
                <p className="comments-empty">Be the first to comment.</p>
              ) : (
                <div className="comments-list">
                  {comments.map((comment) => (
                    <article className="comment-item" key={comment.id}>
                      <div className="comment-avatar" aria-hidden="true">
                        {getInitials(comment.commenter_name) || 'M'}
                      </div>
                      <div className="comment-content">
                        <div className="comment-bubble">
                          <strong>{comment.commenter_name}</strong>
                          <p>{comment.content}</p>
                        </div>
                        <small>{formatCommentTime(comment.created_at)}</small>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>

            {commentError ? (
              <p className="comments-error">{commentError}</p>
            ) : null}

            <div className="comments-composer">
              {!user ? (
                <p className="comments-note">Sign in to write a comment.</p>
              ) : null}
              <textarea
                className="comments-input"
                value={commentText}
                onChange={(event) => setCommentText(event.target.value)}
                placeholder="Write a comment..."
                rows={3}
                disabled={!user}
              />
              <button
                className="primary-button comments-submit"
                type="button"
                onClick={handleSubmitComment}
                disabled={!user || commentSubmitting}
              >
                {commentSubmitting ? 'Posting...' : 'Post comment'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}
