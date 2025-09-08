'use client';

export default function ProductCard({ product, selected, onToggle, no }) {
  const active = selected?.includes(product.product_id);
  return (
    <button
      onClick={() => onToggle(product.product_id)}
      style={{
        textAlign: 'left',
        padding: 12,
        borderRadius: 12,
        border: active ? '2px solid #0070f3' : '1px solid #ddd',
        background: active ? '#eef5ff' : '#fff',
        cursor: 'pointer'
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 4 }}>#{no}</div>
      <div>{product.product_name}</div>
    </button>
  );
}
