import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { MessageCircle, ThumbsUp } from 'lucide-react'
import { useAuth } from '../context/useAuth'
import { supabase } from '../lib/supabase'

type FollowingUser = {
  id: string
  full_name: string
  avatar_url: string | null
  created_at: string | null
}

type ProductWithSeller = {
  id: string
  user_id: string
  name: string
  description: string | null
  price: string | number
  location: string | null
  condition: string | null
  status: string | null
  created_at: string | null
  image_url: string | null
  seller_name: string
  seller_avatar_url: string | null
  likes_count: number
  comments_count: number
  liked_by_me: boolean
}

const CONDITION_LABELS: Record<string, string> = {
  A: 'Like new',
  B: 'Good',
  C: 'Fair',
}

const formatPostedAt = (value: string | null) => {
  if (!value) return 'Recently'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Recently'
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(date)
}

const getInitials = (name: string) =>
  name.split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('')

export function FollowingPage() {
  const { user } = useAuth()
  const [following, setFollowing] = useState<FollowingUser[]>([])
  const [posts, setPosts] = useState<ProductWithSeller[]>([])
  const [loading, setLoading] = useState(true)
  const [commentProduct, setCommentProduct] = useState<ProductWithSeller | null>(null)
  const [comments, setComments] = useState<any[]>([])
  const [commentsLoading, setCommentsLoading] = useState(false)
  const [commentText, setCommentText] = useState('')
  const [commentError, setCommentError] = useState('')
  const [commentSubmitting, setCommentSubmitting] = useState(false)

  // Load comments when a product is selected for comments
  useEffect(() => {
    const loadComments = async () => {
      if (!commentProduct) return
      const client = supabase
      if (!client) return

      setCommentsLoading(true)
      const { data, error } = await client
        .from('comments')
        .select('id, product_id, user_id, content, parent_id, created_at')
        .eq('product_id', commentProduct.id)
        .is('parent_id', null)
        .order('created_at', { ascending: true })

      if (!error && data) {
        const commenterIds = [...new Set(data.map(c => c.user_id).filter(Boolean))]
        const { data: profiles } = await client
          .from('profiles')
          .select('id, full_name')
          .in('id', commenterIds)

        const profileMap = new Map((profiles ?? []).map(p => [p.id, p.full_name]))

        setComments(data.map(c => ({
          ...c,
          commenter_name: c.user_id ? profileMap.get(c.user_id) ?? 'Community member' : 'Community member'
        })))
      }
      setCommentsLoading(false)
    }

    loadComments()
  }, [commentProduct])

  const openComments = (product: ProductWithSeller) => {
    setCommentProduct(product)
    setCommentText('')
    setCommentError('')
  }

  const closeComments = () => {
    setCommentProduct(null)
    setComments([])
  }

  const handleSubmitComment = async () => {
    if (!commentProduct || !user) return
    const client = supabase
    if (!client) return

    const trimmed = commentText.trim()
    if (!trimmed) {
      setCommentError('Write a comment before posting.')
      return
    }

    setCommentSubmitting(true)
    setCommentError('')

    const { error: insertError } = await client.from('comments').insert({
      product_id: commentProduct.id,
      user_id: user.id,
      content: trimmed,
      parent_id: null,
    })

    if (insertError) {
      setCommentError(insertError.message)
      setCommentSubmitting(false)
      return
    }

    setCommentText('')
    setCommentSubmitting(false)

    // Refresh comments
    const { data } = await client
      .from('comments')
      .select('id, product_id, user_id, content, parent_id, created_at')
      .eq('product_id', commentProduct.id)
      .is('parent_id', null)
      .order('created_at', { ascending: true })

    if (data) {
      const commenterIds = [...new Set(data.map(c => c.user_id).filter(Boolean))]
      const { data: profiles } = await client
        .from('profiles')
        .select('id, full_name')
        .in('id', commenterIds)

      const profileMap = new Map((profiles ?? []).map(p => [p.id, p.full_name]))

      setComments(data.map(c => ({
        ...c,
        commenter_name: c.user_id ? profileMap.get(c.user_id) ?? 'Community member' : 'Community member'
      })))
    }

    // Update comment count
    setPosts(prev => prev.map(p =>
      p.id === commentProduct.id ? { ...p, comments_count: p.comments_count + 1 } : p
    ))
  }

  const formatCommentTime = (value: string | null) => {
    if (!value) return 'Recently'
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return 'Recently'
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(d)
  }

  useEffect(() => {
    const loadData = async () => {
      if (!user?.id) {
        setLoading(false)
        return
      }

      const client = supabase
      if (!client) {
        setLoading(false)
        return
      }

      // Get who user is following
      const { data: followData, error: followError } = await client
        .from('follows')
        .select('following_id')
        .eq('follower_id', user.id)

      if (followError) {
        console.error('Failed to load following:', followError)
        setLoading(false)
        return
      }

      const followingIds = (followData ?? []).map((f) => f.following_id)

      if (followingIds.length === 0) {
        setFollowing([])
        setPosts([])
        setLoading(false)
        return
      }

      // Get profiles of followed users
      const { data: profileData } = await client
        .from('profiles')
        .select('id, full_name, avatar_url, created_at')
        .in('id', followingIds)

      if (profileData) {
        setFollowing(profileData as FollowingUser[])
      }

      // Get products from followed users
      const { data: productData, error: productError } = await client
        .from('products')
        .select('id, user_id, name, description, price, location, condition, status, created_at, image_url')
        .in('user_id', followingIds)
        .eq('status', 'active')
        .order('created_at', { ascending: false })

      if (productError) {
        console.error('Failed to load posts:', productError)
        setLoading(false)
        return
      }

      const products = (productData ?? []) as any[]

      if (products.length === 0) {
        setPosts([])
        setLoading(false)
        return
      }

      // Get seller info
      const sellerIds = [...new Set(products.map((p) => p.user_id))]
      const { data: sellerData } = await client
        .from('profiles')
        .select('id, full_name, avatar_url')
        .in('id', sellerIds)

      const sellerMap = new Map((sellerData ?? []).map((s: any) => [s.id, s]))

      // Get likes count and check if liked by current user
      const productIds = products.map((p) => p.id)
      const { data: likeData } = await client
        .from('likes')
        .select('product_id, user_id')
        .in('product_id', productIds)

      const likeCounts: Record<string, number> = {}
      const likedByMe = new Set<string>()
      ;(likeData ?? []).forEach((like: any) => {
        likeCounts[like.product_id] = (likeCounts[like.product_id] ?? 0) + 1
        if (like.user_id === user.id) likedByMe.add(like.product_id)
      })

      // Get comments count
      const { data: commentData } = await client
        .from('comments')
        .select('product_id')
        .in('product_id', productIds)
        .is('parent_id', null)

      const commentCounts: Record<string, number> = {}
      ;(commentData ?? []).forEach((c: any) => {
        commentCounts[c.product_id] = (commentCounts[c.product_id] ?? 0) + 1
      })

      const postsWithSellers = products.map((product) => {
        const seller = sellerMap.get(product.user_id)
        return {
          ...product,
          seller_name: seller?.full_name ?? 'Unknown',
          seller_avatar_url: seller?.avatar_url ?? null,
          likes_count: likeCounts[product.id] ?? 0,
          comments_count: commentCounts[product.id] ?? 0,
          liked_by_me: likedByMe.has(product.id),
        }
      })

      setPosts(postsWithSellers)
      setLoading(false)
    }

    loadData()
  }, [user?.id])

  const handleLikeClick = async (product: ProductWithSeller) => {
    if (!user) return
    const client = supabase
    if (!client) return

    if (product.liked_by_me) {
      await client.from('likes').delete().match({ product_id: product.id, user_id: user.id })
      setPosts((prev) =>
        prev.map((p) =>
          p.id === product.id ? { ...p, liked_by_me: false, likes_count: p.likes_count - 1 } : p,
        ),
      )
    } else {
      await client.from('likes').insert({ product_id: product.id, user_id: user.id })
      setPosts((prev) =>
        prev.map((p) =>
          p.id === product.id ? { ...p, liked_by_me: true, likes_count: p.likes_count + 1 } : p,
        ),
      )
    }
  }

  if (loading) {
    return (
      <section className="page page-following">
        <p className="market-status">Loading...</p>
      </section>
    )
  }

  return (
    <section className="page page-following">
      <div className="market-header">
        <p className="eyebrow">Following</p>
      </div>

      {following.length > 0 && (
        <div className="following-section">
          <h3 className="section-title">People you follow</h3>
          <div className="following-list">
            {following.map((person) => (
              <Link key={person.id} to={`/profile/${person.id}`} className="following-card">
                <div className="following-avatar">
                  {person.avatar_url ? (
                    <img src={person.avatar_url} alt={person.full_name} style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
                  ) : (
                    <div className="market-post-avatar">{getInitials(person.full_name || 'M')}</div>
                  )}
                </div>
                <div className="following-info">
                  <strong className="following-name">{person.full_name ?? 'Unknown'}</strong>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="following-section">
        <h3 className="section-title">Latest from people you follow</h3>
        {posts.length === 0 ? (
          <div className="market-empty">
            <h2>No posts yet</h2>
            <p>When people you follow post products, they'll appear here.</p>
            <Link className="primary-button" to="/">Browse products</Link>
          </div>
        ) : (
          <div className="market-grid">
            {posts.map((product) => (
              <article className="market-card market-feed-card" key={product.id}>
                <div className="market-post-header">
                  <div className="market-post-author" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      {product.seller_avatar_url ? (
                        <img className="market-post-avatar" src={product.seller_avatar_url} alt={product.seller_name} style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover' }} />
                      ) : (
                        <div className="market-post-avatar">{getInitials(product.seller_name)}</div>
                      )}
                      <div className="market-post-author-copy">
                        <span className="market-post-time" style={{ marginRight: 6 }}>{formatPostedAt(product.created_at)}</span>
                        <Link className="market-author-link" to={`/profile/${product.user_id}`}>{product.seller_name}</Link>
                      </div>
                    </div>
                  </div>
                </div>

                <Link className="market-post-content" to={`/product/${product.id}`}>
                  <div className="market-image-wrap">
                    {product.image_url ? (
                      <img className="market-image" src={product.image_url} alt={product.name} />
                    ) : (
                      <div className="market-image market-image-placeholder">No image</div>
                    )}
                  </div>

                  <div className="market-card-body">
                    <div className="market-card-top">
                      <h2>{product.name}</h2>
                      <strong>KSh {Number(product.price).toLocaleString()}</strong>
                    </div>

                    <p className="market-description">{product.description || 'No description provided.'}</p>

                    <div className="market-meta">
                      <span>{product.location ?? 'Kenya'}</span>
                      <span>Condition - {product.condition ? CONDITION_LABELS[product.condition] ?? product.condition : 'N/A'}</span>
                    </div>
                  </div>
                </Link>

                <div className="market-post-actions">
                  <button
                    className={`market-post-icon market-post-icon-button${product.liked_by_me ? ' market-post-icon-active' : ''}`}
                    type="button"
                    disabled={!user}
                    onClick={() => handleLikeClick(product)}
                  >
                    <ThumbsUp size={15} fill={product.liked_by_me ? 'currentColor' : 'none'} />
                  </button>
                  <span className="market-like-count">{product.likes_count}</span>
                  <button
                    className="market-post-icon market-post-icon-button"
                    type="button"
                    disabled={!user}
                    onClick={() => openComments(product)}
                  >
                    <MessageCircle size={15} />
                  </button>
                  <span className="market-comment-count">{product.comments_count}</span>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      {commentProduct ? (
        <div className="comments-overlay" role="presentation" onClick={closeComments}>
          <div className="comments-card" role="dialog" aria-modal="true" aria-label={`Comments for ${commentProduct.name}`} onClick={(event) => event.stopPropagation()}>
            <div className="comments-header">
              <div>
                <p className="eyebrow">Comments</p>
                <h2>{commentProduct.name}</h2>
              </div>
              <button className="comments-close" type="button" onClick={closeComments} aria-label="Close comments">
                ×
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

            {commentError ? <p className="comments-error">{commentError}</p> : null}

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