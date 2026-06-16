const fs = require('fs');
const file = 'src/components/ProductModal.tsx';
let content = fs.readFileSync(file, 'utf8');

const stateTarget = `  const [totalPrice, setTotalPrice] = useState(product.price);`;
const stateRep = `  const [totalPrice, setTotalPrice] = useState(product.price);
  const [selectedCustomVariants, setSelectedCustomVariants] = useState<Record<string, string>>({});`;
content = content.replace(stateTarget, stateRep);

const priceEffectTarget = `    // Upgrades
    if (customization.size === 'grande') {`;
const priceEffectRep = `    // Custom Variants
    if (product.custom_variants) {
      product.custom_variants.forEach(group => {
        const selectedOptName = selectedCustomVariants[group.title];
        if (selectedOptName) {
          const opt = group.options.find(o => o.name === selectedOptName);
          if (opt && opt.priceModifier) {
            base += opt.priceModifier;
          }
        }
      });
    }

    // Upgrades
    if (customization.size === 'grande') {`;
content = content.replace(priceEffectTarget, priceEffectRep);

const addToCartTarget = `      id: Date.now().toString(),
      product,
      quantity,
      customization,
      totalPrice,
    });
    onClose();
  };`;
const addToCartRep = `      id: Date.now().toString(),
      product,
      quantity,
      customization,
      selectedCustomVariants,
      totalPrice,
    });
    onClose();
  };

  const handleCustomVariantChange = (groupTitle: string, optionName: string) => {
    setSelectedCustomVariants(prev => {
      const next = { ...prev };
      if (next[groupTitle] === optionName) {
        delete next[groupTitle]; // toggle off
      } else {
        next[groupTitle] = optionName;
      }
      return next;
    });
  };`;
content = content.replace(addToCartTarget, addToCartRep);

const uiTarget = `          {/* Options Grid */}`;
const uiRep = `          {/* Custom Variants */}
          {product.custom_variants && product.custom_variants.length > 0 && (
            <div className="customization-group" style={{ marginBottom: 20 }}>
              {product.custom_variants.map(group => (
                <div key={group.title} style={{ marginBottom: 15 }}>
                  <h4 style={{ margin: '0 0 10px 0', fontSize: '0.9rem', color: '#888', textTransform: 'uppercase' }}>
                    {group.title}
                  </h4>
                  <div className="options-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 10 }}>
                    {group.options.map(opt => {
                      const isSelected = selectedCustomVariants[group.title] === opt.name;
                      return (
                        <button
                          key={opt.name}
                          className={\`option-btn \${isSelected ? 'active' : ''}\`}
                          onClick={() => handleCustomVariantChange(group.title, opt.name)}
                          style={{
                            padding: '10px',
                            background: isSelected ? 'var(--primary)' : '#2c2c2c',
                            color: isSelected ? '#fff' : '#aaa',
                            border: 'none',
                            borderRadius: '8px',
                            fontWeight: 'bold',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            minHeight: '60px'
                          }}
                        >
                          <span>{opt.name}</span>
                          {opt.priceModifier > 0 && (
                            <span style={{ fontSize: '0.8rem', opacity: 0.8 }}>+$\${opt.priceModifier}</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Options Grid */}`;
content = content.replace(uiTarget, uiRep);

fs.writeFileSync(file, content);
