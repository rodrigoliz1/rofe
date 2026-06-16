const fs = require('fs');
const file = 'src/components/AdminView.tsx';
let content = fs.readFileSync(file, 'utf8');

// Raw Item Detail Modal
content = content.replace(
  /<div className="checkout-modal-overlay" style=\{\{ backdropFilter: 'blur\\(5px\\)' \}\} onClick=\{\(\) => setShowRawItemDetailModal\(false\)\}>/g,
  '<div className="barista-modal-backdrop" style={{ backdropFilter: \'blur(5px)\' }} onClick={() => setShowRawItemDetailModal(false)}>'
);

content = content.replace(
  /<div className="checkout-modal-content" onClick=\{e => e.stopPropagation\(\)\} style=\{\{textAlign: 'center', maxWidth: 450, position: 'relative'\}\}>/g,
  '<div className="barista-modal-dialog" onClick={e => e.stopPropagation()} style={{textAlign: \'center\', maxWidth: 450, position: \'relative\'}}>'
);

// Close button in RawItemDetailModal
content = content.replace(
  /<button\s+onClick=\{\(\) => setShowRawItemDetailModal\(false\)\}\s+style=\{\{position: 'absolute', top: 15, right: 15, background: 'transparent', border: 'none', color: '#888', fontSize: '1\.5rem', cursor: 'pointer'\}\}\s+>✕<\/button>/g,
  '<button className="barista-modal-close" onClick={() => setShowRawItemDetailModal(false)}>✕</button>'
);

// New Raw Item Modal
content = content.replace(
  /<div className="checkout-modal-overlay" onClick=\{\(\) => setShowNewRawItemModal\(false\)\}>/g,
  '<div className="barista-modal-backdrop" onClick={() => setShowNewRawItemModal(false)}>'
);

content = content.replace(
  /<div className="checkout-modal-content" onClick=\{e => e\.stopPropagation\(\)\}>/g,
  '<div className="barista-modal-dialog" onClick={e => e.stopPropagation()}>'
);

fs.writeFileSync(file, content);
