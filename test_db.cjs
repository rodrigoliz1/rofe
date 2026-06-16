async function test() {
  try {
    const res = await fetch('https://rofe-backend.onrender.com/api/products');
    const products = await res.json();
    console.log("Products found:", products.length);
    if (products.length > 0) {
      const p = products[0];
      console.log("Product:", p.name, "Custom variants before:", p.custom_variants);
      const res2 = await fetch('https://rofe-backend.onrender.com/api/products/' + p.id, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...p, custom_variants: [{ title: 'test', options: [] }] })
      });
      console.log("Update status:", res2.status, res2.statusText);
      const text = await res2.text();
      console.log("Update body:", text);
    }
  } catch (e) {
    console.error(e);
  }
}
test();
