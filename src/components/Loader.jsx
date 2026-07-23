import React from 'react';

function Loader() {
  return (
    <div
      style={{
        width: 24,
        height: 24,
        border: '2.5px solid #eee',
        borderTopColor: '#7F77DD',
        borderRadius: '50%',
        animation: 'spin 0.85s linear infinite',
      }}
    />
  );
}
export default Loader;
