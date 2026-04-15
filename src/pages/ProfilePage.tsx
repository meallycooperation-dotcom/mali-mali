import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Inbox, Upload, LogOut } from 'lucide-react'
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
}

type ProductCondition = 'A' | 'B' | 'C'

const PRODUCT_IMAGE_SLOTS = 4
const CONDITION_LABELS: Record<ProductCondition, string> = {
  A: 'Like new',
  B: 'Good',
  C: 'Fair',
}

const formatJoinedDate = (value: string | null) => {
  if (!value) {
    return 'Recently'
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return 'Recently'
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(date)
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
  const [sellerInfoMap, setSellerInfoMap] = useState<Record<string, { name: string; avatar_url: string | null }>>({})
  const [loadingProducts, setLoadingProducts] = useState(true)
  const [showProductForm, setShowProductForm] = useState(false)
  const [productName, setProductName] = useState('')
  const [productDescription, setProductDescription] = useState('')
  const [productPrice, setProductPrice] = useState('')
  const [productLocation, setProductLocation] = useState('')
  const [productCondition, setProductCondition] = useState<ProductCondition>('A')
  const [productImages, setProductImages] = useState<Array<File | null>>(
    () => Array.from({ length: PRODUCT_IMAGE_SLOTS }, () => null),
  )
  const [creatingProduct, setCreatingProduct] = useState(false)
  const [productMessage, setProductMessage] = useState('')
  const [productError, setProductError] = useState('')
  const [conversationError, setConversationError] = useState('')
  const [startingConversation, setStartingConversation] = useState(false)
  const fileInputRefs = useRef<Array<HTMLInputElement | null>>([])

  const loadProfile = useCallback(async () => {
    const client = supabase

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
    setLoadingProfile(false)
  }, [viewedProfileId])

  const loadMyProducts = useCallback(async () => {
    const client = supabase

    if (!client || !viewedProfileId) {
      setLoadingProducts(false)
      return
    }

    setLoadingProducts(true)
    const { data, error } = await client
      .from('products')
      .select(
        'id, name, description, price, location, condition, status, created_at, image_url, user_id',
      )
      .eq('user_id', viewedProfileId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Failed to load user posts:', error)
    }

    const products = (data ?? []) as UserProductRecord[]
    setMyProducts(products)
    // Fetch seller profiles for avatars
    const userIds = Array.from(new Set(products.map((p) => p.user_id)))
    if (userIds.length > 0) {
      const { data: profileData, error: profileError } = await client
        .from('profiles')
        .select('id, full_name, avatar_url')
        .in('id', userIds)
      if (!profileError && profileData) {
        const map: Record<string, { name: string; avatar_url: string | null }> = {}
        ;(profileData as any[]).forEach((p) => {
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
    setProductImages((current) => {
      const next = [...current]
      next[index] = nextFile
      return next
    })
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

    const selectedImages = productImages.filter((image): image is File => Boolean(image))

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
      setProductImages(Array.from({ length: PRODUCT_IMAGE_SLOTS }, () => null))
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

  const openInbox = () => {
    navigate('/inbox')
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
  const joinedDate = formatJoinedDate(
    (isViewingOwnProfile ? profile?.created_at ?? user?.created_at : profile?.created_at) ?? null,
  )
  const pageTitle = isViewingOwnProfile ? 'Your profile' : 'Seller profile'
  const pageDescription = isViewingOwnProfile
    ? 'This page shows your seller details, your posts, and a hidden form to add a new refurbished item when you need it.'
    : 'This page shows the seller details and the posts they have shared on Mali Mali.'
  const summaryTitle = isViewingOwnProfile ? 'Your details' : 'Seller details'
  const summarySubtitle = isViewingOwnProfile
    ? 'Everything in one place, without the extra small cards.'
    : 'Everything we know about this seller in one place.'
  // helper initials for placeholder avatar
  const initials = displayName
    .split(' ')
    .filter(Boolean)
    .map((p) => p.charAt(0))
    .slice(0, 2)
    .join('')

  return (
    <section className="page page-profile">
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
          </div>
        </div>
        <p>{pageDescription}</p>
        {/* Hidden input for avatar upload */}
        <input
          ref={avatarInputRef}
          className="sr-only-input"
          type="file"
          accept="image/*"
          onChange={handleAvatarChange}
        />
      {isViewingOwnProfile ? (
        <div className="profile-actions profile-actions-row">
          <button className="primary-button profile-toggle-button" type="button" onClick={openInbox}>
            <Inbox size={18} />
            Inbox
          </button>
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

      {isViewingOwnProfile ? (
        <article className="profile-summary-card">
          <div className="profile-summary-header">
            <h2>{summaryTitle}</h2>
            <p>{summarySubtitle}</p>
          </div>

          <dl className="profile-summary-grid">
            <div>
              <dt>Email</dt>
              <dd>{profile?.email ?? user?.email ?? 'Not available'}</dd>
            </div>
            <div>
              <dt>Full name</dt>
              <dd>{profile?.full_name ?? displayName}</dd>
            </div>
            <div>
              <dt>Phone</dt>
              <dd>{profile?.phone ?? 'Not available'}</dd>
            </div>
            <div>
              <dt>Location</dt>
              <dd>{profile?.location ?? 'Not available'}</dd>
            </div>
            <div>
              <dt>Avatar URL</dt>
              <dd>{profile?.avatar_url ?? 'Not available'}</dd>
            </div>
            <div>
              <dt>Created</dt>
              <dd>{profile?.created_at ?? 'Not available'}</dd>
            </div>
            <div>
              <dt>Updated</dt>
              <dd>{profile?.updated_at ?? 'Not available'}</dd>
            </div>
          </dl>
        </article>
      ) : (
        <article className="profile-summary-card public-profile-card">
          <div className="profile-summary-header">
            <h2>Seller details</h2>
            <p>Quick profile overview for this marketplace seller.</p>
          </div>

          <dl className="profile-summary-grid">
            <div>
              <dt>Joined</dt>
              <dd>{joinedDate}</dd>
            </div>
          </dl>
        </article>
      )}

      {isViewingOwnProfile ? (
        <div className="profile-actions profile-actions-row">
          <button
            className="primary-button profile-toggle-button"
            type="button"
            onClick={() => setShowProductForm((current) => !current)}
          >
            {showProductForm ? 'Hide new product' : 'Sell new product'}
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
                    className={`product-image-slot${image ? ' product-image-slot-filled' : ''}`}
                  >
                    {image ? (
                      <span className="product-image-preview">
                        <strong>Image {index + 1}</strong>
                        <small>{image.name}</small>
                      </span>
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
            <Link
              key={product.id}
              to={`/product/${product.id}`}
              className="market-card market-card-link profile-post-card"
            >
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

              <div className="market-card-body">
                <div className="market-card-top">
              <div className="market-card-top-left">
                    {sellerInfoMap[product.user_id]?.avatar_url ? (
                      <img
                        className="seller-avatar"
                        src={sellerInfoMap[product.user_id].avatar_url as string}
                        alt={sellerInfoMap[product.user_id]?.name ?? 'Seller'}
                      />
                    ) : (
                      <div
                        className="seller-avatar"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: 22,
                          height: 22,
                          borderRadius: '50%',
                          background: 'rgba(0,0,0,0.15)',
                          color: 'white',
                          fontSize: '0.8rem',
                        }}
                        aria-label="Seller avatar"
                      >
                        {sellerInfoMap[product.user_id]?.name
                          ?.split(' ')
                          .map((n) => n.charAt(0))
                          .slice(0, 2)
                          .join('')
                          .toUpperCase() ?? product.user_id?.slice(0, 2) ?? ''}
                      </div>
                    )}
                    <h2>{product.name}</h2>
                  </div>
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
            </Link>
          ))}
        </div>
      </section>
    </section>
  )
}
