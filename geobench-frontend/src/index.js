import 'bootstrap/dist/css/bootstrap.min.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
// Theme layers — imported last so they override App.css (see src/themes/README.md)
import './themes/modern-dark.css';
import './themes/modern-white.css';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App/>);