import React, { Component } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/ibm-plex-sans/standard.css';
import '@fontsource/ibm-plex-mono/latin-400.css';
import '@fontsource/ibm-plex-mono/latin-500.css';
import './styles.css';
import App from './App.jsx';
import { AppProvider } from './AppContext.jsx';

class ErrorBoundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 24, fontFamily: 'system-ui, sans-serif' }}>
          <h2>Something went wrong</h2>
          <pre style={{ whiteSpace: 'pre-wrap', color: '#b00' }}>{String(this.state.error)}</pre>
          <button onClick={() => { this.setState({ error: null }); window.location.reload(); }}>
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const root = createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <AppProvider>
        <App />
      </AppProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
