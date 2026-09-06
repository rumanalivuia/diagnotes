import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="empty-state" role="alert" style={{ padding: 32 }}>
          <h3>Something went wrong</h3>
          <p style={{ color: 'var(--muted)', maxWidth: 480 }}>
            {this.state.error?.message || 'An unexpected error occurred.'}
          </p>
          <button
            className="btn primary"
            onClick={() => this.setState({ hasError: false, error: null })}
          >
            Try again
          </button>
          {this.props.fallback}
        </div>
      );
    }
    return this.props.children;
  }
}
