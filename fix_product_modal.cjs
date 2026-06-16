const fs = require('fs');
const file = 'src/components/ProductModal.tsx';
let content = fs.readFileSync(file, 'utf8');

const targetStr = `  const handleAdd = () => {
    // Generate a unique ID based on product ID and customization options
    const customizationString = JSON.stringify(customization);
    const uniqueId = \`\${product.id}-\${btoa(customizationString).substring(0, 8)}\`;

    const cartItem: CartItem = {
      id: uniqueId,
      product,
      quantity,
      customization,
      totalPrice,
    };
    onAddToCart(cartItem);
    onClose();
  };`;

const repStr = `  const handleAdd = () => {
    // Generate a unique ID based on product ID and customization options
    const customizationString = JSON.stringify({ ...customization, selectedCustomVariants });
    const uniqueId = \`\${product.id}-\${btoa(customizationString).substring(0, 8)}\`;

    const cartItem: CartItem = {
      id: uniqueId,
      product,
      quantity,
      customization,
      selectedCustomVariants,
      totalPrice,
    };
    onAddToCart(cartItem);
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

if (!content.includes('handleCustomVariantChange')) {
  content = content.replace(targetStr, repStr);
  fs.writeFileSync(file, content);
}
