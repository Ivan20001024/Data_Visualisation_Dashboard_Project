'use client';
import ProductCard from './ProductCard';

export default function ProductGrid({ products, selected, onToggle }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
      gap: 12
    }}>
      {products.map((p, idx) => (
        <ProductCard
          key={p.product_id}
          product={p}
          selected={selected}
          onToggle={onToggle}
          no={idx + 1} 
        />
      ))}
    </div>
  );
}

