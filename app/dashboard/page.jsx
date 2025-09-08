'use client';
import { useEffect, useMemo, useState, Fragment } from 'react';
import { signOut } from 'next-auth/react';
import UploadExcelButton from '../../components/UploadExcelButton';
import ProductGrid from '../../components/ProductGrid';
import ChartPanel from '../../components/ChartPanel';
import { toChartSeries } from '../../lib/transform';

export default function DashboardPage() {
  const [products, setProducts] = useState([]);
  const [selected, setSelected] = useState([]);
  const [factsByProduct, setFactsByProduct] = useState({});
  const [loadingFacts, setLoadingFacts] = useState(false);
  const [clearing, setClearing] = useState(false);

  async function fetchProducts() {
    const res = await fetch('/api/products');
    if (res.ok) setProducts(await res.json());
  }

  useEffect(() => { fetchProducts(); }, []);

  useEffect(() => {
    (async () => {
      if (selected.length === 0) { setFactsByProduct({}); return; }
      setLoadingFacts(true);
      const qs = selected.map(id => `productId=${id}`).join('&');
      const res = await fetch(`/api/daily_facts?${qs}`);
      if (res.ok) setFactsByProduct(await res.json());
      setLoadingFacts(false);
    })();
  }, [selected]);

  const seriesMap = useMemo(() => toChartSeries(factsByProduct), [factsByProduct]);

  const onToggle = (id) => {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const onClearChartsOnly = () => { setSelected([]); setFactsByProduct({}); };

  const onClearAllData = async () => {
    if (!confirm('This will delete all products and their visualization data in the database and cannot be undone. Continue?')) return;
    try {
      setClearing(true);
      const res = await fetch('/api/products', { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.message || 'Failed to clear');
      }
      setSelected([]);
      setFactsByProduct({});
      await fetchProducts();
      alert('All products and visualization data have been cleared');
    } catch (e) {
      alert(e.message || 'Failed to clear');
    } finally {
      setClearing(false);
    }
  };

  return (
    <Fragment>
      <header style={{
        position: 'sticky', top: 0, zIndex: 10,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 24px', borderBottom: '1px solid #eee', background: '#fff'
      }}>
        <div style={{ fontWeight: 700 }}>Retail Dashboard</div>
        <button
          onClick={() => signOut({ callbackUrl: '/login' })}
          style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #222', cursor: 'pointer' }}
          title="Sign out and return to login page"
        >
          Sign out
        </button>
      </header>

      <main style={{ padding: 24, display: 'grid', gap: 24 }}>
        <section>
          <h1 style={{ textAlign: 'center', marginBottom: 8 }}>Import Excel to Our Database</h1>
            <p style={{ textAlign: 'center', marginBottom: 12 }}>
            Supported data template:
            <strong> ID</strong> / <strong>Product Name</strong> / <strong>Opening Inventory on Day 1</strong> /
            <strong> Procurement Qty &amp; Price Day 1..N</strong> /
            <strong> Sales Qty &amp; Price Day 1..N</strong>
            </p>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <UploadExcelButton onUploaded={() => { alert('Data imported successfully'); fetchProducts(); }} />
          </div>
        </section>

        <section>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <h2 style={{ margin: 0, marginBottom: 8 }}>Available Product Data for Visualization</h2>
              <p style={{ margin: 0, color: '#333' }}>Click a product card to visualize its chart below.</p>
            </div>
            <button
              onClick={onClearAllData}
              disabled={clearing}
              title="Clear all products and daily data in the database"
              style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #d33', color: '#d33', cursor: 'pointer', background: '#fff' }}
            >
              {clearing ? 'Clearing…' : 'Clear All Data'}
            </button>
          </div>

          <div style={{ marginTop: 12 }}>
            {products.length === 0 ? (
              <p style={{ textAlign: 'center', color: '#666' }}>No product data has been imported into the database yet.</p>
            ) : (
              <ProductGrid products={products} selected={selected} onToggle={onToggle} />
            )}
          </div>
        </section>

        <section>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <h2 style={{ margin: 0 }}>Visualization Panel</h2>
            <button onClick={onClearChartsOnly} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #888', cursor: 'pointer' }}>
              Clear
            </button>
          </div>

          <ChartPanel seriesMap={seriesMap} loading={loadingFacts} products={products} selected={selected} />
        </section>
      </main>
    </Fragment>
  );
}
