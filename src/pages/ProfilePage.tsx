import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Upload, LogOut, Heart, MessageCircle } from 'lucide-react'
import { formatDateTime } from '../utils/formatDate'
import imageCompression from 'browser-image-compression'
import { useAuth } from '../context/useAuth'
import { supabase } from '../lib/supabase'

type ProfileRecord = {
  id: string
  full_name: string
  email: string | null
  phone: string | null
  location: string | null
  avatar_url: string | null
  created_at: string | null
  updated_at: string | null
}

type UserProductRecord = {
  id: string
  name: string
  description: string | null
  price: string | number
  location: string | null
  condition: string | null
  status: string | null
  created_at: string | null
  image_url: string | null
  user_id: string
  likes_count: number
  comments_count: number
  liked_by_me: boolean
}

type ProductCondition = 'A' | 'B' | 'C'

const PRODUCT_IMAGE_SLOTS = 4
const CONDITION_LABELS: Record<ProductCondition, string> = {
  A: 'Like new',
  B: 'Good',
  C: 'Fair',
}

export function ProfilePage() {
  const { profileId } = useParams()
  const navigate = useNavigate()
  const { user, signOut } = useAuth()
  const viewedProfileId = profileId ?? user?.id ?? null
  const isViewingOwnProfile = !profileId || profileId === user?.id
  const [profile, setProfile] = useState<ProfileRecord | null>(null)
  const [loadingProfile, setLoadingProfile] = useState(true)
  const avatarInputRef = useRef<HTMLInputElement | null>(null)
  const [avatarUploading, setAvatarUploading] = useState(false)
  const [myProducts, setMyProducts] = useState<UserProductRecord[]>([])
  const [followedProductIds, setFollowedProductIds] = useState<string[]>([])
  const [followerCount, setFollowerCount] = useState(0)
  const [followingCount, setFollowingCount] = useState(0)
  const formatProductDate = (value: string | null) => {
    if (!value) return ''
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return ''
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(d)
  }
  const toggleFollowProduct = async (pid: string) => {
    // determine seller id for this product
    const product = myProducts.find((p) => p.id === pid)
    const sellerId = product?.user_id
    if (!user?.id || !sellerId) {
      return
    }
    if (followedProductIds.includes(pid)) {
      // optional unfollow: delete the relation
      const { error } = await (supabase as any).from('follows').delete().match({ follower_id: user!.id, following_id: sellerId as string })
      if (!error) {
        setFollowedProductIds((prev) => prev.filter((id) => id !== pid))
      } else {
        console.error('Unfollow failed:', error)
      }
      return
    }
    // insert new follow relation
    const { error } = await (supabase as any).from('follows').insert({ follower_id: user!.id, following_id: sellerId as string })
    if (!error) {
      setFollowedProductIds((prev) => [...prev, pid])
    } else {
      console.error('Follow failed:', error)
    }
  }

  const toggleSold = async (pid: string) => {
    const product = myProducts.find((p) => p.id === pid)
    if (!product) return
    const newStatus = product.status === 'sold' ? 'active' : 'sold'
    try {
      const { error } = await (supabase as any)
        .from('products')
        .update({ status: newStatus })
        .eq('id', pid)
      if (!error) {
        setMyProducts((prev) => prev.map((p) => (p.id === pid ? { ...p, status: newStatus } : p)))
      } else {
        console.error('Failed to update product status', error)
      }
    } catch (err) {
      console.error('Error updating product status', err)
    }
  }

  const deleteProduct = async (pid: string) => {
    const product = myProducts.find((p) => p.id === pid)
    if (!product) return
    if (!confirm('Are you sure you want to delete this product? This action cannot be undone.')) return
    try {
      const client = supabase as any

      // Delete main product image from storage if exists
      if (product.image_url && product.image_url.includes('/product-images/')) {
        const mainPath = product.image_url.split('/product-images/')[1]
        if (mainPath) {
          await client.storage.from('product-images').remove([mainPath])
        }
      }

      // Fetch and delete gallery images from storage
      const { data: images } = await client
        .from('product_images')
        .select('image_url')
        .eq('product_id', pid)

      if (images && images.length > 0) {
        const pathsToDelete = images
          .map((img: { image_url: string }) => {
            if (img.image_url && img.image_url.includes('/product-images/')) {
              return img.image_url.split('/product-images/')[1]
            }
            return null
          })
          .filter(Boolean)

        if (pathsToDelete.length > 0) {
          await client.storage.from('product-images').remove(pathsToDelete)
        }
      }

      // Delete image records from database
      await client.from('product_images').delete().eq('product_id', pid)

      // Delete the product
      const { error } = await client
        .from('products')
        .delete()
        .eq('id', pid)
      if (!error) {
        setMyProducts((prev) => prev.filter((p) => p.id !== pid))
      } else {
        console.error('Failed to delete product', error)
      }
    } catch (err) {
      console.error('Error deleting product', err)
    }
  }

  const handleStartEdit = (product: UserProductRecord) => {
    setEditingProduct(product)
    setEditPrice(String(product.price))
    setEditDescription(product.description ?? '')
  }

  const handleSaveEdit = async () => {
    if (!editingProduct) return
    try {
      const { error } = await (supabase as any)
        .from('products')
        .update({ 
          price: editPrice, 
          description: editDescription 
        })
        .eq('id', editingProduct.id)
      if (!error) {
        setMyProducts((prev) => prev.map((p) => 
          p.id === editingProduct.id ? { ...p, price: editPrice, description: editDescription } : p
        ))
        setEditingProduct(null)
      } else {
        console.error('Failed to update product', error)
      }
    } catch (err) {
      console.error('Error updating product', err)
    }
  }

  const handleCancelEdit = () => {
    setEditingProduct(null)
    setEditPrice('')
    setEditDescription('')
  }

  const [sellerInfoMap, setSellerInfoMap] = useState<Record<string, { name: string; avatar_url: string | null }>>({})
  const [loadingProducts, setLoadingProducts] = useState(true)
  const [showProductForm, setShowProductForm] = useState(false)
  const [productName, setProductName] = useState('')
  const [productDescription, setProductDescription] = useState('')
  const [productPrice, setProductPrice] = useState('')
  const [productLocation, setProductLocation] = useState('')
  const [productCondition, setProductCondition] = useState<ProductCondition>('A')
  const [productImages, setProductImages] = useState<Array<{ file: File | null; preview: string | null }>>(
    () => Array.from({ length: PRODUCT_IMAGE_SLOTS }, () => ({ file: null, preview: null })),
  )
  const [creatingProduct, setCreatingProduct] = useState(false)
  const [productMessage, setProductMessage] = useState('')
  const [productError, setProductError] = useState('')
  const [conversationError, setConversationError] = useState('')
  const [startingConversation, setStartingConversation] = useState(false)
  const [editingProduct, setEditingProduct] = useState<UserProductRecord | null>(null)
  // Comment modal state for product comments in profile view
  const [commentModalProductId, setCommentModalProductId] = useState<string | null>(null)
  const [modalComments, setModalComments] = useState<Array<any>>([])
  const [modalLoading, setModalLoading] = useState(false)
  const [modalComment, setModalComment] = useState('')
  const openCommentsForProduct = (pid: string) => {
    setCommentModalProductId(pid)
    void loadComments(pid)
  }
  const closeCommentsModal = () => {
    setCommentModalProductId(null)
    setModalComments([])
    setModalComment('')
  }
  const loadComments = async (pid: string) => {
    const client = supabase
    if (!client || !pid) return
    setModalLoading(true)
    try {
      const { data: comments } = await client.from('comments').select('id, user_id, content, created_at').eq('product_id', pid).order('created_at', { ascending: true })
      const userIds = Array.from(new Set((comments ?? []).map((c: any) => c.user_id).filter(Boolean)))
      let profiles: any[] = []
      if (userIds.length > 0) {
        const { data } = await client.from('profiles').select('id, full_name, avatar_url').in('id', userIds)
        profiles = data ?? []
      }
      const map: Record<string, { name: string; avatar_url: string | null }> = {}
      profiles.forEach((p) => {
        map[p.id] = { name: p.full_name, avatar_url: p.avatar_url ?? null }
      })
      const enriched = (comments ?? []).map((c: any) => ({
        ...c,
        user_name: map[c.user_id]?.name ?? c.user_id,
        user_avatar_url: map[c.user_id]?.avatar_url ?? null,
      }))
      setModalComments(enriched)
    } catch (err) {
      console.error('Error loading comments', err)
    } finally {
      setModalLoading(false)
    }
  }
  const addComment = async () => {
    if (!user?.id || !commentModalProductId) return
    const text = modalComment.trim()
    if (!text) return
    try {
      const { error } = await (supabase as any).from('comments').insert({ product_id: commentModalProductId, user_id: user!.id, content: text })
      if (!error) {
        setModalComment('')
        await loadComments(commentModalProductId)
      }
    } catch (err) {
      console.error('Error adding comment', err)
    }
  }
  const [editPrice, setEditPrice] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const fileInputRefs = useRef<Array<HTMLInputElement | null>>([])

  const loadProfile = useCallback(async () => {
    const client = supabase!

    if (!client || !viewedProfileId) {
      setLoadingProfile(false)
      return
    }

    setLoadingProfile(true)
    const { data, error } = await client
      .from('profiles')
      .select('id, full_name, email, phone, location, avatar_url, created_at, updated_at')
      .eq('id', viewedProfileId)
      .maybeSingle()

    if (error) {
      console.error('Failed to load profile:', error)
    }

    setProfile((data as ProfileRecord | null) ?? null)

    // Load follower/following counts for this profile
    if (viewedProfileId) {
      const { count: followerCount } = await client
        .from('follows')
        .select('*', { count: 'exact', head: true })
        .eq('following_id', viewedProfileId)
      const { count: followingCount } = await client
        .from('follows')
        .select('*', { count: 'exact', head: true })
        .eq('follower_id', viewedProfileId)
      setFollowerCount(followerCount ?? 0)
      setFollowingCount(followingCount ?? 0)
    }

    setLoadingProfile(false)
  }, [viewedProfileId])

  const loadMyProducts = useCallback(async () => {
    const client = supabase!

    if (!client || !viewedProfileId) {
      setLoadingProducts(false)
      return
    }

    setLoadingProducts(true)

    // Fetch products with counts
    const { data: productRows, error } = await client
      .from('products')
      .select('id, name, description, price, location, condition, status, created_at, image_url, user_id')
      .eq('user_id', viewedProfileId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Failed to load user posts:', error)
    }

    const products = (productRows ?? []) as UserProductRecord[]
    const productIds = products.map(p => p.id)

    // Get likes count
    const { data: likeData } = productIds.length > 0
      ? await client.from('likes').select('product_id, user_id').in('product_id', productIds)
      : { data: [] }

    const likeCounts: Record<string, number> = {}
    const likedByMe = new Set<string>()
    likeData?.forEach(like => {
      if (like.product_id) {
        likeCounts[like.product_id] = (likeCounts[like.product_id] || 0) + 1
        if (like.user_id === user?.id) likedByMe.add(like.product_id)
      }
    })

    // Get comments count
    const { data: commentData } = productIds.length > 0
      ? await client.from('comments').select('product_id').in('product_id', productIds)
      : { data: [] }

    const commentCounts: Record<string, number> = {}
    commentData?.forEach(comment => {
      if (comment.product_id) {
        commentCounts[comment.product_id] = (commentCounts[comment.product_id] || 0) + 1
      }
    })

    const productsWithCounts = products.map(p => ({
      ...p,
      likes_count: likeCounts[p.id] || 0,
      comments_count: commentCounts[p.id] || 0,
      liked_by_me: likedByMe.has(p.id)
    }))

    setMyProducts(productsWithCounts)
    // Fetch seller profiles for avatars
    const userIds = Array.from(new Set(products.map((p) => p.user_id)))
    if (userIds.length > 0) {
      const { data: profileData, error: profileError } = await client
        .from('profiles')
        .select('id, full_name, avatar_url')
        .in('id', userIds)
      if (!profileError && profileData) {
        const map: Record<string, { name: string; avatar_url: string | null }> = {}
        ;(profileData as { id: string; full_name: string; avatar_url?: string | null }[]).forEach((p) => {
          map[p.id] = {
            name: p.full_name,
            avatar_url: p.avatar_url ?? null,
          }
        })
        setSellerInfoMap(map)
      }
    } else {
      setSellerInfoMap({})
    }
    setLoadingProducts(false)
  }, [viewedProfileId])

  const uploadAvatar = async (file: File) => {
    const client = supabase

    if (!client || !viewedProfileId) {
      return
    }

    setAvatarUploading(true)
    try {
      const compressed = await imageCompression(file, {
        maxSizeMB: 1,
        maxWidthOrHeight: 2048,
        useWebWorker: true,
      })

      // Determine extension safely; prefer webp when available
      const fileExtFromName = file.name?.split('.').pop() ?? 'jpg'
      let ext = fileExtFromName
      if (compressed.type) {
        const mime = compressed.type
        if (mime.includes('image/webp')) ext = 'webp'
        else if (mime.includes('image/jpeg')) ext = 'jpg'
        else if (mime.includes('image/png')) ext = 'png'
      }
      const userIdForUpload = user?.id ?? viewedProfileId
      const storagePath = `${userIdForUpload}/avatar-${Date.now()}.${ext}`

      const { error: uploadError } = await client.storage
        .from('avatars')
        .upload(storagePath, compressed, {
          contentType: compressed.type || file.type,
          upsert: true,
        })

      if (uploadError) throw uploadError

      const { data: publicData } = client.storage
        .from('avatars')
        .getPublicUrl(storagePath)
      const avatarUrl = publicData.publicUrl

      const { error: updateError } = await client
        .from('profiles')
        .update({ avatar_url: avatarUrl })
        .eq('id', userIdForUpload)
        .single()

      if (updateError) throw updateError

      // refresh local state
      setProfile((p) => (p ? { ...p, avatar_url: avatarUrl } : p))
    } catch (err) {
      console.error('Avatar upload failed:', err)
    } finally {
      setAvatarUploading(false)
    }
  }

  const handleAvatarChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      uploadAvatar(file)
    }
    // reset input so user can re-upload same file if desired
    if (event.target) event.target.value = ''
  }

  useEffect(() => {
    void loadProfile()
    void loadMyProducts()
  }, [loadMyProducts, loadProfile])

  const handleProductImageChange = (
    event: ChangeEvent<HTMLInputElement>,
    index: number,
  ) => {
    setProductError('')
    setProductMessage('')
    const nextFile = event.target.files?.[0] ?? null
    if (nextFile) {
      const preview = URL.createObjectURL(nextFile)
      setProductImages((current) => {
        const next = [...current]
        next[index] = { file: nextFile, preview }
        return next
      })
    } else {
      setProductImages((current) => {
        const next = [...current]
        if (next[index].preview) {
          URL.revokeObjectURL(next[index].preview!)
        }
        next[index] = { file: null, preview: null }
        return next
      })
    }
    event.target.value = ''
  }

  const handleCreateProduct = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setProductError('')
    setProductMessage('')
    setCreatingProduct(true)

    const client = supabase

    if (!client || !user) {
      setProductError('You need to be signed in to create a product.')
      setCreatingProduct(false)
      return
    }

    const selectedImages = productImages
      .map((img) => img.file)
      .filter((file): file is File => Boolean(file))

    if (selectedImages.length === 0) {
      setProductError('Please choose at least one product image.')
      setCreatingProduct(false)
      return
    }

    try {
      const uploadedImages: Array<{ storagePath: string; imageUrl: string }> = []

      try {
        for (const file of selectedImages) {
          const compressedImage = await imageCompression(file, {
            maxSizeMB: 1,
            maxWidthOrHeight: 1600,
            useWebWorker: true,
          })

          const fileExtension = compressedImage.name.split('.').pop() || 'jpg'
          const safeName = `${crypto.randomUUID()}.${fileExtension}`
          const storagePath = `${user.id}/${safeName}`

          const { error: uploadError } = await client.storage
            .from('product-images')
            .upload(storagePath, compressedImage, {
              contentType: compressedImage.type || file.type,
              upsert: false,
            })

          if (uploadError) {
            throw uploadError
          }

          const { data: publicData } = client.storage
            .from('product-images')
            .getPublicUrl(storagePath)

          uploadedImages.push({
            storagePath,
            imageUrl: publicData.publicUrl,
          })
        }
      } catch (uploadCaughtError) {
        await client.storage
          .from('product-images')
          .remove(uploadedImages.map((image) => image.storagePath))
        throw uploadCaughtError
      }

      const [primaryImage] = uploadedImages
      const { data: productData, error: productError } = await client
        .from('products')
        .insert({
          user_id: user.id,
          name: productName.trim(),
          description: productDescription.trim() || null,
          price: Number(productPrice),
          location: productLocation.trim() || null,
          condition: productCondition,
          image_url: primaryImage.imageUrl,
        })
        .select('id')
        .single()

      if (productError) {
        await client.storage
          .from('product-images')
          .remove(uploadedImages.map((image) => image.storagePath))
        throw productError
      }

      const productId = productData.id
      const { error: productImageError } = await client
        .from('product_images')
        .insert(
          uploadedImages.map((image) => ({
            product_id: productId,
            image_url: image.imageUrl,
          })),
        )

      if (productImageError) {
        await Promise.allSettled([
          client.from('products').delete().eq('id', productId),
          client.storage
            .from('product-images')
            .remove(uploadedImages.map((image) => image.storagePath)),
        ])
        throw productImageError
      }

      setProductMessage('Product created successfully.')
      setProductName('')
      setProductDescription('')
      setProductPrice('')
      setProductLocation('')
      setProductCondition('A')
      setProductImages(Array.from({ length: PRODUCT_IMAGE_SLOTS }, () => ({ file: null, preview: null })))
      fileInputRefs.current.forEach((input) => {
        if (input) {
          input.value = ''
        }
      })
      void loadMyProducts()
    } catch (caughtError) {
      setProductError(
        caughtError instanceof Error
          ? caughtError.message
          : 'Could not create the product. Please try again.',
      )
    } finally {
      setCreatingProduct(false)
    }
  }

  const startConversationWithSeller = async () => {
    const client = supabase

    if (!client || !user || !viewedProfileId || viewedProfileId === user.id) {
      return
    }

    setStartingConversation(true)
    setConversationError('')

    const [{ data: myParticipantData, error: myParticipantError }, { data: sellerParticipantData, error: sellerParticipantError }] =
      await Promise.all([
        client
          .from('conversation_participants')
          .select('conversation_id')
          .eq('user_id', user.id),
        client
          .from('conversation_participants')
          .select('conversation_id')
          .eq('user_id', viewedProfileId),
      ])

    if (myParticipantError || sellerParticipantError) {
      setStartingConversation(false)
      setConversationError(
        myParticipantError?.message ?? sellerParticipantError?.message ?? '',
      )
      return
    }

    const myConversationIds = new Set(
      (myParticipantData ?? []).map((row) => row.conversation_id),
    )
    const existingConversationId = (sellerParticipantData ?? []).find((row) =>
      myConversationIds.has(row.conversation_id),
    )?.conversation_id

    if (existingConversationId) {
      navigate(`/inbox/${existingConversationId}`)
      return
    }

    const { data: conversationData, error: conversationError } = await client
      .from('conversations')
      .insert({ product_id: null })
      .select('id')
      .single()

    if (conversationError) {
      setStartingConversation(false)
      setConversationError(conversationError.message)
      return
    }

    const conversationId = conversationData.id
    const { error: participantInsertError } = await client
      .from('conversation_participants')
      .insert([
        { conversation_id: conversationId, user_id: user.id },
        { conversation_id: conversationId, user_id: viewedProfileId },
      ])

    if (participantInsertError) {
      setStartingConversation(false)
      setConversationError(participantInsertError.message)
      return
    }

    setStartingConversation(false)
    navigate(`/inbox/${conversationId}`)
  }

  const displayName =
    (isViewingOwnProfile
      ? profile?.full_name ??
        user?.user_metadata?.full_name ??
        user?.user_metadata?.name ??
        user?.email?.split('@')[0] ??
        'Member'
      : profile?.full_name ?? 'Member')
  const pageTitle = isViewingOwnProfile ? 'Your profile' : 'Seller profile'
  // helper initials for placeholder avatar
  const initials = displayName
    .split(' ')
    .filter(Boolean)
    .map((p: string) => p.charAt(0))
    .slice(0, 2)
    .join('')

  return (
    <section className="page page-profile">
      {!isViewingOwnProfile && profile && (
        <div className="breadcrumb">
          <Link to="/users">Users</Link>
          <span className="breadcrumb-separator">›</span>
          <span>{profile.full_name}'s Profile</span>
        </div>
      )}
      <div className="profile-hero">
        <div className="profile-hero-header">
          {profile?.avatar_url ? (
            <img
              src={profile.avatar_url}
              alt="Avatar"
              className="profile-avatar"
              onClick={isViewingOwnProfile ? () => avatarInputRef.current?.click() : undefined}
            />
          ) : (
            <div
              className="profile-avatar profile-avatar-placeholder"
              onClick={isViewingOwnProfile ? () => avatarInputRef.current?.click() : undefined}
              aria-label="Upload profile image"
              role="button"
              title={initials || 'Avatar'}
            >
              {initials || ''}
            </div>
          )}
          <div className="profile-hero-text">
            <p className="eyebrow">{pageTitle}</p>
            <h1>{displayName}</h1>
            <div className="profile-hero-details">
              {isViewingOwnProfile && profile?.email && <span className="profile-hero-detail">✉ {profile.email}</span>}
              {isViewingOwnProfile && profile?.phone && <span className="profile-hero-detail">📞 {profile.phone}</span>}
              {profile?.location && <span className="profile-hero-detail">📍 {profile.location}</span>}
            </div>
          </div>
        </div>
        
        {/* Hidden input for avatar upload */}
        <input
          ref={avatarInputRef}
          className="sr-only-input"
          type="file"
          accept="image/*"
          onChange={handleAvatarChange}
        />
        {avatarUploading ? (
          <span className="avatar-uploading" aria-live="polite">Uploading avatar...</span>
        ) : null}
      {isViewingOwnProfile ? (
        <div className="profile-actions profile-actions-row">
          
          <div className="follower-count-card">
            <span className="follower-label">Followers</span>
            <span className="follower-number">{followerCount}</span>
            <span className="follower-sep">·</span>
            <span className="follower-label">Following</span>
            <span className="follower-number">{followingCount}</span>
          </div>
          <button
            className="ghost-button profile-logout-button"
            type="button"
            onClick={async () => {
              try {
                await signOut()
                navigate('/')
              } catch {
                // ignore
              }
            }}
          >
            <LogOut size={18} />
            Logout
          </button>
        </div>
      ) : (
          <div className="profile-actions profile-actions-row">
            {user ? (
              <button
                className="primary-button profile-message-button"
                type="button"
                onClick={startConversationWithSeller}
                disabled={startingConversation}
              >
                {startingConversation ? 'Opening chat...' : 'Message seller'}
              </button>
            ) : (
              <div className="profile-message-wrap">
                <button className="primary-button profile-message-button" type="button" disabled>
                  Message seller
                </button>
                {!user ? (
                  <small className="profile-message-note">
                    Sign in to message this seller.
                  </small>
                ) : null}
              </div>
            )}
          </div>
        )}
      </div>

      {conversationError ? (
        <p className="market-status market-status-error">{conversationError}</p>
      ) : null}

      {/* Removed the profile-summary-card as details are now in the hero */}

      {isViewingOwnProfile ? (
        <div className="profile-actions profile-actions-row">
          <button
            className="primary-button profile-toggle-button"
            type="button"
            onClick={() => setShowProductForm((current) => !current)}
          >
            {showProductForm ? 'Hide new product' : 'Sell product'}
          </button>
        </div>
      ) : null}

      {loadingProfile ? <p className="profile-loading">Loading profile data...</p> : null}

      {isViewingOwnProfile && showProductForm ? (
        <section className="product-panel">
          <div className="product-panel-header">
            <p className="eyebrow">Create product</p>
            <h2>Add a refurbished item</h2>
            <p>
              Upload multiple compressed images to the `product-images` bucket and
              save them to the marketplace tables.
            </p>
          </div>

          <form className="product-form" onSubmit={handleCreateProduct}>
            <div className="product-grid">
              <label className="field">
                <span>Product name</span>
                <input
                  value={productName}
                  onChange={(event) => setProductName(event.target.value)}
                  type="text"
                  placeholder="Refurbished iPhone 12"
                  required
                />
              </label>

              <label className="field">
                <span>Price</span>
                <input
                  value={productPrice}
                  onChange={(event) => setProductPrice(event.target.value)}
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="45000"
                  required
                />
              </label>

              <label className="field">
                <span>Location</span>
                <input
                  value={productLocation}
                  onChange={(event) => setProductLocation(event.target.value)}
                  type="text"
                  placeholder="Nairobi"
                />
              </label>

              <label className="field">
                <span>Condition</span>
                <select
                  value={productCondition}
                  onChange={(event) =>
                    setProductCondition(event.target.value as ProductCondition)
                  }
                >
                  <option value="A">A - Like new</option>
                  <option value="B">B - Good</option>
                  <option value="C">C - Fair</option>
                </select>
              </label>
            </div>

            <label className="field">
              <span>Description</span>
              <textarea
                value={productDescription}
                onChange={(event) => setProductDescription(event.target.value)}
                placeholder="Add a short description for buyers."
                rows={4}
              />
            </label>

            <div className="field">
              <span>Product images</span>
              <div className="product-image-grid">
                {productImages.map((image, index) => (
                  <label
                    key={index}
                    className={`product-image-slot${image.file ? ' product-image-slot-filled' : ''}`}
                  >
                    {image.file && image.preview ? (
                      <div className="product-image-preview">
                        <img src={image.preview} alt={`Preview ${index + 1}`} />
                        <small>{image.file.name}</small>
                      </div>
                    ) : (
                      <>
                        <span className="product-image-plus">+</span>
                        <small>Add image</small>
                      </>
                    )}
                    <input
                      ref={(node) => {
                        fileInputRefs.current[index] = node
                      }}
                      className="sr-only-input"
                      type="file"
                      accept="image/*"
                      onChange={(event) => handleProductImageChange(event, index)}
                    />
                  </label>
                ))}
              </div>
            </div>

            {productError ? (
              <div className="auth-message auth-message-error">{productError}</div>
            ) : null}
            {productMessage ? (
              <div className="auth-message auth-message-success">{productMessage}</div>
            ) : null}

            <button
              className="primary-button product-submit"
              type="submit"
              disabled={creatingProduct}
            >
              {creatingProduct ? (
                'Saving...'
              ) : (
                <>
                  <Upload size={18} />
                  Create product
                </>
              )}
            </button>
          </form>
        </section>
      ) : null}

      <section className="profile-posts-section">
        <div className="profile-posts-header">
          <p className="eyebrow">{isViewingOwnProfile ? 'Your posts' : 'Posts'}</p>
          <h2>
            {isViewingOwnProfile ? 'Products you have posted' : 'Products this seller has posted'}
          </h2>
        </div>

        {loadingProducts ? (
          <p className="profile-loading">
            {isViewingOwnProfile ? 'Loading your posts...' : 'Loading seller posts...'}
          </p>
        ) : null}

        {!loadingProducts && myProducts.length === 0 ? (
          <div className="market-empty">
            <h2>{isViewingOwnProfile ? 'No posts yet' : 'No posts available'}</h2>
            <p>
              {isViewingOwnProfile
                ? 'Use the button above to post your first refurbished item.'
                : 'This seller has not posted any refurbished items yet.'}
            </p>
          </div>
        ) : null}

        <div className="profile-posts-grid">
        {myProducts.map((product) => (
            <div
              key={product.id}
              className="market-card profile-post-card"
            >
              <div className="market-post-header">
                <div className="market-post-author" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {sellerInfoMap[product.user_id]?.avatar_url ? (
                      <img
                        className="market-post-avatar"
                        src={sellerInfoMap[product.user_id].avatar_url as string}
                        alt={sellerInfoMap[product.user_id]?.name ?? 'Seller'}
                        style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover' }}
                      />
                    ) : (
                      <div className="market-post-avatar" aria-hidden="true">
                        {((sellerInfoMap[product.user_id]?.name ?? product.user_id).split(' ').map((n) => n.charAt(0)).slice(0, 2).join('') || '').toUpperCase() || 'M'}
                      </div>
                    )}
                    <div className="market-post-author-copy">
                      <span className="market-post-time" style={{ marginRight: 6 }}>{formatProductDate(product.created_at)}</span>
                      <span className="market-author-link">{sellerInfoMap[product.user_id]?.name ?? 'Seller'}</span>
                    </div>
                  </div>
                {product.user_id && product.user_id !== user?.id && (
                    followedProductIds.includes(product.id) ? (
                      <button
                        className="follow-pill following"
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleFollowProduct(product.id) }}
                        style={{ padding: '3px 8px', fontSize: '0.7rem', flexShrink: 0 }}
                      >
                        Following
                      </button>
                    ) : (
                      <button
                        className="follow-pill"
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleFollowProduct(product.id) }}
                        style={{ padding: '3px 8px', fontSize: '0.7rem', flexShrink: 0 }}
                      >
                        Follow
                      </button>
                    )
                  )}
              <div style={{ display: 'inline-flex', alignItems: 'center', marginLeft: 8 }}>
                {isViewingOwnProfile && (
                  <>
                    <button
                      type="button"
                      className="edit-pill"
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleStartEdit(product) }}
                      aria-label="Edit product"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="edit-pill"
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); navigate(`/product/${product.id}`) }}
                      aria-label="View product"
                      style={{ marginLeft: 6 }}
                    >
                      View product
                    </button>
                    <button
                      type="button"
                      className="sold-pill"
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleSold(product.id) }}
                      aria-label={product.status === 'sold' ? 'Mark as active' : 'Mark as sold'}
                      style={{ marginLeft: 6 }}
                    >
                      {product.status === 'sold' ? 'Sold' : 'Mark Sold'}
                    </button>
                    {product.status === 'sold' && (
                      <button
                        type="button"
                        className="delete-pill"
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); deleteProduct(product.id) }}
                        aria-label="Delete product"
                        style={{ marginLeft: 6 }}
                      >
                        Delete
                      </button>
                    )}
                  </>
                )}
              </div>
                </div>
              </div>

              <div className="market-image-wrap">
                {product.image_url ? (
                  <img
                    className="market-image"
                    src={product.image_url}
                    alt={product.name}
                  />
                ) : (
                  <div className="market-image market-image-placeholder">No image</div>
                )}
              </div>

              <div className="market-card-footer" aria-label="Product interactions">
                <span className="market-action-text" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Heart size={16} />
                  {product.likes_count} like{product.likes_count === 1 ? '' : 's'}
                </span>
                <button
                  type="button"
                  className="edit-pill"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); openCommentsForProduct(product.id) }}
                  aria-label="View comments"
                  style={{ marginLeft: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}
                >
                  <MessageCircle size={16} />
                  {product.comments_count} comment{product.comments_count === 1 ? '' : 's'}
                </button>
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
                      ? CONDITION_LABELS[product.condition as ProductCondition] ??
                        product.condition
                      : 'N/A'}
                  </span>
                </div>

                <div className="market-seller">
                  <span>Status</span>
                  <strong>{product.status ?? 'active'}</strong>
                </div>
              </div>
            </div>
        ))}
        </div>
      </section>

      {editingProduct && isViewingOwnProfile && (
        <div className="comments-overlay" role="presentation" onClick={handleCancelEdit}>
          <div className="comments-card" role="dialog" aria-modal="true" aria-label={`Edit ${editingProduct.name}`} onClick={(event) => event.stopPropagation()}>
            <div className="comments-header">
              <div>
                <p className="eyebrow">Edit Product</p>
                <h2>{editingProduct.name}</h2>
              </div>
              <button className="comments-close" type="button" onClick={handleCancelEdit} aria-label="Close">
                ×
              </button>
            </div>
<div className="comments-body">
              <div className="edit-popup-field">
                <label>Price (KSh)</label>
                <input
                  type="number"
                  value={editPrice}
                  onChange={(e) => setEditPrice(e.target.value)}
                  placeholder="Enter price"
                />
              </div>
              <div className="edit-popup-field">
                <label>Description</label>
                <textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  placeholder="Enter description"
                />
              </div>
              <div className="edit-field">
                <label>Description</label>
                <textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  placeholder="Description"
                  rows={4}
                />
              </div>
            </div>
            <div className="comments-composer">
              <button
                className="primary-button comments-submit"
                type="button"
                onClick={handleSaveEdit}
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {commentModalProductId && (
        <div className="comments-overlay" role="presentation" onClick={closeCommentsModal}>
          <div
            className="comments-card"
            role="dialog"
            aria-modal="true"
            aria-label="Comments"
            onClick={(e) => e.stopPropagation()}
            style={{ display: 'flex', flexDirection: 'column', height: '60vh', width: '90%', maxWidth: 720, margin: '6vh auto' }}
          >
            <div className="comments-header" style={{ padding: 12, borderBottom: '1px solid #eee' }}>
              <div>
                <p className="eyebrow">Comments</p>
                <h2>Product Comments</h2>
              </div>
              <button className="comments-close" type="button" onClick={closeCommentsModal} aria-label="Close">×</button>
            </div>
            <div className="comments-body" style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
              {modalLoading ? (
                <p>Loading comments...</p>
              ) : modalComments.length === 0 ? (
                <p>No comments yet.</p>
              ) : (
                modalComments.map((c) => (
                  <div key={c.id} className="comment-item" style={{ display: 'flex', gap: 8, padding: '6px 0' }}>
                    <div className="comment-avatar" style={{ width: 28, height: 28, borderRadius: 14, background: '#ddd', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {(c.user_name?.split(' ').map((n: string) => n.charAt(0)).slice(0, 2).join('') ?? 'U').toUpperCase()}
                    </div>
                    <div className="comment-content" style={{ flex: 1 }}>
                      <div className="comment-meta" style={{ fontSize: 12, color: '#666' }}>
                        {c.user_name ?? 'User'} • {formatDateTime(c.created_at)}
                      </div>
                      <div className="comment-text" style={{ marginTop: 2 }}>{c.content}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="comments-composer" style={{ padding: 8, borderTop: '1px solid #eee' }}>
              {user ? (
                <>
                  <textarea
                    value={modalComment}
                    onChange={(e) => setModalComment(e.target.value)}
                    placeholder="Write a comment..."
                    rows={3}
                    style={{ width: '100%', resize: 'vertical' }}
                  />
                  <button className="primary-button comments-submit" type="button" onClick={addComment} style={{ marginTop: 6 }}>
                    Comment
                  </button>
                </>
              ) : (
                <p>Sign in to leave a comment.</p>
              )}
            </div>
          </div>
        </div>
      )}

    </section>
  )
}
