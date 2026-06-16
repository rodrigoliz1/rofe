import React, { useState, useRef } from 'react';
import type { Product, CustomVariantGroup } from '../types';

interface RawInventoryItem {
  id: string;
  name: string;
  unit: string;
  stock: number;
  cost: number;
}

interface ProductEditorModalProps {
  product?: Product;
  rawInventory: RawInventoryItem[];
  onSave: (p: Product, imgFile?: File) => void;
  onClose: () => void;
  onDelete?: (id: string) => void;
}

export const ProductEditorModal: React.FC<ProductEditorModalProps> = ({ product, rawInventory, onSave, onClose, onDelete }) => {
  const [name, setName] = useState(product?.name || '');
  const [description, setDescription] = useState(product?.description || '');
  const [price, setPrice] = useState(product?.price || 0);
  const [category, setCategory] = useState<'coffee' | 'cold' | 'bakery'>(product?.category || 'coffee');
  const [icon, setIcon] = useState(product?.icon || '☕️');
  const [customizable, setCustomizable] = useState(product ? product.customizable : true);
  
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>(product?.image || '');

  const fileInputRef = useRef<HTMLInputElement>(null);

  const [recipe, setRecipe] = useState<Record<string, number>>(product?.recipe || {});
  const [customVariants, setCustomVariants] = useState<CustomVariantGroup[]>(product?.custom_variants || []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setImageFile(file);
      setImagePreview(URL.createObjectURL(file));
    }
  };

  const handleAddRecipeItem = () => {
    if (rawInventory.length === 0) return;
    const firstId = rawInventory[0].id;
    if (!recipe[firstId]) {
      setRecipe({ ...recipe, [firstId]: 1 });
    }
  };

  const updateRecipeItem = (oldId: string, newId: string, qty: number) => {
    const newRecipe = { ...recipe };
    if (oldId !== newId) {
      delete newRecipe[oldId];
    }
    newRecipe[newId] = qty;
    setRecipe(newRecipe);
  };

  const removeRecipeItem = (id: string) => {
    const newRecipe = { ...recipe };
    delete newRecipe[id];
    setRecipe(newRecipe);
  };

  const handleAddVariantGroup = () => {
    setCustomVariants([...customVariants, { title: 'Nuevo Grupo', options: [] }]);
  };

  const updateVariantGroupTitle = (index: number, title: string) => {
    const newVariants = [...customVariants];
    newVariants[index].title = title;
    setCustomVariants(newVariants);
  };

  const addVariantOption = (groupIndex: number) => {
    const newVariants = [...customVariants];
    newVariants[groupIndex].options.push({ name: 'Opción', priceModifier: 0 });
    setCustomVariants(newVariants);
  };

  const updateVariantOption = (groupIndex: number, optionIndex: number, field: 'name' | 'priceModifier', value: string | number) => {
    const newVariants = [...customVariants];
    newVariants[groupIndex].options[optionIndex] = {
      ...newVariants[groupIndex].options[optionIndex],
      [field]: value as never
    };
    setCustomVariants(newVariants);
  };

  const removeVariantOption = (groupIndex: number, optionIndex: number) => {
    const newVariants = [...customVariants];
    newVariants[groupIndex].options.splice(optionIndex, 1);
    setCustomVariants(newVariants);
  };

  const removeVariantGroup = (groupIndex: number) => {
    const newVariants = [...customVariants];
    newVariants.splice(groupIndex, 1);
    setCustomVariants(newVariants);
  };

  const handleSave = () => {
    const newProduct: Product = {
      id: product?.id || Date.now().toString(),
      name,
      description,
      price,
      category,
      icon,
      customizable,
      recipe,
      custom_variants: customVariants,
      image: product?.image
    };
    onSave(newProduct, imageFile || undefined);
  };

  return (
    <div className="barista-modal-backdrop" style={{ backdropFilter: 'blur(5px)', zIndex: 10000 }}>
      <div className="barista-modal-dialog" style={{ maxWidth: 800, width: '90%', maxHeight: '90vh', overflowY: 'auto' }}>
        <button className="barista-modal-close" onClick={onClose}>&times;</button>
        <h2 style={{ marginBottom: 20 }}>{product ? 'Editar Producto' : 'Añadir Nuevo Producto'}</h2>

        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 300px' }}>
            <label style={{ display: 'block', marginBottom: 5 }}>Nombre</label>
            <input className="admin-input-text" style={{ width: '100%', marginBottom: 15 }} value={name} onChange={e => setName(e.target.value)} />

            <label style={{ display: 'block', marginBottom: 5 }}>Categoría</label>
            <select className="admin-input-text" style={{ width: '100%', marginBottom: 15 }} value={category} onChange={e => setCategory(e.target.value as any)}>
              <option value="coffee">Café</option>
              <option value="cold">Frío</option>
              <option value="bakery">Repostería</option>
            </select>

            <label style={{ display: 'block', marginBottom: 5 }}>Precio Base ($)</label>
            <input type="number" className="admin-input-text" style={{ width: '100%', marginBottom: 15 }} value={price} onChange={e => setPrice(parseFloat(e.target.value))} />

            <label style={{ display: 'block', marginBottom: 5 }}>Descripción</label>
            <textarea className="admin-input-text" style={{ width: '100%', marginBottom: 15, height: 80 }} value={description} onChange={e => setDescription(e.target.value)} />
            
            <label style={{ display: 'block', marginBottom: 5 }}>Ícono (Emoji)</label>
            <input className="admin-input-text" style={{ width: '100%', marginBottom: 15 }} value={icon} onChange={e => setIcon(e.target.value)} />

            <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 15, cursor: 'pointer' }}>
              <input type="checkbox" checked={customizable} onChange={e => setCustomizable(e.target.checked)} style={{ width: 20, height: 20 }} />
              Permitir Personalización Clásica (Tamaño, Leche, Dulzor, etc.)
            </label>
          </div>

          <div style={{ flex: '1 1 300px' }}>
            <label style={{ display: 'block', marginBottom: 5 }}>Imagen del Producto</label>
            <div style={{ border: '2px dashed #444', borderRadius: 8, padding: 20, textAlign: 'center', marginBottom: 15, position: 'relative' }}>
              {imagePreview ? (
                <img src={imagePreview} alt="Preview" style={{ maxWidth: '100%', maxHeight: 200, borderRadius: 8, objectFit: 'cover' }} />
              ) : (
                <div style={{ color: '#888', padding: '40px 0' }}>Sin Imagen</div>
              )}
              <input type="file" accept="image/*" ref={fileInputRef} onChange={handleFileChange} style={{ display: 'none' }} />
              <button 
                className="action-btn-small" 
                style={{ marginTop: 15, width: '100%' }} 
                onClick={() => fileInputRef.current?.click()}
              >
                Subir Imagen
              </button>
            </div>

            <div style={{ background: '#2c2c2c', padding: 15, borderRadius: 8, marginBottom: 15 }}>
              <h4 style={{ margin: '0 0 10px 0' }}>Constructor de Receta</h4>
              {Object.entries(recipe).map(([id, qty]) => {
                const rawItem = rawInventory.find(r => r.id === id);
                return (
                <div key={id} style={{ display: 'flex', gap: 10, marginBottom: 10, alignItems: 'center' }}>
                  <select 
                    className="admin-input-text" 
                    style={{ flex: 1, padding: 5 }} 
                    value={id}
                    onChange={e => updateRecipeItem(id, e.target.value, qty)}
                  >
                    {rawInventory.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
                  </select>
                  <input 
                    type="number" 
                    className="admin-input-text" 
                    style={{ width: 80, padding: 5 }} 
                    value={qty} 
                    onChange={e => updateRecipeItem(id, id, parseFloat(e.target.value))}
                  />
                  <span style={{color: '#888', fontSize: '0.9rem', minWidth: 30}}>{rawItem ? rawItem.unit : ''}</span>
                  <button className="action-btn-small delete" onClick={() => removeRecipeItem(id)}>&times;</button>
                </div>
              )})}
              <button className="action-btn-small" onClick={handleAddRecipeItem}>+ Añadir Insumo</button>
            </div>
          </div>
        </div>

        <div style={{ background: '#2c2c2c', padding: 15, borderRadius: 8, marginBottom: 20 }}>
          <h4 style={{ margin: '0 0 10px 0' }}>Variantes Personalizadas (Ej. Pumps, Sabores extra)</h4>
          {customVariants.map((group, gIndex) => (
            <div key={gIndex} style={{ border: '1px solid #444', padding: 15, borderRadius: 8, marginBottom: 15 }}>
              <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
                <input 
                  className="admin-input-text" 
                  style={{ flex: 1 }} 
                  placeholder="Título del Grupo (Ej. Pumps)" 
                  value={group.title} 
                  onChange={e => updateVariantGroupTitle(gIndex, e.target.value)} 
                />
                <button className="action-btn-small delete" onClick={() => removeVariantGroup(gIndex)}>Eliminar Grupo</button>
              </div>
              
              <div style={{ paddingLeft: 20 }}>
                {group.options.map((opt, oIndex) => (
                  <div key={oIndex} style={{ display: 'flex', gap: 10, marginBottom: 5 }}>
                    <input 
                      className="admin-input-text" 
                      style={{ flex: 1, padding: 5 }} 
                      placeholder="Nombre (Ej. Vainilla)" 
                      value={opt.name} 
                      onChange={e => updateVariantOption(gIndex, oIndex, 'name', e.target.value)} 
                    />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span>+$</span>
                      <input 
                        type="number" 
                        className="admin-input-text" 
                        style={{ width: 70, padding: 5 }} 
                        value={opt.priceModifier} 
                        onChange={e => updateVariantOption(gIndex, oIndex, 'priceModifier', parseFloat(e.target.value))} 
                      />
                    </div>
                    <button className="action-btn-small delete" onClick={() => removeVariantOption(gIndex, oIndex)}>&times;</button>
                  </div>
                ))}
                <button className="action-btn-small" style={{ marginTop: 10 }} onClick={() => addVariantOption(gIndex)}>+ Añadir Opción</button>
              </div>
            </div>
          ))}
          <button className="action-btn-small" onClick={handleAddVariantGroup}>+ Añadir Grupo de Variantes</button>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 20, paddingTop: 20, borderTop: '1px solid #444' }}>
          {product && onDelete ? (
            <button className="action-btn-small delete" style={{ padding: '10px 20px' }} onClick={() => {
              if (window.confirm('¿Estás seguro de eliminar este producto?')) {
                onDelete(product.id);
              }
            }}>Remover Producto</button>
          ) : <div></div>}
          
          <button className="checkout-btn" style={{ padding: '10px 30px' }} onClick={handleSave}>Guardar Cambios</button>
        </div>
      </div>
    </div>
  );
};
