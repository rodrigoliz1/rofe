const fs = require('fs');
const file = 'src/components/ProductModal.tsx';
let content = fs.readFileSync(file, 'utf8');

const targetStr = `        </div>

        <div className="modal-footer">`;

const repStr = `          {/* CUSTOM VARIANTS RENDERING */}
          {product.custom_variants && product.custom_variants.length > 0 && (
            <div className="customization-section" style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 15, marginTop: 15 }}>
              {product.custom_variants.map(group => (
                <div key={group.title} style={{ marginBottom: 15 }}>
                  <h4 className="section-label">{group.title}</h4>
                  <div className="options-selector">
                    {group.options.map(opt => (
                      <button
                        key={opt.name}
                        className={\`option-btn \${selectedCustomVariants[group.title] === opt.name ? 'active' : ''}\`}
                        onClick={() => handleCustomVariantChange(group.title, opt.name)}
                      >
                        {opt.name} {opt.priceModifier ? \`(+\$\${opt.priceModifier})\` : ''}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="modal-footer">`;

if (!content.includes('CUSTOM VARIANTS RENDERING')) {
  content = content.replace(targetStr, repStr);
  fs.writeFileSync(file, content);
}
