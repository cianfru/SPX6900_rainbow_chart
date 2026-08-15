import { Component } from "react";
import { isChunkError, recoverStaleChunk } from "./chunk-recover.js";

// Catches render-time errors (a chart throwing on bad data) and failed lazy
// chunk loads, so one broken chart degrades to a friendly message instead of
// white-screening the whole app. Reset it by changing `key` (we key it by the
// selected tab, so switching charts always starts from a clean boundary).
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  // A stale lazy chunk after a deploy reaches here as a render error — reload once to the fresh
  // build instead of leaving the "couldn't be displayed" message up (guarded against a reload loop).
  componentDidCatch(error) {
    if (isChunkError(error)) recoverStaleChunk("error-boundary");
  }

  render() {
    if (this.state.error) {
      return (
        this.props.fallback ?? (
          <div style={{
            textAlign: "center", padding: 40, lineHeight: 1.6,
            fontFamily: "system-ui, -apple-system, sans-serif", color: "#f87171",
          }}>
            This chart couldn&apos;t be displayed.
            <div style={{ marginTop: 6, fontSize: 13, color: "#94a3b8" }}>
              Try another tab or reload the page.
            </div>
          </div>
        )
      );
    }
    return this.props.children;
  }
}
