import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
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
  email: string | null
  phone: string | null
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
                .select('id, full_name, email, phone, location')
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

  return (
    <section className="page page-product-details">
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
              {seller?.phone ? <small>{seller.phone}</small> : null}
              {seller?.email ? <small>{seller.email}</small> : null}
            </div>

            <div className="detail-actions">
              <Link to="/" className="ghost-button">
                Back to listings
              </Link>
            </div>
          </div>
        </article>
      ) : null}
    </section>
  )
}
