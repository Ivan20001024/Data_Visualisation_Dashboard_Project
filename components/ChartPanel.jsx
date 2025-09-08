'use client';
import { useMemo } from 'react';
import ProductChart from './ProductChart';

export default function ChartPanel({ seriesMap, loading, products, selected }) {
  const idToNo = useMemo(() => {
    const map = new Map();
    products.forEach((p, idx) => map.set(p.product_id, idx + 1));
    return map;
  }, [products]);

  if (loading && selected.length > 0) {
    return <p style={{ marginTop: 12 }}>Loading charts…</p>;
  }

  const items = selected.map(id => ({
    id,
    no: idToNo.get(id) ?? '?',
    title: products.find(p => p.product_id === id)?.product_name || '',
    data: seriesMap[id] || []
  }));

  if (items.length === 0) {
    return <p style={{ marginTop: 12, color: '#666' }}>Please select products above to display charts.</p>;
  }

  return (
    <div style={{
      marginTop: 12,
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))',
      gap: 12
    }}>
      {items.map(it => (
        <ProductChart
          key={it.id}
          title={`${it.title} (#${it.no})`}
          data={it.data}
        />
      ))}
    </div>
  );
}
